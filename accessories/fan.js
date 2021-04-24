const ServiceManagerTypes = require('../helpers/serviceManagerTypes');
const SwitchAccessory = require('./switch');
const catchDelayCancelError = require('../helpers/catchDelayCancelError');
const delayForDuration = require('../helpers/delayForDuration');

class FanAccessory extends SwitchAccessory {
  setDefaults () {
    super.setDefaults();
    let { config, state } = this;
    
    // Defaults
    config.showSwingMode = config.hideSwingMode === true || config.showSwingMode === false ? false : true;
    config.showRotationDirection = config.hideRotationDirection === true || config.showRotationDirection === false ? false : true;
    config.stepSize = isNaN(config.stepSize) || config.stepSize > 100 || config.stepSize < 1 ? 1 : config.stepSize;
    
    if (config.speedSteps) {
      config.stepSize = Math.floor(100 / config.speedSteps);
    }
    
    if (config.alwaysResetToDefaults) {
      state.fanSpeed = (config.defaultFanSpeed !== undefined) ? config.defaultFanSpeed : 100;

      if (config.defaultSpeedStep) {
        state.fanSpeed = config.defaultSpeedStep * config.stepSize;
      }
    }
  }

  reset() {
    super.reset();

    this.stateChangeInProgress = true;
    
    // Clear Timeouts
    if (this.delayTimeoutPromise) {
      this.delayTimeoutPromise.cancel();
      this.delayTimeoutPromise = null;
    }

    if (this.autoOffTimeoutPromise) {
      this.autoOffTimeoutPromise.cancel();
      this.autoOffTimeoutPromise = null;
    }

    if (this.autoOnTimeoutPromise) {
      this.autoOnTimeoutPromise.cancel();
      this.autoOnTimeoutPromise = null;
    }
    
	  if (this.serviceManager.getCharacteristic(Characteristic.Active) === undefined) {
      this.serviceManager.setCharacteristic(Characteristic.Active, false);
    }
  }
  
  checkAutoOnOff() {
    this.reset();
    this.checkAutoOn();
    this.checkAutoOff();
  }

  async checkAutoOff() {
    await catchDelayCancelError(async () => {
      const { config, log, name, state, serviceManager } = this;
      let { disableAutomaticOff, enableAutoOff, onDuration } = config;

      if (state.switchState && enableAutoOff) {
        log(
          `${name} setSwitchState: (automatically turn off in ${onDuration} seconds)`
        );

        this.autoOffTimeoutPromise = delayForDuration(onDuration);
        await this.autoOffTimeoutPromise;

        serviceManager.setCharacteristic(Characteristic.Active, false);
      }
    });
  }

  async checkAutoOn() {
    await catchDelayCancelError(async () => {
      const { config, log, name, state, serviceManager } = this;
      let { disableAutomaticOn, enableAutoOn, offDuration } = config;

      if (!state.switchState && enableAutoOn) {
        log(
          `${name} setSwitchState: (automatically turn on in ${offDuration} seconds)`
        );

        this.autoOnTimeoutPromise = delayForDuration(offDuration);
        await this.autoOnTimeoutPromise;

        serviceManager.setCharacteristic(Characteristic.Active, true);
      }
    });
  }

  async setSwitchState (hexData, previousValue) {	  
    const { config, state, serviceManager } = this;
    if (!this.state.switchState) {
      this.lastFanSpeed = undefined;
    }
	  
    // Reset the fan speed back to the default speed when turned off
    if (this.state.switchState === false && config.alwaysResetToDefaults) {
      this.setDefaults();
      serviceManager.setCharacteristic(Characteristic.RotationSpeed, state.fanSpeed);
    }

    super.setSwitchState(hexData, previousValue);
  }

  async setFanSpeed (hexData) {
    const { config, data, host, log, state, name, debug} = this;

    this.reset();

    // Create an array of speeds specified in the data config
    const foundSpeeds = [];
    const allHexKeys = Object.keys(data || {});

    allHexKeys.forEach((key) => {
      const parts = key.split('fanSpeed');

      if (parts.length !== 2) return;

      foundSpeeds.push(parts[1])
    })

    if (config.speedCycle && config.speedSteps) {
      for (let i = 1; i <= config.speedSteps; i++) {
        foundSpeeds.push(config.stepSize * i);
      }
    }

    if (foundSpeeds.length === 0) {

      return log(`${name} setFanSpeed: No fan speed hex codes provided.`)
    }

    // Find speed closest to the one requested
    const closest = foundSpeeds.reduce((prev, curr) => Math.abs(curr - state.fanSpeed) < Math.abs(prev - state.fanSpeed) ? curr : prev);
    log(`${name} setFanSpeed: (closest: ${closest})`);

    if (this.lastFanSpeed === closest) {
      return;
    }

    // Get the closest speed's hex data
    hexData = data[`fanSpeed${closest}`];

    if (config.speedCycle) {
      let fanSpeed = this.lastFanSpeed;
      hexData = [];

      if (fanSpeed > closest) {
        while (fanSpeed < config.speedSteps * config.stepSize) {
          hexData.push(data['fanSpeed']);
          fanSpeed += config.stepSize;
        }

        fanSpeed = 0;
      }

      if (fanSpeed < closest) {
        while (fanSpeed < closest) {
          hexData.push(data['fanSpeed']);
          fanSpeed += config.stepSize;
        } 
      }
    }

    this.lastFanSpeed = closest;

    await this.performSend(hexData);

    this.checkAutoOnOff();
  }

  setupServiceManager () {
    const { config, data, name, serviceManagerType } = this;
    const { on, off, clockwise, counterClockwise, swingToggle } = data || {};

    this.serviceManager = new ServiceManagerTypes[serviceManagerType](name, Service.Fanv2, this.log);

    this.setDefaults();
    
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
          setValuePromise: this.performSend.bind(this)
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
		    maxValue: 100
      }
    });

    if (config.showRotationDirection) {
      this.serviceManager.addToggleCharacteristic({
        name: 'rotationDirection',
        type: Characteristic.RotationDirection,
        getMethod: this.getCharacteristicValue,
        setMethod: this.setCharacteristicValue,
        bind: this,
        props: {
          onData: counterClockwise,
          offData: clockwise,
          setValuePromise: this.performSend.bind(this)
        }
      });
    }
  }
}

module.exports = FanAccessory;
