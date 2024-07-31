const { createHash, randomBytes } = require('crypto');

// adapted from https://github.com/bwp91/homebridge-meross
const merossCheckAlive = (accessoryIp, accessoryUuid, userKey, wattageThreshold, interval, callback) => {
  setInterval(() => {
    const timestamp = Math.floor(Date.now() / 1000);
    const messageId = randomBytes(16).toString('hex');
    const sign = createHash('md5').update(messageId + userKey + timestamp).digest('hex');

    fetch(`http://${accessoryIp}/config`, {
      method: 'POST',
      headers: new Headers({
        'Content-Type': 'application/json',
      }),
      body: JSON.stringify({
        header: {
          from: 'anything',
          messageId,
          method: 'GET',
          namespace: 'Appliance.Control.Electricity',
          payloadVersion: 1,
          sign,
          timestamp,
          triggerSrc: 'iOSLocal',
          uuid: accessoryUuid,
        },
        payload: {},
      }),
      signal: AbortSignal.timeout(1000),
    }).then((response) => {
      return response.json();
    }).then((data) => {
      const currentWattage = data.payload.electricity.power / 1000;
      callback(currentWattage >= wattageThreshold);
    }).catch(() => {
      callback(false);
    });
  }, interval * 1000);
}

module.exports = merossCheckAlive;
