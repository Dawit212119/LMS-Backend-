const Redis = require('ioredis');

class RedisClient {
  constructor() {
    this.client = null;
    this.config = {
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD,
      db: process.env.REDIS_DB || 0,
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      keepAlive: 30000,
      family: 4,
      keyPrefix: process.env.REDIS_KEY_PREFIX || 'learning_platform:',
    };
  }

  async connect() {
    try {
      this.client = new Redis(this.config);

      // Event handlers
      this.client.on('connect', () => {
        console.log('Redis connected successfully');
      });

      this.client.on('ready', () => {
        console.log('Redis ready for commands');
      });

      this.client.on('error', (error) => {
        console.error('Redis connection error:', error);
      });

      this.client.on('close', () => {
        console.log('Redis connection closed');
      });

      this.client.on('reconnecting', (delay) => {
        console.log(`Redis reconnecting in ${delay}ms`);
      });

      // Connect to Redis
      await this.client.connect();

      // Test connection
      await this.client.ping();

      return this.client;
    } catch (error) {
      console.error('Failed to connect to Redis:', error);
      throw error;
    }
  }

  async disconnect() {
    if (this.client) {
      await this.client.quit();
      this.client = null;
    }
  }

  // Cache operations
  async set(key, value, ttl = 3600) {
    try {
      const serializedValue = JSON.stringify(value);
      if (ttl > 0) {
        await this.client.setex(key, ttl, serializedValue);
      } else {
        await this.client.set(key, serializedValue);
      }
      return true;
    } catch (error) {
      console.error('Redis SET error:', error);
      return false;
    }
  }

  async get(key) {
    try {
      const value = await this.client.get(key);
      if (value === null) {
        return null;
      }
      return JSON.parse(value);
    } catch (error) {
      console.error('Redis GET error:', error);
      return null;
    }
  }

  async del(key) {
    try {
      const result = await this.client.del(key);
      return result > 0;
    } catch (error) {
      console.error('Redis DEL error:', error);
      return false;
    }
  }

  async exists(key) {
    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      console.error('Redis EXISTS error:', error);
      return false;
    }
  }

  async expire(key, ttl) {
    try {
      const result = await this.client.expire(key, ttl);
      return result === 1;
    } catch (error) {
      console.error('Redis EXPIRE error:', error);
      return false;
    }
  }

  async ttl(key) {
    try {
      return await this.client.ttl(key);
    } catch (error) {
      console.error('Redis TTL error:', error);
      return -1;
    }
  }

  // Hash operations
  async hset(key, field, value) {
    try {
      const serializedValue = JSON.stringify(value);
      await this.client.hset(key, field, serializedValue);
      return true;
    } catch (error) {
      console.error('Redis HSET error:', error);
      return false;
    }
  }

  async hget(key, field) {
    try {
      const value = await this.client.hget(key, field);
      if (value === null) {
        return null;
      }
      return JSON.parse(value);
    } catch (error) {
      console.error('Redis HGET error:', error);
      return null;
    }
  }

  async hgetall(key) {
    try {
      const hash = await this.client.hgetall(key);
      const parsedHash = {};
      
      for (const [field, value] of Object.entries(hash)) {
        try {
          parsedHash[field] = JSON.parse(value);
        } catch {
          parsedHash[field] = value;
        }
      }
      
      return parsedHash;
    } catch (error) {
      console.error('Redis HGETALL error:', error);
      return {};
    }
  }

  async hdel(key, field) {
    try {
      const result = await this.client.hdel(key, field);
      return result > 0;
    } catch (error) {
      console.error('Redis HDEL error:', error);
      return false;
    }
  }

  // List operations
  async lpush(key, ...values) {
    try {
      const serializedValues = values.map(v => JSON.stringify(v));
      const result = await this.client.lpush(key, ...serializedValues);
      return result;
    } catch (error) {
      console.error('Redis LPUSH error:', error);
      return 0;
    }
  }

  async rpush(key, ...values) {
    try {
      const serializedValues = values.map(v => JSON.stringify(v));
      const result = await this.client.rpush(key, ...serializedValues);
      return result;
    } catch (error) {
      console.error('Redis RPUSH error:', error);
      return 0;
    }
  }

  async lpop(key) {
    try {
      const value = await this.client.lpop(key);
      if (value === null) {
        return null;
      }
      return JSON.parse(value);
    } catch (error) {
      console.error('Redis LPOP error:', error);
      return null;
    }
  }

  async rpop(key) {
    try {
      const value = await this.client.rpop(key);
      if (value === null) {
        return null;
      }
      return JSON.parse(value);
    } catch (error) {
      console.error('Redis RPOP error:', error);
      return null;
    }
  }

  async lrange(key, start = 0, stop = -1) {
    try {
      const values = await this.client.lrange(key, start, stop);
      return values.map(v => {
        try {
          return JSON.parse(v);
        } catch {
          return v;
        }
      });
    } catch (error) {
      console.error('Redis LRANGE error:', error);
      return [];
    }
  }

  async ltrim(key, start, stop) {
    try {
      await this.client.ltrim(key, start, stop);
      return true;
    } catch (error) {
      console.error('Redis LTRIM error:', error);
      return false;
    }
  }

  // Set operations
  async sadd(key, ...members) {
    try {
      const serializedMembers = members.map(m => JSON.stringify(m));
      const result = await this.client.sadd(key, ...serializedMembers);
      return result;
    } catch (error) {
      console.error('Redis SADD error:', error);
      return 0;
    }
  }

  async srem(key, ...members) {
    try {
      const serializedMembers = members.map(m => JSON.stringify(m));
      const result = await this.client.srem(key, ...serializedMembers);
      return result;
    } catch (error) {
      console.error('Redis SREM error:', error);
      return 0;
    }
  }

  async smembers(key) {
    try {
      const members = await this.client.smembers(key);
      return members.map(m => {
        try {
          return JSON.parse(m);
        } catch {
          return m;
        }
      });
    } catch (error) {
      console.error('Redis SMEMBERS error:', error);
      return [];
    }
  }

  async sismember(key, member) {
    try {
      const serializedMember = JSON.stringify(member);
      const result = await this.client.sismember(key, serializedMember);
      return result === 1;
    } catch (error) {
      console.error('Redis SISMEMBER error:', error);
      return false;
    }
  }

  // Pub/Sub operations
  async publish(channel, message) {
    try {
      const serializedMessage = JSON.stringify(message);
      const result = await this.client.publish(channel, serializedMessage);
      return result;
    } catch (error) {
      console.error('Redis PUBLISH error:', error);
      return 0;
    }
  }

  async subscribe(channel, callback) {
    try {
      const subscriber = this.client.duplicate();
      await subscriber.subscribe(channel);
      
      subscriber.on('message', (receivedChannel, message) => {
        if (receivedChannel === channel) {
          try {
            const parsedMessage = JSON.parse(message);
            callback(parsedMessage);
          } catch (error) {
            console.error('Error parsing Redis message:', error);
            callback(message);
          }
        }
      });

      return subscriber;
    } catch (error) {
      console.error('Redis SUBSCRIBE error:', error);
      return null;
    }
  }

  // Utility operations
  async flushdb() {
    try {
      await this.client.flushdb();
      return true;
    } catch (error) {
      console.error('Redis FLUSHDB error:', error);
      return false;
    }
  }

  async keys(pattern) {
    try {
      return await this.client.keys(pattern);
    } catch (error) {
      console.error('Redis KEYS error:', error);
      return [];
    }
  }

  async incr(key, by = 1) {
    try {
      return await this.client.incrby(key, by);
    } catch (error) {
      console.error('Redis INCR error:', error);
      return 0;
    }
  }

  async decr(key, by = 1) {
    try {
      return await this.client.decrby(key, by);
    } catch (error) {
      console.error('Redis DECR error:', error);
      return 0;
    }
  }

  // Health check
  async healthCheck() {
    try {
      const start = Date.now();
      await this.client.ping();
      const latency = Date.now() - start;
      
      const info = await this.client.info('memory');
      const memoryUsed = info.match(/used_memory:(\d+)/)?.[1] || '0';
      
      return {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        latency: `${latency}ms`,
        memoryUsed: memoryUsed,
        connected: this.client.status === 'ready'
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error.message
      };
    }
  }

  // Get Redis client instance
  getClient() {
    return this.client;
  }
}

// Singleton instance
const redisClient = new RedisClient();

module.exports = redisClient;
