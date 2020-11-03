# Homebridge Broadlink RM [TV+AC Pro Fork]

## Version 4.3.1+ notes
There are a couple of changes made in version 4.3.1 which might cause issues when you upgrade.
1. There was a bug in how MAC addresses were stored in the plugin. If you specify a HOST in your config.json by MAC address, you'll likely need to correct this value after you update.
2. In order to fix an issue in iOS 14, all TVs are now seperate accessories. Previously the first TV connected via Homebridge as a bridge. This means that after updating, that first TV will need to be removed and re-added to HomeKit.
3. The Dehumidifer accessory has been updated to use the Humidity readings from your Broadlink device. If your Broadlink device doesn't support Humidity readings, or you don't want to functionality set `"noHumidity" : true` in your config.json

For other changes, refer to the Change Log [here](https://github.com/kiwi-cam/homebridge-broadlink-rm/blob/master/CHANGELOG.md).

# About this fork

This fork adds support for the TV type indroduced in iOS 12.2. I'm only give support for this specific accessory type!

This fork also contains updates the to Air Conditioner accessory, as detailed in the documenation below.

If you want to use this fork, use this command: 

`npm i -g homebridge-broadlink-rm-pro`


# Homebridge Broadlink RM [[Original](https://github.com/lprhodes/homebridge-broadlink-rm)]

## Introduction
Welcome to the Broadlink RM Mini and Broadlink RM Pro plugin for [Homebridge](https://github.com/nfarina/homebridge).

This plugin allows you to control your RM Mini and RM Pro with HomeKit using the Home app and Siri.

## Like this plugin?

If you like this plugin and want to show your support then please star the Github repo, or better yet; buy me a drink using [Paypal](https://paypal.me/kiwicamRM).

Thank you!

## Documentation

Base documentation can be found [here](https://lprhodes.github.io/slate/). With additional configuration options outlined below.

If the plugin is unable to discover your device, it's likely you've locked the device with the cloud so it no longer accepts local connections. In this case, follow these steps:
1. Open the [Broadlink app](https://apps.apple.com/us/app/broadlink/id1450257910)
2. From the Home screen, tap on your Broadlink device
3. Tap the ... in the top right
4. Scroll down and toggle "Lock device" to Off
5. Tap OK when prompted "Confirm to unlock the device"

<img src="https://i.imgur.com/DMTUbDo.png" width="40%" height="40%">

This plugin should now be able to discover your device.

### Hosts Configuration
By default the plugin will search the network and discover your Broadlink devices. If you'd prefer to manaually add devices you can add a hosts section to your config.json (refer to the [sample config](https://github.com/kiwi-cam/homebridge-broadlink-rm/blob/master/config-sample.json#L18-L27))
key | description | example | default
--- | ----------- | ------- | -------
isRFSupported (optional) | Forces the device to support RF signals | true | false
isRM4 (optional) | Marks the device as a newer RM4 device and sends data with required new headers | true | false

### Switch Accessory

key | description | example | default
--- | ----------- | ------- | -------
pingGrace (optional) | Pauses ping status changes for the specified period (seconds) to allow device to start-up/shutdown after the change | 15 | 10

### Fan Accessory

key | description | example | default
--- | ----------- | ------- | -------
hideSwingMode (optional) | Determines whether we should hide the swing mode UI or not. If true, also changes the accessory type to allow additional Fan icons. | true | false
alwaysResetToDefaults (optional) | If set, the fanSpeed is reset to its default when the fan is turned off. | true | false
defaultFanSpeed (optional) | Sets the default Speed for the fan when a value isn't already set. | 50 | 100
stepSize (optional) | If set, sets the amount the fanSpeed will step up/down by | 10 | 1

### Aircon Accessory

key | description | example | default
--- | ----------- | ------- | -------
w1DeviceID (optional) | Updates device current temperature from a Raspberry Pi Wire-1 thermometers (i.e. ds18b20). Value is the Device ID | 28-0321544e531ff | 
heatOnly (optional) | Forces the Aircon accessory to only operate in Heat mode | true | false
coolOnly (optional) | Forces the Aircon accessory to only operate in Cool mode | true | false
noHumidity (optional) | Removes Humidity information from the device. It will be removed when using w1Device or temperatureFilePath | true | false
mqttURL (optional) | The URL to monitor for MQTT topics (below) | mqtt://localhost | null
mqttTopic (optional) | The mqtt topic for temperature data, or an array of objects with an identifier and topic. Identifier can be temperature or humidity. | "/mi_temp/LivingRoom/temperature" | null

#### "data" key-value object
The device can be setup to manage modes in one of two ways. If your AC unit accepts a hexcade to change mode only (without temperature details) you can set the mode keys (heat/cool) and then the temperatureX values to change the teperature. If your AC unit sends hexcodes that contain the mode AND temperature you can use the modeX codes alone.

When the mode is changed the mode hexcodes are sent first - if set. Then the modeX code is sent to set the temperature, if it is set. If a matching modeX code can't be found, the temperatureX code is sent.  If neither of these temperature codes are found either defaultHeatTemperature or defaultCoolTemperature codes will be used depending on if the target Temperature is higher or lower than the current temperature.

key | description
--- | -----------
off | A hex code string to be sent when the air conditioner is asked to be turned off.
temperatureX | A hex code string where X is any temperature you wish to support e.g. "temperature30".
modeX | A hex code string where X is any temperture, and mode is one of "heat","cool", or "auto". Hex code used to set unit to the specified mode and temperature

#### "temperatureX" and "modeX" key-value object

key | description
--- | -----------
data | Hex data stored as string.
pseudo-mode (optional) | The mode we set when this hex is sent. i.e. "heat" or "cool". For graphical purposes only (hence use of the term "pseudo"). Not recommended for ModeX key-values.

### humidifier-dehumidifier Accessory
Adds a humidifier/dehumidifer accessory.
key | description | example | default
--- | ----------- | ------- | -------
deHumifierOnly (optional) | Sets the device to only run in Dehumidifer mode | true | false
humifierOnly (optional) | Sets the device to only run in Humidifer mode | true | false 
threshold (optional) | Sets how close to the target humidity the device should try to get | 2 | 5 
humStepSize (optional) | If set, sets the amount the Humidity settings will step up/down by | 10 | 1
noHumidity (optional) | Removes Humidity information from the device. It will be removed when using w1Device or temperatureFilePath | true | false
humidityAdjustment (optional) | An adjustment value to tune the value from the value the broadlink returns | -5 | 0 
humidityFilePath (optional) | path to a local file that Humidity readings can come from | /var/tmp/humidity.txt | null
data>fanOnly (optional) | Hex code used to disable both Humidifer and Dehumifier functions | 0020000... | off code used if not supplied 
mqttURL (optional) | The URL to monitor for MQTT topics (below) | mqtt://localhost | null
mqttTopic (optional) | The mqtt topic for humidity data | "/mi_temp/LivingRoom/humidity" | null

### TemperatureSensor Accessory
Adds a temperature and humidity sensor using the Broadlink device's sensors.
key | description | example | default
--- | ----------- | ------- | -------
noHumidity (optional) | Removes Humidity information from the device. It will be removed when using w1Device or temperatureFilePath | true | false
tempertureAdjustment (optional) | An adjustment value to tune the value from the value the broadlink returns | -5 | 0 
humidityAdjustment (optional) | An adjustment value to tune the value from the value the broadlink returns | -5 | 0 
temperatureFilePath (optional) | path to a local file that Temperature (and other) readings can come from. Needs to be either a single number (used as temperature) or temperature:XX \nhumidity:XX\n battery:XX | /var/tmp/livingroom.txt | null
batteryAlerts (optional) | Sets whether battery levels are monitored (using battery:XX in humidityFilePath). Adds some HAP Characteristics errors on start-up as Battery Level is not native but supported in Eve app. Requires file or MQTT to include 'battery' field | true | false
mqttURL (optional) | The URL to monitor for MQTT topics (below) | mqtt://localhost | null
mqttTopic (optional) | The mqtt topic for temperature data, or an array of objects with an identifier and topic. Identifier can be temperature,humidity, or battery. |  "/mi_temp/LivingRoom/temperature" | null

### HumiditySensor Accessory
Adds a temperature and humidity sensor using the Broadlink device's sensors.
key | description | example | default
--- | ----------- | ------- | -------
humidityAdjustment (optional) | An adjustment value to tune the value from the value the broadlink returns | -5 | 0 
humidityFilePath (optional) | path to a local file that Humidity readings can come from. Needs to be either a single number (used as humidity) or humidity:XX\n battery:XX | /var/tmp/humidity.txt | null
batteryAlerts (optional) | Sets whether battery levels are monitored (using battery:XX in humidityFilePath). Adds some HAP Characteristics errors on start-up as Battery Level is not native but supported in Eve app. Requires file or MQTT to include 'battery' field | true | false
mqttURL (optional) | The URL to monitor for MQTT topics (below) | mqtt://localhost | null
mqttTopic (optional) | The mqtt topic for humidity data, or an array of objects with an identifier and topic. Identifier can be humidity or battery. |  "/mi_temp/LivingRoom/humidity" | null

### TV Accessory

key | description | example | default
--- | ----------- | ------- | -------
enableAutoOff | Turn the TV off automatically when onDuration has been reached. |	true | false
onDuration | The amount of time before the TV automatically turns itself off (used in conjunction with enableAutoOff). | 5 | 60
enableAutoOn | Turn the TV on automatically when offDuration has been reached | false | true
offDuration | The amount of time before the TV automatically turns itself on (used in conjunction with enableAutoOn). | 5 | 60
pingIPAddress | When an IP address is provided, it is pinged every second. If a response is received then the TV turns on, otherwise it turns off. | "192.167.1.77" |
pingIPAddressStateOnly | Using this option will prevent the hex code from being sent when the state changes | true | false
pingFrequency | The frequency in seconds that the IP address should be pinged | 5 | 1
pingGrace (optional) | Pauses ping status changes for the specified period (seconds) to allow device to start-up/shutdown after the change | 15 | 10
data | see below
subType (Optional) | Updates the icon in Home to either TV, STB, Stick, or Receiver | stb | tv

#### "data" key-value object

key | description
--- | -----------
on | A hex code string to be sent when the tv is powered on.
off | A hex code string to be sent when the tv is powered off.
volume | see below
inputs | see below
remote | see below

#### "volume" key-value object
Configuration for volume changes via the Control Centre remote

key | description
--- | -----------
up | A hex code string to be sent to turn the TV volume up.
down | A hex code string to be sent to turn the TV volume down.

#### "inputs" key-value object
Inputs contain an array of the below settings, one for each input

key | description
--- | -----------
name | The name used for the mode, shown in the GUI.
type | One of the follow to represent the mode: 'other','home_screen','tuner','hdmi','composite_video','s_video','component_video','dvi','airplay','usb','application'
data | A hex code string to be sent to switch the TV to the selected input.

#### "remote" key-value object
Configuration of button options in the Control Centre remote

key | description
--- | -----------
rewind | The hex code for this button function
fastForward | The hex code for this button function
nextTrack | The hex code for this button function
previousTrack | The hex code for this button function
arrowUp | The hex code for this button function
arrowDown | The hex code for this button function
arrowLeft | The hex code for this button function
arrowRight | The hex code for this button function
select | The hex code for this button function
back | The hex code for this button function
exit | The hex code for this button function
playPause | The hex code for this button function
info | The hex code for this button function

### Heater Cooler Accessory
Implementation of heater cooler accessory specification as per Apple HAP. Heater cooler allows for better representation of standalone heaters and air-conditioners that support functions like 
oscillation and fan speed.

In addition to the fan speed and oscillation features, this accessory also supports temperature in both degree Celsius and Fahrenheit.

<img src="https://j.gifs.com/vlVRR0.gif" alt="Home app heater cooler UI in action" width="150"/>

For more details on how to configure a heater-cooler accessory please review the documentation [here](https://github.com/kiwi-cam/homebridge-broadlink-rm/blob/master/docs/heater-cooler.md) and review [config-sample.json](https://github.com/kiwi-cam/homebridge-broadlink-rm/blob/master/config-sample.json) for sample configurations.

## Thanks
Original: Thanks to @tattn (https://github.com/tattn/homebridge-rm-mini3), @PJCzx (https://github.com/PJCzx/homebridge-thermostat), @momodalo (https://github.com/momodalo/broadlinkjs), and @lprhodes (https://github.com/lprhodes/homebridge-broadlink-rm) whose time and effort got this started.

In this fork: Thanks to @kiwi-cam (https://github.com/kiwi-cam), @Cloudore (https://github.com/Cloudore) and @Faisalthe01 (https://github.com/Faisalthe01) for your work!
