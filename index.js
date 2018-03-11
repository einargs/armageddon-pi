const SerialPort = require("serialport");
const socketIO = require("socket.io");
const express = require("express");

const { connectToArduino } = require("./arduino");
const { buildIotClient } = require("./iot-cloud");

const arduinoConfig = {
  portPath: "/dev/ttyACM0",
  baudRate: 9600,
  readyLine: "starting"
};
const iotClientConfig = {
  projectId: "armageddon-cloud",
  cloudRegion: "us-central1",
  registryId: "arm-devices",
  deviceId: "arm-1",
  privateKeyFile: "/home/einargs/Auth/armageddon-pi/rsa_private.pem", //TEMP
  algorithm: "RS256",
  expireSeconds: 2 * 60, //TEMP
  mqttBridgeHostname: "mqtt.googleapis.com",
  mqttBridgePort: 8883,
};

async function run() {
  // Setup arduino and iotClient
  const arduino = await connectToArduino(arduinoConfig);
  const iotClient = await buildIotClient(iotClientConfig);

  // Handle config updates
  iotClient.on("config", (config) => {
    for (const [ledId, state] of Object.entries(config.leds)) {
      arduino.send(`LT:${ledId}:${state?"on":"off"};`);
    }
  });
}

async function testIotClient() {
  const iotClient = await buildIotClient(iotClientConfig);
  iotClient.on("config", console.log);
}
testIotClient();
//run();
