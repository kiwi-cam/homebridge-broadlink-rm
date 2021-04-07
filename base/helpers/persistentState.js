const path = require('path');
const nodePersist = require('node-persist');

const init = ({ homebridgeDirectory, homebridge }) => {
  if (!homebridgeDirectory) {
    homebridgeDirectory = homebridge.user.storagePath()
  }

  nodePersist.initSync({ dir: `${homebridgeDirectory}/plugin-persist/homebridge-broadlink-rm`, forgiveParseErrors: true });
}

const clear = ({ host, name }) => {
  if (!host) host = 'default';

  return nodePersist.removeItemSync(`${host}-${name}`);
}

const load = ({ host, name }) => {
  if (!host) host = 'default';

  return nodePersist.getItemSync(`${host}-${name}`);
}

const save = ({ host, name, state }) => {
  if (!host) host = 'default';

  return nodePersist.setItemSync(`${host}-${name}`, state);
}

module.exports = {
  init,
  clear,
  load,
  save
};
