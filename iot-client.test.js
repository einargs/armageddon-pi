const { buildIotClient } = require("./iot-cloud");

const iotClientConfig = require("./iot-client.config");

async function testIotClient() {
  const iotClient = await buildIotClient(iotClientConfig);
  iotClient.on("config", (config) => {
    console.log("Config", typeof config, config);
  });
}

testIotClient();
