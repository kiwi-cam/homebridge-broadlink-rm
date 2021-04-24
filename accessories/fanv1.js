const ServiceManagerTypes = require('../helpers/serviceManagerTypes');
const FanAccessory = require('./fan');
const catchDelayCancelError = require('../helpers/catchDelayCancelError');
const delayForDuration = require('../helpers/delayForDuration');

class Fanv1Accessory extends FanAccessory {
  setDefaults () {
    super.setDefaults();
    let { config, state } = this;
    
    // Defaults
    config.showRotationDirection = config.hideRotationDirection === true || config.showRotationDirection === false ? false : true;
    config.stepSize = isNaN(config.stepSize) || config.stepSize > 100 || config.stepSize < 1 ? 1 : config.stepSize
    
    if (config.alwaysResetToDefaults) {
      state.fanSpeed = (config.defaultFanSpeed !== undefined) ? config.defaultFanSpeed : 100;
    }
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

        serviceManager.setCharacteristic(Characteristic.On, false);
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

        serviceManager.setCharacteristic(Characteristic.On, true);
      }
    });
  }

  setupServiceManager () {
    const { config, data, name, serviceManagerType } = this;
    const { on, off } = data || {};

    this.setDefaults();

    this.serviceManager = new ServiceManagerTypes[serviceManagerType](name, Service.Fan, this.log);

    this.serviceManager.addToggleCharacteristic({
      name: 'switchState',
      type: Characteristic.On,
      getMethod: this.getCharacteristicValue,
      setMethod: this.setCharacteristicValue,
      bind: this,
      props: {
        onData: on,
        offData: off,
        setValuePromise: this.setSwitchState.bind(this)
      }
    });
    
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

module.exports = Fanv1Accessory;
