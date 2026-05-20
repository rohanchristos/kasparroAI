/**
 * Kasparro AI Backend — Redis Client (ioredis)
 */

const Redis = require('ioredis');

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    const delay = Math.min(times * 200, 5_000);
    console.log(`🔄  Redis reconnect attempt #${times} in ${delay}ms`);
    return delay;
  },
  reconnectOnError(err) {
    const targetErrors = ['READONLY', 'ECONNRESET'];
    return targetErrors.some((e) => err.message.includes(e));
  },
});

redis.on('connect', () => console.log('🔴  Redis connected'));
redis.on('ready', () => console.log('🟢  Redis ready'));
redis.on('error', (err) => console.error('💥  Redis error:', err.message));

module.exports = redis;
