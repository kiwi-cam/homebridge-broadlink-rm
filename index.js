const BroadlinkRMPlatform = require('./platform');
const fakegatoHistory = require( 'fakegato-history');

module.exports = (homebridge) => {
  global.HomebridgeAPI = homebridge;
  global.cachedAccessories = [];
  global.HistoryService = fakegatoHistory( homebridge );
  
  global.Service = homebridge.hap.Service;
  global.Accessory = homebridge.hap.Accessory;
  global.Characteristic = homebridge.hap.Characteristic;

  BroadlinkRMPlatform.setHomebridge(homebridge);

  homebridge.registerPlatform("homebridge-broadlink-rm", "BroadlinkRM", BroadlinkRMPlatform);
}
