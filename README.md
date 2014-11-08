# strict-rate-limiter

Rate limiter backed by redis with strict concurrency rules for scalable applications

## What

Suitable for cloud applications with multi-node and/or cluster infrastructure.

To keep the limiter up-to-date across multiple workers or nodes, it uses a lock mechanism to throttle the connection while the previous connection is not yet dispatched and the limiter is saved to the redis database.
The lock mechanism throttles only those concurrent connections coming from the same origin (identified by the ID).
  
## Requirements

- Redis 2.6.12+ (2.8 recommended)
  
## Dependecies

- github.com/kriskowal/q
  
## Install

```
$ npm install strict-rate-limiter
```

## Usage

```
var redisClient = redis.createClient();

var id = req.apiKey;

// allow 100 request / 60s
limiters[id] = new RateLimiter({
  id: id,
  limit: 100, // 100 tokens
  duration: 60000 // 60s duration
}, redisClient);

limiters[id].get(function(err, limit, remaining, reset) {
  if (err) {
    return next(err);
  }

  res.setHeader('X-RateLimit-Limit', limit);
  res.setHeader('X-RateLimit-Remaining', remaining);
  res.setHeader('X-RateLimit-Reset', Math.floor(reset / 1000));
  
  if (remaining >= 0) {
    // allowed, call next middleware
    next();
    
  } else {
    // limit exceeded
    res.setHeader('Retry-After', Math.floor((reset - new Date()) / 1000));
    res.statusCode = 429;
    res.end('Rate limit exceeded.');
  }
});
```

## Options
  - `id` Unique identifier (API key, IP address or user ID)
  - `limit` Number of tokens
  - `duration` Duration in milliseconds
  
## Test

```
$ npm test
```
  
## License
  MIT

