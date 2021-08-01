const persistentState = require('./helpers/persistentState')
const semver = require('semver');

if (semver.lt(process.version, '7.6.0')) {throw new Error(`Homebridge plugins that use the "homebridge-platform-helper" library require your node version to be at least the v12.14.0 LTM. Current version: ${process.version}`)}

class HomebridgePlatform {

  constructor (log, config = {}, homebridge) {
    this.log = log;
    this.config = config;
    this.homebridge = homebridge;

    const { homebridgeDirectory } = config;

    persistentState.init({ homebridge, homebridgeDirectory });

    //Set LogLevel
    switch(this.config.logLevel){
      case 'none':
        this.logLevel = 6;
        break;
      case 'critical':
        this.logLevel = 5;
        break;
      case 'error':
        this.logLevel = 4;
        break;
      case 'warning':
        this.logLevel = 3;
        break;
      case 'info':
        this.logLevel = 2;
        break;
      case 'debug':
        this.logLevel = 1;
        break;
      case 'trace':
        this.logLevel = 0;
        break;
      default:
        //default to 'info':
        if(this.config.logLevel !== undefined) {log(`\x1b[31m[CONFIG ERROR] \x1b[33mlogLevel\x1b[0m should be one of: trace, debug, info, warning, error, critical, or none.`);}
        this.logLevel = 2;
        break;
    }
    if(this.config.debug) {this.logLevel = Math.min(1, this.logLevel);}
    if(this.config.disableLogs) {this.logLevel = 6;}  
  }

  async addAccessories (accessories) {
    throw new Error('The addAccessories method must be overridden.')
  }

  async accessories (callback) {
    const { config, log } = this;
    const { name, disableLogs } = config;

    const accessories = [];

    await this.addAccessories(accessories);

    // Disable logs if requested
    if (disableLogs !== undefined) {
      accessories.forEach((accessory) => {
        if (accessory.config.disableLogs === undefined) {
          accessory.disableLogs = disableLogs
        }
      })
    }

    // Check for no accessories
    if (!config.accessories || config.accessories.length === 0) {
      if (!disableLogs) {log(`No accessories have been added to the "${name}" platform config.`);}
      return callback(accessories);
    }

    // Let accessories know about one-another if they wish
    accessories.forEach((accessory) => {
      if (accessory.updateAccessories) {accessory.updateAccessories(accessories);}
    })

    callback(accessories);
  }
}

module.exports = HomebridgePlatform;
