#!/usr/bin/env node
// Copyright (c) 2014 Myk Willis & Company, LLC. All Rights Reserved.

var argv = require('minimist')(process.argv.slice(2));
var fs = require('fs');

var VERSION = require('../package.json').version;

// The default apiRoot is 'ws://api.organiq.io'. We look for an override
// in the following places:
//    `--apiRoot` command line option
//    `apiRoot` property of organiq.json in current directory
//    process.env.ORGANIQ_APIROOT
var optionsPath = './organiq.json';

var _packageData = null;
function writePackageData(apiRoot) {
  var packageData = {
    'apiRoot': apiRoot,
    'namespace': defaultNamespace
  };
  var s = JSON.stringify(packageData, null, 4);
  fs.writeFileSync(optionsPath, s);
  _packageData = null;
}
function readPackageData() {
  if (!_packageData && fs.existsSync(optionsPath)) {
    var s = fs.readFileSync(optionsPath, 'utf8');
    _packageData = JSON.parse(s);
  }
  return _packageData || {};
}

function getApiRoot() {
  var apiRoot = argv['apiRoot'] || argv['a'];
  if (!apiRoot) { apiRoot = readPackageData()['apiRoot']; }
  if (!apiRoot) { apiRoot = process.env.ORGANIQ_APIROOT; }
  if (!apiRoot) { apiRoot = 'ws://api.organiq.io'; }
  return apiRoot;
}

var apiRoot = getApiRoot();
var defaultNamespace = '.';

function _getLocalExternalIPAddress() {
    var os = require('os');
    var ifaces = os.networkInterfaces();
    var ip = null;
    function _g(details) {
        if ((details.family === 'IPv4') && (!details.internal)) {
          ip = details.address;
          return false;
        }
        return true;
    }
    for (var dev in ifaces) {
      if (!ifaces.hasOwnProperty(dev)) { continue; }
      ifaces[dev].every(_g);
    }
    return ip;
}

if ( argv._.length < 1 ) {
  console.log("organiq v"+VERSION+" - Command Line Interface to Organiq");
  console.log("usage: organiq <command> [args]");
  console.log("");
  console.log("Where <command> is one of:");
  console.log("  init - create organiq.json file.");
  console.log("  server - configure local test server. See `iq server help`");
  console.log("API Root is currently: '" + apiRoot + "'");
  console.log("(Override with --apiRoot argument, 'apiRoot' in organiq.json,");
  console.log(" or ORGANIQ_APIROOT environment variable.");
  process.exit(1);
}


var command = argv._[0];
switch( command ) {
  case 'init':
    var useLocalDevServer = argv['local-dev'];
    if (useLocalDevServer) {
      // find an external IPv4 address for the local host
      var ip = _getLocalExternalIPAddress();
      if (ip) {
        apiRoot = 'ws://' + ip + ':1340';
        console.log('Initialized organiq.json with API root: ' + apiRoot);
      } else {
        console.error('Unable to determine external IP address. Use --api-root to specify it explicitly.');
        process.exit(1);
      }
    }
    writePackageData(apiRoot);
    break;
  case 'server':
    console.log('The Organiq Gateway Server no longer ships with the SDK. ');
    console.log('Use `npm install -g organiq-gateway` to install.');
    break;
  default:
    console.log("Unrecognized command '%s'", command);
}
