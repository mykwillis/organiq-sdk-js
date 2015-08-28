#!/usr/bin/env node
// Copyright (c) 2014 Myk Willis & Company, LLC. All Rights Reserved.

var argv = require('minimist')(process.argv.slice(2));
var fs = require('fs');
var rest = require('restler');
var prompt = require('prompt');
var debug = require('debug')('organiq:cli');
var osenv = require('osenv');

var VERSION = require('../package.json').version;

// The default apiRoot is 'ws://api.organiq.io'. We look for an override
// in the following places:
//    `--apiRoot` command line option
//    `apiRoot` property of organiq.json in current directory
//    `apiRoot` property of organiq.json in home directory
//    process.env.ORGANIQ_APIROOT
var optionsPath = './organiq.json';

var _packageData = null;

function writePackageData(apiRoot, apiKeyId, apiKeySecret) {
  var packageData = {
    'apiRoot': apiRoot,
    'namespace': defaultNamespace
  };
  if (apiKeyId) {
    packageData['apiKeyId'] = apiKeyId;
  }
  if (apiKeySecret) {
    packageData['apiKeySecret'] = apiKeySecret;
  }
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

function getApiKeyId() {
  var apiKeyId = argv['apiKeyId'] || argv['id'];
  if (!apiKeyId) { apiKeyId = readPackageData()['apiKeyId']; }
  if (!apiKeyId) { apiKeyId = process.env.ORGANIQ_APIKEY_ID; }
  if (!apiKeyId) { apiKeyId = ''; }
  return apiKeyId;
}

function getApiKeySecret() {
  var apiKeySecret = argv['apiKeySecret'] || argv['secret'];
  if (!apiKeySecret) { apiKeySecret = readPackageData()['apiKeySecret']; }
  if (!apiKeySecret) { apiKeySecret = process.env.ORGANIQ_APIKEY_SECRET; }
  if (!apiKeySecret) { apiKeySecret = ''; }
  return apiKeySecret;
}

var apiRoot = getApiRoot();
var apiKeyId = getApiKeyId();
var apiKeySecret = getApiKeySecret();
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
  console.log("");
  console.log("APIROOT:       '" + apiRoot + "'");
  console.log("APIKEY_ID:     " + (apiKeyId ? "'" + apiKeyId + "'" : "not set"));
  console.log("APIKEY_SECRET: " + (apiKeySecret ? "[redacted]" : "not set"));
  console.log("");
  console.log("You can override APIXXX values with --apiXxx argument, 'apiXxx' in organiq.json,");
  console.log(" or ORGANIQ_APIXXX environment variable.");
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

    var generateNewAccessKey = argv['generate-api-key'];
    if (generateNewAccessKey) {
      if (apiKeyId && apiKeySecret) {
        argv['email'] = apiKeyId;
        argv['password'] = apiKeySecret;
      }

      _generateApiKey(function (err, result) {
        if (err) {
          console.log('Failed to generate API key.');
          console.log(err);
          process.exit(1);
        }
        writePackageData(apiRoot, result.id, result.secret);
        process.exit(1);
      });
    }

    // case where no new key is to be generated.
    writePackageData(apiRoot, apiKeyId, apiKeySecret);
    break;
  case 'server':
    console.log('The Organiq Gateway Server no longer ships with the SDK. ');
    console.log('Use `npm install -g organiq-gateway` to install.');
    break;
  case 'register':
    _registerAccount(function(err, result) {
      if (err) { console.log('Failed to register account.'.red); console.log(err); return -1; }
      console.log('');
      console.log('Welcome, ' + result.given_name + '!');
      console.log('Check your email to activate your account.');
    });
    break;
  case 'generate-api-key':
    _generateApiKey(function(err, result) {
      if (err) { console.log('Failed to get API Key.'.red); console.log(err); return -1; }
      console.log('      API Key Id: ' + result.id);
      console.log('  API Key Secret: ' + result.secret);
    });
    break;
  case 'get-account-info':
    _getAccountInfo(function(err, result) {
      if (err) {
        console.log('Failed to get account information.'.red);
        console.log(err);
        return -1;
      }
      console.log(result);
    });
    break;


  default:
    console.log("Unrecognized command '%s'", command);
}


function _registerAccount(callback) {
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
      return callback(Error('Passwords do not match!'));
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

    rest.postJson(getApiRoot('http') + '/users/', data).on('complete',
      function(data, response) {
        if (data instanceof Error) {
          return callback(data);
        }
        if (response.statusCode !== 201) {
          if (response.statusCode === 400) {
            if (typeof data['email'] !== 'undefined') {
              if (/This field must be unique/.test(data.email[0])) {
                return callback(Error('An account with the supplied email already exists.'));
              }
            }
          }
          return callback(Error(response.statusCode + ': ' + JSON.stringify(data)));
        }
        return callback(null, data);
      });
  });

}

function _generateApiKey(callback)  {
  var schema = {
    properties: {
      email: {
        message: '     Email address',
        required: true,
        validator: /^.+@.+\..+$/,
        warning: 'Please enter a valid email address (you@example.com)'
      },
      password: {
        message: '    Enter password',
        hidden: true
      }
    }
  };

  prompt.message  = "organiq".white.bold;
  prompt.override = argv;

  prompt.get(schema, function(err, result) {
    var data = {
      name: argv['keyName'] || ''
    };

    var options = {
      username: result.email,
      password: result.password
    };

    rest.postJson(getApiRoot('http') + '/apikeys/', data, options).on('complete',
      function(data, response) {
        if (data instanceof Error) {
          return callback(data);
        }
        if (response.statusCode !== 201) {
          callback(Error(response.statusCode + ': ' + JSON.stringify(data)));
        }
        callback(null, data);
      });
  });
}

function _getAccountInfo(callback)  {
  var schema = {
    properties: {
      email: {
        message: '     Email address',
        required: true,
        validator: /^.+@.+\..+$/,
        warning: 'Please enter a valid email address (you@example.com)'
      },
      password: {
        message: '    Enter password',
        hidden: true
      }
    }
  };

  prompt.message  = "organiq".white.bold;
  prompt.override = argv;

  if (apiKeyId && apiKeySecret) {
    argv['email'] = apiKeyId;
    argv['password'] = apiKeySecret;
    delete schema.properties.email.validator;
  }
  prompt.get(schema, function(err, result) {
    var options = {
      username: result.email,
      password: result.password
    };

    rest.get(getApiRoot('http') + '/current_user/', options).on('complete',
      function(data, response) {
        if (data instanceof Error) {
          return callback(data);
        }
        if (response.statusCode !== 200) {
          callback(Error(response.statusCode + ': ' + JSON.stringify(data)));
        }
        callback(null, data);
      });
  });
}
