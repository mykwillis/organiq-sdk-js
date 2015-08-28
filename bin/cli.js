#!/usr/bin/env node
// Copyright (c) 2014 Myk Willis & Company, LLC. All Rights Reserved.

var argv = require('minimist')(process.argv.slice(2));
var fs = require('fs');
var rest = require('restler');
var prompt = require('prompt');
var debug = require('debug')('organiq:cli');

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

function getApiRoot(protocol) {
  var apiRoot = argv['apiRoot'] || argv['a'];
  if (!apiRoot) { apiRoot = readPackageData()['apiRoot']; }
  if (!apiRoot) { apiRoot = process.env.ORGANIQ_APIROOT; }
  if (!apiRoot) { apiRoot = 'ws://api.organiq.io'; }
  if (protocol) {
    if (['http', 'https', 'ws', 'wss'].indexOf(protocol) < 0) {
      throw Error('Invalid protocol specified: ' + protocol);
    }
    apiRoot = apiRoot.replace(/^ws/, protocol);
  }
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
  case 'register':
    var schema = {
      properties: {
        givenName: {
          message: 'First (given) name',
          required: true,
          validator: /^[a-zA-Z\s\-]+$/,
          warning: 'Name should contain only letters, spaces, or dashes'
        },
        surname: {
          message: 'Last (family) name',
          required: true,
          validator: /^[a-zA-Z\s\-]+$/,
          warning: 'Name should contain only letters, spaces, or dashes'
        },
        email: {
          message: '     Email address',
          required: true,
          validator: /^.+@.+\..+$/,
          warning: 'Please enter a valid email address (you@example.com)'
        },
        password: {
          message: ' Choose a password',
          hidden: true
        },
        password2: {
          message: ' Re-enter password',
          hidden: true
        }
      }
    };

    prompt.message  = "organiq".white.bold;
    prompt.override = argv;

    if (argv['name']) {
      var names = argv['name'].split(' ');
      console.log('name is ' + names[0] + ' ' + names[1]);
      prompt.override['givenName'] = names[0];
      if (names.length > 1) {
        prompt.override['surname'] = names[1];
      }
    }


    prompt.get(schema, function(err, result) {
      if (result.password !== result.password2) {
        console.log('Passwords do not match!');
        return -1;
      }

      var data = {
        email: result.email,
        password: result.password,
        surname: result.surname,
        given_name: result.givenName,
        profile: {
          namespace: 'com.example'
        }
      };

      console.log('Creating user account for ' + result.email + '...');
      debug('apiroot: ' + getApiRoot('http'));
      rest.postJson(getApiRoot('http') + '/users/', data).on('complete',
        function(data, response) {
          if (data instanceof Error) {
            console.log('Failed to connect to server at: ' + getApiRoot('http'));
            return -3;
          }
          if (response.statusCode !== 201) {
            console.log('Account registration failed.'.red);
            if (response.statusCode === 400) {
              if (typeof data['email'] !== 'undefined') {
                if (/This field must be unique/.test(data.email[0])) {
                  console.log('An account with the supplied email already exists.');
                  return -2;
                }
              }
            }
            console.log(response.statusCode + ': ' + JSON.stringify(data));
            return -1;
          }
          console.log('Account was successfully created.');
          console.log('Click the link in the email we sent to activate your account.');
          //console.log('data: ' + JSON.stringify(data));

        });
    });
    break;
  case 'generate-api-key':
    var schema2 = {
      properties: {
        email: {
          message: '     Email address',
          required: true,
          validator: /^.+@.+\..+$/,
          warning: 'Please enter a valid email address (you@example.com)'
        },
        password: {
          message: ' Enter password',
          hidden: true
        },
        keyName: {
          message: ' Enter a friendly name for the key (optional)',
          required: false
        }
      }
    };

    prompt.message  = "organiq".white.bold;
    prompt.override = argv;

    prompt.get(schema2, function(err, result) {
      var data = {
        name: result.keyName
      };

      var options = {
        username: result.email,
        password: result.password
      };

      console.log('Requesting API key for ' + result.email + '...');
      rest.postJson(getApiRoot('http') + '/apikeys/', data, options).on('complete',
        function(data, response) {
          if (response.statusCode !== 201) {
            console.log('API Key request failed.'.red);
            console.log(response.statusCode + ': ' + JSON.stringify(data));
            return -1;
          }
          console.log('API Key successfully created.');
          console.log('      API Key Id: ' + data.id);
          console.log('  API Key Secret: ' + data.secret);
          //console.log('data: ' + JSON.stringify(data));
        });
    });
    break;

  default:
    console.log("Unrecognized command '%s'", command);
}
