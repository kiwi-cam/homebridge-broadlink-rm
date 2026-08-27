const ping = require('ping');
const broadlink = require('./broadlink');
const delayForDuration = require('./delayForDuration');
const dgram = require('dgram');
const Mutex = require('await-semaphore').Mutex;

const pingFrequency = 5000;
const keepAliveFrequency = 90000;
const pingTimeout = 5;

// Default interval (minutes) for the scheduled re-discovery sweep.
// Broadcast discovery is the only reliable MAC -> IP mapping we have, so we
// re-run it periodically instead of only once at startup. That way a device
// that took a new DHCP lease, or that was offline when Homebridge booted, is
// picked up without a restart.
const defaultRediscoveryInterval = 60;

const startKeepAlive = (device, log) => {
  if(!device.host.port) {return;}
  if(device.keepAliveStarted) {return;} // deviceReady fires again on re-auth
  device.keepAliveStarted = true;
  setInterval(() => {
    if(broadlink.debug) {log('\x1b[33m[DEBUG]\x1b[0m Sending keepalive to', device.host.address,':',device.host.port)}
    const socket = dgram.createSocket({ type:'udp4', reuseAddr:true }); 
    const packet = Buffer.alloc(0x30, 0);
    packet[0x26] = 0x1;
    socket.send(packet, 0, packet.length, device.host.port, device.host.address, (err, bytes) => {
      if (err) {log('\x1b[33m[DEBUG]\x1b[0m send keepalive packet error', err)}
    });
    socket.close();
  }, keepAliveFrequency);
}

const startPing = (device, log) => {
  if(device.pingStarted) {return;} // deviceReady fires again on re-auth
  device.pingStarted = true;
  device.state = 'unknown';
  device.retryCount = 1;

  setInterval(() => {
    try {
      ping.sys.probe(device.host.address, (active, err) => {
        if(err){
          log(`Error pinging Broadlink RM device at ${device.host.address} (${device.host.macAddress || ''}): ${err}`);
          throw err;
        }
        
        if (!active && device.state === 'active' && device.retryCount === 2) {
          log(`Broadlink RM device at ${device.host.address} (${device.host.macAddress || ''}) is no longer reachable after three attempts.`);

          device.state = 'inactive';
          device.retryCount = 0;

          // A device that dropped off its address is exactly the case a
          // broadcast sweep can fix, so kick one off immediately rather than
          // waiting for the next scheduled sweep.
          runDiscoveryBurst(log, 15);
        } else if (!active && device.state === 'active') {
          if(broadlink.debug) {log(`Broadlink RM device at ${device.host.address} (${device.host.macAddress || ''}) is no longer reachable. (attempt ${device.retryCount})`);}

          device.retryCount += 1;
        } else if (active && device.state !== 'active') {
          if (device.state === 'inactive') {log(`Broadlink RM device at ${device.host.address} (${device.host.macAddress || ''}) has been re-discovered.`);}

          device.state = 'active';
          device.retryCount = 0;
        } else if (active && device.retryCount !== 0 ) {
          //Acive - reset retry counter
          device.retryCount = 0;
        }
      }, {timeout: pingTimeout})
    } catch (err) {
      log(`Error pinging Broadlink RM device at ${device.host.address} (${device.host.macAddress || ''}): ${err}`);
    }
  }, pingFrequency);
}

const discoveredDevices = {};
const manualDevices = {};
let discoverDevicesInterval;

// Helpers below implement MAC-first addressing and scheduled re-discovery.
const macAddressPattern = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/;

const normaliseMac = (mac) => {
  if (!mac) {return null;}
  if (Buffer.isBuffer(mac)) {
    return (mac.toString('hex').match(/[\s\S]{1,2}/g) || []).join(':').toLowerCase();
  }
  const value = mac.toString();
  if (value.includes(':')) {return value.toLowerCase();}
  return (value.match(/[\s\S]{1,2}/g) || []).join(':').toLowerCase();
}

const isLinkLocal = (address) => typeof address === 'string' && address.startsWith('169.254.');

let discoveryBurstInterval = null;

// Fire a short burst of broadcast discovery packets. Broadlink devices only
// answer a broadcast, so a burst is how we learn the current IP of every device
// on the LAN, keyed by MAC.
const runDiscoveryBurst = (log, durationSeconds = 30) => {
  if (discoveryBurstInterval) {return;} // a burst is already in flight

  discoveryBurstInterval = setInterval(() => {
    broadlink.discover();
  }, 2000);

  broadlink.discover();

  const stop = () => {
    clearInterval(discoveryBurstInterval);
    discoveryBurstInterval = null;
  }

  delayForDuration(durationSeconds).then(stop).catch(stop);
}

// Log one line per known device so an unhealthy device is visible in the log
// without having to reproduce a failed send.
const reportDeviceHealth = (log) => {
  const seen = {};

  Object.keys(discoveredDevices).forEach((key) => {
    const device = discoveredDevices[key];
    if (!device || typeof device !== 'object') {return;}

    const mac = device.host.macAddress || normaliseMac(device.mac) || key;
    if (seen[mac]) {return;}
    seen[mac] = true;

    const address = device.host.address;
    const reachable = device.state === undefined ? 'unknown' : device.state;
    const authenticated = device.authenticated === undefined ? 'unknown' : (device.authenticated ? 'yes' : 'no');

    if (isLinkLocal(address)) {
      log(`\x1b[31m[ERROR]\x1b[0m Broadlink device ${mac} is on a link-local address (${address}). It failed to get a DHCP lease, so it can only be reached by broadcast and will not respond to commands. Reserve an IP for this MAC on the router and power-cycle the device.`);
      return;
    }

    log(`\x1b[35m[INFO]\x1b[0m Broadlink health: ${mac} at ${address} - reachable: ${reachable}, authenticated: ${authenticated}`);
  });

  Object.keys(manualDevices).forEach((key) => {
    log(`\x1b[33m[WARN]\x1b[0m Broadlink device ${key} has never been discovered on this network. Check that it is powered on and joined to the same VLAN/subnet as Homebridge.`);
  });
}

const discoverDevices = (automatic = true, log, logLevel, deviceDiscoveryTimeout = 60, rediscoveryInterval = defaultRediscoveryInterval) => {
  broadlink.log = log;
  broadlink.debug = logLevel <=1;
  //broadlink.logLevel = logLevel;

  if (automatic) {
    this.discoverDevicesInterval = setInterval(() => {
      broadlink.discover();
    }, 2000);

    delayForDuration(deviceDiscoveryTimeout).then(() => {
      clearInterval(this.discoverDevicesInterval);
    });

    broadlink.discover();
  }

  broadlink.on('deviceReady', (device) => {
    let macAddressParts, macAddress;
    if (device.mac.includes(":")) {
      macAddress = device.mac;
    }else{
      macAddressParts = device.mac.toString('hex').match(/[\s\S]{1,2}/g) || [];
      macAddress = macAddressParts.join(':');
    }
    device.host.macAddress = macAddress;

    log(`\x1b[35m[INFO]\x1b[0m Discovered ${device.model} (${device.type.toString(16)}) at ${device.host.address} (${device.host.macAddress})`);
    addDevice(device);

    startPing(device, log);
    startKeepAlive(device, log);
  })

  // A device that changed IP re-authenticates against its new address.
  // Re-index it so lookups by the old IP stop resolving to it.
  broadlink.on('deviceMoved', (device) => {
    const macAddress = normaliseMac(device.mac);
    device.host.macAddress = macAddress;

    // Only re-index a device that was already usable. One that has never
    // authenticated - a device sitting on a link-local address, for instance -
    // is registered by the deviceReady handler once its handshake succeeds.
    // Registering it here would hand accessories a device they cannot reach,
    // turning a fast "no device found" into a read that never responds.
    if (discoveredDevices[macAddress]) {addDevice(device);}
  })

  // Scheduled sweep. Runs in both automatic and manual-hosts mode - in manual
  // mode the configured addresses are only a starting hint, and the sweep is
  // what keeps them correct when DHCP hands out a different IP.
  if (rediscoveryInterval > 0) {
    // Always keep a broadcast sweep available, even when "hosts" is configured
    // and the initial automatic discovery was skipped.
    if (!automatic) {runDiscoveryBurst(log, deviceDiscoveryTimeout);}

    setInterval(() => {
      log(`\x1b[35m[INFO]\x1b[0m Running scheduled Broadlink device discovery (every ${rediscoveryInterval} minutes).`);
      runDiscoveryBurst(log, 30);

      delayForDuration(35).then(() => reportDeviceHealth(log)).catch(() => {});
    }, rediscoveryInterval * 60 * 1000);
  }
}

const addDevice = (device) => {
  // Index by MAC first and drop any stale IP key, so a device that moved to a
  // new address is reachable under its new IP and not its old one.
  const macAddress = device.host.macAddress || normaliseMac(device.mac);

  if (device.isUnitTestDevice) {
    device.mutex = device.mutex || new Mutex();
    discoveredDevices[device.host.address] = device;
    if (macAddress) {discoveredDevices[macAddress] = device;}
    return;
  }

  if (!device.mutex) {device.mutex = new Mutex();}

  // Remove any address key that used to point at this device but no longer
  // matches its current address.
  Object.keys(discoveredDevices).forEach((key) => {
    if (discoveredDevices[key] === device && key !== macAddress && key !== device.host.address) {
      delete discoveredDevices[key];
    }
  });

  discoveredDevices[device.host.address] = device;
  if (macAddress) {
    discoveredDevices[macAddress] = device;
    // A real device turned up for this MAC, so the placeholder is obsolete.
    delete manualDevices[macAddress];
  }
}

const getDevice = ({ host, log, learnOnly }) => {
  let device;

  if (host) {
    // Accessories reference devices by MAC, so normalise the lookup key before
    // going to the index.
    const key = macAddressPattern.test(host) ? host.toLowerCase() : host;
    device = discoveredDevices[key];

    // Create manual device
    if (!device && !manualDevices[key]) {
      // A MAC is not routable - there is nothing to ping or keep alive, so just
      // record that we are still waiting for this device to be discovered.
      if (macAddressPattern.test(key)) {
        manualDevices[key] = { host: { macAddress: key } };
      } else {
        const device = { host: { address: key } };
        manualDevices[key] = device;

        startPing(device, log);
        startKeepAlive(device, log);
      }
    }
  } else { // use the first one of no host is provided
    const hosts = Object.keys(discoveredDevices);
    if (hosts.length === 0) {
      // log(`Send data (no devices found)`);

      return;
    }

    // Only return device that can Learn Code codes
    if (learnOnly) {
      for (let i = 0; i < hosts.length; i++) {
        const currentDevice = discoveredDevices[hosts[i]];

        if (currentDevice.enterLearning) {
          device = currentDevice

          break;
        }
      }

      if (!device) {log(`Learn Code (no device found at ${host})`);}
    } else {
      device = discoveredDevices[hosts[0]];

      if (!device) {log(`Send data (no device found at ${host})`);}
    }
  }

  return device;
}

module.exports = { getDevice, discoverDevices, addDevice };
