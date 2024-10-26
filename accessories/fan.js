const ServiceManagerTypes = require('../helpers/serviceManagerTypes');
const BroadlinkRMAccessory = require('./accessory');
const catchDelayCancelError = require('../helpers/catchDelayCancelError');
const delayForDuration = require('../helpers/delayForDuration');
const ping = require('../helpers/ping');
const arp = require('../helpers/arp')

class FanAccessory extends BroadlinkRMAccessory {
  constructor(log, config = {}, serviceManagerType) {
    super(log, config, serviceManagerType);

    if (!config.isUnitTest) {this.checkPing(ping);}
  }

  setDefaults() {
    let { config, state } = this;
    config.pingFrequency = config.pingFrequency || 1;
    config.pingGrace = config.pingGrace || 10;

    config.offDuration = config.offDuration || 60;
    config.onDuration = config.onDuration || 60;

    // Defaults
    config.showSwingMode = config.hideSwingMode === true || config.showSwingMode === false ? false : true;
    config.showRotationDirection = config.hideRotationDirection === true || config.showRotationDirection === false ? false : true;
    config.stepSize = isNaN(config.stepSize) || config.stepSize > 100 || config.stepSize < 1 ? 1 : config.stepSize;

    if (config.speedSteps) {
      config.stepSize = Math.floor(100 / config.speedSteps);
    }

    if (config.alwaysResetToDefaults) {
      state.fanSpeed = (config.defaultFanSpeed !== undefined) ? config.defaultFanSpeed : 100;

      if (config.defaultSpeedStep && config.stepSize) {
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

    if (this.pingGraceTimeout) {
      this.pingGraceTimeout.cancel();
      this.pingGraceTimeout = null;
    }

    if (this.serviceManager.getCharacteristic(Characteristic.Active) === undefined) {
      this.serviceManager.setCharacteristic(Characteristic.Active, false);
    }
  }

  checkAutoOnOff() {
    this.reset();
    this.checkPingGrace();
    this.checkAutoOn();
    this.checkAutoOff();
  }

  checkPing(ping) {
    const { config } = this;
    let { pingIPAddress, pingFrequency, pingUseArp } = config;

    if (!pingIPAddress) {return;}

    // Setup Ping/Arp-based State
    if(!pingUseArp) {ping(pingIPAddress, pingFrequency, this.pingCallback.bind(this))}
    else {arp(pingIPAddress, pingFrequency, this.pingCallback.bind(this))}
  }

  pingCallback(active) {
    const { config, state, serviceManager } = this;

    if (this.stateChangeInProgress){
      return;
    }

    if (config.pingIPAddressStateOnly) {
      state.switchState = active ? true : false;
      serviceManager.updateCharacteristic(Characteristic.Active,state.switchState);

      return;
    }

    const value = active ? true : false;
    serviceManager.setCharacteristic(Characteristic.Active, value);
  }

  async checkPingGrace () {
    await catchDelayCancelError(async () => {
      const { config, log, name, state, serviceManager } = this;

      let { pingGrace } = config;

      if (pingGrace) {

        this.pingGraceTimeoutPromise = delayForDuration(pingGrace);
        await this.pingGraceTimeoutPromise;

        this.stateChangeInProgress = false;
      }
    });
  }

  async checkAutoOff() {
    await catchDelayCancelError(async () => {
      const { config, log, logLevel, name, state, serviceManager } = this;
      let { disableAutomaticOff, enableAutoOff, onDuration } = config;

      if (state.switchState && enableAutoOff) {
        if (logLevel <= 2) {log(`${name} setSwitchState: (automatically turn off in ${onDuration} seconds)`);}

        this.autoOffTimeoutPromise = delayForDuration(onDuration);
        await this.autoOffTimeoutPromise;

        serviceManager.setCharacteristic(Characteristic.Active, false);
      }
    });
  }

  async checkAutoOn() {
    await catchDelayCancelError(async () => {
      const { config, log, logLevel, name, state, serviceManager } = this;
      let { disableAutomaticOn, enableAutoOn, offDuration } = config;

      if (!state.switchState && enableAutoOn) {
        if (logLevel <= 2) {log(`${name} setSwitchState: (automatically turn on in ${offDuration} seconds)`);}

        this.autoOnTimeoutPromise = delayForDuration(offDuration);
        await this.autoOnTimeoutPromise;

        serviceManager.setCharacteristic(Characteristic.Active, true);
      }
    });
  }

  async setSwitchState(hexData, previousValue) {
    const { config, state, serviceManager } = this;
    if (!state.switchState) {
      this.lastFanSpeed = undefined;
    }

    if (config.defaultSpeedStep && config.stepSize) {
      this.lastFanSpeed = config.defaultSpeedStep * config.stepSize;
    }

    // Reset the fan speed back to the default speed when turned off
    if (!state.switchState && config.alwaysResetToDefaults) {
      this.setDefaults();
      serviceManager.setCharacteristic(Characteristic.RotationSpeed, state.fanSpeed);
    }

    this.reset();

    if (hexData) {await this.performSend(hexData);}
  }

  async setFanSpeed(hexData) {
    const { config, data, host, log, state, name, logLevel } = this;

    this.reset();

    // Create an array of speeds specified in the data config
    const foundSpeeds = Object.keys(data || {}).reduce((accu, key) => {
      const match = key.match(/fanSpeed(\d+)/);
      if (match && match[1]) {
        accu.push(match[1]);
      }
      return accu;
    }, []);

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
    if (logLevel <= 2) {log(`${name} setFanSpeed: (closest: ${closest})`);}

    if (this.lastFanSpeed === closest) {
      return;
    }

    // Get the closest speed's hex data
    hexData = data[`fanSpeed${closest}`];

    if (config.speedCycle) {
      let fanSpeedHexData = data.fanSpeed;
      let fanSpeed = this.lastFanSpeed;
      hexData = [];

      if (typeof fanSpeedHexData === 'string') {
        fanSpeedHexData = {
          data: fanSpeedHexData
        }
      }

      if (fanSpeed > closest) {
        while (fanSpeed < config.speedSteps * config.stepSize) {
          hexData.push(fanSpeedHexData);
          fanSpeed += config.stepSize;
        }

        fanSpeed = 0;
      }

      if (fanSpeed < closest) {
        while (fanSpeed < closest) {
          hexData.push(fanSpeedHexData);
          fanSpeed += config.stepSize;
        }
      }
    }

    this.lastFanSpeed = closest;

    await this.performSend(hexData);

    this.checkAutoOnOff();
  }

  setupServiceManager() {
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

    // Add HAP properties for improved accessory representation in Homekit
    this.serviceManager.getCharacteristic(Characteristic.RotationSpeed).setProps({
      minStep: config.stepSize,
      minValue: 0,
      maxValue: 100
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
