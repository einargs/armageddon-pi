/*
NOTE that the client connection is terminated by cloud IoT core
if no message has been sent in 20 minutes.
TODO: Figure out how much leway there is in that--should I refresh
every 19 minutes? Every 15 minutes? Every 18 minutes? Find out.
*/

const fs = require("fs");
const EventEmitter = require("events");
const jwt = require("jsonwebtoken");
const mqtt = require("mqtt");

const gCloudOptions = {
  projectId: "armageddon-cloud",
  cloudRegion: "us-central1",
  registryId: "arm-devices",
  deviceId: "arm-1",
  privateKeyFile: "/home/einargs/Coding/Gcloud/armageddon-cloud/rsa_private.pem", //TEMP
  algorithm: "RS256",
  expireSeconds: 20 * 60, //NOTE expires in 20 minutes
  mqttBridgeHostname: "mqtt.googleapis.com",
  mqttBridgePort: 8883,
};

// Warn about the token timing out
//TODO: Check the constraints on how often I need to refresh the token
function warnInSeconds(msg, seconds) {
  setTimeout(() => {
    console.warn(msg);
  }, seconds*1000);
}
warnInSeconds("JWT Token has now expired", gCloudOptions.expireSeconds);

// Accepts gCloudOptions object
//TODO: make this asynchronous
//NOTE: that this is currently reading from disk synchronously
function createJwt({ projectId, privateKeyFile, expireSeconds, algorithm }) {
  const token = {
    'iat': parseInt(Date.now() / 1000),
    'exp': parseInt(Date.now() / 1000) + expireSeconds,
    'aud': projectId
  };
  const privateKey = fs.readFileSync(privateKeyFile);
  return jwt.sign(token, privateKey, { algorithm });
}
// Create token early to get synchronous overhead over with
const jwtToken = createJwt(gCloudOptions);

// Accepts messageType string, gCloudOptions object
// messageType: ["config", "state", "events"]
// Config for configuration, state for state, events for telemetry
function makeTopicUri(topic, { deviceId }) {
  return `/devices/${deviceId}/${topic}`;
}

// Accepts gCloudOptions object
function makeClientId({ projectId, cloudRegion, registryId, deviceId }) {
  return `projects/${projectId}/locations/${cloudRegion}/registries/${registryId}/devices/${deviceId}`;
}

//TODO: I'm pretty sure I can remove this,
// but I don't understand what the MQTT example code was using it for.
// Accepts gCloudOptions object
function makePayload(message, { registryId, deviceId }) {
  return `${registryId}/${deviceId}-payload-${message}`;
}

// Accepts token JWT token, gCloudOptions object
function makeClient(token, options) {
  return mqtt.connect({
    host: options.mqttBridgeHostname,
    port: options.mqttBridgePort,
    clientId: makeClientId(options),
    username: 'unused',
    password: token,
    protocol: 'mqtts',
    secureProtocol: 'TLSv1_2_method'
  });
}

//
const client = makeClient(jwtToken, gCloudOptions);
client.on("connect", (success) => {
  console.log("Connection successful", success);
});

// Make message event emitter
const messageEmitter = new EventEmitter();

// Subscribe to configuration updates
client.subscribe(makeTopicUri("config", gCloudOptions));

//
client.on("message", (topic, messageBuffer, packet) => {
  // Get the raw text
  const messageText = Buffer.from(messageBuffer, "base64").toString("ascii");

  // Handle an empty buffer
  const messageJson = messageText==="" ? {} : JSON.parse(messageText);

  // Get truncated topic (device & registry removed)
  // Format is "/{registry}/{device}/{...truncatedTopic}"
  const truncatedTopic = topic.split("/").slice(3).join("/");

  // Log about the message
  console.log("Got message about topic", topic);
  console.log("Message is", messageJson);
  console.log("Truncated topic", truncatedTopic);

  // Emit the message
  messageEmitter.emit(truncatedTopic, messageJson);
});

// Accepts message string, topic string, gCloudOptions object
function publishToTopic(message, topic, options) {
  console.log("Publishing message", message, "to topic", topic);
  const topicUri = makeTopicUri(topic, options);
  const payload = message;

  // Quality of Service = 0: at most once delivery
  // Quality of Service = 1: at least once delivery
  //SEE: https://github.com/GoogleCloudPlatform/nodejs-docs-samples/blob/2523dfc0a131a3036252cd79908b307cb32473d0/iot/mqtt_example/cloudiot_mqtt_example_nodejs.js#L126
  const qos = 1;

  client.publish(topicUri, payload, { qos });
}

// Accepts json object, topic string, gCloudOptions object
function publishJsonToTopic(json, topic, options) {
  return publishToTopic(JSON.stringify(json), topic, options);
}


// Accepts state object
function publishState(state) {
  return publishJsonToTopic(state, "state", gCloudOptions);
}

// Accepts telemetry object
function publishTelemetry(telemetry) {
  return publishJsonToTopic(telemetry, "events", gCloudOptions);
}

// Exports
module.exports = {
  messageEmitter,
  publishState,
  publishTelemetry
};
