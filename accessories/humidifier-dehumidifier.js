const { assert } = require('chai');
const uuid = require('uuid');
const fs = require('fs');
const findKey = require('find-key');

const delayForDuration = require('../helpers/delayForDuration');
const ServiceManagerTypes = require('../helpers/serviceManagerTypes');
const catchDelayCancelError = require('../helpers/catchDelayCancelError');
const { getDevice } = require('../helpers/getDevice');
const BroadlinkRMAccessory = require('./accessory');

const FanAccessory = require('./fan');

class HumidifierDehumidifierAccessory extends FanAccessory {
  
  constructor (log, config = {}, serviceManagerType) {
    super(log, config, serviceManagerType);
	  
    //Fakegato setup
	  if(config.noHistory !== true) {
      this.displayName = config.name;
      this.lastUpdatedAt = undefined;
      this.historyService = new HistoryService("room", this, { storage: 'fs', filename: 'RMPro_' + config.name.replace(' ','-') + '_persist.json'}); 
      this.historyService.log = log;
    }
    
    this.humidityCallbackQueue = {};
    this.monitorHumidity();
  }

  setDefaults () {
    const { data, config, state } = this;
	  
	  super.setDefaults();
	
    // Set config default values
    config.humidifierOnly = config.humidifierOnly || false;
    config.deHumidifierOnly = config.deHumidifierOnly || false;
    config.humidityUpdateFrequency = config.humidityUpdateFrequency || 10;
    config.humidityAdjustment = config.humidityAdjustment || 0;
    config.noHumidity = config.noHumidity || false;
    config.threshold = config.threshold || 5;
    data.fanOnly = data.fanOnly ? data.fanOnly : data.off;

    state.firstHumidityUpdate = true;
  }

  reset () {
    super.reset();
  }
  
  async setSwitchState (hexData, previousValue){
    this.previouslyOff = previousValue ? false : true;
    this.updateDeviceState ();     
    super.setSwitchState (hexData, previousValue);
    super.checkAutoOnOff();
  }
  
  async setCurrentState (hexData, previousValue) {
      const { debug, data, config, log, name, state, serviceManager } = this;
    
      if (debug) log(`\x1b[34m[DEBUG]\x1b[0m ${name} setCurrentState: requested update from ${previousValue} to ${state.currentState}`);

      // Ignore if no change to the targetPosition
      if (state.currentState === previousValue || !state.switchState) return;

      switch(state.currentState){
        case Characteristic.CurrentHumidifierDehumidifierState.DEHUMIDIFYING:
          hexData = data.targetStateDehumidifier;
        case Characteristic.CurrentHumidifierDehumidifierState.HUMIDIFYING:
          hexData = data.targetStateHumidifier;
        case Characteristic.CurrentHumidifierDehumidifierState.IDLE:
          hexData = data.fanOnly;
      }
    
      log(`${name} setCurrentState: currently ${previousValue}, changing to ${state.currentState}`);
	  
      if(hexData) await this.performSend(hexData);
      serviceManager.refreshCharacteristicUI(Characteristic.CurrentHumidifierDehumidifierState);
      this.previouslyOff = false;
  }
  
  async setHumidifierThreshold (hexData, previousValue) {
    const { config, name, log, state } = this;
    if (state.HumidifierThreshold === previousValue && config.preventResendHex && !this.previouslyOff) return;
    let desiredState = this.getDesiredState ();
    let previousState = state.currentState;
    
    if (state.currentState === desiredState) return;
    
    log(`${name} setHumidifierThreshold: currently ${previousValue} to ${state.DehumidifierThreshold}, changing to ${state.HumidifierThreshold} to ${state.DehumidifierThreshold}`);
    state.currentState = desiredState;
    this.setCurrentState (hexData, previousState);
  }
  
  async setDehumidifierThreshold (hexData, previousValue) {
    const { config, name, log, state } = this;
    if (state.DehumidifierThreshold === previousValue && config.preventResendHex && !this.previouslyOff) return;
    let desiredState = this.getDesiredState ();
    let previousState = state.currentState;
    
    if (state.currentState === desiredState) return;
    
    log(`${name} setDeumidifierThreshold: currently ${state.HumidifierThreshold} to ${previousValue}, changing to ${state.HumidifierThreshold} to ${state.DehumidifierThreshold}`);
    state.currentState = desiredState;
    this.setCurrentState (hexData, previousState);
  }
  
  getDesiredState () {
    const { config, log, name, state, serviceManager } = this;
    
    let desiredState = Characteristic.CurrentHumidifierDehumidifierState.IDLE;

    //Work out the ideal state
    if (state.targetState === Characteristic.TargetHumidifierDehumidifierState.HUMIDIFIER_OR_DEHUMIDIFIER) {
      if ((state.currentHumidity > state.HumidifierThreshold) && (state.currentHumidity < state.DehumidifierThreshold)){
        desiredState = Characteristic.CurrentHumidifierDehumidifierState.IDLE;
      } else if (state.currentHumidity < state.HumidifierThreshold) {
        desiredState = Characteristic.CurrentHumidifierDehumidifierState.HUMIDIFYING;
      } else if (state.currentHumidity > state.DehumidifierThreshold) {
        desiredState = Characteristic.CurrentHumidifierDehumidifierState.DEHUMIDIFYING;
      }
    } else if (state.targetState === Characteristic.TargetHumidifierDehumidifierState.HUMIDIFIER) {
      if(state.currentHumidity < state.HumidifierThreshold){
        desiredState = Characteristic.CurrentHumidifierDehumidifierState.HUMIDIFYING;
      } 
    } else if (state.targetState === Characteristic.TargetHumidifierDehumidifierState.DEHUMIDIFIER) {
      if(state.currentHumidity > state.DehumidifierThreshold){
        desiredState = Characteristic.CurrentHumidifierDehumidifierState.DEHUMIDIFYING;
      }
    } 

    if (config.humidifierOnly && desiredState === Characteristic.CurrentHumidifierDehumidifierState.DEHUMIDIFYING) {
      desiredState = Characteristic.CurrentHumidifierDehumidifierState.IDLE;
    }
    if (config.deHumidifierOnly && desiredState === Characteristic.CurrentHumidifierDehumidifierState.HUMIDIFYING) {
      desiredState = Characteristic.CurrentHumidifierDehumidifierState.IDLE;
    }

    return desiredState;  
	}
	
  async updateDeviceState () {
    const { serviceManager, debug, config, name, log, state } = this;
    
    //Do nothing if turned off
    if (!state.switchState) {
      state.currentState = Characteristic.CurrentHumidifierDehumidifierState.INACTIVE;
      serviceManager.refreshCharacteristicUI(Characteristic.CurrentHumidifierDehumidifierState);
      this.previouslyOff = true;
      return;
    }
    
    //Update "switchState to match device state
	  if (state.targetState === Characteristic.TargetHumidifierDehumidifierState.OFF){
      state.currentState = Characteristic.CurrentHumidifierDehumidifierState.INACTIVE;
      state.switchState = false;
      this.previouslyOff = true;
      return;
    }
    
    // Use hardcoded values if not using Humidity values 
    if(config.noHumidity && state.targetState === Characteristic.TargetHumidifierDehumidifierState.HUMIDIFIER){
      state.currentHumidity = 0
      state.HumidifierThreshold = 100
    } else if (config.noHumidity && state.targetState === Characteristic.TargetHumidifierDehumidifierState.DEHUMIDIFIER) {
      state.currentHumidity = 100
      state.DehumidifierThreshold = 0
    }
    
    let desiredState = this.getDesiredState ();
    
    if (state.currentState === desiredState && !this.previouslyOff) return;
    
    let previousState = state.currentState;
    if (debug) log(`\x1b[34m[DEBUG]\x1b[0m ${name} updateDeviceState: currently ${state.currentState}, changing to ${desiredState}`);

    state.currentState = desiredState;
    this.setCurrentState (null, previousState);
    this.previouslyOff = false;
  }

  // Device Temperature Methods
  async monitorHumidity () {
    const { debug, config, host, log, name, state } = this;
    const device = getDevice({ host, log });
	  
    // Try again in a second if we don't have a device yet
    if (!device) {
      await delayForDuration(1);
      this.monitorHumidity();
      return;
    }

    if (debug) log(`\x1b[34m[DEBUG]\x1b[0m ${name} monitorHumidity`);

    //Broadlink module emits 'temperature for both sensors.
    device.on('temperature', this.onHumidity.bind(this));
    device.checkHumidity();

    this.updateHumidityUI();
    if (!config.isUnitTest && !config.noHumidity) setInterval(this.updateHumidityUI.bind(this), config.humidityUpdateFrequency * 1000)
  }

  onHumidity (temperature,humidity) {
    const { config, host, debug, log, name, state } = this;
    const { humidityAdjustment } = config;

    // onHumidity is getting called twice. No known cause currently.
    // This helps prevent the same humidity from being processed twice
    if (Object.keys(this.humidityCallbackQueue).length === 0) return;

    humidity += humidityAdjustment;
    state.currentHumidity = humidity;
    if(debug) log(`\x1b[34m[DEBUG]\x1b[0m ${name} onHumidity (` + humidity + `)`);
	 
	  //Fakegato history update 
    if(config.noHistory !== true) {
      this.lastUpdatedAt = Date.now();
      if(debug) log(`\x1b[34m[DEBUG]\x1b[0m ${name} Logging data to history: humidity: ${this.state.currentHumidity}`);
      this.historyService.addEntry({ time: Math.round(new Date().valueOf() / 1000), humidity: this.state.currentHumidity });
    }
    
    this.updateDeviceState();
    this.processQueuedHumidityCallbacks(humidity);
  }

  addHumidityCallbackToQueue (callback) {
    const { config, host, debug, log, name, state } = this;
    
    // Clear the previous callback
    if (Object.keys(this.humidityCallbackQueue).length > 1) {
      if (state.currentHumidity) {
        if (debug) log(`\x1b[34m[DEBUG]\x1b[0m ${name} addHumidityCallbackToQueue (clearing previous callback, using existing humidity)`);
        this.processQueuedHumidityCallbacks(state.currentHumidity);
      }
    }

    // Add a new callback
    const callbackIdentifier = uuid.v4();
    this.humidityCallbackQueue[callbackIdentifier] = callback;
    
    // Read temperature from file
    if (config.humidityFilePath) {
      this.updateHumidityFromFile();

      return;
    }
    
    // Read humidity from mqtt
    if (config.mqttURL) {
      const humidity = this.mqttValueForIdentifier('humidity');
      this.onHumidity(null,humidity || 0);

      return;
    }
    
	  //Check if we're actually reading from the device
    if(config.noHumidity)  {
      let humidity = 50;
      if(state.targetState === Characteristic.TargetHumidifierDehumidifierState.DEHUMIDIFIER){
        humidity = 100;
      } else if(state.targetState === Characteristic.TargetHumidifierDehumidifierState.HUMIDIFIER) {
        humidity = 0;
      }
      this.onHumidity(null,humidity);
      
      return;
    }
    
    // Read temperature from Broadlink RM device
    // If the device is no longer available, use previous tempeature
    const device = getDevice({ host, log });

    if (!device || device.state === 'inactive') {
      if (device && device.state === 'inactive') {
        log(`${name} addHumidityCallbackToQueue (device no longer active, using existing humidity)`);
      }

      this.processQueuedHumidityCallbacks(state.currentHumidity || 0);

      return;
    }

    device.checkHumidity();
    if (debug) log(`\x1b[34m[DEBUG]\x1b[0m ${name} addHumidityCallbackToQueue (requested humidity from device, waiting)`);
  }
  
  updateHumidityFromFile () {
    const { config, debug, host, log, name, state } = this;
    const { humidityFilePath, batteryAlerts } = config;
    let humidity = null;
    let temperature = null;

    if (debug) log(`\x1b[34m[DEBUG]\x1b[0m ${name} updateHumidityFromFile reading file: ${humidity}`);

    fs.readFile(humidityFilePath, 'utf8', (err, data) => {
      if (err) {
         log(`\x1b[31m[ERROR] \x1b[0m${name} updateHumidityFromFile\n\n${err.message}`);
      }

      if (data === undefined || data.trim().length === 0) {
        log(`\x1b[33m[WARNING]\x1b[0m ${name} updateHumidityFromFile error reading file: ${humidityFilePath}, using previous Temperature`);
        humidity = (state.currentHumidity || 0);
      }

      const lines = data.split(/\r?\n/);
      if (/^[0-9]+\.*[0-9]*$/.test(lines[0])){
        humidity = parseFloat(data);
      } else {
        lines.forEach((line) => {
          if(-1 < line.indexOf(':')){
            let value = line.split(':');
            if(value[0] == 'temperature') temperature = parseFloat(value[1]);
            if(value[0] == 'humidity') humidity = parseFloat(value[1]);
            if(value[0] == 'battery' && batteryAlerts) state.batteryLevel = parseFloat(value[1]);
          }
        });
      }

      if (debug) log(`\x1b[34m[DEBUG]\x1b[0m ${name} updateHumidityFromFile (parsed humidity: ${humidity})`);

      this.onHumidity(temperature, humidity);
    });
  }
  
  // MQTT
  onMQTTMessage (identifier, message) {
    const { state, debug, log, name } = this;

    if (identifier !== 'unknown' && identifier !== 'humidity' && identifier !== 'battery') {
      log(`\x1b[31m[ERROR] \x1b[0m${name} onMQTTMessage (mqtt message received with unexpected identifier: ${identifier}, ${message.toString()})`);
      return;
    }

    super.onMQTTMessage(identifier, message);

    let value = this.mqttValuesTemp[identifier];
    if (debug) log(`\x1b[34m[DEBUG]\x1b[0m ${name} onMQTTMessage (raw value: ${value})`);

    try {
      const humidityJSON = JSON.parse(value);

      if (typeof humidityJSON === 'object') {
        let values = findKey(humidityJSON, 'humidity');
        if (identifier == 'humidity' || identifier == 'unknown'){
          //Try to locate other Humidity fields
          if (values.length === 0) values = findKey(temperatureJSON, 'Hum');
          if (values.length === 0) values = findKey(temperatureJSON, 'hum');
          if (values.length === 0) values = findKey(temperatureJSON, 'Humidity');
          if (values.length === 0) values = findKey(temperatureJSON, 'RelativeHumidity');
          if (values.length === 0) values = findKey(temperatureJSON, 'relativehumidity');
        }else{
          //Try to locate other Battery fields
          if (values.length === 0) values = findKey(temperatureJSON, 'Batt');
          if (values.length === 0) values = findKey(temperatureJSON, 'batt');
          if (values.length === 0) values = findKey(temperatureJSON, 'Battery');
          if (values.length === 0) values = findKey(temperatureJSON, 'battery');
        }

        if (values.length > 0) {
          value = values[0];
        } else {
          value = undefined;
        }
      }
    } catch (err) {} //Couldn't parse as JSON

    if (value === undefined || (typeof value === 'string' && value.trim().length === 0)) {
      log(`\x1b[31m[ERROR] \x1b[0m${name} onMQTTMessage (mqtt value not found)`);
      return;
    }

    if (debug) log(`\x1b[34m[DEBUG]\x1b[0m ${name} onMQTTMessage (parsed value: ${value})`);
    value = parseFloat(value);
    
    if (identifier == 'battery'){
      state.batteryLevel = value;
      return;
    }
    this.mqttValues[identifier] = value;
    this.updateHumidityUI();
  }

  processQueuedHumidityCallbacks (humidity) {
    if (Object.keys(this.humidityCallbackQueue).length === 0) return;

    Object.keys(this.humidityCallbackQueue).forEach((callbackIdentifier) => {
      const callback = this.humidityCallbackQueue[callbackIdentifier];

      callback(null, humidity);
      delete this.humidityCallbackQueue[callbackIdentifier];
    })

    this.humidityCallbackQueue = {};
  }

  updateHumidityUI () {
    const { config, serviceManager } = this;

    serviceManager.refreshCharacteristicUI(Characteristic.CurrentRelativeHumidity);
  }

  getCurrentHumidity (callback) {
    const { config, host, debug, log, name, state, serviceManager } = this;
    const { noHumidity } = config;

	  this.addHumidityCallbackToQueue(callback);
  }
 
  setupServiceManager () {
    const { config, data, name, serviceManagerType } = this;
    const { on, off, targetStateHumidifier, targetStateDehumidifier, lockControls, unlockControls, swingToggle } = data || {};

    // Defaults
    if (config.showLockPhysicalControls !== false) config.showLockPhysicalControls = true
    if (config.showSwingMode !== false && config.hideSwingMode !== true) config.showSwingMode = true
    if (config.showRotationDirection !== false && config.hideRotationDirection !== true) config.showRotationDirection = true

    this.serviceManager = new ServiceManagerTypes[serviceManagerType](name, Service.HumidifierDehumidifier, this.log);
    
    this.serviceManager.addToggleCharacteristic({
      name: 'switchState',
      type: Characteristic.Active,
      getMethod: this.getCharacteristicValue,
      setMethod: this.setCharacteristicValue,
      bind: this,
      props: {
        onData: on,
        offData: off,
        setValuePromise: this.setSwitchState.bind(this)
      }
    });

    this.serviceManager.addGetCharacteristic({
      name: 'currentHumidity',
      type: Characteristic.CurrentRelativeHumidity,
      method: this.getCurrentHumidity,
      bind: this
    });
	
	  this.serviceManager.addToggleCharacteristic({
      name: 'HumidifierThreshold',
      type: Characteristic.RelativeHumidityHumidifierThreshold,
      getMethod: this.getCharacteristicValue,
      setMethod: this.setCharacteristicValue,
      bind: this,
      props: {
        setValuePromise: this.setHumidifierThreshold.bind(this)
      }
	  });
	
	  this.serviceManager.addToggleCharacteristic({
      name: 'DehumidifierThreshold',
      type: Characteristic.RelativeHumidityDehumidifierThreshold,
      getMethod: this.getCharacteristicValue,
      setMethod: this.setCharacteristicValue,
      bind: this,
      props: {
        setValuePromise: this.setDehumidifierThreshold.bind(this)
      }
	  });
		
    this.serviceManager.addToggleCharacteristic({
      name: 'currentState',
      type: Characteristic.CurrentHumidifierDehumidifierState,
      getMethod: this.getCharacteristicValue,
      setMethod: this.setCharacteristicValue,
      bind: this,
      props: { }
    });
    
    this.serviceManager.addToggleCharacteristic({
      name: 'targetState',
      type: Characteristic.TargetHumidifierDehumidifierState,
      getMethod: this.getCharacteristicValue,
      setMethod: this.setCharacteristicValue,
      bind: this,
      props: {
        setValuePromise: this.updateDeviceState.bind(this)
      }
    });
    
    //Remove Auto mode if not getting Humidity readings
    if(config.noHumidity) {
	    this.serviceManager
		    .getCharacteristic(Characteristic.TargetHumidifierDehumidifierState)
			    .setProps({
				    validValues: [0, 1, 2]
				});
    }
    
    if (config.humidifierOnly) {
	    this.serviceManager
    		.getCharacteristic(Characteristic.TargetHumidifierDehumidifierState)
		     	.setProps({
					  validValues: [1]
				});
				
	    this.serviceManager
    		.getCharacteristic(Characteristic.CurrentHumidifierDehumidifierState)
		    	.setProps({
					validValues: [0, 2]
				});
      
      this.serviceManager
		    .getCharacteristic(Characteristic.RelativeHumidityDehumidifierThreshold)
			    .setProps({
				    validValues: [100]
				});
    }	
	 
 	  if (config.deHumidifierOnly) {
	    this.serviceManager
		    .getCharacteristic(Characteristic.TargetHumidifierDehumidifierState)
			    .setProps({
				    validValues: [2]
				});
				
	    this.serviceManager
		    .getCharacteristic(Characteristic.CurrentHumidifierDehumidifierState)
			    .setProps({
				    validValues: [0, 3]
				});
      
      this.serviceManager
		    .getCharacteristic(Characteristic.RelativeHumidityHumidifierThreshold)
			    .setProps({
				    validValues: [0]
				});
	  }

    if (config.showLockPhysicalControls) {
      this.serviceManager.addToggleCharacteristic({
        name: 'lockPhysicalControls',
        type: Characteristic.LockPhysicalControls,
        getMethod: this.getCharacteristicValue,
        setMethod: this.setCharacteristicValue,
        bind: this,
        props: {
          onData: lockControls,
          offData: unlockControls
        }
      });
    }

    if (config.showSwingMode) {
      this.serviceManager.addToggleCharacteristic({
        name: 'swingMode',
        type: Characteristic.SwingMode,
        getMethod: this.getCharacteristicValue,
        setMethod: this.setCharacteristicValue,
        bind: this,
        props: {
          onData: swingToggle,
          offData: swingToggle,
        }
      });
    }

    this.serviceManager.addToggleCharacteristic({
      name: 'fanSpeed',
      type: Characteristic.RotationSpeed,
      getMethod: this.getCharacteristicValue,
      setMethod: this.setCharacteristicValue,
      bind: this,
      props: {
        setValuePromise: this.setFanSpeed.bind(this),
		    minStep: config.stepSize,
		    minValue: 0,
		    maxVlue: 100
      }
    });
  }
}

module.exports = HumidifierDehumidifierAccessory;
