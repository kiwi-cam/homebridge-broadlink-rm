const ServiceManagerTypes = require('../helpers/serviceManagerTypes');
const FanAccessory = require('./fan');

class AirPurifierAccessory extends FanAccessory {

  async setSwitchState (hexData, previousValue) {
    super.setSwitchState(hexData, previousValue);
    
    this.updateCurrentState()
  }

  // User requested a the target state be set
  async setTargetState (hexData, previousValue) {
      const { log, name, state, serviceManager } = this;

      // Ignore if no change to the targetPosition
      if (state.targetState === previousValue) return;

      // Set the CurrentAirPurifierState to match the switch state
      log(`${name} setTargetState: currently ${previousValue === 0 ? 'manual' : 'auto'}, changing to ${state.targetState === 0 ? 'manual' : 'auto'}`);

      await this.performSend(hexData);
  }

  updateCurrentState() {
    const { log, name, state, serviceManager } = this;

    if (state.switchState === true) {
      log(`${name} updateCurrentState: changing to purifying`);
      state.currentState = Characteristic.CurrentAirPurifierState.PURIFYING_AIR
    } else {
      log(`${name} updateCurrentState: changing to idle`);
      state.currentState = Characteristic.CurrentAirPurifierState.INACTIVE
    }
    
    serviceManager.refreshCharacteristicUI(Characteristic.CurrentAirPurifierState);
  }

  setupServiceManager () {
    const { config, data, name, serviceManagerType } = this;
    const {
      on,
      off,
      targetStateManual,
      targetStateAuto,
      lockControls,
      unlockControls,
      swingToggle
    } = data || {};

    // Defaults
    if (config.showLockPhysicalControls !== false) config.showLockPhysicalControls = true
    if (config.showSwingMode !== false && config.hideSwingMode !== true) config.showSwingMode = true
    if (config.showRotationDirection !== false && config.hideRotationDirection !== true) config.showRotationDirection = true

    this.serviceManager = new ServiceManagerTypes[serviceManagerType](name, Service.AirPurifier, this.log);

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

    this.serviceManager.addToggleCharacteristic({
      name: 'currentState',
      type: Characteristic.CurrentAirPurifierState,
      getMethod: this.getCharacteristicValue,
      setMethod: this.setCharacteristicValue,
      bind: this,
      props: { }
    });

    this.serviceManager.addToggleCharacteristic({
      name: 'targetState',
      type: Characteristic.TargetAirPurifierState,
      getMethod: this.getCharacteristicValue,
      setMethod: this.setCharacteristicValue,
      bind: this,
      props: {
        onData: targetStateManual,
        offData: targetStateAuto,
        setValuePromise: this.setTargetState.bind(this)
      }
    });

    if (config.showLockPhysicalControls) {
      this.serviceManager.addToggleCharacteristic({
        name: 'lockPhysicalControls',
        type: Characteristic.LockPhysicalControls,
        getMethod: this.getCharacteristicValue,
        setMethod: this.setCharacteristicValue,
        bind: this,
        props: {
          onData: lockControls,
          offData: unlockControls,
          setValuePromise: this.performSend.bind(this)
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
        setValuePromise: this.setFanSpeed.bind(this)
      }
    });
  }
}

module.exports = AirPurifierAccessory;
