import { connection as redis } from "../../config/bullmq.js";

export class CacheService {
  static async get(key) {
    try {
      const data = await redis.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.warn(`⚠️ Cache GET error for key ${key}:`, error.message);
      return null;
    }
  }

  static async set(key, value, ttlSeconds = 600) {
    try {
      const stringified = JSON.stringify(value);
      await redis.set(key, stringified, "EX", ttlSeconds);
    } catch (error) {
      console.warn(`⚠️ Cache SET error for key ${key}:`, error.message);
    }
  }

  static async del(key) {
    try {
      await redis.del(key);
    } catch (error) {
      console.warn(`⚠️ Cache DEL error for key ${key}:`, error.message);
    }
  }

  static async clearPattern(pattern) {
    try {
      const stream = redis.scanStream({ match: pattern, count: 100 });
      const keysToDelete = [];
      for await (const resultKeys of stream) {
        keysToDelete.push(...resultKeys);
      }
      if (keysToDelete.length > 0) {
        await redis.del(...keysToDelete);
      }
    } catch (error) {
      console.warn(`⚠️ Cache CLEAR PATTERN error for pattern ${pattern}:`, error.message);
    }
  }
}
