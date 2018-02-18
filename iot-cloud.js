/*
NOTE that the client connection is terminated by cloud IoT core
if no message has been sent in 20 minutes.
TODO: Figure out how much leway there is in that--should I refresh
every 19 minutes? Every 15 minutes? Every 18 minutes? Find out.
*/

const fs = require("fs");
const util = require("util");
const EventEmitter = require("events");
const jwt = require("jsonwebtoken");
const mqtt = require("mqtt");

const readFilePromisified = util.promisify(fs.readFile);

// Accepts starting date, gCloudOptions object
function createJwt(
    startDate=Date.now(),
    { projectId, privateKeyFile, expireSeconds, algorithm }
  ) {
  const nowSeconds = parseInt(startDate / 1000);
  const token = {
    'iat': nowSeconds,
    'exp': nowSeconds + expireSeconds,
    'aud': projectId
  };

  return readFilePromisified(privateKeyFile)
    .then(privateKey => jwt.sign(token, privateKey, { algorithm }));
}

// Accepts messageType string, gCloudOptions object
// messageType: ["config", "state", "events"]
// Config for configuration, state for state, events for telemetry
function makeTopicUri(topic, { deviceId }) {
  return `/devices/${deviceId}/${topic}`;
}

// removes device and registry
// Format is "/{registry}/{device}/{...truncatedTopic}"
function getTopicFromUri(uri) {
  return uri.split("/").slice(3).join("/");
}

// Accepts gCloudOptions object
function makeClientId({ projectId, cloudRegion, registryId, deviceId }) {
  return `projects/${projectId}/locations/${cloudRegion}/registries/${registryId}/devices/${deviceId}`;
}

//TODO: figure out how to deal with dead clients
// that haven't been replaced yet.
// TODO: add proper error handling to the refreshClient.
class MqttClientStateMachine {
  constructor({bridgeHostname, bridgePort, clientId, jwtConfig, setup}) {
    this._setupCallback = setup;
    this.bridgeHostname = bridgeHostname;
    this.bridgePort = bridgePort;
    this.clientId = clientId;
    this.jwtConfig = jwtConfig;
  }

  // Client getter
  //NOTE: may be part of "dead client" solution
  get client() {
    return this._client;
  }

  start() {
    return this.refreshClient();
  }

  refreshClient() {
    // Get the JWT authentication token
    const signDate = Date.now();
    // Make the token
    return createJwt(signDate, this.jwtConfig)
      // Get the client
      .then(token => mqtt.connect({
        host: this.bridgeHostname,
        port: this.bridgePort,
        clientId: this.clientId,
        username: "unused",
        password: token,
        protocol: "mqtts",
        secureProtocol: "TLSv1_2_method"
      }))
      // Wait for connection
      .then(client => {
        return new Promise((resolve, reject) => {
          client.once("connect", success => {
            if (success) {
              resolve(client);
            } else {
              //TODO: figure out how to handle errors
              reject(new Error("Failed to connect"));
            }
          });
        });
      })
      // Run the setup callback
      //NOTE: async so that the setup callback can be awaited
      .then(async client => {
        await this._setupCallback(client);
        return client;
      })
      // Store the new client & refresh on close
      .then(client => {
        // End the current client (if it exists)
        if (this._client) {
          this._client.end();
        }

        // Store the client
        this._client = client;

        // When the client closes, refresh the client
        client.once("close", () => {
          console.log("Refreshing client");
          this.refreshClient();
        });

        // Return the client
        return client;
      });
  }
}


class IotCoreClient extends EventEmitter {
  _handleClientMessages(topicUri, messageBuffer, packet) {
    // Get the raw text
    const messageText = Buffer.from(messageBuffer, "base64").toString("ascii");

    // Handle an empty buffer & parse from JSON
    const messageObj = messageText==="" ? {} : JSON.parse(messageText);

    // Get the topic
    const topic = getTopicFromUri(topicUri);

    // Emit the topic
    this.emit(topic, messageObj);
  }

  constructor(globalOptions) {
    super();
    this.globalOptions = globalOptions;

    this.clientId = makeClientId(globalOptions);

    // Configure the mqtt client state machine
    this.clientStateMachine = new MqttClientStateMachine({
      bridgeHostname: globalOptions.mqttBridgeHostname,
      bridgePort: globalOptions.mqttBridgePort,
      clientId: this.clientId,
      jwtConfig: globalOptions,
      setup:(client) => {
        // Subscribe to config updates
        client.subscribe(makeTopicUri("config", globalOptions));
        // Handle messages
        client.on("message", (...args) => {
          this._handleClientMessages(...args);
        });
      }
    });
  }

  async start() {
    await this.clientStateMachine.start();
    return this;
  }

  //NOTE: automatically converts message object to JSON & adds topic URI
  publish(topic, message) {
    const topicUri = makeTopicUri(topic, this.globalOptions);
    const messageJson = JSON.stringify(message);
    const qos = 1; // Quality of Service. qos = 1: at least one delivery
    const client = this.clientStateMachine.client;
    client.publish(topicUri, messageJson, { qos });
  }
}

// Exports
module.exports = {
  IotCoreClient
};
