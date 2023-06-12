const BroadlinkRMPlatform = require('./platform');
const fakegatoHistory = require( 'fakegato-history');

module.exports = (homebridge) => {
  HistoryService = fakegatoHistory( homebridge );
  
  global.Service = homebridge.hap.Service;
  global.Characteristic = homebridge.hap.Characteristic;

  BroadlinkRMPlatform.setHomebridge(homebridge);

  homebridge.registerPlatform("homebridge-broadlink-rm", "BroadlinkRM", BroadlinkRMPlatform);
}
