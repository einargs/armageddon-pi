const split = require("split");
const SerialPort = require("serialport");

// Should be used by makeArduinoStream
//NOTE: The readyLine should only be a single line;
// the lineOut stream is used to listen for it.
//NOTE: Is readyLine a more confusing name than readyMessage?
class Arduino {
  constructor({portPath, baudRate, readyLine}) {
    // Store info
    this.portPath = portPath;
    this.baudRate = baudRate;
    this.readyLine = readyLine;

    // Setup serial port connection
    this.serialPort = new SerialPort(portPath, { baudRate });
    this.serialPort.setEncoding("ASCII");

    // Split defaults to spliting on newlines
    this.lineOut = this.serialPort.pipe(split());
  }

  send(msg) {
    return new Promise((resolve, reject) => {
      this.serialPort.write(msg, (err) => {
        console.log("send message", msg);
        if (err) reject(err);
        else resolve();
      });
    });
  }
}

// Returns a promise that resolves with the arduino
// once the arduino has sent the readyLine message
function connectToArduino(options) {
  // Promise returns the stream once the readyLine is recieved
  return new Promise((resolve, reject) => {
    // Make the arduino
    const arduino = new Arduino(options);

    // Listen for the readyLine
    arduino.lineOut.on("data", function readyListener(line) {
      if (line === arduino.readyLine) {
        arduino.lineOut.removeListener("data", readyListener);
        resolve(arduino);
      }
    });
  });
}


module.exports = {
  connectToArduino
};
