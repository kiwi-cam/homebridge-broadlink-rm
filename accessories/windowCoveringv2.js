const { assert } = require('chai');

const ServiceManagerTypes = require('../helpers/serviceManagerTypes');
const catchDelayCancelError = require('../helpers/catchDelayCancelError');
const BroadlinkRMAccessory = require('./accessory');
const delayForDuration = require('../helpers/delayForDuration');

class WindowCoveringv2Accesory extends BroadlinkRMAccessory {
    setDefaults () {
    const { config, state } = this;
    const { currentPosition, positionState } = state;
    const { initialDelay, totalDurationOpen, totalDurationClose } = config;

    // Check required propertoes
    assert.isNumber(totalDurationOpen, '`totalDurationOpen` is required and should be numeric.')
    assert.isNumber(totalDurationClose, '`totalDurationClose` is required and should be numeric.')

    // Set config default values
    if (!initialDelay) {config.initialDelay = 0.1;}

    // Set state default values
    if (currentPosition === undefined) {this.state.currentPosition = 0;}
    if (positionState === undefined) {this.state.positionState = Characteristic.PositionState.STOPPED;}
  }

  async reset () {
    super.reset();

    // Clear existing timeouts
    if (this.initialDelayPromise) {
      this.initialDelayPromise.cancel();
      this.initialDelayPromise = null;
    }
    
    if (this.updateCurrentPositionPromise) {
      this.updateCurrentPositionPromise.cancel();
      this.updateCurrentPositionPromise = null;
    }
    
    if (this.autoStopPromise) {
      this.autoStopPromise.cancel();
      this.autoStopPromise = null;
    }
  }

  // User requested a specific position or asked the window-covering to be open or closed
  async setTargetPosition (hexData, previousValue) {
    await catchDelayCancelError(async () => {
      const { config, host, logLevel, data, log, name, state, serviceManager } = this;
      const { initialDelay } = config;
      const { open, close, stop } = data;
      
      this.reset();

      // Ignore if no change to the targetPosition
      if (state.targetPosition === previousValue && !config.allowResend) {return;}

      // `initialDelay` allows multiple `window-covering` accessories to be updated at the same time
      // without RF interference by adding an offset to each `window-covering` accessory
      this.initialDelayPromise = delayForDuration(initialDelay);
      await this.initialDelayPromise;

      if (logLevel <= 1) {log(`${name} setTargetPosition: (set new position)`)}

      // Determine if we're opening or closing
      const difference = state.targetPosition - state.currentPosition;

      if (difference > 0) {
        state.positionState = Characteristic.PositionState.INCREASING
        hexData = open
      } else if (difference < 0) {
        state.positionState = Characteristic.PositionState.DECREASING
        hexData = close
      } else {
        state.positionState = Characteristic.PositionState.STOPPED
        hexData = stop
      }
      
      // Perform the actual open/close asynchronously i.e. without await so that HomeKit status can be updated
      this.openOrClose({ hexData, previousValue });
    });
  }

  async openOrClose ({ hexData, previousValue }) {
    await catchDelayCancelError(async () => {
      const { config, data, host, name, log, state, logLevel, serviceManager } = this;
      const { totalDurationOpen, totalDurationClose } = config;
      const { stop } = data;

      const foundPositions = Object.keys(data || {}).reduce((accu, key) => {
        const match = key.match("/windowPosition(\d+)/");
        if (match && match[1]) {
            accu.push(match[1]);
        }
        return accu;
      }, []);

      serviceManager.setCharacteristic(Characteristic.PositionState, state.positionState);

      if (foundPositions.length === 0) {
        return log(`${name} openOrClose: No position hex codes provided.`)
      }

      const closest = foundPositions.reduce((prev, curr) => abs(curr - state.positionState) < Math.abs(prev - state.positionState) ? curr : prev);
      if (logLevel <= 2) {log(`${name} openOrClose: (closest: ${closest})`);}

      if (this.lastPosition === closest) {
        return;
      }

      hexData = data[`windowPosition${closest}`];

      this.lastPosition = closest;

      await this.performSend(hexData);

      serviceManager.setCharacteristic(Characteristic.CurrentPosition, state.targetPosition);
      setTimeout(() => {
        serviceManager.setCharacteristic(Characteristic.PositionState, Characteristic.PositionState.STOPPED);
      }, 3000);
    });
  }

  setupServiceManager () {
      const { data, log, name, serviceManagerType } = this;
  
      this.serviceManager = new ServiceManagerTypes[serviceManagerType](name, Service.WindowCovering, log);
  
      this.serviceManager.addToggleCharacteristic({
        name: 'currentPosition',
        type: Characteristic.CurrentPosition,
        bind: this,
        getMethod: this.getCharacteristicValue,
        setMethod: this.setCharacteristicValue,
        props: {
  
        }
      });
  
      this.serviceManager.addToggleCharacteristic({
        name: 'positionState',
        type: Characteristic.PositionState,
        bind: this,
        getMethod: this.getCharacteristicValue,
        setMethod: this.setCharacteristicValue,
        props: {
  
        }
      });
  
      this.serviceManager.addToggleCharacteristic({
        name: 'targetPosition',
        type: Characteristic.TargetPosition,
        bind: this,
        getMethod: this.getCharacteristicValue,
        setMethod: this.setCharacteristicValue,
        props: {
          setValuePromise: this.setTargetPosition.bind(this)
        }
      });
    }
}

module.exports = WindowCoveringv2Accesory;