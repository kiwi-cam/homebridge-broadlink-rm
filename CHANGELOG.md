# Changes

## 4.3.9-BETA
 - [Improvement] Updated all dependencies to remove some security vulnerabilities 
 - [Improvement] Added Low Battery Alerts to Humidity and Temperature sensors (using battery:XX in readings from files)
 - [Improvement] Extended Temperature and Humidity readings from files to support temperature:XX, humidity:XX, and battery:XX values on each line
 - [Improvement] Removed file and w1 Temperature readings being forced to 10 minutes. Now 1 minute minimum and adjustable
 - [Improvement] Added MQTT support to AC and Temperature sensor using temperature,humidity, and battery identifiers
 - [Improvement] Added HeaterCooler accessory option. Refer to [this document](https://github.com/kiwi-cam/homebridge-broadlink-rm/blob/kiwi-cam-beta-1/docs/heater-cooler.md) to read @newt10's work here.
 - [Improvement] Integrated the platform helper module to improve maintainability.
 - [Improvement] MQTT will update when published so frequent refreshes aren't required ( 10 minute default as a fallback )
 - [Bug] Fixed duplicate monitorTemperature calls from Temperature Sensor accessories
 - [Bug] Fixed SIGTERM when unexpected packet received

## 4.3.8
- [Improvement] Added Keep Alive packet to RM Devices to avoid reboots when the cloud is unreachable.
- [Improvement] **Added RF Learning** steps from #45
- [Bug] Fixes "No Response" from Dehumidifers when noHumidity and accessory Off
- [Bug] Fixes "log is not a function" error when using Pronto codes

## 4.3.7
- [Bug] Fixes missing FanSpeed/Direction features in Fanv1

## 4.3.6
- [Improvement] Improves HumidifierDehumidifier accessory to update state by using Humidity data from the Broadlink device 
- [Improvement] Adds humidityFilePath support to the HumidifierDehumidifier accessory to update the current humidity from a local file
- [Improvement] Adds autoOn/autoOff support to the Fan and HumidifierDehumidifier accessory (Note the Bug detail below)
- [Improvement] Updated humiditySensor and temperatureSensor accessories to extend HumidifierDehumidifier and AirCon accessories (respectively) so both gain MQTT and file values too.
- [Bug] Updated the switch accessory to use On/Active status depending on device type. Many accessories inherit from this and it broke their AutoOff functions.
- [Bug] Fixed AutoOn/AutoOff functions for Fan and HumidifierDehumidifier. This was an issue with the different characteristics between the HomeKit Fan and Fanv2 Services. In order to tidy this up users wanting to have the classic style Fan (with more icon options) will need to update type to "fanv1" i.e. `"type": "fanv1"`

## 4.3.5
- [Bug] Fixes bug in Fan accessory that removed Rotation Direction and/or Swing options

## 4.3.4
- [Improvement] Improves HumidifierDehumidifier accessory by using Humidity data from the Broadlink device (See README.md for notes.) 
- [Improvement] Uses Service.Fan instead of Service.Fanv2 to allow Fan icons if not using SwingMode (Thanks @apexad)
- [Improvement] Adds fan improvements with defaultFanSpeed and stepSize (Thanks @newt10)
- [Bug] Fixes Air Purifier so it no longer appears as a fan
- [Bug] Removes limits on air-conditioner Current Temperature so it isn't constrained to the same limits as the Target Temperature.
- [Bug] Fixed the identification of manual devices. New Manual deviceTypes added which are selected based on isRFSupported and isRM4. isRM4 will be required on newer devices to make sure messages include the correct headers.
- [Bug] Fixes an error in the aircon accessory where HEX codes for temperatureXX would falsely report as missing

## 4.3.3
- [Bug] Fixes error in heombridge-platform-helper "ReferenceError: log is not defined"
- [Improvement] Adds Humidity information to the Aircon accessory
- [Improvement] Adds TemperatureSensor accessory to give temperature and humidity information from Broadlink sensors
- [Improvement] Adds HumiditySensor accessory to give humidity information from Broadlink sensors
- [Improvement] Adds AirPurifier and HumidifierDehumidifier accessory from the original fork

## 4.3.2
- [Improvement] Updated documentation around TV changes

## 4.3.1
- [Bug] Fixes issue in heatOnly mode for Aircon accessories
- [Improvement] Adds coolOnly mode for Aircon accessories
- [Improvement] Fixes TV Display issue in iOS14. *All TVs are now seperate accessories. Previously the first TV connected via Homebridge as a bridge. This means that after updating, that first TV will need to be removed and re-added to HomeKit.*
- [Improvement] Adds TV subType to display STB, Receiver, or Stick types 
- [Bug] Fixes MAC address order error. *If you specify a HOST in your config.json by MAC address, you'll likely need to correct this value after you update.*

## 4.3.0
- [Improvement] Adds HeatOnly mode for Aircon accessories
- [Improvement] Adds support for RM4 Temperature sensors
- [Improvement] Improves support for RM4 RF devices (e.g. RM4 Pro)

## 4.2.9
- [Model] Added `Broadlink RM Mini 4 C` 610f support
- [Improvement] Added notes about IHC setup/reset process 

## 4.2.8
- [Model] Added `Broadlink RM4 4 Pro` 649b support

## 4.2.7
- [Improvement] Adds IR Learn support for RM4 devices
- [Improvement] Adds additional Debug information
- [Model] Added `Broadlink RM4 Mini 4 KR` support

## 4.2.6

- [Bug] Fix for RM4 SendCode issues
- [Improvement] Adds command acknowledgement messages

## 4.2.5

- [Bug] Updated to use new kiwicam-broadlinkjs-rm version with RM4 bug fixes (Learn Mode)
- [Model] Added `Broadlink RM Mini 4 S` support

## 4.2.3

- [Bug] Update to use new fork kiwicam-broadlinkjs-rm with RM4 support

## 4.2.0

- Inital version - forked from AlexanderBabel/homebridge-broadlink-rm-tv
- [Bug] Added device support from def-broadlinkjs-rm
