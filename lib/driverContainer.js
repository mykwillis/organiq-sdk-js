var OrganiqRequest = require('./request');
var RequestStack = require('./requestStack');
var when = require('when');
var debug = require('debug')('organiq:core');
var EventEmitter = require('events').EventEmitter;
var util = require('util');
module.exports = LocalDriverContainer;

/**
 * Create a DriverContainer node.
 *
 * A driver container holds references to locally-connected drivers and attaches
 * them to the upstream gateway.
 *
 * Downstream messages are processed first by the container stack, and then by
 * the driver stack. Upstream messages are processed first by the driver stack
 * and then by the container stack.
 *
 * @param {Object=} options
 * @returns {LocalDriverContainer}
 * @constructor
 */
function LocalDriverContainer(options) {
  if (!(this instanceof LocalDriverContainer)) {
    return new LocalDriverContainer(options);
  }
  //options = options || {};

  var drivers = {};      // installed local driver stacks, by deviceid
  var gateway = null;    // gateway with which we are associated
  var stack = new RequestStack(finalHandlerUpstream, finalHandlerDownstream);

  // Public Interface
  this.dispatch = dispatch;
  this.install = install;
  this.uninstall = uninstall;

  // dispatch a message from the transport
  function dispatch(req) {
    if (req.isApplicationOriginated()) {
      return stack.dispatch(req);
    } else {
      var driverStack = drivers[req.deviceid];
      if (!driverStack) {
        throw new Error('driver not installed: ' + req.deviceid);
      }
      return driverStack.dispatch(req);
    }
  }

  /**
   * Handle an application-originated request after it has passed through the
   * middleware stack.
   *
   * The request will be passed to the underlying device object.
   *
   * @param {OrganiqRequest} req request object
   */
  function finalDriverHandlerDownstream(req) {
    // send the request to the underlying device object
    if (gateway && gateway.connected) {
      return gateway.dispatchFromDriver(req);
    }
  }

  /**
   * Handle a device-originated request after it has passed through the
   * middleware stack.
   *
   * We forward the request to the gateway.
   *
   * @param {OrganiqRequest} req request object
   * @returns {Boolean}
   */
  function finalDriverHandlerUpstream(req) {
    // let the container stack have a crack
    return stack.dispatch(req);
  }


  /**
   *
   * @param {OrganiqRequest} req request object
   */
  function finalHandlerDownstream(req) {
    var driver = drivers[req.deviceid];
    if (!driver) {
      throw new Error('Driver \'' + req.deviceid + '\' is not connected.');
    }

    return driver.dispatch(req);
  }

  /**
   *
   * @param {OrganiqRequest} req request object
   * @returns {Boolean}
   */
  function finalHandlerUpstream(req) {
    if (gateway && gateway.connected) {
      gateway.dispatchFromDriver(req);
    }
    return true;
  }

  /**
   * Register a device with the system.
   *
   * The device may be either a locally-implemented device, or a proxy to a
   * device implemented elsewhere.
   *
   *
   * @param {String} deviceid
   * @param {Dispatcher} driver
   * @returns {Device} the device object given
   */
  function install(deviceid, driver) {

    // Make sure we haven't already registered this deviceid.
    if (typeof drivers[deviceid] !== 'undefined') {
      return when.reject(new Error(
        'Install called for already installed deviceid: ' + deviceid));
    }

    var driverStack =  new RequestStack(finalDriverHandlerUpstream, finalDriverHandlerDownstream);
    driverStack.use(driver);
    drivers[deviceid] = driverStack;

    if (gateway && gateway.connected) {
      installWithGateway(deviceid);
    }
    return driver;
  }

  function installWithGateway(deviceid) {
    debug('Installing ' + deviceid + ' with gateway.');
    var req = new OrganiqRequest(deviceid, 'INSTALL');
    gateway.dispatch(req).then(function() {
      debug('Driver installed with gateway: ' + deviceid);
    }, function(err) {
      debug('Failed to install driver ' + deviceid + ': ' + err);
    });
  }

  /**
   * Uninstalls a device registration from the system.
   *
   * @param {string} deviceid
   *
   */
  function uninstall(deviceid) {
    if (typeof drivers[deviceid] === 'undefined') {
      debug('uninstall called for uninstalled deviceid: ' + deviceid);
      return when.reject(new Error(
        'uninstall of uninstalled device: ' + deviceid));
    }

    var driverStack = drivers[deviceid];
    delete drivers[deviceid];
    void(driverStack);  // cleanup somehow? Make sure requests aer empty?

    var req = new OrganiqRequest(deviceid, 'UNINSTALL');
    return gateway.dispatch(req);
  }

  /**
   * Attach to a Gateway.
   *
   * A device container is associated with a single gateway for its entire
   * lifetime. The gateway connection may `connect` and `disconnect`, potentially
   * many times, over the lifetime of the container. Any time the gateway goes
   * into the `connect` state, we assume that it has lost server-side context
   * associated with connected devices, and we re-register all devices.
   *
   * @param gateway_
   */
  LocalDriverContainer.prototype.attachGateway = function attachGateway(gateway_) {
    if (gateway) {
      throw new Error('Gateway already attached');
    }
    gateway = gateway_;

    gateway.on('connect', function() {
      debug('Gateway connected');
      for (var deviceid in drivers) {
        if (drivers.hasOwnProperty(deviceid)) {
          installWithGateway(deviceid);
        }
      }
    });
    gateway.on('disconnect', function() {
      debug('Gateway disconnnected');
      // nothing
    });
  };
}
util.inherits(LocalDriverContainer, EventEmitter);

