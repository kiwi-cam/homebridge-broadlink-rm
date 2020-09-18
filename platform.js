const { HomebridgePlatform } = require('homebridge-platform-helper');
const { assert } = require('chai');

const npmPackage = require('./package.json');
const Accessory = require('./accessories');
const checkForUpdates = require('./helpers/checkForUpdates');
const broadlink = require('./helpers/broadlink');
const { discoverDevices } = require('./helpers/getDevice');
const { createAccessory } = require('./helpers/accessoryCreator');

const classTypes = {
  'air-conditioner': Accessory.AirCon,
  'learn-ir': Accessory.LearnCode,
  'learn-code': Accessory.LearnCode,
  'switch': Accessory.Switch,
  'garage-door-opener': Accessory.GarageDoorOpener,
  'lock': Accessory.Lock,
  'switch-multi': Accessory.SwitchMulti,
  'switch-multi-repeat': Accessory.SwitchMultiRepeat,
  'switch-repeat': Accessory.SwitchRepeat,
  'fan': Accessory.Fan,
  'outlet': Accessory.Outlet,
  'light': Accessory.Light,
  'window-covering': Accessory.WindowCovering,
  'tv': Accessory.TV
}

let homebridgeRef

const BroadlinkRMPlatform = class extends HomebridgePlatform {

  constructor (log, config = {}) {
    super(log, config, homebridgeRef);
  }

  addAccessories (accessories) {
    const { config, log } = this;
    const { debug } = config;

    this.discoverBroadlinkDevices();
    this.showMessage();
    setTimeout(checkForUpdates, 1800);

    if (!config.accessories) config.accessories = []

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
    let tvs = [];
    config.accessories.forEach((accessory) => {
      if (!accessory.type) throw new Error(`Each accessory must be configured with a "type". e.g. "switch"`);

      if (!classTypes[accessory.type]) throw new Error(`homebridge-broadlink-rm doesn't support accessories of type "${accessory.type}".`);

      const homeKitAccessory = new classTypes[accessory.type](log, accessory);

      if (classTypes[accessory.type] === classTypes.tv) {
        if(accessory.subType.toLowerCase() === 'stb'){homeKitAccessory.subType = homebridgeRef.hap.Accessory.Categories.TV_SET_TOP_BOX;}
        if(accessory.subType.toLowerCase() === 'receiver'){homeKitAccessory.subType = homebridgeRef.hap.Accessory.Categories.AUDIO_RECEIVER;}
        if(accessory.subType.toLowerCase() === 'stick'){homeKitAccessory.subType = homebridgeRef.hap.Accessory.Categories.TV_STREAMING_STICK;}
        
        if (debug) log(`\x1b[34m[DEBUG]\x1b[0m Adding Accessory ${accessory.type} (${accessory.subType})`);
        tvs.push(homeKitAccessory);
        return;
      }

      if (debug) log(`\x1b[34m[DEBUG]\x1b[0m Adding Accessory ${accessory.type} (${accessory.subType})`);
      accessories.push(homeKitAccessory);
    });

    if (tvs.length > 0) {
      if (tvs.length > 0) {
        const TV = homebridgeRef.hap.Accessory.Categories.TELEVISION;
        homebridgeRef.publishExternalAccessories(this, tvs.map(tv => createAccessory(tv, tv.name, TV, homebridgeRef, tv.subType)));

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
    const { config, log } = this;
    const { debug, hosts } = config;

    if (!hosts) {
      log(`\x1b[35m[INFO]\x1b[0m Automatically discovering Broadlink RM devices.`)
      discoverDevices(true, log, debug, config.deviceDiscoveryTimeout);

      return;
    }
    
    discoverDevices(false, log, debug);

    log(`\x1b[35m[INFO]\x1b[0m Automatic Broadlink RM device discovery has been disabled as the "hosts" option has been set.`)

    assert.isArray(hosts, `\x1b[31m[CONFIG ERROR] \x1b[33mhosts\x1b[0m should be an array of objects.`)
      
    hosts.forEach((host) => {
      assert.isObject(host, `\x1b[31m[CONFIG ERROR] \x1b[0m Each item in the \x1b[33mhosts\x1b[0m array should be an object.`)
      
      const { address, isRFSupported, mac } = host;
      assert(address, `\x1b[31m[CONFIG ERROR] \x1b[0m Each object in the \x1b[33mhosts\x1b[0m option should contain a value for \x1b[33maddress\x1b[0m (e.g. "192.168.1.23").`)
      assert(mac, `\x1b[31m[CONFIG ERROR] \x1b[0m Each object in the \x1b[33mhosts\x1b[0m option should contain a unique value for \x1b[33mmac\x1b[0m (e.g. "34:ea:34:e7:d7:28").`)

      const deviceType = isRFSupported ? 0x279d : 0x2712;

      broadlink.addDevice({ address, port: 80 }, mac, deviceType);
    })
  }

  showMessage () {
    const { config, log } = this;

    if (config && (config.hideWelcomeMessage || config.isUnitTest)) {
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
