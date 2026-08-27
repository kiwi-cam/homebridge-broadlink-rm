const { HomebridgePluginUiServer, RequestError } = require('@homebridge/plugin-ui-utils');
const BroadlinkJS = require('kiwicam-broadlinkjs-rm');

const DEFAULT_SCAN_SECONDS = 12;
const MAX_SCAN_SECONDS = 60;

// A session holds authenticated devices open between requests so that learning
// does not have to re-discover. It is torn down once nothing has used it for a
// while, and again when the UI process exits.
const SESSION_IDLE_MS = 10 * 60 * 1000;

const IR_TIMEOUT_MS = 30 * 1000;
const RF_TIMEOUT_MS = 60 * 1000;
const CONTINUOUS_IDLE_MS = 180 * 1000;
const POLL_MS = 1000;

// RM Pro and RM3 Pro Plus finish the RF sweep by entering ordinary learning
// mode; every other model has a second frequency step first.
const RF_SINGLE_STEP_TYPES = [0x279d, 0x27a9];

const macToString = (mac) => {
  const hex = Buffer.isBuffer(mac) ? mac.toString('hex') : String(mac);
  return (hex.match(/[\s\S]{1,2}/g) || []).join(':').toLowerCase();
};

const macToKey = (mac) => String(mac || '').toLowerCase().replace(/[^0-9a-f]/g, '');

class UiServer extends HomebridgePluginUiServer {
  constructor() {
    super();

    this.session = null;
    this.sessionTimer = null;
    this.learning = null;

    this.onRequest('/discover', this.discover.bind(this));
    this.onRequest('/learn/start', this.learnStart.bind(this));
    this.onRequest('/learn/stop', this.learnStopRequest.bind(this));
    this.onRequest('/send', this.send.bind(this));

    this.ready();
  }

  // ---------------------------------------------------------------- session

  touchSession() {
    if (this.sessionTimer) { clearTimeout(this.sessionTimer); }

    this.sessionTimer = setTimeout(() => {
      this.learnStop('stopped');
      this.closeSession();
    }, SESSION_IDLE_MS);
  }

  closeSession() {
    if (!this.session) { return; }

    const broadlink = this.session.broadlink;
    this.session = null;

    (broadlink.sockets || []).forEach((socket) => {
      try {
        socket.close();
      } catch (err) {
        // Already closed.
      }
    });

    Object.keys(broadlink.devices || {}).forEach((key) => {
      const device = broadlink.devices[key];
      if (device && typeof device === 'object' && device.socket) {
        try {
          device.socket.close();
        } catch (err) {
          // Already closed.
        }
      }
    });
  }

  /**
   * Broadcast a Broadlink discovery packet and report everything that answers.
   *
   * The reply carries the device's MAC, its current address, its type and
   * whether it has been locked to the Broadlink cloud, so a device that is
   * present but unusable can be told apart from one that is simply missing.
   */
  discover(payload) {
    const requested = payload && payload.seconds ? Number(payload.seconds) : DEFAULT_SCAN_SECONDS;
    const seconds = Math.min(Math.max(requested || DEFAULT_SCAN_SECONDS, 3), MAX_SCAN_SECONDS);

    this.learnStop('stopped');
    this.closeSession();

    return new Promise((resolve, reject) => {
      let broadlink;

      try {
        broadlink = new BroadlinkJS();
      } catch (err) {
        reject(new RequestError('Could not start the Broadlink discovery service.', { message: err.message }));
        return;
      }

      // The library logs directly; keep the UI server quiet.
      broadlink.log = () => {};
      broadlink.debug = false;

      const found = new Map();
      const session = { broadlink, found };
      this.session = session;

      const originalOnMessage = broadlink.onMessage.bind(broadlink);

      const macOf = (message) => {
        const mac = Buffer.alloc(6, 0);
        for (let i = 0; i < 6; i += 1) {
          message.copy(mac, i, 0x3f - i);
        }
        return mac;
      };

      // discover() binds this.onMessage when it opens its sockets, so replacing
      // it here means every reply is seen before the library decides whether to
      // create a device for it.
      broadlink.onMessage = (message, host) => {
        let key = null;

        try {
          const mac = macOf(message);
          key = mac.toString('hex');

          const deviceType = message[0x34] | (message[0x35] << 8);
          const existing = found.get(key) || {};

          found.set(key, Object.assign(existing, {
            mac: macToString(mac),
            address: host.address,
            port: host.port,
            deviceType: '0x' + deviceType.toString(16),
            locked: Boolean(message[0x7f]),
            linkLocal: typeof host.address === 'string' && host.address.indexOf('169.254.') === 0,
            authenticated: existing.authenticated === true
          }));
        } catch (err) {
          // A malformed reply should not stop the scan.
        }

        originalOnMessage(message, host);

        // The library has now had a chance to build a device for this reply, so
        // the model name and RF capability can be read back off it.
        try {
          const device = key ? broadlink.devices[key] : null;
          const record = key ? found.get(key) : null;

          if (record && device && typeof device === 'object') {
            record.model = device.model;
            record.supportsRF = typeof device.enterRFSweep === 'function';
            record.supportsLearning = typeof device.enterLearning === 'function';
          } else if (record && !record.model) {
            record.model = null;
            record.supportsRF = false;
            record.supportsLearning = false;
          }
        } catch (err) {
          // Ignore - the scan result is still useful without the model name.
        }
      };

      broadlink.on('deviceReady', (device) => {
        const record = found.get(Buffer.isBuffer(device.mac) ? device.mac.toString('hex') : String(device.mac));
        if (record) {
          record.authenticated = true;
          record.address = device.host.address;
        }
      });

      const interval = setInterval(() => {
        try {
          broadlink.discover();
        } catch (err) {
          // Interface came and went mid-scan; the next tick will retry.
        }
      }, 2000);

      try {
        broadlink.discover();
      } catch (err) {
        clearInterval(interval);
        reject(new RequestError('Could not send the discovery broadcast.', { message: err.message }));
        return;
      }

      setTimeout(() => {
        clearInterval(interval);

        // The discovery sockets have done their job; the per-device sockets
        // stay open so a learn request does not have to scan again.
        (broadlink.sockets || []).forEach((socket) => {
          try {
            socket.close();
          } catch (err) {
            // Already closed.
          }
        });
        broadlink.sockets = [];

        this.touchSession();

        const devices = Array.from(found.values()).sort((a, b) => a.mac.localeCompare(b.mac));

        resolve({ devices, scannedFor: seconds });
      }, seconds * 1000);
    });
  }

  // Find an authenticated device, scanning once if this is the first request.
  deviceFor(mac) {
    const key = macToKey(mac);

    if (!key) {
      return Promise.reject(new RequestError('No Broadlink device was chosen for this accessory.', { status: 400 }));
    }

    const fromSession = () => {
      const device = this.session ? this.session.broadlink.devices[key] : null;
      return device && typeof device === 'object' ? device : null;
    };

    const existing = fromSession();
    if (existing) {
      this.touchSession();
      return Promise.resolve(existing);
    }

    return this.discover({ seconds: 8 }).then(() => {
      const device = fromSession();

      if (!device) {
        throw new RequestError('That Broadlink device did not answer. Check that it is powered on and on the same network.', { status: 404 });
      }

      return device;
    });
  }

  // ----------------------------------------------------------------- learn

  status(state, message) {
    this.pushEvent('learn-status', { state, message });
  }

  learnStop(state, message) {
    const learning = this.learning;
    if (!learning) { return; }

    this.learning = null;
    learning.stopped = true;

    learning.timers.forEach((timer) => clearTimeout(timer));
    learning.intervals.forEach((interval) => clearInterval(interval));

    Object.keys(learning.listeners).forEach((event) => {
      try {
        learning.device.removeListener(event, learning.listeners[event]);
      } catch (err) {
        // The device may already be gone.
      }
    });

    try {
      learning.device.cancelLearn();
    } catch (err) {
      // Nothing to cancel.
    }

    if (state) { this.status(state, message); }
  }

  learnStopRequest() {
    this.learnStop('stopped', 'Learning stopped.');
    return { state: 'stopped' };
  }

  learnStart(payload) {
    const mode = payload && payload.mode === 'rf' ? 'rf' : 'ir';
    const continuous = Boolean(payload && payload.continuous);

    return this.deviceFor(payload && payload.mac).then((device) => {
      this.learnStop();

      if (typeof device.enterLearning !== 'function') {
        throw new RequestError('This Broadlink model cannot learn codes.', { status: 400 });
      }

      if (mode === 'rf' && typeof device.enterRFSweep !== 'function') {
        throw new RequestError('This Broadlink model cannot learn RF codes. An RM Pro or RM4 Pro is needed.', { status: 400 });
      }

      const learning = {
        device,
        mode,
        continuous,
        stopped: false,
        timers: [],
        intervals: [],
        listeners: {}
      };

      this.learning = learning;

      const listen = (event, handler) => {
        learning.listeners[event] = handler;
        device.on(event, handler);
      };

      const poll = (fn) => {
        const interval = setInterval(() => {
          if (learning.stopped) { return; }
          try {
            fn();
          } catch (err) {
            // A dropped packet is retried on the next tick.
          }
        }, POLL_MS);
        learning.intervals.push(interval);
        return interval;
      };

      const expire = (ms, state, message) => {
        const timer = setTimeout(() => this.learnStop(state, message), ms);
        learning.timers.push(timer);
        return timer;
      };

      const captured = (message) => {
        if (learning.stopped) { return; }

        this.pushEvent('learn-code', { hex: message.toString('hex'), mode });

        if (!continuous) {
          this.learnStop();
          this.status('captured', 'Code received.');
          return;
        }

        // Keep the session open for the next button. The device has to be put
        // back into learning mode after every capture.
        learning.timers.forEach((timer) => clearTimeout(timer));
        learning.timers = [];

        try {
          device.cancelLearn();
        } catch (err) {
          // Nothing to cancel.
        }

        const resume = setTimeout(() => {
          if (learning.stopped) { return; }
          try {
            device.enterLearning();
          } catch (err) {
            // The next poll will surface the failure as a timeout.
          }
          this.status('waiting', 'Ready for the next button.');
        }, 500);

        learning.timers.push(resume);
        expire(CONTINUOUS_IDLE_MS, 'timeout', 'Stopped after three minutes without a button press.');
      };

      if (mode === 'ir') {
        listen('rawData', captured);
        device.enterLearning();
        poll(() => device.checkData());
        expire(continuous ? CONTINUOUS_IDLE_MS : IR_TIMEOUT_MS, 'timeout', 'No code was received.');

        this.status('waiting', 'Point the remote at the Broadlink device and press the button.');

        return { state: 'waiting', mode, continuous };
      }

      // RF is a sweep: find the frequency, confirm it, then read the code.
      let frequencyPoll = null;

      listen('rawRFData', () => {
        if (learning.stopped) { return; }

        if (frequencyPoll) { clearInterval(frequencyPoll); }

        if (RF_SINGLE_STEP_TYPES.indexOf(device.type) !== -1) {
          device.enterLearning();
          this.status('rf-press', 'Frequency found. Press the button again, in short bursts.');
          poll(() => device.checkData());
          return;
        }

        this.status('rf-holding', 'Frequency found. Keep holding the button.');
        poll(() => device.checkRFData2());
      });

      listen('rawRFData2', () => {
        if (learning.stopped) { return; }
        this.status('rf-press', 'Now press the button several times, pausing between presses.');
        poll(() => device.checkData());
      });

      listen('rawData', captured);

      device.enterRFSweep();
      frequencyPoll = poll(() => device.checkRFData());
      expire(RF_TIMEOUT_MS, 'timeout', 'No RF code was received.');

      this.status('rf-sweep', 'Hold down the button on the remote until the frequency is found.');

      return { state: 'rf-sweep', mode, continuous };
    });
  }

  // Send a code back out, so a mapped button can be checked without leaving
  // the settings page.
  send(payload) {
    const hex = payload && payload.hex;

    if (typeof hex !== 'string' || !/^[0-9a-fA-F]+$/.test(hex) || hex.length < 8) {
      return Promise.reject(new RequestError('That does not look like a hex code.', { status: 400 }));
    }

    return this.deviceFor(payload && payload.mac).then((device) => {
      return device.sendData(Buffer.from(hex, 'hex')).then(() => ({ sent: true }));
    });
  }
}

new UiServer();
