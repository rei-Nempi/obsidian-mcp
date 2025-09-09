import { Logger } from '../../utils/logger';

interface CacheEntry<T> {
  value: T;
  timestamp: number;
  ttl: number;
}

export class CacheManager {
  private cache: Map<string, CacheEntry<any>>;
  private logger: Logger;
  private defaultTTL: number;
  private maxSize: number;

  constructor(maxSize: number = 500, defaultTTL: number = 3600000) {
    this.cache = new Map();
    this.logger = new Logger('CacheManager');
    this.maxSize = maxSize;
    this.defaultTTL = defaultTTL;
    
    this.startCleanupInterval();
  }

  async get<T>(key: string): Promise<T | null> {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return null;
    }
    
    if (this.isExpired(entry)) {
      this.cache.delete(key);
      return null;
    }
    
    entry.timestamp = Date.now();
    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    if (this.cache.size >= this.maxSize) {
      this.evictOldest();
    }
    
    this.cache.set(key, {
      value,
      timestamp: Date.now(),
      ttl: ttl || this.defaultTTL,
    });
    
    this.logger.debug(`Cache set: ${key}`);
  }

  async delete(key: string): Promise<void> {
    this.cache.delete(key);
    this.logger.debug(`Cache deleted: ${key}`);
  }

  async clear(): Promise<void> {
    this.cache.clear();
    this.logger.info('Cache cleared');
  }

  async has(key: string): Promise<boolean> {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return false;
    }
    
    if (this.isExpired(entry)) {
      this.cache.delete(key);
      return false;
    }
    
    return true;
  }

  getSize(): number {
    return this.cache.size;
  }

  getStats(): { size: number; hits: number; misses: number } {
    return {
      size: this.cache.size,
      hits: 0,
      misses: 0,
    };
  }

  private isExpired(entry: CacheEntry<any>): boolean {
    return Date.now() - entry.timestamp > entry.ttl;
  }

  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Date.now();
    
    for (const [key, entry] of this.cache) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldestKey = key;
      }
    }
    
    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.logger.debug(`Cache evicted: ${oldestKey}`);
    }
  }

  private startCleanupInterval(): void {
    setInterval(() => {
      this.cleanup();
    }, 60000);
  }

  private cleanup(): void {
    let cleaned = 0;
    
    for (const [key, entry] of this.cache) {
      if (this.isExpired(entry)) {
        this.cache.delete(key);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      this.logger.debug(`Cache cleanup: removed ${cleaned} expired entries`);
    }
  }
}