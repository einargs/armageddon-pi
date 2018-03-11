const fs = require("fs");
const util = require("util");
const EventEmitter = require("events");
const jwt = require("jsonwebtoken");
const mqtt = require("async-mqtt");

const readFilePromisified = util.promisify(fs.readFile);

// Accepts options object
async function createJwt(
    { projectId, privateKeyFile, expireSeconds, algorithm }) {
  // Get the privateKey before the current time
  // so the delay doesn't affect the expire time.
  const privateKey = await readFilePromisified(privateKeyFile);

  const nowSeconds = parseInt(Date.now() / 1000);
  const token = {
    'iat': nowSeconds,
    'exp': nowSeconds + expireSeconds,
    'aud': projectId
  };

  return jwt.sign(token, privateKey, { algorithm });
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

// Refresh the client's JWT password
// Mutates the options object and calls reconnect
async function refreshClient(client, jwtConfig) {
  const newPasswordToken = await createJwt(jwtConfig);
  client.options.password = newPasswordToken;
  client.reconnect();
}

// Makes a new MQTT client
async function makeClient(
    {bridgeHostname, bridgePort, clientId, jwtConfig}) {
  const passwordToken = await createJwt(jwtConfig);
  const client = mqtt.connect({
    host: bridgeHostname,
    port: bridgePort,
    clientId: clientId,
    username: "unused",
    password: passwordToken,
    protocol: "mqtts",
    secureProtocol: "TLSv1_2_method"
  });

  // Wait for the client to connect
  const success = await new Promise((resolve, reject) => {
    client.once("connect", success => {
      resolve(success);
    });
  });

  // If the connect failed, throw an error
  if (!success) {
    throw new Error("MQTT client failed to connect");
  }

  // Refresh the token when closing
  // Google Cloud IoT core closes the connection when the token expires
  client.on("close", () => {
    console.log("Refreshing client");
    refreshClient(client, jwtConfig);
  });

  // Return the client
  return client;
}


class IotClient extends EventEmitter {
  // Only use this for creating new IotClients
  static async build(globalOptions) {
    // Make the client
    const iotClient = new IotClient(globalOptions);
    // Set the client up
    await iotClient.setup();
    // Return the client
    return iotClient;
  }

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

  // Never call the constructor directly. Always use the static build method.
  constructor(globalOptions) {
    super();
    this.globalOptions = globalOptions;

    this.clientId = makeClientId(globalOptions);
  }

  // Setup the IotClient
  async setup() {
    // Make the MQTT client
    const mqttClient = await makeClient({
      bridgeHostname: this.globalOptions.mqttBridgeHostname,
      bridgePort: this.globalOptions.mqttBridgePort,
      clientId: this.clientId,
      jwtConfig: this.globalOptions
    });

    // Subscribe to config updates
    await mqttClient.subscribe(makeTopicUri("config", this.globalOptions));

    // Handle messages
    mqttClient.on("message", (...args) => {
      this._handleClientMessages(...args);
    });

    // Store the client
    this.mqttClient = mqttClient;

    // Return self
    return this;
  }

  //NOTE: automatically converts message object to JSON & adds topic URI
  async publish(topic, message) {
    const topicUri = makeTopicUri(topic, this.globalOptions);
    const messageJson = JSON.stringify(message);
    const qos = 1; // Quality of Service. qos = 1: at least one delivery
    await this.mqttClient.publish(topicUri, messageJson, { qos });
  }
}

// IotClient.build wrapper
function buildIotClient(globalOptions) {
  return IotClient.build(globalOptions);
}

// Exports
module.exports = {
  buildIotClient
};
