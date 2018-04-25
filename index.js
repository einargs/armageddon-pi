const SerialPort = require("serialport");
const path = require("path");

const { connectToArduino } = require("./arduino");
const { buildIotClient } = require("./iot-cloud");

const arduinoConfig = require("./arduino.config");
const iotClientConfig = require("./iot-client.config");

// Format a LED command for the arduino.
function formatLedCmd(ledId, state) {
  return `LT:${ledId}:${state?"on":"off"};`;
}

function convertRadianToStep(radian) {
  radianToStepConversionFactor =arduinoConfig.motorSteps/(Math.PI*2);
  const posRadian = radian<0 ? radian+(Math.PI*2) : radian;
  const steps = posRadian * radianToStepConversionFactor;
  return Math.round(steps);
}

const defaultMotorCmds={
  base:0,shoulder:0,elbow:0,horizontal:0,vertical:0,rotation:0};
// Format a motor command for the arduino.
function formatMotorCmd({
    base=0, shoulder=0, elbow=0, horizontal=0, vertical=0, rotation=0}={}) {
  const radianJointAngles = [
      base, shoulder, elbow, horizontal, vertical, rotation];
  const stepJointAngles = radianJointAngles.map(Number).map(convertRadianToStep);

  return `MC:${stepJointAngles.join(":")};`;
}

//console.log(formatMotorCmd({shoulder:-1.5}));

async function run() {
  console.log("Runnning");
  // Setup arduino and iotClient
  const arduino = await connectToArduino(arduinoConfig);
  console.log("Got arduino");
  const iotClient = await buildIotClient(iotClientConfig);
  console.log("Got IoT Client");

  // Handle config updates
  iotClient.on("config", (config) => {
    console.log(config);
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

run();
