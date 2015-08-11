var organiq = require('../../'); // use `require('organiq')` in your own code

var device = {
  _pressed: false,
  get buttonState() { return this._pressed; },
  set buttonState(pressed) { this._pressed = !!pressed },
  pressButton: function() { this.buttonState = true; this.emit('buttonPress', true); },
  releaseButton: function() { this.buttonState = false; this.emit('buttonReleas', false); }
};
organiq.registerDevice('Demo Device', device);

var driver = function(req, next) {
  console.log('driver called: ' + req.method + ' ' + req.identifier);
  return next();
};
organiq.installDriver('Demo Device', driver);


function client(device) {
  device.on('buttonPress', function() {
    console.log('Button was pressed.');
  });
  device.on('buttonRelease', function() {
    console.log('Button was released.');
  });

  device.pressButton();
  device.releaseButton();
}
organiq.getDevice('Demo Device').then(client);
