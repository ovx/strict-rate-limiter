var assert = require('assert'),
  RateLimiter = require('../index'),
  Redis = require('ioredis');

var ID = 'testlimiter',
  LIMIT = 10,
  DURATION = 30000;

var redisClient = new Redis();

describe('Setup', function () {
  var limiter;

  it('should not be possible to initialize w/out options', function (done) {
    try {
      var limiter = new RateLimiter();
      throw new Error('Ratelimit doesn\'t throw any error');

    } catch (e) {
      if (e instanceof assert.AssertionError) {
        done();
      }
    }
  });

  it('should intialize new limiter', function (done) {
    limiter = new RateLimiter({
      id: ID,
      limit: LIMIT,
      duration: DURATION
    }, redisClient);

    assert.strictEqual(limiter.limit, LIMIT);
    assert.strictEqual(limiter.remaining, 0);

    done();
  });
});

describe('API', function () {
  var limiter;

  function clearRedis(done) {
    redisClient.keys('ratelimit:*', function (err, keys) {
      if (err) {
        return done(err);
      }

      if (!keys.length) {
        return done();
      }

      redisClient.del.apply(redisClient, keys.concat(done));
    });
  }

  it('cleaning redis...', function (done) {
    clearRedis(done);

    limiter = new RateLimiter({
      id: ID,
      limit: LIMIT,
      duration: DURATION
    }, redisClient);
  });

  describe('.get()', function () {
    it('should decrement .remaining on each call (calling LIMIT-1 times)', function (done) {
      var i = 0,
        max = LIMIT - 1;

      next();

      function next() {
        i++;

        if (i > max) {
          return done();
        }

        limiter.get(function (err, limit, remaining, reset) {
          assert.strictEqual(err, undefined);
          assert.strictEqual(limit, LIMIT);
          assert.strictEqual(remaining, LIMIT - i);
          assert(reset instanceof Date, '.reset should be a Date');
          assert(reset.getTime() >= (new Date().getTime() + DURATION - 500), 'incorrect .reset');
          next();
        });
      }
    });

    it('should return .remaining === 0', function (done) {
      limiter.get(function (err, limit, remaining, reset) {
        assert.strictEqual(err, undefined);
        assert.strictEqual(limit, LIMIT);
        assert.strictEqual(remaining, 0);
        assert(reset instanceof Date, '.reset should be a Date');
        assert(reset.getTime() >= (new Date().getTime() + DURATION - 500), 'incorrect .reset');
        done();
      });
    });

    it('should return .remaining === -1', function (done) {
      limiter.get(function (err, limit, remaining, reset) {
        assert.strictEqual(err, undefined);
        assert.strictEqual(limit, LIMIT);
        assert.strictEqual(remaining, -1);
        assert(reset instanceof Date, '.reset should be a Date');
        assert(reset.getTime() >= (new Date().getTime() + DURATION - 500), 'incorrect .reset');
        done();
      });
    });
  });

  it('cleaning redis...', function (done) {
    clearRedis(done);

    limiter = new RateLimiter({
      id: ID,
      limit: LIMIT,
      duration: 500
    }, redisClient);
  });

  describe('.reset', function () {
    it('should decrement .remaining', function (done) {
      limiter.get(function (err, limit, remaining, reset) {
        assert.strictEqual(err, undefined);
        assert.strictEqual(remaining, LIMIT - 1);
        done();
      });
    });

    it('should reset .remaining after timeout', function (done) {
      setTimeout(function () {
        limiter.get(function (err, limit, remaining, reset) {
          assert.strictEqual(err, undefined);
          assert.strictEqual(limit, LIMIT);
          assert.strictEqual(remaining, LIMIT - 1);
          assert(reset instanceof Date, '.reset should be a Date');
          assert(reset.getTime() < (new Date().getTime() + DURATION), 'incorrect .reset');
          done();
        });
      }, 600);
    });
  });
});
