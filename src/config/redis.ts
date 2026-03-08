import Redis from 'ioredis';
import * as dotenv from 'dotenv';

dotenv.config();

const hasHostConfig = !!process.env.REDIS_HOST || !!process.env.REDIS_PORT;
const redisUrl = process.env.REDIS_URL;

const redis = hasHostConfig
  ? new Redis({
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: process.env.REDIS_PORT ? Number(process.env.REDIS_PORT) : 6379,
    password: process.env.REDIS_PASSWORD || undefined,
  })
  : new Redis(redisUrl || 'redis://127.0.0.1:6379');

redis.on('error', (error) => {
  console.error('[Redis] Connection error:', error);
});

export { redis };
