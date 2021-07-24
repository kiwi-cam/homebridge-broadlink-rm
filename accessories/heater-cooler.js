const { assert } = require('chai');
const uuid = require('uuid');
const fs = require('fs');
const findKey = require('find-key');

const delayForDuration = require('../helpers/delayForDuration');
const ServiceManagerTypes = require('../helpers/serviceManagerTypes');
const catchDelayCancelError = require('../helpers/catchDelayCancelError');
const { getDevice, discoverDevices } = require('../helpers/getDevice');
const BroadlinkRMAccessory = require('./accessory');

// Initializing predefined constants based on homekit API
// All temperature values passed and received from homekit API are defined in degree Celsius
let COOLING_THRESHOLD_TEMPERATURE = {
  minValue: 10,
  maxValue: 30,
  minStep: 0.1
}

let HEATING_THRESHOLD_TEMPERATURE = {
  minValue: 18,
  maxValue: 25,
  minStep: 0.1
}

const CharacteristicName = {
  ACTIVE: "active",
  CURRENT_HEATER_COOLER_STATE: "currentHeaterCoolerState",
  TARGET_HEATER_COOLER_STATE: "targetHeaterCoolerState",
  CURRENT_TEMPERATURE: "currentTemperature",
  COOLING_THRESHOLD_TEMPERATURE: "coolingThresholdTemperature",
  HEATING_THRESHOLD_TEMPERATURE: "heatingThresholdTemperature",
  ROTATION_SPEED: "rotationSpeed",
  SWING_MODE: "swingMode",
  SLEEP: "sleep"
}

/**
 * This accessory implements the HAP Service and Characteristics as documented under
 * https://developers.homebridge.io/#/service/HeaterCooler.
 * 
 * Implemented Characteristics
 *  1. Active
 *  2. Current Heater Cooler State
 *  3. Target Heater Cooler State (Cool & Heat only)
 *  4. Current Temperature
 *  5. Cooling Threshold Temperature
 *  6. Heating Threshold Temperature
 *  7. Rotation Speed
 *  8. Swing Mode (Oscillation)
 */
class HeaterCoolerAccessory extends BroadlinkRMAccessory {
  /**
   * 
   * @param {func} log - function used for logging
   * @param {object} config - object with config data for accessory 
   * @param {classType} serviceManagerType - represents object type of service manager
   */
  constructor(log, config = {}, serviceManagerType) {
    super(log, config, serviceManagerType);

    // Fakegato setup
    if (config.noHistory !== true) {
      this.displayName = config.name;
      this.lastUpdatedAt = undefined;
      this.historyService = new HistoryService("room", this, { storage: 'fs', filename: 'RMPro_' + config.name.replace(' ', '-') + '_persist.json' });
      this.historyService.log = this.log;
    }

    this.temperatureCallbackQueue = {};
    this.monitorTemperature();
  }

  /**
   * Setting default state of accessory for each defined characteristic. This ensures that
   * getCharacteristic calls provide valid data on first run.
   * Prerequisties: this.config is validated and defaults are initialized.
   */
  setDefaults() {
    const { config, state } = this
    const { coolingThresholdTemperature, heatingThresholdTemperature, defaultMode, defaultRotationSpeed } = config

    // For backwards compatibility with resend hex
    if (config.preventResendHex === undefined && config.allowResend === undefined) {
      config.preventResendHex = false;
    } else if (config.allowResend !== undefined) {
      config.preventResendHex = !config.allowResend;
    }
    config.allowResend = !config.preventResendHex;

    config.turnOnWhenOff = config.turnOnWhenOff === undefined ? true : config.turnOnWhenOff;

    state.active = state.active || Characteristic.Active.INACTIVE
    state.currentHeaterCoolerState = state.currentHeaterCoolerState || Characteristic.CurrentHeaterCoolerState.INACTIVE

    if (state.coolingThresholdTemperature === undefined) { state.coolingThresholdTemperature = coolingThresholdTemperature }
    if (state.heatingThresholdTemperature === undefined) { state.heatingThresholdTemperature = heatingThresholdTemperature }
    if (state.targetHeaterCoolerState === undefined) {
      state.targetHeaterCoolerState = defaultMode === "cool" ? Characteristic.TargetHeaterCoolerState.COOL : Characteristic.TargetHeaterCoolerState.HEAT
    }
    if (state.currentTemperature === undefined) { state.currentTemperature = config.defaultNowTemperature }
    config.temperatureAdjustment = config.temperatureAdjustment || 0;
    config.humidityAdjustment = config.humidityAdjustment || 0;
    if (config.mqttURL) {
      //MQTT updates when published so frequent refreshes aren't required ( 10 minute default as a fallback )
      config.temperatureUpdateFrequency = config.temperatureUpdateFrequency || 600;
    } else {
      config.temperatureUpdateFrequency = config.temperatureUpdateFrequency || 10;
    }
    if(config.mqttURL && config.useCachedTemperature === undefined){
      config.useCachedTemperature = true;
    }else{
      config.useCachedTemperature = config.useCachedTemperature || false;
    }

    const { internalConfig } = config
    const { available } = internalConfig
    if (available.cool.rotationSpeed || available.heat.rotationSpeed) {
      if (state.rotationSpeed === undefined) { state.rotationSpeed = defaultRotationSpeed }
    }
    if (available.cool.swingMode || available.heat.swingMode) {
      if (state.swingMode === undefined) { state.swingMode = Characteristic.SwingMode.SWING_DISABLED }
    }
  }


  /**
   ********************************************************
   *                       SETTERS                        *
   ********************************************************
   */
  /**
   * Updates the characteristic value for current heater cooler in homebridge service along with
   * updating cached state based on whether the device is set to cool or heat.
   */
  updateServiceCurrentHeaterCoolerState() {
    const { serviceManager, state, log, logLevel } = this
    const { targetHeaterCoolerState } = state

    if (!state.active) {
      state.currentHeaterCoolerState = Characteristic.CurrentHeaterCoolerState.INACTIVE
      delayForDuration(0.25).then(() => {
        serviceManager.setCharacteristic(Characteristic.CurrentHeaterCoolerState, Characteristic.CurrentHeaterCoolerState.INACTIVE)
      })
      return
    }
    switch (targetHeaterCoolerState) {
      // TODO: support Auto mode
      case Characteristic.TargetHeaterCoolerState.HEAT:
        state.currentHeaterCoolerState = Characteristic.CurrentHeaterCoolerState.HEATING
        delayForDuration(0.25).then(() => {
          serviceManager.setCharacteristic(Characteristic.CurrentHeaterCoolerState, Characteristic.CurrentHeaterCoolerState.HEATING)
        })
        break
      case Characteristic.TargetHeaterCoolerState.COOL:
        state.currentHeaterCoolerState = Characteristic.CurrentHeaterCoolerState.COOLING
        delayForDuration(0.25).then(() => {
          serviceManager.setCharacteristic(Characteristic.CurrentHeaterCoolerState, Characteristic.CurrentHeaterCoolerState.COOLING)
        })
        break
      default:
    }
    if (logLevel <= 2) {log(`Updated currentHeaterCoolerState to ${state.currentHeaterCoolerState}`)}
  }

  /**
   * Homekit automatically requests Characteristic.Active and Characteristics.TargetHeaterCoolerState
   * when the device is turned on. However it doesn't specify a temperature. We use a default temperature
   * from the config file to determine which hex codes to send if temperature control is supported.
   * 
   * setTargetHeaterCoolerState() is called by the main handler after updating the state.targetHeaterCoolerState
   * to the latest requested value. Method is only invoked by Homekit when going from 'off' -> 'any mode' or
   * 'heat/cool/auto' -> 'heat/cool/auto'. Method is not called when turning off device.
   * Characteristic.Active is either already 'Active' or set to 'Active' prior to method call.
   * This sub-handler is only called if the previous targetHeaterCoolerState value is different from the new
   * requested value
   *
   * Prerequisites: this.state is updated with the latest requested value for Target Heater Cooler State
   * @param {any} hexData The decoded data that is passed in by handler
   * @param {int} previousValue Previous value for targetHeaterCoolerState  
   */
  async setTargetHeaterCoolerState(hexData, previousValue) {
    const { config, data, state, log, logLevel } = this
    const { internalConfig } = config
    const { available } = internalConfig
    let { targetHeaterCoolerState, heatingThresholdTemperature, coolingThresholdTemperature } = state

    if (logLevel <= 2) {log(`Changing target state from ${previousValue} to ${targetHeaterCoolerState}`)}
    switch (targetHeaterCoolerState) {
      case Characteristic.TargetHeaterCoolerState.COOL:
        if (available.cool.temperatureCodes) {
          // update internal state to be consistent with what Home app & homebridge see
          coolingThresholdTemperature = this.serviceManager.getCharacteristic(Characteristic.CoolingThresholdTemperature).value
        }

        hexData = this.decodeHexFromConfig(CharacteristicName.TARGET_HEATER_COOLER_STATE)
        break
      case Characteristic.TargetHeaterCoolerState.HEAT:
        if (available.heat.temperatureCodes) {
          // update internal state to be consistent with what Home app & homebridge see
          heatingThresholdTemperature = this.serviceManager.getCharacteristic(Characteristic.HeatingThresholdTemperature).value
        }

        hexData = this.decodeHexFromConfig(CharacteristicName.TARGET_HEATER_COOLER_STATE)
        break
      default:
        if (logLevel <= 4) {log(`BUG: ${this.name} setTargetHeaterCoolerState invoked with unsupported target mode ${targetHeaterCoolerState}`)}
    }

    await this.performSend(hexData)
    // Update current heater cooler state to match the new state
    this.updateServiceCurrentHeaterCoolerState()

    return;
  }

  /**
   * Returns hexcodes from config file to operate the device. Hexcodes are decoded based on the requested targetHeaterCoolerState
   * currently stored in the cached state
   * @param {CharacteristicName} toUpdateCharacteristic - string name of the characteristic that is being updated by the caller
   * @returns {any} hexData - object, array or string values to be sent to IR device
   */
  decodeHexFromConfig(toUpdateCharacteristic) {
    const { state, config, data, log, logLevel, name } = this
    const { heatingThresholdTemperature, coolingThresholdTemperature, targetHeaterCoolerState } = state
    const { heat, cool } = data
    const { available } = config.internalConfig

    var temperature
    switch (targetHeaterCoolerState) {
      case Characteristic.TargetHeaterCoolerState.COOL:
        temperature = coolingThresholdTemperature
        if (!available.coolMode) {
          if (logLevel <= 4) {log(`BUG: ${name} decodeHexFromConfig invoked with unsupported target mode: cool.`)}
          return "0'" // sending dummy hex data to prevent homebridge from tripping
        }
        if (toUpdateCharacteristic === CharacteristicName.ACTIVE
          && state.active === Characteristic.Active.INACTIVE) {
          return cool.off
        }
        if (!available.cool.temperatureCodes) {
          return cool.on
        }
        return this.decodeTemperatureHex(temperature, cool, toUpdateCharacteristic)
        break

      case Characteristic.TargetHeaterCoolerState.HEAT:
        temperature = heatingThresholdTemperature
        if (!available.heatMode) {
          if (logLevel <= 4) {log(`BUG: ${name} decodeHexFromConfig invoked with unsupported target mode: heat.`)}
          return "0'" // sending dummy hex data to prevent homebridge from tripping
        }
        if (toUpdateCharacteristic === CharacteristicName.ACTIVE
          && state.active === Characteristic.Active.INACTIVE) {
          return heat.off
        }
        if (!available.heat.temperatureCodes) {
          return heat.on // temperature codes are not supported for the heater device
        }
        return this.decodeTemperatureHex(temperature, heat, toUpdateCharacteristic)
        break
      default:
        if (logLevel <= 4) {log(`BUG: decodeHexFromConfig has invalid value for targetHeaterCoolerState: ${targetHeaterCoolerState}.`)}
        break
    }

  }

  /**
   * Recursively parses supplied hexData object to find the hex codes.
   * @param {object} hexDataObject - object to parse in order to retrieve hex codes
   * @param {array} checkCharacteristics - list of all hierarchical characteristics in the object to parse
   * @param {CharacteristicName} toUpdateCharacteristic - characteristic that is being updated
   * @returns {any} hexData - object, array or string values to be sent to IR device
   */
  decodeHierarchichalHex(hexDataObject, checkCharacteristics, toUpdateCharacteristic) {
    const { state, log, logLevel, name } = this
    if (hexDataObject === undefined || hexDataObject == null) { return "hexDataObject" } // should never happen, unless bug
    if (typeof hexDataObject !== 'object') { return hexDataObject }
    if (Array.isArray(hexDataObject)) { return hexDataObject }

    // All hierarchical characteristics have been checked so we can return
    if (checkCharacteristics.length === 0) {
      return hexDataObject  // finished checking all characteristics
    }

    const keys = Object.keys(hexDataObject)
    let keyFromState
    const characteristic = checkCharacteristics.pop()
    switch (characteristic) {
      case CharacteristicName.ROTATION_SPEED:
        keyFromState = 'rotationSpeed' + state.rotationSpeed
        if (toUpdateCharacteristic === CharacteristicName.ROTATION_SPEED) {
          if (keys.includes('fanSpeedToggle')) {
            return this.decodeHierarchichalHex(hexDataObject.fanSpeedToggle, checkCharacteristics, null)
          }
          if (keys.includes(keyFromState)) {
            return this.decodeHierarchichalHex(hexDataObject[keyFromState], checkCharacteristics, null)
          }
          if (logLevel <= 3) {log(`Could not find rotationSpeed${state.rotationSpeed} hex codes`)}
          return "0"
        }
        // do not change state of fanspeed mode
        if (keys.includes('fanSpeedDnd')) {
          return this.decodeHierarchichalHex(hexDataObject.fanSpeedDnd, checkCharacteristics, toUpdateCharacteristic)
        }
        if (keys.includes(keyFromState)) {
          return this.decodeHierarchichalHex(hexDataObject[keyFromState], checkCharacteristics, toUpdateCharacteristic)
        }
        break
      case CharacteristicName.SWING_MODE:
        if (toUpdateCharacteristic === CharacteristicName.SWING_MODE) {
          if (keys.includes('swingToggle')) {
            return this.decodeHierarchichalHex(hexDataObject.swingToggle, checkCharacteristics, null)
          }
          keyFromState = state.swingMode === Characteristic.SwingMode.SWING_ENABLED ? 'swingOn' : 'swingOff'
          if (keys.includes(keyFromState)) {
            return this.decodeHierarchichalHex(hexDataObject[keyFromState], checkCharacteristics, null)
          }
          if (logLevel <= 3) {log(`Could not find swingMode hex codes for swingMode ${keyFromState}`)}
          return "0"
        }
        // do not change state of swing mode
        if (keys.includes('swingDnd')) {
          return this.decodeHierarchichalHex(hexDataObject.swingDnd, checkCharacteristics, toUpdateCharacteristic)
        }
        keyFromState = state.swingMode === Characteristic.SwingMode.SWING_ENABLED ? 'swingOn' : 'swingOff'
        if (keys.includes(keyFromState)) {
          return this.decodeHierarchichalHex(hexDataObject[keyFromState], checkCharacteristics, toUpdateCharacteristic)
        }
        break
      case undefined:
        // should not happen, this is a fail safe to prevent infinite recursion.
        if (logLevel <= 4) {log(`BUG: ${name} decodeHierarchichalHex encountered a bug, please raise an issue`)}
        return hexDataObject
    }
    if (logLevel <= 4) {log(`Hex codes not found for ${characteristic}`)}
    // if we reach here, this characteristic is not defined for the accessory so continue searching for the next one
    return this.decodeHierarchichalHex(hexDataObject, checkCharacteristics, toUpdateCharacteristic)
  }

  /**
   * Decode hexData from temperature codes.
   * Prerequisites: Temperature control is available
   * @param {number} temperature - temperature in degree Celsius for hex code lookup
   * @param {object} hexDataObject - Object to parse in order to find the hex codes
   * @param {CharacteristicName} toUpdateCharacteristic - characteristic that is being updated
   * @returns {any} hexData - object, array or string values to be sent to IR device
   */
  decodeTemperatureHex(temperature, hexDataObject, toUpdateCharacteristic) {
    const { config, state, log, logLevel } = this
    const { temperatureCodes } = hexDataObject
    const { temperatureUnits, internalConfig } = config
    const { available } = internalConfig

    if (temperatureUnits === "f") {
      temperature = this.temperatureCtoF(temperature)
    }

    if (logLevel <= 2) {log(`Looking up temperature hex codes for ${temperature}`)}

    let CONFIG_CHARACTERISTICS = [
      //CharacteristicName.SLEEP,
      CharacteristicName.SWING_MODE,
      CharacteristicName.ROTATION_SPEED
    ]

    let hexCode = "0"
    let temperatureHexDataObject = temperatureCodes[`${temperature}`]
    if (temperatureHexDataObject) {
      hexCode = this.decodeHierarchichalHex(temperatureHexDataObject, CONFIG_CHARACTERISTICS, toUpdateCharacteristic)
      if (logLevel <= 2) {log(`\tSending hex codes for temperature ${temperature}`)}
    } else {
      if (logLevel <= 4) {log(`\tDid not find temperature code for ${temperature}. Please update data.${this.state.targetHeaterCoolerState === 1 ?
        "heat" : "cool"}.temperatureCodes in config.json`)}
    }

    return hexCode
  }

  /**
   * Send IR codes to set the temperature of the accessory in its current mode of operation.
   * @param {string} hexData
   * @param {number} previousValue - previous temperature value
   */
  async setTemperature(hexData, previousValue) {
    const { name, log, logLevel, state, config } = this
    const { targetHeaterCoolerState, coolingThresholdTemperature, heatingThresholdTemperature } = state

    let targetTemperature = targetHeaterCoolerState === Characteristic.TargetHeaterCoolerState.COOL ? coolingThresholdTemperature : heatingThresholdTemperature;

    if (logLevel <= 2) {log(`${name} setTemperature: Changing temperature from ${previousValue} to ${targetTemperature}`)}
    hexData = this.decodeHexFromConfig(targetHeaterCoolerState === Characteristic.TargetHeaterCoolerState.COOL ? CharacteristicName.CoolingThresholdTemperature : CharacteristicName.HeatingThresholdTemperature)

    await this.performSend(hexData)
  }

  /**
   * Send IR codes to toggle the device on/off. By the time this function is invoked cached state is already updated
   * to reflect the requested value. 
   * If requested value is to turn on the device then we will send hex codes based on the last saved cached state
   * @param {string} hexData 
   * @param {int} previousValue 
   */
  async setActive(hexData, previousValue) {
    const { state, config, data, logLevel } = this
    const { resetPropertiesOnRestart, turnOnWhenOff } = config
    const { available } = config.internalConfig
    const { targetHeaterCoolerState } = state
    const requestedValue = state.active // state is already set by main handler before this subhandler is called

    hexData = this.decodeHexFromConfig(CharacteristicName.ACTIVE)

    if (turnOnWhenOff === true && state.active === Characteristic.Active.ACTIVE && previousValue === Characteristic.Active.INACTIVE) {
      //Add ON hex to be sent first
      if (logLevel <= 2) {this.log(`\tAdding ON code first`);}
      //Add pause to the ON Code
      let onCode = targetHeaterCoolerState === Characteristic.TargetHeaterCoolerState.COOL ? data.cool.on : data.heat.on;
      let newCode = [];
      if (typeof onCode === 'string') {
        newCode = [{ "data": onCode, "pause": 1 }];
      } else {
        onCode[onCode.length - 1].pause = 1;
        newCode = onCode;
      }
      //Append the On code (with pause) to the state code.
      if (typeof hexData === 'string') {
        newCode.push({ "data": hexData });
        hexData = newCode;
      } else {
        hexData = newCode.concat(hexData);
      }
    }

    await this.performSend(hexData)

    // Update homebridge and home app state to reflect the cached state of all the available
    // characteristics. This ensures that UI for osciallte, fan speed, etc in the app are in
    // sync with device settings
    this.updateServiceCurrentHeaterCoolerState();
    if (available.swingMode) {
      this.serviceManager.getCharacteristic(Characteristic.SwingMode)
        .updateValue(state.swingMode)
    }
    if (available.rotationSpeed) {
      this.serviceManager.getCharacteristic(Characteristic.RotationSpeed)
        .updateValue(state.rotationSpeed)
    }
  }

  /**
   * Send IR codes to enable/disable swing mode (oscillation)
   * @param {string} hexData 
   * @param {int} previousValue 
   */
  async setSwingMode(hexData, previousValue) {
    const { state, data, config, log, logLevel, name } = this
    const { swingMode } = state

    if (logLevel <= 2) {log(`${name} setSwingMode: Changing swing from ${previousValue} to ${Characteristic.SwingMode.SWING_ENABLED}`)}
    if (data.swingOn && data.swingOff) {
      hexData = swingMode === Characteristic.SwingMode.SWING_ENABLED ? data.swingOn : data.swingOff
    }
    else if (data.swingMode && data.swingToggle) {
      hexData = data.swingToggle
    }
    else {
      hexData = this.decodeHexFromConfig(CharacteristicName.SWING_MODE)
    }
    if (hexData === "0") {
      if (logLevel <= 3) {log(`Swing hex codes not found, resetting state to previous value`)}
      state.swingMode = previousValue
      this.serviceManager.service
        .getCharacteristic(Characteristic.SwingMode)
        .updateValue(previousValue)
    } else {
      await this.performSend(hexData)
    }
  }

  /**
   * Send IR codes to change fan speed of device.
   * @param {string} hexData 
   * @param {int} previousValue - previous rotation speed of device
   */
  async setRotationSpeed(hexData, previousValue) {
    const { state, config, log, logLevel, name } = this
    const { rotationSpeed } = state

    if (logLevel <= 2) {log(`${name} setRotationSpeed: Changing RotationSpeed from ${previousValue} to ${state.rotationSpeed}`)}

    // TODO: Check other locations for fanSpeed
    if (rotationSpeed === 0) {
      // reset rotationSpeed back to default
      state.rotationSpeed = previousValue
      // set active handler (called by homebridge/home app) will take
      // care of turning off the fan
      return
    }

    hexData = this.decodeHexFromConfig(CharacteristicName.ROTATION_SPEED)
    if (hexData === "0") {
      if (logLevel <= 3) {log(`Fan speed hex codes not found, resetting back to previous value`)}
      state.rotationSpeed = previousValue
      this.serviceManager.service
        .getCharacteristic(Characteristic.RotationSpeed)
        .updateValue(previousValue)
    } else {
      await this.performSend(hexData)
    }
  }

  /**
   ********************************************************
   *                       GETTERS                        *
   ********************************************************
   */
  /**
   * Read current temperature from device. We don't have any way of knowing the device temperature so we will
   * instead send a default value.
   * @param {func} callback - callback function passed in by homebridge API to be called at the end of the method
   */
  async monitorTemperature() {
    const { config, host, log, logLevel, name, state } = this;
    const { temperatureFilePath, defaultNowTemperature, w1DeviceID } = config;

    if (defaultNowTemperature !== undefined) {return;}

    //Force w1 and file devices to a minimum 1 minute refresh
    if (w1DeviceID || temperatureFilePath) {config.temperatureUpdateFrequency = Math.max(config.temperatureUpdateFrequency, 60);}

    const device = getDevice({ host, log });

    // Try again in a second if we don't have a device yet
    if (!device) {
      await delayForDuration(1);

      this.monitorTemperature();

      return;
    }

    if (logLevel <= 3) {log(`${name} monitorTemperature`);}

    device.on('temperature', this.onTemperature.bind(this));
    device.checkTemperature();

    this.updateTemperatureUI();
    if (!config.isUnitTest) {setInterval(this.updateTemperatureUI.bind(this), config.temperatureUpdateFrequency * 1000)}
  }

  onTemperature(temperature, humidity) {
    const { config, host, log, logLevel, name, state } = this;
    const { minTemperature, maxTemperature, temperatureAdjustment, humidityAdjustment, noHumidity } = config;

    // onTemperature is getting called twice. No known cause currently.
    // This helps prevent the same temperature from being processed twice
    if (Object.keys(this.temperatureCallbackQueue).length === 0) {return;}

    temperature += temperatureAdjustment;
    state.currentTemperature = temperature;
    if (logLevel <= 1) {log(`\x1b[34m[DEBUG]\x1b[0m ${name} onTemperature (${temperature})`);}

    if (humidity) {
      if (noHumidity) {
        state.currentHumidity = null;
      } else {
        humidity += humidityAdjustment;
        state.currentHumidity = humidity;
        if (logLevel <= 1) {log(`\x1b[34m[DEBUG]\x1b[0m ${name} onHumidity (` + humidity + `)`);}
      }
    }

    //Process Fakegato history
    //Ignore readings of exactly zero - the default no value value.
    if (config.noHistory !== true && this.state.currentTemperature != 0.00) {
      this.lastUpdatedAt = Date.now();
      if (logLevel <= 1) {log(`\x1b[34m[DEBUG]\x1b[0m ${name} Logging data to history: temp: ${this.state.currentTemperature}, humidity: ${this.state.currentHumidity}`);}
      if (noHumidity) {
        this.historyService.addEntry({ time: Math.round(new Date().valueOf() / 1000), temp: this.state.currentTemperature });
      } else {
        this.historyService.addEntry({ time: Math.round(new Date().valueOf() / 1000), temp: this.state.currentTemperature, humidity: this.state.currentHumidity });
      }
    }

    this.processQueuedTemperatureCallbacks(temperature);
  }

  addTemperatureCallbackToQueue(callback) {
    const { config, host, logLevel, log, name, state } = this;
    const { mqttURL, temperatureFilePath, w1DeviceID, noHumidity } = config;

    // Clear the previous callback
    if (Object.keys(this.temperatureCallbackQueue).length > 1) {
      if (state.currentTemperature) {
        if (logLevel <= 1) {log(`\x1b[34m[DEBUG]\x1b[0m ${name} addTemperatureCallbackToQueue (clearing previous callback, using existing temperature)`);}
        this.processQueuedTemperatureCallbacks(state.currentTemperature);
      }
    }

    // Add a new callback
    const callbackIdentifier = uuid.v4();
    this.temperatureCallbackQueue[callbackIdentifier] = callback;

    // Read temperature from file
    if (temperatureFilePath) {
      this.updateTemperatureFromFile();

      return;
    }

    // Read temperature from W1 Device
    if (w1DeviceID) {
      this.updateTemperatureFromW1();

      return;
    }

    // Read temperature from mqtt
    if (mqttURL) {
      const temperature = this.mqttValueForIdentifier('temperature');
      const humidity = noHumidity ? null : this.mqttValueForIdentifier('humidity');
      this.onTemperature(temperature || 0, humidity);

      return;
    }

    // Read temperature from Broadlink RM device
    // If the device is no longer available, use previous tempeature
    const device = getDevice({ host, log });

    if (!device || device.state === 'inactive') {
      if (device && device.state === 'inactive') {
        if (logLevel <= 3) {log(`${name} addTemperatureCallbackToQueue (device no longer active, using existing temperature)`);}
      }

      this.processQueuedTemperatureCallbacks(state.currentTemperature || 0);

      return;
    }

    device.checkTemperature();
    if (logLevel < 1) {log(`\x1b[34m[DEBUG]\x1b[0m ${name} addTemperatureCallbackToQueue (requested temperature from device, waiting)`);}
  }

  updateTemperatureFromFile() {
    const { config, host, log, logLevel, name, state } = this;
    const { temperatureFilePath, noHumidity, batteryAlerts } = config;
    let humidity = null;
    let temperature = null;

    if (logLevel <= 1) {log(`\x1b[34m[DEBUG]\x1b[0m ${name} updateTemperatureFromFile reading file: ${temperatureFilePath}`);}

    fs.readFile(temperatureFilePath, 'utf8', (err, data) => {
      if (err) {
        if (logLevel <= 4) {log(`\x1b[31m[ERROR] \x1b[0m${name} updateTemperatureFromFile\n\n${err.message}`);}
      }

      if (data === undefined || data.trim().length === 0) {
        if (logLevel <= 3) {log(`\x1b[33m[WARNING]\x1b[0m ${name} updateTemperatureFromFile error reading file: ${temperatureFilePath}, using previous Temperature`);}
        if (!noHumidity) {humidity = (state.currentHumidity || 0);}
        temperature = (state.currentTemperature || 0);
      }

      const lines = data.split(/\r?\n/);
      if (/^[0-9]+\.*[0-9]*$/.test(lines[0])) {
        temperature = parseFloat(data);
      } else {
        lines.forEach((line) => {
          if (-1 < line.indexOf(':')) {
            let value = line.split(':');
            if (value[0] == 'temperature') {temperature = parseFloat(value[1]);}
            if (value[0] == 'humidity' && !noHumidity) {humidity = parseFloat(value[1]);}
            if (value[0] == 'battery' && batteryAlerts) {state.batteryLevel = parseFloat(value[1]);}
          }
        });
      }

      if (logLevel <= 1) {log(`\x1b[34m[DEBUG]\x1b[0m ${name} updateTemperatureFromFile (parsed temperature: ${temperature} humidity: ${humidity})`);}

      this.onTemperature(temperature, humidity);
    });
  }

  updateTemperatureFromW1() {
    const { config, logLevel, host, log, name, state } = this;
    const { w1DeviceID } = config;

    var W1PATH = "/sys/bus/w1/devices";
    var fName = W1PATH + "/" + w1DeviceID + "/w1_slave";
    var temperature;

    if (logLevel <= 1) {log(`\x1b[34m[DEBUG]\x1b[0m ${name} updateTemperatureFromW1 reading file: ${fName}`);}

    fs.readFile(fName, 'utf8', (err, data) => {
      if (err) {
        if (logLevel <= 4) {log(`\x1b[31m[ERROR] \x1b[0m${name} updateTemperatureFromW1\n\n${err.message}`);}
      }

      if (data.includes("t=")) {
        var matches = data.match(/t=([0-9]+)/);
        temperature = parseInt(matches[1]) / 1000;
      } else {
        if (logLevel <= 4) {log(`\x1b[33m[WARNING]\x1b[0m ${name} updateTemperatureFromW1 error reading file: ${fName}, using previous Temperature`);}
        temperature = (state.currentTemperature || 0);
      }

      if (logLevel <= 1) {log(`\x1b[34m[DEBUG]\x1b[0m ${name} updateTemperatureFromW1 (parsed temperature: ${temperature})`);}
      this.onTemperature(temperature);
    });
  }

  processQueuedTemperatureCallbacks(temperature) {
    if (Object.keys(this.temperatureCallbackQueue).length === 0) {return;}

    Object.keys(this.temperatureCallbackQueue).forEach((callbackIdentifier) => {
      const callback = this.temperatureCallbackQueue[callbackIdentifier];

      callback(null, temperature);
      delete this.temperatureCallbackQueue[callbackIdentifier];
    })

    this.temperatureCallbackQueue = {};

    this.checkTemperatureForAutoOnOff(temperature);
  }

  updateTemperatureUI() {
    const { config, serviceManager } = this;
    const { noHumidity } = config;

    serviceManager.refreshCharacteristicUI(Characteristic.CurrentTemperature);
    if (!noHumidity) { serviceManager.refreshCharacteristicUI(Characteristic.CurrentRelativeHumidity); }
  }

  getCurrentTemperature(callback) {
    const { config, host, logLevel, log, name, state } = this;
    const { defaultNowTemperature } = config;

    // Some devices don't include a thermometer and so we can use `defaultNowTemperature` instead
    if (defaultNowTemperature !== undefined) {
      if (logLevel <= 1) {log(`\x1b[34m[DEBUG]\x1b[0m ${name} getCurrentTemperature (using defaultNowTemperature ${defaultNowTemperature} from config)`);}
      return callback(null, defaultNowTemperature);
    }

    if (config.useCachedTemperature) {
      return callback(null, state.currentTemperature);
    } else {
      this.addTemperatureCallbackToQueue(callback);
    }
  }

  getCurrentHumidity(callback) {
    const { config, host, logLevel, log, name, state } = this;
    const { defaultNowTemperature } = config;

    return callback(null, state.currentHumidity);
  }

  async checkTemperatureForAutoOnOff(temperature) {
    const { config, host, log, logLevel, name, serviceManager, state } = this;
    let { autoHeatTemperature, autoCoolTemperature, minimumAutoOnOffDuration } = config;

    if (this.shouldIgnoreAutoOnOff) {
      if (logLevel <= 2) {this.log(`${name} checkTemperatureForAutoOn (ignore within ${minimumAutoOnOffDuration}s of previous auto-on/off due to "minimumAutoOnOffDuration")`);}

      return;
    }

    if (!autoHeatTemperature && !autoCoolTemperature) {return;}

    if (!this.isAutoSwitchOn()) {
      if (logLevel <= 2) {this.log(`${name} checkTemperatureForAutoOnOff (autoSwitch is off)`);}
      return;
    }

    if (logLevel <= 2) {this.log(`${name} checkTemperatureForAutoOnOff`);}

    if (autoHeatTemperature && temperature < autoHeatTemperature) {
      this.state.isRunningAutomatically = true;

      if (logLevel <= 2) {this.log(`${name} checkTemperatureForAutoOnOff (${temperature} < ${autoHeatTemperature}: auto heat)`);}
      serviceManager.setCharacteristic(Characteristic.TargetHeatingCoolingState, Characteristic.TargetHeatingCoolingState.HEAT);
    } else if (autoCoolTemperature && temperature > autoCoolTemperature) {
      this.state.isRunningAutomatically = true;

      if (logLevel <= 2) {this.log(`${name} checkTemperatureForAutoOnOff (${temperature} > ${autoCoolTemperature}: auto cool)`);}
      serviceManager.setCharacteristic(Characteristic.TargetHeatingCoolingState, Characteristic.TargetHeatingCoolingState.COOL);
    } else {
      if (logLevel <= 1) {this.log(`${name} checkTemperatureForAutoOnOff (temperature is ok)`);}

      if (this.state.isRunningAutomatically) {
        this.isAutomatedOff = true;
        if (logLevel <= 2) {this.log(`${name} checkTemperatureForAutoOnOff (auto off)`);}
        serviceManager.setCharacteristic(Characteristic.TargetHeatingCoolingState, Characteristic.TargetHeatingCoolingState.OFF);
      } else {
        return;
      }
    }

    this.shouldIgnoreAutoOnOff = true;
    this.shouldIgnoreAutoOnOffPromise = delayForDuration(minimumAutoOnOffDuration);
    await this.shouldIgnoreAutoOnOffPromise;

    this.shouldIgnoreAutoOnOff = false;
  }

  getTemperatureDisplayUnits(callback) {
    const { config } = this;
    const temperatureDisplayUnits = (config.units.toLowerCase() === 'f') ? Characteristic.TemperatureDisplayUnits.FAHRENHEIT : Characteristic.TemperatureDisplayUnits.CELSIUS;

    callback(null, temperatureDisplayUnits);
  }

  // MQTT
  onMQTTMessage(identifier, message) {
    const { state, logLevel, log, name } = this;

    if (identifier !== 'unknown' && identifier !== 'temperature' && identifier !== 'humidity' && identifier !== 'battery' && identifier !== 'combined') {
      if (logLevel <= 4) {log(`\x1b[31m[ERROR] \x1b[0m${name} onMQTTMessage (mqtt message received with unexpected identifier: ${identifier}, ${message.toString()})`);}

      return;
    }

    super.onMQTTMessage(identifier, message);

    let temperatureValue, humidityValue, batteryValue;
    let objectFound = false;
    let value = this.mqttValuesTemp[identifier];
    if (logLevel <= 1) {log(`\x1b[34m[DEBUG]\x1b[0m ${name} onMQTTMessage (raw value: ${value})`);}
    try {
      //Attempt to parse JSON - if result is JSON
      const temperatureJSON = JSON.parse(value);

      if (typeof temperatureJSON === 'object') {
        objectFound = true;
        let values = [];
        if (identifier !== 'temperature' && identifier !== 'battery') {
          //Try to locate other Humidity fields
          if (values.length === 0) {values = findKey(temperatureJSON, 'Hum');}
          if (values.length === 0) {values = findKey(temperatureJSON, 'hum');}
          if (values.length === 0) {values = findKey(temperatureJSON, 'Humidity');}
          if (values.length === 0) {values = findKey(temperatureJSON, 'humidity');}
          if (values.length === 0) {values = findKey(temperatureJSON, 'RelativeHumidity');}
          if (values.length === 0) {values = findKey(temperatureJSON, 'relativehumidity');}
          if (values.length > 0) {
            humidityValue = values;
            values = [];
          }
        }
        if (identifier !== 'temperature' && identifier !== 'humidity') {
          //Try to locate other Battery fields
          if (values.length === 0) {values = findKey(temperatureJSON, 'Batt');}
          if (values.length === 0) {values = findKey(temperatureJSON, 'batt');}
          if (values.length === 0) {values = findKey(temperatureJSON, 'Battery');}
          if (values.length === 0) {values = findKey(temperatureJSON, 'battery');}
          if (values.length > 0) {
            batteryValue = values;
            values = [];
          }
        }
        if (identifier !== 'battery' && identifier !== 'humidity') {
          //Try to locate other Temperature fields
          if (values.length === 0) {values = findKey(temperatureJSON, 'temp');}
          if (values.length === 0) {values = findKey(temperatureJSON, 'Temp');}
          if (values.length === 0) {values = findKey(temperatureJSON, 'temperature');}
          if (values.length === 0) {values = findKey(temperatureJSON, 'Temperature');}
          if (values.length > 0) {
            temperatureValue = values;
          }
        }

        if (values.length > 0) {
          value = values[0];
        } else {
          value = undefined;
        }
      }
    } catch (err) { } //Result couldn't be parsed as JSON

    if (objectFound) {
      if (temperatureValue !== undefined && temperatureValue.length > 0) {
        this.mqttValues.temperature = parseFloat(temperatureValue[0]);
      }
      if (batteryValue !== undefined && batteryValue.length > 0) {
        state.batteryLevel = parseFloat(batteryValue[0]);
        this.mqttValues.battery = parseFloat(batteryValue[0]);
      }
      if (humidityValue !== undefined && humidityValue.length > 0) {
        this.mqttValues.humidity = parseFloat(humidityValue[0]);
      }
    } else {
      if (value === undefined || (typeof value === 'string' && value.trim().length === 0)) {
        if (logLevel <= 3) {log(`\x1b[31m[ERROR] \x1b[0m${name} onMQTTMessage (mqtt value not found)`);}
        return;
      }

      if (logLevel <= 1) {log(`\x1b[34m[DEBUG]\x1b[0m ${name} onMQTTMessage (parsed value: ${value})`);}
      value = parseFloat(value);

      if (identifier == 'battery') {
        state.batteryLevel = value;
        return;
      }
      this.mqttValues[identifier] = value;
    }
    this.updateTemperatureUI();
  }

  /**
   ********************************************************
   *                      UTILITIES                       *
   ********************************************************
   */

  /**
   * Converts supplied temperature to value from degree Celcius to degree Fahrenheit, truncating to the
   * default step size of 1. Returns temperature in degree Fahrenheit.
   * @param {number} temperature - Temperature value in degress Celcius
   */
  temperatureCtoF(temperature) {
    const temp = (temperature * 9 / 5) + 32
    const whole = Math.round(temp)
    return Math.trunc(whole)
  }

  /**
   * Converts supplied temperature to value from degree Fahrenheit to degree Celsius, truncating to the
   * default step size of 0.1. Returns temperature in degree Celsius.
   * @param {number} temperature - Temperature value in degress Fahrenheit
   */
  temperatureFtoC(temperature) {
    const temp = (temperature - 32) * 5 / 9
    const abs = Math.abs(temp)
    const whole = Math.trunc(abs)
    var fraction = (abs - whole) * 10
    fraction = Math.trunc(fraction) / 10
    return temp < 0 ? -(fraction + whole) : (fraction + whole)
  }

  /**
   ********************************************************
   *                   CONFIGURATION                      *
   ********************************************************
   */

  /**
   * Validates if the keys for optional characteristics are defined in config.json and
   * accordingly updates supplied config object
   * @param {object} dataObject - hex code object to validate keys
   * @param {object} configObject - object pointing to available.<mode>
   */
  validateOptionalCharacteristics(dataObject, configObject) {
    const isValidRotationSpeedKey = (stringValue) => stringValue.startsWith('rotationSpeed') // loose validation, can further validate number endings
    const isValidSwingModeKey = (stringValue) => stringValue.startsWith('swing')
    const isValidSleepKey = (stringValue) => stringValue.startsWith('sleep')
    const isValidTemperature = (stringValue) => isFinite(Number(stringValue)) // Arrow function to check if supplied string is a int or float parseable number

    const dataObjectKeys = Object.keys(dataObject)
    if (this.config.logLevel <= 1) {this.log(`Checking keys ${dataObjectKeys}`)}
    if (!configObject.temperatureCodes && dataObjectKeys.every(isValidTemperature)) {
      configObject.temperatureCodes = true
    }
    else if (!configObject.rotationSpeed && dataObjectKeys.every(isValidRotationSpeedKey)) {
      configObject.rotationSpeed = true
    }
    else if (!configObject.swingMode && dataObjectKeys.every(isValidSwingModeKey)) {
      configObject.swingMode = true
    }
    else if (!configObject.sleep && dataObjectKeys.every(isValidSleepKey)) {
      configObject.sleep = true
    }


    for (const [key, value] of Object.entries(dataObject)) {
      if (this.config.logLevel <= 1) {this.log(`Going into key -> ${key}`)}
      if (typeof value === 'object' && !Array.isArray(value)) {
        this.validateOptionalCharacteristics(value, configObject)
      }
    }
  }

  /**
   * Configure optional characteristics like rotation speed, swing mode, temperature control
   * and sleep mode
   */
  configureOptionalCharacteristics() {
    const { name, config, data, logLevel } = this
    const { internalConfig } = config
    const { available } = internalConfig || {}
    const { heat, cool } = data
    assert(available.coolMode || available.heatMode, `ERROR: ${name} configureOptionalCharacteristics invoked without configuring heat and cool modes`)
    available.cool = new Object()
    available.heat = new Object()
    available.cool.temperatureCodes = false
    available.cool.rotationSpeed = false
    available.cool.swingMode = false
    available.cool.sleep = false
    available.heat.temperatureCodes = false
    available.heat.rotationSpeed = false
    available.heat.swingMode = false
    available.heat.sleep = false

    if (available.coolMode && cool.temperatureCodes && typeof cool.temperatureCodes === 'object'
      && !Array.isArray(cool.temperatureCodes)) {
      this.validateOptionalCharacteristics(cool.temperatureCodes, available.cool)
    }

    if (available.heatMode && heat.temperatureCodes && typeof heat.temperatureCodes === 'object'
      && !Array.isArray(heat.temperatureCodes)) {
      this.validateOptionalCharacteristics(heat.temperatureCodes, available.heat)
    }

    if (logLevel <= 2) {this.log(`INFO ${name} configured with optional characteristics:
    Temperature control: ${available.cool.temperatureCodes} ${available.heat.temperatureCodes}
    Rotation speed: ${available.cool.rotationSpeed} ${available.heat.rotationSpeed}
    Swing mode: ${available.cool.swingMode} ${available.heat.swingMode}
    Sleep: ${available.cool.sleep} ${available.heat.sleep}`)}
  }

  /**
   * Validates and initializes following values in this.config:
   * coolingThresholdTemperature, heatingThresholdTemperature, defaultNowTemperature,
   * minTemperature, maxTemperature,temperatureUnits.
   * All temperatures are converted to degree Celsius for internal usage in the plugin.
   */
  configureTemperatures() {
    const { config } = this
    const { internalConfig } = config
    const { available } = internalConfig

    if (!["C", "c", "F", "f"].includes(config.temperatureUnits)) { config.temperatureUnits = "c" }
    config.temperatureUnits = config.temperatureUnits.toLowerCase()

    const { coolingThresholdTemperature, heatingThresholdTemperature, temperatureUnits, defaultNowTemperature } = config

    if (coolingThresholdTemperature === undefined) {
      config.coolingThresholdTemperature = 30
    } else if (temperatureUnits === "f") {
      config.coolingThresholdTemperature = this.temperatureFtoC(coolingThresholdTemperature)
    }
    if (heatingThresholdTemperature === undefined) {
      config.heatingThresholdTemperature = 18
    } else if (temperatureUnits === "f") {
      config.heatingThresholdTemperature = this.temperatureFtoC(heatingThresholdTemperature)
    }
    //if (defaultNowTemperature === undefined) {
    //  config.defaultNowTemperature = 24
    //} else if (temperatureUnits === "f") {
    //  config.defaultNowTemperature = this.temperatureFtoC(defaultNowTemperature)
    //}
    // convert min and max temperatures to degree Celsius if defined as fahrenheit
    if (temperatureUnits === "f") {
      if (config.minTemperature) { config.minTemperature = this.temperatureFtoC(config.minTemperature) }
      if (config.maxTemperature) { config.maxTemperature = this.temperatureFtoC(config.maxTemperature) }
    }

    const { cool, heat } = config.data
    // Apple doesn't complain if we set the values above or below documented max,min values respectively
    // so if your device supports a higher max or a lower min we set it here.
    if (available.heatMode) {
      heat.minTemperature = Math.min(heat.minTemperature, HEATING_THRESHOLD_TEMPERATURE.minValue)
      heat.maxTemperature = Math.max(heat.maxTemperature, HEATING_THRESHOLD_TEMPERATURE.maxValue)
    }

    if (available.coolMode) {
      cool.minTemperature = Math.min(cool.minTemperature, COOLING_THRESHOLD_TEMPERATURE.minValue)
      cool.maxTemperature = Math.max(cool.maxTemperature, COOLING_THRESHOLD_TEMPERATURE.maxValue)
    }
  }

  /**
   * Configures available heat and cool operations in the this.config.internalConfig
   * based on parsing of config.json
   * Prerequisites: this.config and this.data are defined, this.config.internalConfig.available
   * is allocated.
   */
  configureHeatCoolModes() {
    const { config } = this
    const { heat, cool } = config.data || {}

    const { internalConfig } = config
    assert(internalConfig !== undefined && typeof internalConfig === 'object', `ERROR: ${this.name} internalConfig is not initialized. Please raise an issue`)
    const { available } = internalConfig
    assert(available !== undefined && typeof available === 'object', `ERROR: ${this.name} internalConfig.available is not initialized. Please raise an issue`)

    if (typeof heat === 'object' && heat.on !== undefined && heat.off !== undefined) {
      internalConfig.available.heatMode = true
    } else {
      internalConfig.available.heatMode = false
    }
    if (typeof cool === 'object' && cool.on !== undefined && cool.off !== undefined) {
      internalConfig.available.coolMode = true
    } else {
      internalConfig.available.coolMode = false
    }

    if (!available.coolMode && !available.heatMode)
    {throw new Error(`At least one of data.cool or data.heat object is required in config.json. Please update your config.json file`)}
    // Default power on mode for first run when both heat & cool modes are available.
    if (config.defaultMode === undefined) {
      config.defaultMode = available.coolMode ? "cool" : "heat"
    }
  }

  /**
   * Setup default config values which are used to initializing the service manager
   */
  configDefaultsHelper() {
    const { config, name, log, logLevel } = this

    // this is a safeguard and should never happen unless the base constructor invokes
    // setupServiceManager before validating config file
    if (config === undefined || typeof config !== 'object')
    {throw new Error('config.json is not setup properly, please check documentation')}

    const { data } = config
    if (data === undefined || typeof data !== 'object')
    {throw new Error(`data object is required in config.json for initializing accessory`)}

    config.defaultRotationSpeed = config.defaultRotationSpeed || 100
    config.internalConfig = new Object()
    config.internalConfig.available = new Object()
    const { available } = config.internalConfig

    this.configureHeatCoolModes()
    this.configureTemperatures()
    this.configureOptionalCharacteristics()

    if (logLevel <= 2) {log(`${name} initialized with modes Cool: ${available.coolMode ? '\u2705' : '\u274c'}, Heat: ${available.heatMode ? '\u2705' : '\u274c'},\
    config temperatures as: ${this.config.temperatureUnits === "f" ? '\u00b0F' : '\u00b0C'}\
    Using following default configuration:
    Power on mode: ${config.defaultMode}
    Now Temperature: ${config.defaultNowTemperature} \u00b0C
    Cooling Temperature: ${config.coolingThresholdTemperature} \u00b0C
    Heating Temperature: ${config.heatingThresholdTemperature} \u00b0C`)}
  }

  // Service Manager Setup
  setupServiceManager() {
    this.configDefaultsHelper()
    const { config, name, data, serviceManagerType } = this;
    const { minTemperature, maxTemperature } = config
    const { internalConfig } = config
    const { available } = internalConfig

    this.serviceManager = new ServiceManagerTypes[serviceManagerType](name, Service.HeaterCooler, this.log);

    // Setting up all Required Characteristic handlers
    this.serviceManager.addToggleCharacteristic({
      name: 'active',
      type: Characteristic.Active,
      getMethod: this.getCharacteristicValue,
      setMethod: this.setCharacteristicValue,
      bind: this,
      props: {
        setValuePromise: this.setActive.bind(this)
      }
    });

    this.serviceManager.addToggleCharacteristic({
      name: 'currentHeaterCoolerState',
      type: Characteristic.CurrentHeaterCoolerState,
      getMethod: this.getCharacteristicValue,
      setMethod: this.setCharacteristicValue,
      bind: this,
      props: {
      }
    });

    this.serviceManager.addToggleCharacteristic({
      name: 'targetHeaterCoolerState',
      type: Characteristic.TargetHeaterCoolerState,
      getMethod: this.getCharacteristicValue,
      setMethod: this.setCharacteristicValue,
      bind: this,
      props: {
        setValuePromise: this.setTargetHeaterCoolerState.bind(this),
      }
    });

    this.serviceManager.addGetCharacteristic({
      name: 'currentTemperature',
      type: Characteristic.CurrentTemperature,
      method: this.getCurrentTemperature,
      bind: this
    });

    if (!config.noHumidity) {
      this.serviceManager.addGetCharacteristic({
        name: 'currentHumidity',
        type: Characteristic.CurrentRelativeHumidity,
        method: this.getCurrentHumidity,
        bind: this
      })
    }

    // Setting up Required Characteristic Properties
    /**
     * There seems to be bug in Apple's Homekit documentation and/or implementation for the properties of
     * TargetHeaterCoolerState
     * 
     * If we want to support only heat or only cool then the configuration of
     * (minValue: 1, maxValue:2, validValues: [<1 or 2>]) accomplishes this
     *
     * When we want to support heat or cool without the auto mode, we have to provide
     * (minValue: 1, maxValue:2, validValues as [0, 1, 2])
     * 
     * In addition, in order to support auto mode along with this, heat and cool, we need to update the
     * configuration as (minValue: 0, maxValue:2, validValues: [0, 1, 2]).
     * 
     * As per Apple guidelines, if an accessory supports heat or cool mode then it also needs to support
     * auto functionality.
     */
    var validTargetHeaterCoolerValues = []

    if (available.heatMode && available.coolMode) {
      validTargetHeaterCoolerValues.push(
        Characteristic.TargetHeaterCoolerState.AUTO,
      )
    }

    if (available.heatMode) {
      validTargetHeaterCoolerValues.push(Characteristic.TargetHeaterCoolerState.HEAT)
    }

    if (available.coolMode) {
      validTargetHeaterCoolerValues.push(Characteristic.TargetHeaterCoolerState.COOL)
    }

    this.serviceManager
      .getCharacteristic(Characteristic.TargetHeaterCoolerState)
      .setProps({
        minValue: 1,
        maxValue: 2,
        validValues: validTargetHeaterCoolerValues
      })

    this.serviceManager
      .getCharacteristic(Characteristic.CurrentTemperature)
      .setProps({
        minValue: -270,
        maxValue: 100,
        minStep: 0.1,
      })

    // Setting up optional Characteristics handlers
    if (available.cool.temperatureCodes) {
      this.serviceManager.addToggleCharacteristic({
        name: 'coolingThresholdTemperature',
        type: Characteristic.CoolingThresholdTemperature,
        getMethod: this.getCharacteristicValue,
        setMethod: this.setCharacteristicValue,
        bind: this,
        props: {
          setValuePromise: this.setTemperature.bind(this),
        }
      })
      // Characteristic properties
      this.serviceManager
        .getCharacteristic(Characteristic.CoolingThresholdTemperature)
        .setProps({
          minValue: minTemperature,
          maxValue: maxTemperature,
          minStep: config.tempStepSize || 0.1
        })
    }

    if (available.heat.temperatureCodes) {
      this.serviceManager.addToggleCharacteristic({
        name: 'heatingThresholdTemperature',
        type: Characteristic.HeatingThresholdTemperature,
        getMethod: this.getCharacteristicValue,
        setMethod: this.setCharacteristicValue,
        bind: this,
        props: {
          setValuePromise: this.setTemperature.bind(this),
        }
      })
      // Characteristic properties
      this.serviceManager
        .getCharacteristic(Characteristic.HeatingThresholdTemperature)
        .setProps({
          minValue: minTemperature,
          maxValue: maxTemperature,
          minStep: config.tempStepSize || 0.1
        })
    }

    // TODO: Update checks to also validate stateless global settings
    if (available.cool.swingMode || available.heat.swingMode) {
      this.serviceManager.addToggleCharacteristic({
        name: 'swingMode',
        type: Characteristic.SwingMode,
        getMethod: this.getCharacteristicValue,
        setMethod: this.setCharacteristicValue,
        bind: this,
        props: {
          setValuePromise: this.setSwingMode.bind(this)
        }
      })
    }

    if (available.cool.rotationSpeed || available.heat.rotationSpeed) {
      this.serviceManager.addToggleCharacteristic({
        name: 'rotationSpeed',
        type: Characteristic.RotationSpeed,
        getMethod: this.getCharacteristicValue,
        setMethod: this.setCharacteristicValue,
        bind: this,
        props: {
          setValuePromise: this.setRotationSpeed.bind(this)
        }
      })
      this.serviceManager
        .getCharacteristic(Characteristic.RotationSpeed)
        .setProps({
          minStep: config.fanStepSize || 1,
          minValue: 0,
          maxValue: 100
        })
    }
    // ---- End of setupServiceManager() -----
  }

  // ---- End of HeaterCoolerAccessory ----
}

module.exports = HeaterCoolerAccessory
