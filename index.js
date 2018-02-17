const SerialPort = require("serialport");
const socketIO = require("socket.io");
const express = require("express");

const app = express();
const server = app.listen(3000);
const io = socketIO(server);
const arduino = new SerialPort("/dev/ttyACM0", {
  baudRate: 9600
});
arduino.setEncoding("ASCII");

arduino.on("data", (chunk)=> {
  console.log("arduino says", chunk);
});

function sendToArduino(msg) {
  return new Promise((resolve, reject) => {
    console.log("Sent message to arduino", msg);
    try {
      arduino.write(msg, err=> {
        if (err) reject(err);
        else resolve();
      });
    } catch (err) {
      reject(err);
    }
  });
}

io.on("connection", socket=>{
  socket.on("msg", text => {
    sendToArduino(text)
      .catch(console.error);
  });
});

// Handle configuration updates
function handleConfiguration(config) {
  for (const [ledId, state] of Object.entries(config.leds)) {
    sendToArduino(`LT:${ledId}:${state?"on":"off"};`);
  }
}

// Figure out how to wait for a "ready" message
// Will probably need to figure out how to handle
// breaking chunks into lines.
setTimeout(() => {
  const { messageEmitter } = require("./iot-cloud.js");
  
  // Subscribe to config updates
  messageEmitter.on("config", (config) => {
    handleConfiguration(config);
  });
}, 4000);
