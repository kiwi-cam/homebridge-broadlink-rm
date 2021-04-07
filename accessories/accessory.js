const uuid = require('uuid');

const { HomebridgeAccessory } = require('../base');

const sendData = require('../helpers/sendData');
const delayForDuration = require('../helpers/delayForDuration');
const catchDelayCancelError = require('../helpers/catchDelayCancelError');
const fakegatoHistory = require('fakegato-history')

let HistoryService

class BroadlinkRMAccessory extends HomebridgeAccessory {

  constructor(log, config = {}, serviceManagerType) {
    if (!config.name) config.name = "Unknown Accessory"

    config.resendDataAfterReload = config.resendHexAfterReload;
    if (config.host) {
      //Clean up MAC address formatting
      config.host = config.host.toLowerCase();
      if (!config.host.includes(".") && !config.host.includes(":") && config.host.length === 12){
        config.host = config.host.match(/[\s\S]{1,2}/g).join(':');
      }
    }

    super(log, config, serviceManagerType);
    if (config.debug) this.debug = true


    this.manufacturer = 'Broadlink';
    this.model = 'RM Mini or Pro';
    this.serialNumber = uuid.v4();
  }

  performSetValueAction({ host, data, log, name, debug }) {
    sendData({ host, hexData: data, log, name, debug });
  }

  getHistoryService() {
    if (this.historyService == null) {
      this.historyService = new HistoryService('weather', { displayName: 'Broadlink' }, {
        storage: 'fs',
      })
    }
    return this.historyService
  }

  reset() {
    // Clear Multi-hex timeouts
    if (this.intervalTimeoutPromise) {
      this.intervalTimeoutPromise.cancel();
      this.intervalTimeoutPromise = null;
    }

    if (this.pauseTimeoutPromise) {
      this.pauseTimeoutPromise.cancel();
      this.pauseTimeoutPromise = null;
    }
  }

  async performSend(data, actionCallback) {
    const { debug, config, host, log, name } = this;

    if (typeof data === 'string') {
      sendData({ host, hexData: data, log, name, debug });

      return;
    }

    await catchDelayCancelError(async () => {
      // Itterate through each hex config in the array
      for (let index = 0; index < data.length; index++) {
        const { pause } = data[index];

        await this.performRepeatSend(data[index], actionCallback);

        if (pause) {
          this.pauseTimeoutPromise = delayForDuration(pause);
          await this.pauseTimeoutPromise;
        }
      }
    });
  }

  async performRepeatSend(parentData, actionCallback) {
    const { host, log, name, debug } = this;
    let { data, interval, sendCount } = parentData;

    sendCount = sendCount || 1
    if (sendCount > 1) interval = interval || 0.1;

    // Itterate through each hex config in the array
    for (let index = 0; index < sendCount; index++) {
      sendData({ host, hexData: data, log, name, debug });

      if (interval && index < sendCount - 1) {
        this.intervalTimeoutPromise = delayForDuration(interval);
        await this.intervalTimeoutPromise;
      }
    }
  }
}

BroadlinkRMAccessory.setHomebridge = (homebridge) => {
  HistoryService = fakegatoHistory(homebridge);
}

module.exports = BroadlinkRMAccessory;
