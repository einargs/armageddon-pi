const { connectToArduino } = require("./arduino");

const arduinoConfig = require("./arduino.config");

const rawMotorPosArg = process.argv[2];

function getMotorCmd(rawString) {
  const values = rawString.split(":");
  for (let i = 0; i<6; i++) {
    if (!values[i]) values[i] = 0;
  }
  return `MC:${values.join(":")};`;
}


console.log(rawMotorPosArg);
console.log(getMotorCmd(rawMotorPosArg));

async function run() {
  const arduino = await connectToArduino(arduinoConfig);
  arduino.send(getMotorCmd(rawMotorPosArg));
  //process.exit(0);
}

run();
