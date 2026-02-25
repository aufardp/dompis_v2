import Redis from 'ioredis';

const getRedisUrl = () => {
  return process.env.REDIS_URL || 'redis://localhost:6379';
};

class RedisClient {
  private static instance: Redis | null = null;
  private static isConnected: boolean = false;

  static getInstance(): Redis {
    if (!RedisClient.instance) {
      RedisClient.instance = new Redis(getRedisUrl(), {
        maxRetriesPerRequest: 5,
        retryStrategy: (times) => {
          if (times > 5) {
            console.error('[Redis] Max retries reached, giving up');
            RedisClient.isConnected = false;
            return null;
          }
          RedisClient.isConnected = false;
          const delay = Math.min(times * 500, 5000);
          console.log(`[Redis] Retry attempt ${times}, waiting ${delay}ms`);
          return delay;
        },
        lazyConnect: false,
        connectTimeout: 10000,
        enableOfflineQueue: true,
        enableReadyCheck: true,
      });

      RedisClient.instance.on('connect', () => {
        RedisClient.isConnected = true;
        console.log('[Redis] Connected successfully');
      });

      RedisClient.instance.on('ready', () => {
        RedisClient.isConnected = true;
        console.log('[Redis] Ready');
      });

      RedisClient.instance.on('error', (err) => {
        console.error('[Redis] Connection error:', err.message);
        RedisClient.isConnected = false;
      });

      RedisClient.instance.on('close', () => {
        console.log('[Redis] Connection closed');
        RedisClient.isConnected = false;
      });

      RedisClient.instance.on('reconnecting', () => {
        console.log('[Redis] Reconnecting...');
      });
    }

    return RedisClient.instance;
  }

  static isReady(): boolean {
    return RedisClient.isConnected && RedisClient.instance?.status === 'ready';
  }

  static async close(): Promise<void> {
    if (RedisClient.instance) {
      await RedisClient.instance.quit();
      RedisClient.instance = null;
      RedisClient.isConnected = false;
    }
  }

  static reset(): void {
    RedisClient.instance = null;
    RedisClient.isConnected = false;
  }
}

export const redis = RedisClient.getInstance();
export const isRedisReady = () => RedisClient.isReady();
export default redis;
