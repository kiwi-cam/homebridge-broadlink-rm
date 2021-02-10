# Homebridge Broadlink RM Pro (fork)

## Introduction
Welcome to the Broadlink RM Mini and Broadlink RM Pro plugin for [Homebridge](https://github.com/nfarina/homebridge).

This plugin allows you to control your RM Mini and RM Pro with HomeKit using the Home app and Siri.

This fork adds support for fakegato temperature and humidity history in the Eve App.

## Like this plugin?

If you like this plugin and want to show your support then please star the Github repo, or better yet; buy me a drink using [Paypal](https://paypal.me/kiwicamRM).

Thank you!

## Documentation

**Documentation can be found [here](https://broadlink.kiwicam.nz).** If you have any trouble after reading through the information please raise an issue and we'll help out as best we can.

If the plugin is unable to discover your device, it's likely you've locked the device with the cloud so it no longer accepts local connections. In this case, follow these steps:
1. Open the [Broadlink app](https://apps.apple.com/us/app/broadlink/id1450257910)
2. From the Home screen, tap on your Broadlink device
3. Tap the ... in the top right
4. Scroll down and toggle "Lock device" to Off
5. Tap OK when prompted "Confirm to unlock the device"

<img src="https://i.imgur.com/DMTUbDo.png" width="40%" height="40%">

This plugin should now be able to discover your device.

## Thanks
Original: Thanks to @tattn (https://github.com/tattn/homebridge-rm-mini3), @PJCzx (https://github.com/PJCzx/homebridge-thermostat), @momodalo (https://github.com/momodalo/broadlinkjs), and @lprhodes (https://github.com/lprhodes/homebridge-broadlink-rm) whose time and effort got this started.

Forked from: Thanks to @kiwi-cam (https://github.com/kiwi-cam).
