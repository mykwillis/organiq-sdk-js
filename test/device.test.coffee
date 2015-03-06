DeviceWrapper = require '../lib/device'
util = require('util')
EventEmitter = require('events').EventEmitter

describe 'DeviceWrapper', ->

  #
  # Constructor
  #
  # Test proper operation of the function as constructor.
  #
  describe 'constructor', ->
    testDevice = null

    beforeEach ->
      testDevice =
        echo: (ping) -> return ping
        prop: true
        events: ['going', 'gone']
        __emitter: new EventEmitter
        on: () -> return this.__emitter.on.apply(this,arguments)

    it 'should always invoke as constructor', ->
      ld = new DeviceWrapper testDevice
      ld.should.be.an.instanceof DeviceWrapper

      # call as function (not as constructor)
      ld = DeviceWrapper testDevice
      ld.should.be.an.instanceof DeviceWrapper

    it 'should create schema if not supplied', ->
      ld = new DeviceWrapper testDevice
      ld.schema.should.exist
      ld.schema.methods.should.have.property 'echo'
      ld.schema.properties.should.have.property 'prop'
      ld.schema.events.should.have.property 'going'
      ld.schema.events.should.have.property 'gone'


  # Schema Handling
  # Test proper handling of situations where a schema is given to the
  # constructor.
  describe 'schema handling', ->
    testDevice = null
    ld = null
    spyOn = null

    beforeEach ->
      testSchema =
        properties: {
          'numberProp': { type: 'number', constructor: Number },
          'stringProp': { type: 'string', constructor: String },
          'booleanProp': { type: 'boolean', constructor: Boolean },
          'notInImpl': { type: 'string', constructor: String }
        }
        methods: {
          'f': { type: 'unknown' }
        }
        events: {
          'swoosh': {}
        }

      testDevice =
        numberProp: 42
        stringProp: 'stringValue'
        booleanProp: true
        f: (x) -> return { got: x, said: 'smash' }
        events: ['swoosh', 'ignoredEvent']

        ignoredProp: 43
        ignoredString: 'nothing'
        ignoredFunc: (x) -> return x

        __emitter: new EventEmitter
        on: (ev, fn) -> return this.__emitter.on(ev,fn)

      spyOn = sinon.spy testDevice, 'on'
      ld = new DeviceWrapper testDevice, testSchema

    it 'maps number properties', ->
      v = ld.get 'numberProp'
      v.should.exist
      v.should.be.a('number')
      v.should.equal 42

    it 'maps string properties', ->
      v = ld.get 'stringProp'
      v.should.exist
      v.should.be.a('string')
      v.should.equal 'stringValue'

    it 'maps boolean properties', ->
      v = ld.get 'booleanProp'
      v.should.exist
      v.should.be.a('boolean')
      v.should.equal true

    it 'maps functions', ->
      v = ld.invoke 'f', 'goombay'
      v.should.exist
      v.should.be.a('object')
      v.should.deep.equal { got: 'goombay', said: 'smash' }

    # Set up an event handler for 'notify' of the wrapper. We should be
    # invoked when the native object emits one of the events defined in
    # the schema.
    it 'maps explicit events', (done) ->
      ld.on 'notify', (event, args) ->
        event.should.equal 'swoosh'
        args.should.deep.equal { apple: 'red', banana: 'yellow' }
        done()

      testDevice.__emitter.emit 'swoosh', { apple: 'red', banana: 'yellow' }

    # If a device implementation does not have an explicit declaration of a
    # property defined in the schema, it should get one created.
    it 'maps schema properties not in implementation', ->
      v = ld.get 'notInImpl'
      v.should.exist
      v.should.be.a('string')

      ld.set 'notInImpl', 'you there?'
      v = ld.get 'notInImpl'
      v.should.equal 'you there?'


    # if a property/method/event is not present in the schema, it should fail
    # when we try to access it through the wrapper.
    it 'does not map ignored props/methods/events', (done) ->
      (-> ld.get 'ignoredProp').should.throw /invalid/
      (-> ld.get 'ignoredString').should.throw /invalid/
      (-> ld.invoke 'ignoredFunc').should.throw /invalid/

      # Make sure ignoredEvent is not fired. We do this by emitting
      # another event right after ignoredEvent and making sure that when the
      # second event's handler is called we hadn't seen the first.
      ld.on 'notify', (event, args) ->
        event.should.not.equal 'ignoredEvent' # it will be 'swoosh'
        testDevice.on.should.not.have.been.calledWith 'ignoredEvent'
        done()

      testDevice.__emitter.emit 'ignoredEvent', { IDoNot: 'see this' }
      testDevice.__emitter.emit 'swoosh', { apple: 'red', banana: 'yellow' }


  # Every time a property is updated with the DeviceWrapper setter, a 'put'
  # event should be fired.
  describe 'metric recording', ->
    testDevice = null
    ld = null

    beforeEach ->
      testDevice =
        numberProp: 42
        stringProp: 'stringValue'
        booleanProp: true

      ld = new DeviceWrapper testDevice

    it 'captures number properties', (done) ->
      ld.on 'put', (metric, value) ->
        metric.should.equal 'numberProp'
        value.should.equal 43
        done()
      testDevice.numberProp = 43

    it 'captures string properties', (done) ->
      ld.on 'put', (metric, value) ->
        metric.should.equal 'stringProp'
        value.should.equal 'hiya'
        done()
      testDevice.stringProp = 'hiya'

    it 'captures boolean properties', (done) ->
      ld.on 'put', (metric, value) ->
        metric.should.equal 'booleanProp'
        value.should.equal false
        done()
      testDevice.booleanProp = false

    it 'sets implementation property before invoking PUT', (done) ->
      ld.on 'put', (metric, value) ->
        metric.should.equal 'numberProp'
        value.should.equal 47
        testDevice.numberProp.should.equal 47
        done()
      testDevice.numberProp = 47

  describe 'method invocations', ->
    it 'handles void argument list', ->
      testDevice =
        f: () -> return 'expected'
      ld = new DeviceWrapper testDevice
      result = ld.invoke('f')
      result.should.equal('expected')

    it 'handles single argument', ->
      testDevice =
        f: (x) -> return { arg: x }
      ld = new DeviceWrapper testDevice
      result = ld.invoke('f', 'input')
      result.should.deep.equal { arg: 'input' }

    it 'handles argument list', ->
      testDevice =
        f: (x, y, z) -> return { args: [x,y,z] }
      ld = new DeviceWrapper testDevice
      result = ld.invoke('f', ['larry', 'moe', 'curly'])
      result.should.deep.equal { args: ['larry', 'moe', 'curly'] }




