/* mock.js - Mock device using SDK for testing client interfaces */

var organiq = require('../../');  // 'organiq'

var _counter = 0;
var device = {
  events: ['hello', 'tick'],
  scream: function(s) { return s.toUpperCase() + '!!!'; },
  get counter() { return _counter++; }
};

setInterval(function() {
  device.emit('tick', Date.now());
}, 5000);

organiq.registerDevice('MockDevice', device);
device.emit('hello');

