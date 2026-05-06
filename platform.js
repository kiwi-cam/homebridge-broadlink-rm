const { HomebridgePlatform } = require('./base');
const { assert } = require('chai');

const npmPackage = require('./package.json');
const Accessory = require('./accessories');
const checkForUpdates = require('./helpers/checkForUpdates');
const broadlink = require('./helpers/broadlink');
const { discoverDevices } = require('./helpers/getDevice');
const { createAccessory } = require('./helpers/accessoryCreator');

const classTypes = {
  'air-conditioner': Accessory.AirCon,
  'air-purifier': Accessory.AirPurifier,
  'humidifier-dehumidifier': Accessory.HumidifierDehumidifier,
  'learn-ir': Accessory.LearnCode,
  'learn-code': Accessory.LearnCode,
  'switch': Accessory.Switch,
  'garage-door-opener': Accessory.GarageDoorOpener,
  'lock': Accessory.Lock,
  'switch-multi': Accessory.SwitchMulti,
  'switch-multi-repeat': Accessory.SwitchMultiRepeat,
  'switch-repeat': Accessory.SwitchRepeat,
  'fan': Accessory.Fan,
  'fanv1': Accessory.Fanv1,
  'outlet': Accessory.Outlet,
  'light': Accessory.Light,
  'window': Accessory.Window,
  'window-covering': Accessory.WindowCovering,
  'tv': Accessory.TV,
  'temperatureSensor': Accessory.TemperatureSensor,
  'humiditySensor': Accessory.HumiditySensor,
  'heater-cooler': Accessory.HeaterCooler
}

let homebridgeRef

const BroadlinkRMPlatform = class extends HomebridgePlatform {

  constructor (log, config = {}) {
    super(log, config, homebridgeRef);
  }

  addAccessories (accessories) {
    const { config, log, logLevel } = this;

    this.discoverBroadlinkDevices();
    this.showMessage();
    setTimeout(() => checkForUpdates(log), 1800);

    if (!config.accessories) {config.accessories = []}

    // Add a Learn Code accessory if none exist in the config
    const learnIRAccessories = (config && config.accessories && Array.isArray(config.accessories)) ? config.accessories.filter((accessory) => (accessory.type === 'learn-ir' || accessory.type === 'learn-code')) : [];

    if (learnIRAccessories.length === 0) {

      if (!config.hideLearnButton) {
        const learnCodeAccessory = new Accessory.LearnCode(log, { name: 'Learn', scanFrequency: false });
        accessories.push(learnCodeAccessory);
      }

      if (!config.hideScanFrequencyButton) {
        const scanFrequencyAccessory = new Accessory.LearnCode(log, { name: 'Scan Frequency', scanFrequency: true });
        accessories.push(scanFrequencyAccessory);
      }
    }

    // Iterate through the config accessories
    const tvs = [];
    config.accessories.forEach((accessory) => {
      if (!accessory.type) {throw new Error(`Each accessory must be configured with a "type". e.g. "switch"`);}
      if (accessory.disabled) {return;}
      if (!classTypes[accessory.type]) {throw new Error(`homebridge-broadlink-rm doesn't support accessories of type "${accessory.type}".`);}

      const homeKitAccessory = new classTypes[accessory.type](log, accessory);

      if (classTypes[accessory.type] === classTypes.tv) {
        if(accessory.subType.toLowerCase() === 'stb'){homeKitAccessory.subType = homebridgeRef.hap.Categories.TV_SET_TOP_BOX;}
        if(accessory.subType.toLowerCase() === 'receiver'){homeKitAccessory.subType = homebridgeRef.hap.Categories.AUDIO_RECEIVER;}
        if(accessory.subType.toLowerCase() === 'stick'){homeKitAccessory.subType = homebridgeRef.hap.Categories.TV_STREAMING_STICK;}

        if (logLevel <=1) {log(`\x1b[34m[DEBUG]\x1b[0m Adding Accessory ${accessory.type} (${accessory.subType})`);}
        tvs.push(homeKitAccessory);
        return;
      }

      if (logLevel <=1) {log(`\x1b[34m[DEBUG]\x1b[0m Adding Accessory ${accessory.type} (${accessory.subType})`);}
      accessories.push(homeKitAccessory);
    });

    if (tvs.length > 0) {
      if (tvs.length > 0) {
        const TV = homebridgeRef.hap.Categories.TELEVISION;
        homebridgeRef.publishExternalAccessories('homebridge-broadlink-rm', tvs.map(tv => createAccessory(tv, tv.name, TV, homebridgeRef, tv.subType)));

        log('');
        log(`**************************************************************************************************************`);
        log(`You added TVs in your configuration!`);
        log(`Due to a HomeKit limitation you need to add any TVs to the Home app by using the Add Accessory function.`);
        log(`There you'll find your TVs and you can use the same PIN as you using for this HomeBridge instance.`);
        log(`**************************************************************************************************************`);
        log('');
      }
    }
  }

  discoverBroadlinkDevices () {
    const { config, log, logLevel } = this;
    const { hosts } = config;

    if (!hosts) {
      if (logLevel <=2) {log(`\x1b[35m[INFO]\x1b[0m Automatically discovering Broadlink RM devices.`)}
      discoverDevices(true, log, logLevel, config.deviceDiscoveryTimeout);

      return;
    }

    discoverDevices(false, log, logLevel);

    if (logLevel <=2) {log(`\x1b[35m[INFO]\x1b[0m Automatic Broadlink RM device discovery has been disabled as the "hosts" option has been set.`)}

    assert.isArray(hosts, `\x1b[31m[CONFIG ERROR] \x1b[33mhosts\x1b[0m should be an array of objects.`)

    hosts.forEach((host) => {
      assert.isObject(host, `\x1b[31m[CONFIG ERROR] \x1b[0m Each item in the \x1b[33mhosts\x1b[0m array should be an object.`)

      const { address, isRFSupported, isRM4, mac } = host;
      assert(address, `\x1b[31m[CONFIG ERROR] \x1b[0m Each object in the \x1b[33mhosts\x1b[0m option should contain a value for \x1b[33maddress\x1b[0m (e.g. "192.168.1.23").`)
      assert(mac, `\x1b[31m[CONFIG ERROR] \x1b[0m Each object in the \x1b[33mhosts\x1b[0m option should contain a unique value for \x1b[33mmac\x1b[0m (e.g. "34:ea:34:e7:d7:28").`)

      //Create manual device type
      let deviceType = 0x2221;
      deviceType = isRFSupported ? (deviceType | 0x2) : deviceType;
      deviceType = isRM4 ? (deviceType | 0x4) : deviceType;
      // RM4 Pro firmware validates the deviceType bytes in incoming request
      // packets and only accepts its real type 0x520b — the synthetic 0x2227
      // ("Manual RM4 Pro Device") is in the lib's lookup table for client-side
      // routing but is rejected by the device itself. Without this swap, even
      // packets with correct MAC bytes get dropped server-side and auth
      // never completes. Diagnosed 2026-05-05.
      if (deviceType === 0x2227) deviceType = 0x520b;
      
      // The Device class indexes `this.mac[5..0]` to write the MAC into the
      // request packet header (sendPacket, bytes 0x2a..0x2f), expecting a
      // Buffer. Passing the MAC as a string makes those indices return
      // single chars whose Number coercion produces NaN→0 (and stray digits
      // for `0-9` chars), so the MAC bytes in every outgoing packet are
      // garbage. RM3 devices ignore those bytes; RM4 Pro firmware validates
      // them and silently drops the request — auth never completes.
      const macBuffer = Buffer.from(mac.replace(/:/g, ''), 'hex');
      broadlink.addDevice({ address, port: 80 }, macBuffer, deviceType);
    })
  }

  showMessage () {
    const { config, log } = this;

    if (config && (config.hideWelcomeMessage || config.isUnitTest || this.logLevel >=4)) {
      log(`\x1b[35m[INFO]\x1b[0m Running Homebridge Broadlink RM Plugin version \x1b[32m${npmPackage.version}\x1b[0m`)

      return
    }

    setTimeout(() => {
      log('')
      log(`**************************************************************************************************************`)
      log(`** Welcome to version \x1b[32m${npmPackage.version}\x1b[0m of the \x1b[34mHomebridge Broadlink RM Plugin\x1b[0m!`)
      log('** ')
      log(`** Find out what's in the latest release here: \x1b[4mhttps://github.com/kiwi-cam/homebridge-broadlink-rm/blob/master/CHANGELOG.md\x1b[0m`)
      log(`** `)
      log(`** If you like this plugin then please star it on GitHub or better yet`)
      log(`** buy me a drink using Paypal \x1b[4mhttps://paypal.me/kiwicamRM\x1b[0m.`)
      log(`**`)
      log(`** You can disable this message by adding "hideWelcomeMessage": true to the config (see config-sample.json).`)
      log(`**`)
      log(`**************************************************************************************************************`)
      log('')
    }, 1500)
  }
}

BroadlinkRMPlatform.setHomebridge = (homebridge) => {
  homebridgeRef = homebridge
}

module.exports = BroadlinkRMPlatform
