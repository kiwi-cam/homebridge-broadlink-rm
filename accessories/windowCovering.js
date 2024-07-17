const { assert } = require('chai');

const delayForDuration = require('../helpers/delayForDuration');
const ServiceManagerTypes = require('../helpers/serviceManagerTypes');
const catchDelayCancelError = require('../helpers/catchDelayCancelError');
const BroadlinkRMAccessory = require('./accessory');

class WindowCoveringAccessory extends BroadlinkRMAccessory {

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

      const closeCompletely = await this.checkOpenOrCloseCompletely();
      if (closeCompletely) {return;}

      if (logLevel <= 1) {log(`${name} setTargetPosition: (set new position)`)};

      // Determine if we're opening or closing
      let difference = state.targetPosition - state.currentPosition;

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

  getUpToDatePosition (state) {  
    let currentValue = state.currentPosition || 0;
  
    if (state.positionState == Characteristic.PositionState.INCREASING) {currentValue++;}
    if (state.positionState == Characteristic.PositionState.DECREASING) {currentValue--;}
  
    if (currentValue < 0) {
      currentValue = 0
    } else if (currentValue > 100) {
      currentValue = 100
    }
  
    return currentValue;
  }

  async openOrClose ({ hexData, previousValue }) {
    await catchDelayCancelError(async () => {
      let { config, data, host, name, log, state, logLevel, serviceManager } = this;
      let { totalDurationOpen, totalDurationClose } = config;
      const { stop } = data;

      serviceManager.setCharacteristic(Characteristic.PositionState, state.positionState);

      let difference = state.targetPosition - state.currentPosition
      let positionStateDescription = null;
      let fullOpenCloseTime = null

      if (state.positionState == Characteristic.PositionState.INCREASING) {
        positionStateDescription = 'opening';
        fullOpenCloseTime = totalDurationOpen;
      } else if (state.positionState == Characteristic.PositionState.DECREASING) {
        positionStateDescription = 'closing';
        fullOpenCloseTime = totalDurationClose;
        difference = -1 * difference;
      } else {
        positionStateDescription = 'stopped';
        fullOpenCloseTime = 0;
      }
      
      const totalTime = Math.abs(difference / 100 * fullOpenCloseTime);

      if (logLevel <= 1) {log(`${name} setTargetPosition: position change ${state.currentPosition}% -> ${state.targetPosition}% (${positionStateDescription})`)};
      if (logLevel <= 1) {log(`${name} setTargetPosition: ${+totalTime.toFixed(2)}s ((${Math.abs(difference)} / 100) * ${fullOpenCloseTime}) until auto-stop`)};

      await this.performSend(hexData);
      
      if (state.positionState != Characteristic.PositionState.STOPPED) {
        // immediately update position to reflect that there's already some change in the position (even though its fractional,
        // we have to add 1 whole %), we then skip incrementing the position within startUpdatingCurrentPositionAtIntervals
        // if this is a first iteration, this way at time 0 the position delta is already 1, and so is the position at time 1
        // and we do not overshoot the actual position.
                
        // NOTE: ideally send+position update should be an "atomic" operation and the position should change by some
        //       fractional value (e.g. 0.00001) but that requires significant changes to the code base.

        const currentValue = this.getUpToDatePosition(state)
        serviceManager.setCharacteristic(Characteristic.CurrentPosition, currentValue);
        
        this.startUpdatingCurrentPositionAtIntervals(true, name, log);
      } else {
        this.startUpdatingCurrentPositionAtIntervals(false, name, log);
      }

      this.autoStopPromise = delayForDuration(totalTime);
      await this.autoStopPromise;

      await this.stopWindowCovering();

      serviceManager.setCharacteristic(Characteristic.CurrentPosition, state.targetPosition);
    });
  }

  async stopWindowCovering () {
    const { config, data, host, log, name, state, logLevel, serviceManager } = this;
    const { sendStopAt0, sendStopAt100 } = config;
    const { stop } = data;
  
    if (logLevel <= 2) {log(`${name} setTargetPosition: (stop window covering)`)};

    // Reset the state and timers
    this.reset();

    if (state.targetPosition === 100 && sendStopAt100) {await this.performSend(stop);}
    if (state.targetPosition === 0 && sendStopAt0) {await this.performSend(stop);}
    if (state.targetPosition !== 0 && state.targetPosition != 100) {await this.performSend(stop);}

    serviceManager.setCharacteristic(Characteristic.PositionState, Characteristic.PositionState.STOPPED);
  }

  async checkOpenOrCloseCompletely () {
    const { data, logLevel, host, log, name, serviceManager, state } = this;
    const { openCompletely, closeCompletely } = data;

    // Completely Close
    if (state.targetPosition === 0 && closeCompletely) {
      serviceManager.setCharacteristic(Characteristic.CurrentPosition, state.targetPosition);

      await this.performSend(closeCompletely);

      this.stopWindowCovering();

      return true;
    }

    // Completely Open
    if (state.targetPosition === 100 && openCompletely) {
      serviceManager.setCharacteristic(Characteristic.CurrentPosition, state.targetPosition);

      await this.performSend(openCompletely);

      this.stopWindowCovering();

      return true;
    }

    return false;
  }
  
  // Determine how long it should take to increase/decrease a single %
  determineOpenCloseDurationPerPercent ({ positionState, totalDurationOpen, totalDurationClose  }) {
    assert.isNumber(totalDurationOpen);
    assert.isNumber(totalDurationClose);
    assert.isAbove(totalDurationOpen, 0);
    assert.isAbove(totalDurationClose, 0);

    let fullOpenCloseTime = null
    if (positionState == Characteristic.PositionState.INCREASING) {
      fullOpenCloseTime = totalDurationOpen;
    } else if (positionState == Characteristic.PositionState.DECREASING) {
      fullOpenCloseTime = totalDurationClose;
    } else {
      fullOpenCloseTime = 0;
    }

    const durationPerPercentage = fullOpenCloseTime / 100;

    return durationPerPercentage;
  }

  async startUpdatingCurrentPositionAtIntervals (isFirst, name, log) {
    catchDelayCancelError(async () => {
      const { log, logLevel, config, serviceManager, state } = this;
      const { totalDurationOpen, totalDurationClose } = config;
      
      const durationPerPercentage = this.determineOpenCloseDurationPerPercent({ positionState: state.positionState, totalDurationOpen, totalDurationClose });

      // Wait for a single % to increase/decrease
      this.updateCurrentPositionPromise = delayForDuration(durationPerPercentage)
      await this.updateCurrentPositionPromise

      // Set the new currentPosition
      let positionStateDescription = null;
      
      if (state.positionState == Characteristic.PositionState.INCREASING) {
        positionStateDescription = 'opening';
      } else if (state.positionState == Characteristic.PositionState.DECREASING) {
        positionStateDescription = 'closing';
      } else {
        positionStateDescription = 'stopped';
      }

      if (!isFirst) {               
        const currentValue = this.getUpToDatePosition(state)
        serviceManager.setCharacteristic(Characteristic.CurrentPosition, currentValue);

        if (logLevel <= 2) {log(`${name} setTargetPosition: updated position to ${currentValue} (${positionStateDescription})`)};
      }

      // Let's go again
      if (state.positionState != Characteristic.PositionState.STOPPED) {
        this.startUpdatingCurrentPositionAtIntervals(false, name, log);
      }
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

module.exports = WindowCoveringAccessory;
