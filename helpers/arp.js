const arp = require('node-arp');

const arpIPAddress = (ipAddress, interval, callback) => {
  setInterval(() => {
    arp.getMAC(ipAddress, (err, mac) => {
      // Validate received MAC address
      if (!err && /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/.test(mac)) {
        callback(true)
      } else {
        callback(false)
      }
    });
  }, interval * 1000);
}

module.exports = arpIPAddress;
  