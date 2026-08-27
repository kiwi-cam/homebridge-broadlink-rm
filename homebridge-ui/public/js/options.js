/**
 * Option catalogue for the Broadlink RM custom configuration UI.
 *
 * Every entry mirrors an option the plugin implements, as documented at
 * https://broadlink.kiwicam.nz. Adding an option here is all that is needed for
 * it to appear in the accessory editor.
 *
 *   key     - the config.json property name
 *   label   - shown next to the control
 *   type    - boolean | number | text | select | stringList
 *   help    - one line explaining what it does
 *   group   - which section of the editor it belongs to
 *   types   - accessory types the option applies to
 *   unit    - optional suffix shown after a number input
 */

(function (global) {
  'use strict';

  var ACCESSORY_TYPES = [
    { value: 'switch', label: 'Switch', hint: 'On/off control for anything with a separate on and off code.' },
    { value: 'outlet', label: 'Outlet', hint: 'Like a switch, but shown as a plug in the Home app.' },
    { value: 'light', label: 'Light', hint: 'Brightness and colour, using one code per level.' },
    { value: 'fan', label: 'Fan', hint: 'Speed, swing and rotation direction.' },
    { value: 'fanv1', label: 'Fan (classic)', hint: 'Older fan service. Use "Fan" unless you need the legacy behaviour.' },
    { value: 'air-purifier', label: 'Air purifier', hint: 'Purifier with optional swing and child lock.' },
    { value: 'air-conditioner', label: 'Air conditioner', hint: 'Thermostat with one code per temperature.' },
    { value: 'heater-cooler', label: 'Heater / cooler', hint: 'Heater-cooler service with per-temperature fan speed and swing codes.' },
    { value: 'humidifier-dehumidifier', label: 'Humidifier / dehumidifier', hint: 'Humidifier, dehumidifier, or both.' },
    { value: 'temperatureSensor', label: 'Temperature sensor', hint: 'Reports temperature from the RM device, a file, or MQTT.' },
    { value: 'humiditySensor', label: 'Humidity sensor', hint: 'Reports humidity from the RM device, a file, or MQTT.' },
    { value: 'garage-door-opener', label: 'Garage door opener', hint: 'Open and close with a travel time.' },
    { value: 'lock', label: 'Lock', hint: 'Lock and unlock with a travel time.' },
    { value: 'window-covering', label: 'Window covering', hint: 'Blinds and curtains, positioned by travel time.' },
    { value: 'window', label: 'Window', hint: 'Like a window covering, shown as a window in the Home app.' },
    { value: 'tv', label: 'TV', hint: 'Full TV remote with inputs, volume and directional buttons.' },
    { value: 'switch-multi', label: 'Switch (multiple codes)', hint: 'Sends a list of codes in order when switched on.' },
    { value: 'switch-multi-repeat', label: 'Switch (multiple, repeated)', hint: 'Sends a list of codes, repeated a number of times.' },
    { value: 'switch-repeat', label: 'Switch (repeated code)', hint: 'Sends the same code several times, useful for stubborn devices.' },
    { value: 'learn-code', label: 'Learn code', hint: 'A switch that puts the RM device into learning mode and writes the code to the log.' },
    { value: 'learn-ir', label: 'Learn code (alias)', hint: 'Identical to "Learn code". Kept for older configurations.' }
  ];

  var LOG_LEVELS = [
    { value: 'none', label: 'None' },
    { value: 'critical', label: 'Critical' },
    { value: 'error', label: 'Error' },
    { value: 'warning', label: 'Warning' },
    { value: 'info', label: 'Info (default)' },
    { value: 'debug', label: 'Debug' },
    { value: 'trace', label: 'Trace' }
  ];

  var GROUPS = [
    { id: 'general', label: 'General' },
    { id: 'behaviour', label: 'Behaviour' },
    { id: 'ping', label: 'Presence detection (ping)' },
    { id: 'temperature', label: 'Temperature' },
    { id: 'humidity', label: 'Humidity' },
    { id: 'mqtt', label: 'MQTT and external readings' },
    { id: 'advanced', label: 'Advanced' }
  ];

  // Accessory type groupings reused below.
  var SWITCH_LIKE = ['switch', 'outlet', 'light', 'fan', 'fanv1', 'tv'];
  var PING_TYPES = ['switch', 'outlet', 'fan', 'tv'];
  var AUTO_TYPES = ['switch', 'outlet', 'light', 'fan', 'fanv1', 'tv', 'air-conditioner', 'learn-code', 'learn-ir'];
  var CLIMATE = ['air-conditioner', 'heater-cooler'];
  var HUMIDITY_TYPES = ['air-conditioner', 'heater-cooler', 'humidifier-dehumidifier', 'temperatureSensor', 'humiditySensor'];
  var HISTORY_TYPES = ['air-conditioner', 'heater-cooler', 'humidifier-dehumidifier', 'temperatureSensor', 'humiditySensor'];
  var ALL = ACCESSORY_TYPES.map(function (t) { return t.value; });

  var OPTIONS = [
    // ---------------------------------------------------------------- general
    { key: 'host', label: 'Broadlink device', type: 'device', group: 'general', types: ALL,
      help: 'Which RM device sends this accessory\'s codes. Leave empty to use the first device found.' },
    { key: 'disabled', label: 'Disabled', type: 'boolean', group: 'general', types: ALL, default: false,
      help: 'Keeps the configuration but stops the accessory being added to HomeKit.' },
    { key: 'subType', label: 'Shown in Home as', type: 'select', group: 'general', types: ['tv'], default: 'tv',
      options: [{ value: 'tv', label: 'TV' }, { value: 'stb', label: 'Set-top box' }, { value: 'stick', label: 'Streaming stick' }, { value: 'receiver', label: 'Receiver' }],
      help: 'Changes the icon and wording used by the Home app.' },

    // -------------------------------------------------------------- behaviour
    { key: 'enableAutoOff', label: 'Turn off automatically', type: 'boolean', group: 'behaviour', types: AUTO_TYPES, default: false,
      help: 'Switches the accessory off by itself once the on duration has passed.' },
    { key: 'onDuration', label: 'On duration', type: 'number', unit: 'seconds', group: 'behaviour', types: AUTO_TYPES, default: 60,
      help: 'How long to stay on before switching off automatically.' },
    { key: 'enableAutoOn', label: 'Turn on automatically', type: 'boolean', group: 'behaviour', types: ['switch', 'outlet', 'light', 'fan', 'fanv1', 'tv'], default: false,
      help: 'Switches the accessory on by itself once the off duration has passed.' },
    { key: 'offDuration', label: 'Off duration', type: 'number', unit: 'seconds', group: 'behaviour', types: ['switch', 'outlet', 'light', 'fan', 'fanv1', 'tv'], default: 60,
      help: 'How long to stay off before switching on automatically.' },
    { key: 'stateless', label: 'Stateless', type: 'boolean', group: 'behaviour', types: ['switch'], default: false,
      help: 'Always falls back to "off" after being triggered, like a button.' },

    { key: 'defaultBrightness', label: 'Default brightness', type: 'number', unit: '%', group: 'behaviour', types: ['light'], default: 100,
      help: 'Brightness used when the light is turned on and no level has been set.' },
    { key: 'useLastKnownBrightness', label: 'Use last known brightness', type: 'boolean', group: 'behaviour', types: ['light'], default: true,
      help: 'Restores the previous brightness instead of the default when turning the light on.' },
    { key: 'onDelay', label: 'Delay after the on code', type: 'number', unit: 'seconds', group: 'behaviour', types: ['light'], default: 0.1,
      help: 'Gap between the on code and the brightness or hue code that follows it.' },
    { key: 'exclusives', label: 'Turn these off', type: 'stringList', group: 'behaviour', types: ['light'],
      help: 'Names of other light accessories to switch off when this one is switched on.' },

    { key: 'hideSwingMode', label: 'Hide swing control', type: 'boolean', group: 'behaviour', types: ['fan', 'air-purifier', 'humidifier-dehumidifier'], default: false,
      help: 'Removes the swing control from the Home app.' },
    { key: 'hideRotationDirection', label: 'Hide rotation direction', type: 'boolean', group: 'behaviour', types: ['fan', 'fanv1', 'air-purifier', 'humidifier-dehumidifier'], default: false,
      help: 'Removes the clockwise / counter-clockwise control from the Home app.' },
    { key: 'showLockPhysicalControls', label: 'Show child lock', type: 'boolean', group: 'behaviour', types: ['air-purifier', 'humidifier-dehumidifier'], default: true,
      help: 'Shows the physical controls lock in the Home app.' },
    { key: 'alwaysResetToDefaults', label: 'Reset speed when turned off', type: 'boolean', group: 'behaviour', types: ['fan', 'fanv1'], default: false,
      help: 'Puts the speed back to its default every time the fan is switched off.' },
    { key: 'defaultFanSpeed', label: 'Default speed', type: 'number', unit: '%', group: 'behaviour', types: ['fan', 'fanv1'], default: 100,
      help: 'Speed used when the fan is turned on and no speed has been set.' },
    { key: 'stepSize', label: 'Speed step size', type: 'number', unit: '%', group: 'behaviour', types: ['fan', 'fanv1', 'humidifier-dehumidifier'], default: 1,
      help: 'How much the speed moves each time it is adjusted.' },
    { key: 'speedCycle', label: 'Cycle through speeds', type: 'boolean', group: 'behaviour', types: ['fan'], default: false,
      help: 'Wraps around to the lowest speed after the highest.' },
    { key: 'speedSteps', label: 'Number of speeds', type: 'number', group: 'behaviour', types: ['fan'],
      help: 'Use when the fan has a fixed number of speeds rather than a percentage.' },
    { key: 'defaultSpeedStep', label: 'Default speed step', type: 'number', group: 'behaviour', types: ['fan'],
      help: 'Which of the fixed speeds to use when none has been set.' },

    { key: 'openCloseDuration', label: 'Travel time', type: 'number', unit: 'seconds', group: 'behaviour', types: ['garage-door-opener'], default: 8,
      help: 'How long the door shows as opening or closing.' },
    { key: 'openDuration', label: 'Opening time', type: 'number', unit: 'seconds', group: 'behaviour', types: ['garage-door-opener'],
      help: 'Overrides the travel time for opening only.' },
    { key: 'closeDuration', label: 'Closing time', type: 'number', unit: 'seconds', group: 'behaviour', types: ['garage-door-opener'],
      help: 'Overrides the travel time for closing only.' },
    { key: 'autoCloseDelay', label: 'Close automatically after', type: 'number', unit: 'seconds', group: 'behaviour', types: ['garage-door-opener'], default: 30,
      help: 'Starts closing by itself once this time has passed.' },

    { key: 'autoLockDelay', label: 'Lock automatically after', type: 'number', unit: 'seconds', group: 'behaviour', types: ['lock'], default: 30,
      help: 'Locks by itself once this time has passed.' },
    { key: 'lockDuration', label: 'Locking time', type: 'number', unit: 'seconds', group: 'behaviour', types: ['lock'], default: 1,
      help: 'How long the lock shows as "locking".' },
    { key: 'unlockDuration', label: 'Unlocking time', type: 'number', unit: 'seconds', group: 'behaviour', types: ['lock'], default: 1,
      help: 'How long the lock shows as "unlocking".' },

    { key: 'totalDurationOpen', label: 'Time to open fully', type: 'number', unit: 'seconds', group: 'behaviour', types: ['window-covering', 'window'],
      help: 'Used to work out the position shown in the Home app.' },
    { key: 'totalDurationClose', label: 'Time to close fully', type: 'number', unit: 'seconds', group: 'behaviour', types: ['window-covering', 'window'],
      help: 'Used to work out the position shown in the Home app.' },
    { key: 'initialDelay', label: 'Start delay', type: 'number', unit: 'seconds', group: 'behaviour', types: ['window-covering', 'window'], default: 0.1,
      help: 'Offsets this accessory so several coverings moving at once do not interfere with each other.' },
    { key: 'sendStopAt0', label: 'Send stop at 0%', type: 'boolean', group: 'behaviour', types: ['window-covering', 'window'], default: false,
      help: 'Sends the stop code when the covering reaches fully closed.' },
    { key: 'sendStopAt100', label: 'Send stop at 100%', type: 'boolean', group: 'behaviour', types: ['window-covering', 'window'], default: false,
      help: 'Sends the stop code when the covering reaches fully open.' },

    { key: 'interval', label: 'Gap between codes', type: 'number', unit: 'seconds', group: 'behaviour', types: ['switch-multi', 'switch-multi-repeat', 'switch-repeat'],
      help: 'How long to wait between each code that is sent.' },
    { key: 'sendCount', label: 'Times to send', type: 'number', group: 'behaviour', types: ['switch-repeat', 'switch-multi-repeat'], default: 1,
      help: 'How many times the code is repeated.' },
    { key: 'onSendCount', label: 'Times to send (on)', type: 'number', group: 'behaviour', types: ['switch-repeat'],
      help: 'Overrides the repeat count for the on code.' },
    { key: 'offSendCount', label: 'Times to send (off)', type: 'number', group: 'behaviour', types: ['switch-repeat'],
      help: 'Overrides the repeat count for the off code.' },
    { key: 'pause', label: 'Pause between repeats', type: 'number', unit: 'seconds', group: 'behaviour', types: ['switch-multi-repeat'],
      help: 'How long to wait before starting the list again.' },

    { key: 'scanFrequency', label: 'Learn RF instead of IR', type: 'boolean', group: 'behaviour', types: ['learn-code', 'learn-ir'], default: false,
      help: 'Switches this accessory to the RF frequency sweep used for radio remotes.' },

    // ------------------------------------------------------------------- ping
    { key: 'pingIPAddress', label: 'IP address to watch', type: 'text', group: 'ping', types: PING_TYPES,
      help: 'The accessory shows as on while this address answers, and off when it stops.' },
    { key: 'pingUseArp', label: 'Use ARP instead of ping', type: 'boolean', group: 'ping', types: PING_TYPES, default: false,
      help: 'Checks the address in the ARP table. Useful for devices that ignore ICMP.' },
    { key: 'pingIPAddressStateOnly', label: 'Status only', type: 'boolean', group: 'ping', types: PING_TYPES, default: false,
      help: 'Reflects the state in HomeKit without sending any code when it changes.' },
    { key: 'pingFrequency', label: 'Check every', type: 'number', unit: 'seconds', group: 'ping', types: PING_TYPES, default: 1,
      help: 'How often the address is checked.' },
    { key: 'pingGrace', label: 'Grace period', type: 'number', unit: 'seconds', group: 'ping', types: PING_TYPES, default: 10,
      help: 'Ignores state changes for this long after a command, giving the device time to start up or shut down.' },

    // ------------------------------------------------------------ temperature
    { key: 'minTemperature', label: 'Minimum temperature', type: 'number', group: 'temperature', types: CLIMATE,
      help: 'Lowest temperature that can be requested.' },
    { key: 'maxTemperature', label: 'Maximum temperature', type: 'number', group: 'temperature', types: CLIMATE,
      help: 'Highest temperature that can be requested.' },
    { key: 'tempStepSize', label: 'Temperature step size', type: 'number', group: 'temperature', types: CLIMATE, default: 0.5,
      help: 'How much the temperature moves each time it is adjusted.' },
    { key: 'temperatureDisplayUnits', label: 'Display units', type: 'select', group: 'temperature', types: ['air-conditioner'], default: 'C',
      options: [{ value: 'C', label: 'Celsius' }, { value: 'F', label: 'Fahrenheit' }],
      help: 'Units shown in the Home app.' },
    { key: 'temperatureUnits', label: 'Config units', type: 'select', group: 'temperature', types: ['heater-cooler'], default: 'C',
      options: [{ value: 'C', label: 'Celsius' }, { value: 'F', label: 'Fahrenheit' }],
      help: 'The units the temperatures in this accessory are written in.' },
    { key: 'defaultCoolTemperature', label: 'Default cool temperature', type: 'number', group: 'temperature', types: ['air-conditioner'], default: 16,
      help: 'Used when no code exists for the requested temperature.' },
    { key: 'defaultHeatTemperature', label: 'Default heat temperature', type: 'number', group: 'temperature', types: ['air-conditioner'], default: 30,
      help: 'Used when no code exists for the requested temperature.' },
    { key: 'heatTemperature', label: 'Heating threshold', type: 'number', group: 'temperature', types: ['air-conditioner'],
      help: 'Above this the accessory shows as heating, and the heat default is used for missing codes.' },
    { key: 'replaceAutoMode', label: 'Replace auto mode with', type: 'select', group: 'temperature', types: ['air-conditioner'], default: 'cool',
      options: [{ value: 'cool', label: 'Cool' }, { value: 'heat', label: 'Heat' }],
      help: 'Siri sets auto mode; this is the mode used instead.' },
    { key: 'autoHeatTemperature', label: 'Auto heat below', type: 'number', group: 'temperature', types: ['air-conditioner'],
      help: 'Switches to heat mode when the measured temperature falls below this.' },
    { key: 'autoCoolTemperature', label: 'Auto cool above', type: 'number', group: 'temperature', types: ['air-conditioner'],
      help: 'Switches to cool mode when the measured temperature rises above this.' },
    { key: 'autoSwitchName', label: 'Auto switch accessory', type: 'text', group: 'temperature', types: ['air-conditioner'],
      help: 'Name of a switch accessory that turns the automatic heating and cooling on and off.' },
    { key: 'minimumAutoOnOffDuration', label: 'Minimum auto on/off time', type: 'number', unit: 'seconds', group: 'temperature', types: ['air-conditioner'], default: 120,
      help: 'How long the unit must stay on or off after being switched automatically.' },
    { key: 'coolingThresholdTemperature', label: 'Cooling target', type: 'number', group: 'temperature', types: ['heater-cooler'], default: 35,
      help: 'Temperature the cooler is set to.' },
    { key: 'heatingThresholdTemperature', label: 'Heating target', type: 'number', group: 'temperature', types: ['heater-cooler'], default: 10,
      help: 'Temperature the heater is set to.' },
    { key: 'defaultRotationSpeed', label: 'Default fan speed', type: 'number', unit: '%', group: 'temperature', types: ['heater-cooler'], default: 100,
      help: 'Fan speed used when the unit is turned on.' },
    { key: 'fanStepSize', label: 'Fan step size', type: 'number', unit: '%', group: 'temperature', types: ['heater-cooler'], default: 1,
      help: 'How much the fan speed moves each time it is adjusted.' },
    { key: 'heatOnly', label: 'Heat only', type: 'boolean', group: 'temperature', types: ['air-conditioner'], default: false,
      help: 'Restricts the accessory to heating.' },
    { key: 'coolOnly', label: 'Cool only', type: 'boolean', group: 'temperature', types: ['air-conditioner'], default: false,
      help: 'Restricts the accessory to cooling.' },
    { key: 'turnOnWhenOff', label: 'Send on code first', type: 'boolean', group: 'temperature', types: CLIMATE, default: false,
      help: 'Sends the on code before the temperature code when the unit is off.' },
    { key: 'sendTemperatureOnlyWhenOff', label: 'Do not turn on for a temperature change', type: 'boolean', group: 'temperature', types: ['air-conditioner'], default: false,
      help: 'Stops the unit being turned on when a temperature is set while it is off.' },
    { key: 'ignoreTemperatureWhenOff', label: 'Ignore temperature while off', type: 'boolean', group: 'temperature', types: ['air-conditioner'], default: false,
      help: 'Stops temperature codes being sent at all while the unit is off.' },
    { key: 'temperatureAdjustment', label: 'Temperature offset', type: 'number', group: 'temperature', types: ['air-conditioner', 'heater-cooler', 'temperatureSensor'], default: 0,
      help: 'Degrees added to the reading before it is reported.' },
    { key: 'temperatureUpdateFrequency', label: 'Read temperature every', type: 'number', unit: 'seconds', group: 'temperature', types: ['air-conditioner', 'heater-cooler', 'temperatureSensor'], default: 10,
      help: 'How often the temperature is requested.' },
    { key: 'pseudoDeviceTemperature', label: 'Fixed temperature', type: 'number', group: 'temperature', types: ['air-conditioner', 'temperatureSensor'],
      help: 'Reports this value instead of reading the device, for RM units without a thermometer.' },
    { key: 'defaultNowTemperature', label: 'Fixed temperature', type: 'number', group: 'temperature', types: ['heater-cooler'],
      help: 'Reports this value instead of reading the device, for RM units without a thermometer.' },
    { key: 'temperatureFilePath', label: 'Temperature from file', type: 'text', group: 'mqtt', types: ['air-conditioner', 'heater-cooler', 'temperatureSensor'],
      help: 'Path to a file holding the current temperature.' },
    { key: 'w1DeviceID', label: '1-Wire sensor ID', type: 'text', group: 'mqtt', types: ['air-conditioner', 'heater-cooler', 'temperatureSensor'],
      help: 'Reads the temperature from a Raspberry Pi 1-Wire sensor, for example 28-0321544e531ff.' },
    { key: 'tempSourceUnits', label: 'Source units', type: 'select', group: 'mqtt', types: HISTORY_TYPES, default: 'C',
      options: [{ value: 'C', label: 'Celsius' }, { value: 'F', label: 'Fahrenheit' }],
      help: 'The units used by the file, MQTT or 1-Wire source. Not the RM device.' },

    // --------------------------------------------------------------- humidity
    { key: 'noHumidity', label: 'Hide humidity', type: 'boolean', group: 'humidity', types: HUMIDITY_TYPES, default: false,
      help: 'Removes humidity reporting from the accessory.' },
    { key: 'humidityAdjustment', label: 'Humidity offset', type: 'number', unit: '%', group: 'humidity', types: HUMIDITY_TYPES, default: 0,
      help: 'Percentage added to the reading before it is reported.' },
    { key: 'humidityUpdateFrequency', label: 'Read humidity every', type: 'number', unit: 'seconds', group: 'humidity', types: ['humidifier-dehumidifier', 'humiditySensor'], default: 10,
      help: 'How often the humidity is requested.' },
    { key: 'humidityFilePath', label: 'Humidity from file', type: 'text', group: 'mqtt', types: ['humidifier-dehumidifier', 'humiditySensor'],
      help: 'Path to a file holding the current humidity.' },
    { key: 'threshold', label: 'Humidity threshold', type: 'number', unit: '%', group: 'humidity', types: ['humidifier-dehumidifier'], default: 5,
      help: 'How close to the target humidity the unit tries to get.' },
    { key: 'humidifierOnly', label: 'Humidifier only', type: 'boolean', group: 'humidity', types: ['humidifier-dehumidifier'], default: false,
      help: 'Restricts the accessory to humidifying.' },
    { key: 'deHumidifierOnly', label: 'Dehumidifier only', type: 'boolean', group: 'humidity', types: ['humidifier-dehumidifier'], default: false,
      help: 'Restricts the accessory to dehumidifying.' },

    // ------------------------------------------------------------------- mqtt
    { key: 'mqttURL', label: 'MQTT broker URL', type: 'text', group: 'mqtt', types: HISTORY_TYPES,
      help: 'Must start with mqtt://, for example mqtt://192.168.1.77.' },
    { key: 'mqttUsername', label: 'MQTT username', type: 'text', group: 'mqtt', types: HISTORY_TYPES,
      help: 'Username for the broker, if it needs one.' },
    { key: 'mqttPassword', label: 'MQTT password', type: 'password', group: 'mqtt', types: HISTORY_TYPES,
      help: 'Password for the broker, if it needs one.' },
    { key: 'batteryAlerts', label: 'Monitor battery level', type: 'boolean', group: 'mqtt', types: ['temperatureSensor', 'humiditySensor'], default: false,
      help: 'Reads battery: values from the file or MQTT source and reports them to the Eve app.' },

    // --------------------------------------------------------------- advanced
    { key: 'persistState', label: 'Remember state across restarts', type: 'boolean', group: 'advanced', types: ALL, default: true,
      help: 'Restores the last known state when Homebridge restarts.' },
    { key: 'resendHexAfterReload', label: 'Resend code after restart', type: 'boolean', group: 'advanced', types: ALL, default: false,
      help: 'Sends the code for the restored state when Homebridge restarts.' },
    { key: 'allowResend', label: 'Allow resending the same code', type: 'boolean', group: 'advanced', types: ALL, default: true,
      help: 'Sends the code even when the accessory is already in the requested state.' },
    { key: 'noHistory', label: 'Disable Eve history', type: 'boolean', group: 'advanced', types: HISTORY_TYPES, default: false,
      help: 'Removes the temperature and humidity history service used by the Eve app.' },
    { key: 'disableLogs', label: 'Disable logging', type: 'boolean', group: 'advanced', types: ALL, default: false,
      help: 'Silences this accessory in the Homebridge log.' },
    { key: 'logLevel', label: 'Log level', type: 'select', group: 'advanced', types: ALL, default: 'info',
      options: LOG_LEVELS, help: 'How much detail this accessory writes to the log.' }
  ];

  // Accessory types that carry a "data" object of hex codes.
  var DATA_TYPES = ALL.filter(function (t) {
    return ['temperatureSensor', 'humiditySensor', 'learn-code', 'learn-ir'].indexOf(t) === -1;
  });

  function optionsFor(type) {
    return OPTIONS.filter(function (option) {
      return option.types.indexOf(type) !== -1;
    });
  }

  function typeLabel(type) {
    for (var i = 0; i < ACCESSORY_TYPES.length; i += 1) {
      if (ACCESSORY_TYPES[i].value === type) {return ACCESSORY_TYPES[i].label;}
    }
    return type;
  }

  // Starting points for the "data" object of each accessory type. They are only
  // offered when an accessory has no codes yet, so an existing configuration is
  // never overwritten.
  var DATA_TEMPLATES = {
    'switch': { on: '', off: '' },
    'outlet': { on: '', off: '' },
    'light': { on: '', off: '', brightness100: '' },
    'fan': { on: '', off: '', swingToggle: '', fanSpeed100: '' },
    'fanv1': { on: '', off: '', fanSpeed100: '' },
    'air-purifier': { on: '', off: '' },
    'air-conditioner': { off: '', temperature16: { 'pseudo-mode': 'cool', data: '' } },
    'heater-cooler': { cool: { on: '', off: '', temperatureCodes: {} } },
    'humidifier-dehumidifier': { on: '', off: '', targetStateHumidifier: '', targetStateDehumidifier: '' },
    'garage-door-opener': { open: '', close: '' },
    'lock': { lock: '', unlock: '' },
    'window-covering': { open: '', close: '', stop: '' },
    'window': { open: '', close: '', stop: '' },
    'tv': { on: '', off: '', volume: { up: '', down: '' }, remote: {}, inputs: [] },
    'switch-multi': { on: [''], off: [''] },
    'switch-multi-repeat': { on: [''], off: [''] },
    'switch-repeat': { on: '', off: '' }
  };

  // ------------------------------------------------------------------ codes
  //
  // Every hex code an accessory can hold, so the editor can offer a labelled
  // slot to learn into instead of asking for hand-written JSON.
  //
  //   path   - dotted path inside the accessory's "data" object
  //   label  - what the button on the remote does
  //   group  - heading it appears under

  var TV_REMOTE = [
    ['select', 'OK / Select'], ['back', 'Back'], ['exit', 'Exit'], ['info', 'Info'],
    ['arrowUp', 'Up'], ['arrowDown', 'Down'], ['arrowLeft', 'Left'], ['arrowRight', 'Right'],
    ['playPause', 'Play / Pause'], ['rewind', 'Rewind'], ['fastForward', 'Fast forward'],
    ['previousTrack', 'Previous track'], ['nextTrack', 'Next track']
  ].map(function (pair) {
    return { path: 'remote.' + pair[0], label: pair[1], group: 'Remote buttons' };
  });

  var POWER = [
    { path: 'on', label: 'Turn on', group: 'Power' },
    { path: 'off', label: 'Turn off', group: 'Power' }
  ];

  var CODE_SLOTS = {
    'switch': POWER,
    'outlet': POWER,
    'switch-repeat': POWER,
    'switch-multi': [
      { path: 'on', label: 'Turn on', group: 'Power', list: true },
      { path: 'off', label: 'Turn off', group: 'Power', list: true }
    ],
    'switch-multi-repeat': [
      { path: 'on', label: 'Turn on', group: 'Power', list: true },
      { path: 'off', label: 'Turn off', group: 'Power', list: true }
    ],
    'light': [
      { path: 'on', label: 'Turn on', group: 'Power', optional: true },
      { path: 'off', label: 'Turn off', group: 'Power' },
      { path: 'white', label: 'Set to white', group: 'Colour', optional: true }
    ],
    'fan': POWER.concat([
      { path: 'swingToggle', label: 'Toggle swing', group: 'Movement', optional: true },
      { path: 'clockwise', label: 'Rotate clockwise', group: 'Movement', optional: true },
      { path: 'counterClockwise', label: 'Rotate counter-clockwise', group: 'Movement', optional: true }
    ]),
    'fanv1': POWER,
    'air-purifier': POWER.concat([
      { path: 'swingToggle', label: 'Toggle swing', group: 'Movement', optional: true },
      { path: 'lockControls', label: 'Lock the controls', group: 'Child lock', optional: true },
      { path: 'unlockControls', label: 'Unlock the controls', group: 'Child lock', optional: true }
    ]),
    'humidifier-dehumidifier': POWER.concat([
      { path: 'targetStateHumidifier', label: 'Humidifier mode', group: 'Mode' },
      { path: 'targetStateDehumidifier', label: 'Dehumidifier mode', group: 'Mode' },
      { path: 'fanOnly', label: 'Fan only', group: 'Mode', optional: true },
      { path: 'swingToggle', label: 'Toggle swing', group: 'Movement', optional: true },
      { path: 'lockControls', label: 'Lock the controls', group: 'Child lock', optional: true },
      { path: 'unlockControls', label: 'Unlock the controls', group: 'Child lock', optional: true }
    ]),
    'air-conditioner': [
      { path: 'off', label: 'Turn off', group: 'Power' },
      { path: 'on', label: 'Turn on', group: 'Power', optional: true },
      { path: 'offDryMode', label: 'Turn off with coil dry', group: 'Power', optional: true }
    ],
    'heater-cooler': [
      { path: 'cool.on', label: 'Cool mode on', group: 'Cooling' },
      { path: 'cool.off', label: 'Cool mode off', group: 'Cooling' },
      { path: 'heat.on', label: 'Heat mode on', group: 'Heating' },
      { path: 'heat.off', label: 'Heat mode off', group: 'Heating' }
    ],
    'garage-door-opener': [
      { path: 'open', label: 'Open', group: 'Door' },
      { path: 'close', label: 'Close', group: 'Door' },
      { path: 'lock', label: 'Lock', group: 'Lock', optional: true },
      { path: 'unlock', label: 'Unlock', group: 'Lock', optional: true }
    ],
    'lock': [
      { path: 'lock', label: 'Lock', group: 'Lock' },
      { path: 'unlock', label: 'Unlock', group: 'Lock' }
    ],
    'window-covering': [
      { path: 'open', label: 'Open', group: 'Movement' },
      { path: 'close', label: 'Close', group: 'Movement' },
      { path: 'stop', label: 'Stop', group: 'Movement' },
      { path: 'openCompletely', label: 'Open completely', group: 'Movement', optional: true },
      { path: 'closeCompletely', label: 'Close completely', group: 'Movement', optional: true }
    ],
    'tv': [
      { path: 'on', label: 'Turn on', group: 'Power' },
      { path: 'off', label: 'Turn off', group: 'Power' },
      { path: 'volume.up', label: 'Volume up', group: 'Volume' },
      { path: 'volume.down', label: 'Volume down', group: 'Volume' },
      { path: 'powerMode.show', label: 'Open the settings menu', group: 'Power', optional: true }
    ].concat(TV_REMOTE)
  };

  CODE_SLOTS.window = CODE_SLOTS['window-covering'];

  // Codes that come in numbered sets. The editor asks for the number and builds
  // the key, rather than listing every possible one up front.
  var CODE_FAMILIES = {
    'light': [
      { id: 'brightness', label: 'Brightness level', group: 'Brightness', unit: '%',
        key: function (n) { return 'brightness' + n; }, min: 1, max: 100, step: 10 },
      { id: 'hue', label: 'Colour (hue)', group: 'Colour', unit: 'degrees',
        key: function (n) { return 'hue' + n; }, min: 0, max: 359, step: 1 }
    ],
    'fan': [
      { id: 'fanSpeed', label: 'Fan speed', group: 'Speed', unit: '%',
        key: function (n) { return 'fanSpeed' + n; }, min: 1, max: 100, step: 10 }
    ],
    'air-conditioner': [
      { id: 'temperature', label: 'Temperature', group: 'Temperatures', unit: 'degrees',
        key: function (n) { return 'temperature' + n; }, min: 10, max: 40, step: 1, mode: true }
    ]
  };

  CODE_FAMILIES.fanv1 = CODE_FAMILIES.fan;
  CODE_FAMILIES['air-purifier'] = CODE_FAMILIES.fan;
  CODE_FAMILIES['humidifier-dehumidifier'] = CODE_FAMILIES.fan;

  // Read a dotted path out of an accessory's data object. A slot's value is
  // either a hex string or an object carrying the hex under "data", so both
  // shapes are unwrapped to the string the editor shows.
  function readCode(data, path) {
    var node = data;
    var parts = path.split('.');

    for (var i = 0; i < parts.length; i += 1) {
      if (node === null || typeof node !== 'object') { return undefined; }
      node = node[parts[i]];
    }

    if (node === undefined || node === null) { return undefined; }
    if (typeof node === 'string') { return node; }
    if (Array.isArray(node)) { return node.length ? '[' + node.length + ' codes]' : undefined; }
    if (typeof node === 'object' && typeof node.data === 'string') { return node.data; }
    return undefined;
  }

  // Write a hex string into a dotted path, keeping whatever shape is already
  // there: an object slot keeps its siblings (pseudo-mode, sendCount, ...) and
  // only its "data" is replaced. Passing null removes the slot.
  function writeCode(data, path, hex) {
    var parts = path.split('.');
    var node = data;

    for (var i = 0; i < parts.length - 1; i += 1) {
      if (node[parts[i]] === null || typeof node[parts[i]] !== 'object') { node[parts[i]] = {}; }
      node = node[parts[i]];
    }

    var last = parts[parts.length - 1];

    if (hex === null) {
      delete node[last];
      return;
    }

    var existing = node[last];

    if (existing && typeof existing === 'object' && !Array.isArray(existing)) {
      existing.data = hex;
    } else {
      node[last] = hex;
    }
  }

  function slotsFor(accessory) {
    var fixed = (CODE_SLOTS[accessory.type] || []).slice();
    var data = accessory.data;

    if (!data || typeof data !== 'object') { return fixed; }

    var known = {};
    fixed.forEach(function (slot) { known[slot.path] = true; });

    // Anything already in the configuration that is not a fixed slot - a
    // learned temperature, a fan speed, a code added by hand - is listed too,
    // so nothing in the file is invisible in the editor.
    Object.keys(data).forEach(function (key) {
      if (known[key]) { return; }
      if (key === 'remote' || key === 'volume' || key === 'inputs' || key === 'powerMode') { return; }
      if (data[key] === null || typeof data[key] === 'object') {
        if (Array.isArray(data[key]) || typeof data[key].data === 'string') {
          fixed.push({ path: key, label: key, group: 'From your configuration', extra: true });
        }
        return;
      }
      fixed.push({ path: key, label: key, group: 'From your configuration', extra: true });
    });

    return fixed;
  }

  global.BroadlinkOptions = {
    ACCESSORY_TYPES: ACCESSORY_TYPES,
    LOG_LEVELS: LOG_LEVELS,
    GROUPS: GROUPS,
    OPTIONS: OPTIONS,
    DATA_TYPES: DATA_TYPES,
    DATA_TEMPLATES: DATA_TEMPLATES,
    CODE_SLOTS: CODE_SLOTS,
    CODE_FAMILIES: CODE_FAMILIES,
    readCode: readCode,
    writeCode: writeCode,
    slotsFor: slotsFor,
    SWITCH_LIKE: SWITCH_LIKE,
    optionsFor: optionsFor,
    typeLabel: typeLabel
  };
}(window));
