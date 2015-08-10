/**
 * Organiq Application and Device SDK.
 *
 * Provides interfaces for obtaining proxies for remote Organiq objects, and
 * implements a local device container for hosting devices.
 *
 */
var DeviceContainer = require('./deviceContainer');
var ClientContainer = require('./clientContainer');
var DriverContainer = require('./driverContainer');
var WebSocket = require('./websocket');
var WebSocketTransport = require('./webSocketTransport');
//var when = require('when');
var fs = require('fs');
require('when/monitor/console');
var debug = require('debug')('sdk');

var Proxy_ = require('./proxyWrapper');
var Device = require('./deviceWrapper');
var Schema = require('./schema');


module.exports = Organiq;
module.exports.Device = Device;
module.exports.Proxy = Proxy_;
module.exports.Schema = Schema;


var DEFAULT_APIROOT = 'ws://api.organiq.io';
var DEFAULT_APITOKEN = '';
var DEFAULT_NAMESPACE = '.';
var DEFAULT_OPTIONS_PATH = './organiq.json';


/**
 * Create Organiq Device Container.
 *
 * The values used for API root and API token can be specified in any of the
 * following places:
 *  (1) Organiq constructor
 *  (2) organiq.json in the current working directory
 *  (3) ORGANIQ_APIROOT, ORGANIQ_APITOKEN, and ORGANIQ_NAMESPACE environment
 *    variables
 *
 * If values are not found in any of these places, defaults are used.
 *
 * @param {Object} options Configuration options.
 * @param {String=} options.apiRoot The URI of the gateway server endpoint to which we
 *  should connect.
 * @param {String=} options.apiToken The authentication token to use with the gateway.
 * @param {String=} options.namespace The namespace to use for deviceids
 *  when one is not specified. Defaults to the global namespace ('.').
 * @param {String=} options.optionsPath Defaults to './organiq.json'
 * @param {Boolean=} options.autoConnect Defaults to true.
 * @param {Boolean=} options.strictSchema Defaults to false.
 *
 * @constructor
 */
function Organiq(options) {
  if (!(this instanceof Organiq)) {
    return new Organiq(options);
  }

  options = options || {};
  var apiRoot = options.apiRoot;
  var apiToken = options.apiToken;
  var namespace = options.namespace;
  var optionsPath = options.optionsPath || DEFAULT_OPTIONS_PATH;
  //var autoConnect = options.autoConnect !== false;  // true if not given false
  var strictSchema = options.strictSchema || false; // false if not given true


  // If we weren't given all configurable parameters, look in organiq.json.
  // Note that the special checks for fs.existsSync are necessary for this code
  // to work in a web browser environment (where it will not be defined).

  if (!apiRoot || !apiToken || !!namespace) {
    if (fs && fs.existsSync !== undefined && fs.existsSync(optionsPath)) {
      var s = fs.readFileSync(optionsPath, 'utf8');
      var config = JSON.parse(s);
      apiToken = apiToken || config['token'];
      apiRoot = apiRoot || config['apiRoot'];
      namespace = namespace || config['namespace'];
    }
  }

  apiRoot = apiRoot || process.env['ORGANIQ_APIROOT'] || DEFAULT_APIROOT;
  apiToken = apiToken || process.env['ORGANIQ_APITOKEN'] || DEFAULT_APITOKEN;
  namespace = namespace || process.env['ORGANIQ_NAMESPACE'] || DEFAULT_NAMESPACE;

  // Create a device container and client node, and connect them to the gateway
  // via the WebSocketTransport.
  var container = new DeviceContainer({defaultDomain: namespace});
  var client = new ClientContainer({defaultDomain: namespace});
  var driverContainer = new DriverContainer({defaultDomain: namespace});
  var gateway = new WebSocketTransport(container, client, driverContainer);
  client.attachGateway(gateway, namespace);
  container.attachGateway(gateway, namespace);
  driverContainer.attachGateway(gateway, namespace);

  var ws = new WebSocket(apiRoot);
  ws.on('open', gateway.connectionHandler);
  ws.on('error', function (e) {
    debug('Failed to connect container to gateway server: ' + e);
  });


  /**
   * Normalize a user-supplied deviceid.
   *
   * For convenience, the SDK allows user to supply deviceids without being
   * fully qualified. The Organiq core always requires fully-qualified ids.
   *
   * @param deviceid
   * @return {string} A normalized deviceid of the form <domain>:<deviceid>
   */
  function normalizeDeviceId(deviceid) {
    var parts = deviceid.toLowerCase().split(':');
    if (parts.length === 1) {
      parts[1] = parts[0];
      parts[0] = namespace;
    }
    return parts.join(':');
  }


  /**
   * Register a local device object with the system.
   *
   * If `strictSchema` is enabled in options, a schema object must be provided
   * that specifies the properties, methods, and events exposed by the device
   * being registered. If `strictSchema` is not enabled, then the schema object
   * is optional. If omitted in this case, a schema will be automatically
   * created by inspecting the given `impl` object.
   *
   * @param {String} deviceid
   * @param {Object} impl Native implementation object
   * @param {Object} [schema] optional schema for interface
   * @returns {Device}
   */
  this.registerDevice = function (deviceid, impl, schema) {
    if (strictSchema && !schema) {
      throw new Error('Schema is required when `strictSchema` enabled');
    }
    deviceid = normalizeDeviceId(deviceid);
    var device = new Device(impl, schema, {strictSchema: strictSchema});
    return container.register(deviceid, device);
  };

  /**
   * Get a reference to a remote device.
   *
   * @param deviceid
   * @return {ProxyWrapper|Promise}
   */
  this.getDevice = function(deviceid) {
    var proxy = null;

    deviceid = normalizeDeviceId(deviceid);
    debug('getDevice(deviceid='+deviceid+')');

    return client.connect(deviceid)
      .then(function(proxy_) {
      // Query the device for its schema
      debug('getDevice received native device proxy.');
      proxy = proxy_;
      return proxy.describe('.schema');
    }).then(function(schema) {
      // Create the proxy wrapper object for the caller
      debug('getDevice received device schema.');
      return new Proxy_(schema, proxy);
    }).catch(function(err) {
      console.log('getDevice error: ', err);
      throw err;
    });
  };

  /**
   * Register a device driver.
   *
   * @param {String} deviceid
   * @param {Function} handler
   * @return {*}
   */
  this.installDriver = function(deviceid, handler) {
    deviceid = normalizeDeviceId(deviceid);
    return driverContainer.install(deviceid, handler);
  };
}



/**
 * Factory for a singleton Organiq object.
 *
 * It is common for the module client to want to use a single instance of
 * Organiq with default connection settings (or settings configured in the
 * environment or config file). This factory, together with the class functions
 * below, allows the constructor function exported by this module to be used
 * directly in this case, obviating the need for the caller to manually create
 * an instance.
 *
 * // verbose (normal) flow:
 * var organiq = require('organiq');
 * var options = { ... }
 * var app = organiq(options);  // create instance with optional options
 * app.register(...);           // call via instance
 *
 * // using singleton pattern
 * var organiq = require('organiq');
 * organiq.register();  // implicitly create singleton and call through it
 * // ...
 * organiq.getDevice(); // calls through same singleton object
 *
 */
var Singleton = (function () {
  var o;
  return { get: function() { if (!o) { o = new Organiq(); } return o; } };
})();

/**
 * Calls `registerDevice` of singleton object.
 *
 * @return {LocalDeviceProxy|Promise|WebSocketDeviceProxy|*|Connection}
 */
Organiq.registerDevice = function() {
  var s = Singleton.get();
  return s.registerDevice.apply(s, arguments);
};

/**
 * Calls `getDevice` of singleton object.
 *
 * @return {LocalDeviceProxy|Promise|WebSocketDeviceProxy|*|Connection}
 */
Organiq.getDevice = function() {
  var s = Singleton.get();
  return s.getDevice.apply(s, arguments);
};

/**
 * Calls `installDriver` of singleton object.
 *
 * @return {*}
 */
Organiq.installDriver = function() {
  var s = Singleton.get();
  return s.installDriver.apply(s, arguments);
};
