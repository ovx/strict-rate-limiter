// imports
var assert = require('assert'),
  Q = require('q');

// redis lock TTL
var LOCK_TTL = 300; // ms

// when locked, try again after this delay
var RETRY_DELAY = 20; // ms

// default values
var DEFAULTS = {
  namespace: 'ratelimit:'
};

// exports
module.exports = RateLimit;

function RateLimit() {
  this.init.apply(this, arguments);
}

/**
 * @constructor
 * @param {Object} options
 * @param {Object} redisClient Instance of a redis client
 */
RateLimit.prototype.init = function (options, redisClient) {
  var namespace;
  assert(typeof options === 'object', 'Requires `options` object');
  assert(redisClient, 'Requires instance of Redis client');

  /**
   * @cfg {String} id (required)
   * Unique ID for this limiter (unique for user/api key/IP etc.)
   */
  this.id = options.id;
  /**
   * @cfg {Number} limit (required)
   * Number of tokens
   */
  this.limit = options.limit;
  /**
   * @cfg {String} duration (required)
   * Duration in milliseconds
   */
  this.duration = options.duration;
  /**
   * @cfg {String} namespace
   * Namespace to prefix the id with (defaults to <tt>'ratelimit:'</tt>)
   */
  namespace = (typeof options.namespace === 'string') ? options.namespace : DEFAULTS.namespace;
  this.redisClient = redisClient;
  this.reset = 0;
  this.remaining = 0;
  this.storageId = namespace + this.id;

  assert(this.id, 'options.id required');
  assert(this.limit, 'options.limit required');
  assert(this.duration, 'options.duration required');
};

/**
 * Reset properties
 *
 * @private
 */
RateLimit.prototype.start = function () {
  this.reset = new Date();
  this.reset.setMilliseconds(this.reset.getMilliseconds() + this.duration);
  this.remaining = this.limit;
}

/**
 * Withdraws one token
 *
 * @param {Function} callback Receives: err, limit, remaining, reset
 */
RateLimit.prototype.get = function (callback) {
  if (this._getWaiting && this._getWaiting.promise.isPending()) {
    this._getWaiting.promise.then(this.get.bind(this, callback));
    return;
  }

  if (this.reset < new Date()) {
    this.start();

  } else if (this.remaining === 0) {
    // limit depleted => resolve immediately
    callback(undefined, this.limit, this.remaining - 1, this.reset);
    return;
  }

  this._getWaiting = Q.defer();

  this.storageGet(function (err) {
    callback(err, this.limit, this.remaining, this.reset);
    this._getWaiting.resolve();
  }.bind(this));
}

/**
 * Get the current value from redis and decrement it
 *
 * @private
 * @param {Function} callback Receives: err
 */
RateLimit.prototype.storageGet = function (callback) {
  var retries = 0;

  this.redisClient.multi()
    .get(this.storageId)
    .pttl(this.storageId)
    .setnx(this.storageId + ':lock', 1) // lock the record for other workers
  .pexpire(this.storageId + ':lock', LOCK_TTL) // set expire in case this program crashes
  .exec(onResult.bind(this));

  function onResult(err, res) {
    if (err) {
      return callback(err);
    }

    if (res === null || res[2][1] === 0) {
      // res[2] === 0 means already locked, try again later
      return retry.bind(this)();

    } else if (res[1][1] < 0) {
      // TTL is 0, start new limiter
      this.start();
      this.remaining -= 1;

    } else {
      // all good, set .remaining and .reset
      this.remaining = (res[0][1] >> 0) - 1;
      this.reset = new Date();
      this.reset.setMilliseconds(this.reset.getMilliseconds() + (res[1][1] >> 0));
    }

    this.storageSet(function (err) {
      callback(err);
    });
  }

  function retry() {
    if (retries >= 4) {
      var err = new Error('Max. number of retries reached');
      err.code = 'MAX_RETRY';
      return callback(err);
    }

    retries += 1;

    return Q.delay(RETRY_DELAY).then(this.storageGet.bind(this, callback));
  }
}

/**
 * Store the current value
 *
 * @private
 * @param {Function} callback Receives: err
 */
RateLimit.prototype.storageSet = function (callback) {
  this.redisClient.multi()
    .del(this.storageId + ':lock')
    .set(this.storageId, Math.max(0, this.remaining), 'PX', Math.max(0, this.reset - new Date()))
    .exec(onResult.bind(this));

  function onResult(err, res) {
    callback(err ? err : undefined);
  }
}
