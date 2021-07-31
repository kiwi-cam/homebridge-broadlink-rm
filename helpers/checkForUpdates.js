const versionCheck = require('github-version-checker');
const pkg = require('../package.json'); 

const options = {
  repo: 'homebridge-broadlink-rm', 
  owner: 'kiwi-cam',
  currentVersion: pkg.version
};


const checkForUpdates = () => {
  versionCheck (options, (error, update) => { 
    // if (error) throw error;
    if (update) { 
      console.log(`\x1b[32m[UPDATE AVAILABLE] \x1b[0mVersion ${update.tag_name} of homebridge-broadlink-rm-tv is available. The release notes can be found here: \x1b[4mhttps://github.com/lprhodes/homebridge-broadlink-rm/releases/\x1b[0m`);
    }
  });
}

module.exports = checkForUpdates;
