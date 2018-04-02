const SerialPort = require("serialport");

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
  expireSeconds: 0.5 * 60, //TEMP: currently *ridiculously* short
  mqttBridgeHostname: "mqtt.googleapis.com",
  mqttBridgePort: 8883,
};

// Format a LED command for the arduino.
function formatLedCmd(ledId, state) {
  return `LT:${ledId}:${state?"on":"off"};`;
}

// Format a motor command for the arduino.
function formatMotorCmd({
    base, shoulder, elbow, horizontal, vertical, rotation}) {
  return `MC:${
      base}:${
      shoulder}:${
      elbow}:${
      horizontal}:${
      vertical}:${
      rotation};`;
}

async function run() {
  // Setup arduino and iotClient
  const arduino = await connectToArduino(arduinoConfig);
  const iotClient = await buildIotClient(iotClientConfig);

  // Handle config updates
  iotClient.on("config", (config) => {
    // Log the config object (and type to catch JSON mixups)
    console.log("config", typeof config, config);

    // Set the LED states
    //TODO: see how multiple messages being sent in parallel plays out.
    // If this is triggered while a motor command is being sent, what happens?
    for (const [ledId, state] of Object.entries(config.leds)) {
      arduino.send(formatLedCmd(ledId, state));
    }

    // Set the motor states
    arduino.send(formatMotorCmd(config.motors));
  });
}

async function testIotClient() {
  const iotClient = await buildIotClient(iotClientConfig);
  iotClient.on("config", (config) => {
    console.log("Config", typeof config, config);
  });
}
//testIotClient();
run();
