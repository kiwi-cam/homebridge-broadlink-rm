const { assert } = require('chai');
const uuid = require('uuid');
const fs = require('fs');
const findKey = require('find-key');

const delayForDuration = require('../helpers/delayForDuration');
const ServiceManagerTypes = require('../helpers/serviceManagerTypes');
const catchDelayCancelError = require('../helpers/catchDelayCancelError');
const { getDevice } = require('../helpers/getDevice');
const AirconAccessory = require('./aircon');

class TemperatureSensorAccessory extends AirconAccessory {

  constructor (log, config = {}, serviceManagerType) {
    super(log, config, serviceManagerType);

    this.temperatureCallbackQueue = {};
  }

  setDefaults () {
    const { config, state } = this;

    // Set config default values
    config.temperatureUpdateFrequency = config.temperatureUpdateFrequency || 10;
    config.units = config.units ? config.units.toLowerCase() : 'c';
    config.temperatureAdjustment = config.temperatureAdjustment || 0;
    config.humidityAdjustment = config.humidityAdjustment || 0;

    // ignore Humidity if set to not use it, or using Temperature source that doesn't support it
    if(config.noHumidity){
      state.currentHumidity = null;
      config.noHumidity = true;
    } else {
      config.noHumidity = false;
    }

    state.firstTemperatureUpdate = true;
  }

  reset () {
    super.reset();
  }

  getBatteryAlert (callback) {
    const { config, name, state, log, debug } = this;

    const batteryAlert = state.batteryLevel <= 20? Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW : Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL;
    if (debug) log(`\x1b[34m[DEBUG]\x1b[0m ${name} Battery Alert:`,batteryAlert);

    callback(null, batteryAlert);
  }
  
  getBatteryLevel (callback) {
    const { config, name, state, log, debug } = this;
    if (debug) log(`\x1b[34m[DEBUG]\x1b[0m ${name} Battery Level:`,state.batteryLevel);
    callback(null, parseFloat(state.batteryLevel));
  }
  
  // Service Manager Setup

  setupServiceManager () {
    const { config, name, serviceManagerType } = this;

    this.serviceManager = new ServiceManagerTypes[serviceManagerType](name, Service.TemperatureSensor, this.log);

    this.serviceManager.addGetCharacteristic({
      name: 'currentTemperature',
      type: Characteristic.CurrentTemperature,
      method: this.getCurrentTemperature,
      bind: this
    });

    if (!config.noHumidity){
      this.serviceManager.addGetCharacteristic({
        name: 'currentHumidity',
        type: Characteristic.CurrentRelativeHumidity,
        method: this.getCurrentHumidity,
        bind: this
      })
    };
    
    if (config.batteryAlerts){
      this.serviceManager.addGetCharacteristic({
        name: 'batteryAlert',
        type: Characteristic.StatusLowBattery,
        method: this.getBatteryAlert,
        bind: this
      })
      
      this.serviceManager.addGetCharacteristic({
        name: 'batteryLevel',
        type: Characteristic.BatteryLevel,
        method: this.getBatteryLevel,
        bind: this
      })
    };
    
    this.serviceManager.addGetCharacteristic({
      name: 'temperatureDisplayUnits',
      type: Characteristic.TemperatureDisplayUnits,
      method: this.getTemperatureDisplayUnits,
      bind: this
    })

    this.serviceManager
      .getCharacteristic(Characteristic.CurrentTemperature)
      .setProps({
        minStep: 0.1
      });
  }
}

module.exports = TemperatureSensorAccessory
