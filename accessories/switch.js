// -*- js-indent-level : 2 -*-
const ServiceManagerTypes = require('../helpers/serviceManagerTypes');
const delayForDuration = require('../helpers/delayForDuration');
const catchDelayCancelError = require('../helpers/catchDelayCancelError');
const ping = require('../helpers/ping')
const arp = require('../helpers/arp')
const BroadlinkRMAccessory = require('./accessory');

class SwitchAccessory extends BroadlinkRMAccessory {

  constructor (log, config = {}, serviceManagerType) {    
    super(log, config, serviceManagerType);

      // Fakegato setup
    if(config.history === true || config.noHistory === false) {
      this.historyService = new HistoryService('switch', { displayName: config.name, log: log }, { storage: 'fs', filename: 'RMPro_' + config.name.replace(' ','-') + '_persist.json'});
      this.historyService.addEntry(
	{time: Math.round(new Date().valueOf()/1000),
	 status: this.state.switchState ? 1 : 0})
      
      let state2 = this.state;
      this.state = new Proxy(state2, {
	set: function(target, key, value) {
	  if (target[key] != value) {
	    Reflect.set(target, key, value);
	    if (this.historyService) {
	      if (key == `switchState`) {
		this.log.debug(`adding history of switchState.`, value);
		const time = Math.round(new Date().valueOf()/1000);
		//if (value) {
		  this.state.lastActivation = time;
		//}
		this.historyService.addEntry(
		  {time: time, status: value ? 1 : 0})
	      }
	    }
	  }
	  return true
	}.bind(this)
      })

      if (!config.isUnitTest) {this.checkPing(ping)}
    } 
  }

  setDefaults () {
    const { config } = this;
    config.pingFrequency = config.pingFrequency || 1;
    config.pingGrace = config.pingGrace || 10;

    config.offDuration = config.offDuration || 60;
    config.onDuration = config.onDuration || 60;

    if (config.enableAutoOn === undefined && config.disableAutomaticOn === undefined) {
      config.enableAutoOn = false;
    } else if (config.disableAutomaticOn !== undefined) {
      config.enableAutoOn = !config.disableAutomaticOn;
    }

    if (config.enableAutoOff === undefined && config.disableAutomaticOff === undefined) {
      config.enableAutoOff = false;
    } else if (config.disableAutomaticOff !== undefined) {
      config.enableAutoOff = !config.disableAutomaticOff;
    }
  }

  reset () {
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
      this.autoOnTimeoutPromise = null
    }
    
    if (this.pingGraceTimeout) {
      this.pingGraceTimeout.cancel();
      this.pingGraceTimeout = null;
    }
    
    if (this.serviceManager.getCharacteristic(Characteristic.On) === undefined) {
      this.state.switchState = false;
      this.serviceManager.refreshCharacteristicUI(Characteristic.On);
    }
  }

  checkAutoOnOff () {
    this.reset();
    this.checkPingGrace();
    this.checkAutoOn();
    this.checkAutoOff();
    
  }
  
  checkPing (ping) {
    const { config } = this
    let { pingIPAddress, pingFrequency, pingUseArp } = config;

    if (!pingIPAddress) {return}
    
    // Setup Ping/Arp-based State
    if(!pingUseArp) {
      ping(pingIPAddress, pingFrequency, this.pingCallback.bind(this));
    } else {
      arp(pingIPAddress, pingFrequency, this.pingCallback.bind(this));
    }
  }

  pingCallback (active) {
    const { config, state, serviceManager } = this;

    if (this.stateChangeInProgress){ 
      return; 
    }
    
    if (config.pingIPAddressStateOnly) {
      state.switchState = active ? true : false;
      serviceManager.refreshCharacteristicUI(Characteristic.On);

      return;
    }
    
    const value = active ? true : false;
    serviceManager.setCharacteristic(Characteristic.On, value);
  }

  async setSwitchState (hexData) {
    const { data, host, log, name, logLevel, config, state, serviceManager } = this;
    this.stateChangeInProgress = true;
    this.reset();

    if (hexData) {await this.performSend(hexData);}
    
    if (config.stateless === true) { 
      state.switchState = false;
      serviceManager.refreshCharacteristicUI(Characteristic.On);
    } else {
      this.checkAutoOnOff();
    }
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
    
  async checkAutoOff () {
    await catchDelayCancelError(async () => {
      const { config, log, name, state, serviceManager } = this;
      let { disableAutomaticOff, enableAutoOff, onDuration } = config;

      if (state.switchState && enableAutoOff) {
        log(`${name} setSwitchState: (automatically turn off in ${onDuration} seconds)`);

        this.autoOffTimeoutPromise = delayForDuration(onDuration);
        await this.autoOffTimeoutPromise;

        serviceManager.setCharacteristic(Characteristic.On, false);
      }
    });
  }

  async checkAutoOn () {
    await catchDelayCancelError(async () => {
      const { config, log, name, state, serviceManager } = this;
      let { disableAutomaticOn, enableAutoOn, offDuration } = config;

      if (!state.switchState && enableAutoOn) {
        log(`${name} setSwitchState: (automatically turn on in ${offDuration} seconds)`);

        this.autoOnTimeoutPromise = delayForDuration(offDuration);
        await this.autoOnTimeoutPromise;

        serviceManager.setCharacteristic(Characteristic.On, true);
      }
    });
  }

  async getLastActivation(callback) {
    const lastActivation = this.state.lastActivation ?
	  Math.max(0, this.state.lastActivation - this.historyService.getInitialTime()) : 0;
    
    callback(null, lastActivation);
  }

  localCharacteristic(key, uuid, props) {
    let characteristic = class extends Characteristic {
      constructor() {
	super(key, uuid);
	this.setProps(props);
      }
    }
    characteristic.UUID = uuid;

    return characteristic;
  }

  setupServiceManager () {
    const { data, name, config, serviceManagerType } = this;
    const { on, off } = data || { };
    const history = config.history === true || config.noHistory === false;
    
    this.serviceManager = new ServiceManagerTypes[serviceManagerType](name, Service.Switch, this.log);

    if (history) {
      const LastActivationCharacteristic = this.localCharacteristic(
	'LastActivation', 'E863F11A-079E-48FF-8F27-9C2605A29F52',
	{format: Characteristic.Formats.UINT32,
	 unit: Characteristic.Units.SECONDS,
	 perms: [
	   Characteristic.Perms.READ,
	   Characteristic.Perms.NOTIFY
	 ]});
      
      this.serviceManager.addGetCharacteristic({
	name: 'LastActivation',
	type: LastActivationCharacteristic,
	method: this.getLastActivation,
	bind: this
      });
    }
  
    this.serviceManager.addToggleCharacteristic({
      name: 'switchState',
      type: Characteristic.On,
      getMethod: this.getCharacteristicValue,
      setMethod: this.setCharacteristicValue,
      bind: this,
      props: {
        onData: on || data,
        offData: off || undefined,
        setValuePromise: this.setSwitchState.bind(this)
      }
    });
  }
}

module.exports = SwitchAccessory;
