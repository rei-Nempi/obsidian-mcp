import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';
import { Logger } from '../../utils/logger';

export type FileEvent = 'add' | 'change' | 'unlink';

export interface WatcherOptions {
  ignored?: string[];
  persistent?: boolean;
  ignoreInitial?: boolean;
  depth?: number;
}

export class FileWatcher extends EventEmitter {
  private watchers: Map<string, fs.FSWatcher>;
  private logger: Logger;
  private options: WatcherOptions;

  constructor(options: WatcherOptions = {}) {
    super();
    this.watchers = new Map();
    this.logger = new Logger('FileWatcher');
    this.options = {
      ignored: ['.obsidian', '.trash', 'node_modules', '.git'],
      persistent: true,
      ignoreInitial: true,
      ...options,
    };
  }

  watch(directory: string): void {
    if (this.watchers.has(directory)) {
      this.logger.warn(`Already watching: ${directory}`);
      return;
    }

    try {
      const watcher = fs.watch(
        directory,
        { persistent: this.options.persistent, recursive: true },
        (eventType, filename) => {
          if (filename) {
            this.handleFileChange(directory, eventType, filename);
          }
        }
      );

      this.watchers.set(directory, watcher);
      this.logger.info(`Started watching: ${directory}`);

      watcher.on('error', (error) => {
        this.logger.error(`Watcher error for ${directory}:`, error);
        this.emit('error', error);
      });
    } catch (error) {
      this.logger.error(`Failed to watch directory: ${directory}`, error);
      throw error;
    }
  }

  unwatch(directory: string): void {
    const watcher = this.watchers.get(directory);
    if (watcher) {
      watcher.close();
      this.watchers.delete(directory);
      this.logger.info(`Stopped watching: ${directory}`);
    }
  }

  unwatchAll(): void {
    for (const [directory, watcher] of this.watchers) {
      watcher.close();
      this.logger.info(`Stopped watching: ${directory}`);
    }
    this.watchers.clear();
  }

  private handleFileChange(directory: string, eventType: string, filename: string): void {
    const fullPath = path.join(directory, filename);

    if (this.shouldIgnore(filename)) {
      return;
    }

    if (!filename.endsWith('.md')) {
      return;
    }

    let event: FileEvent;
    if (eventType === 'rename') {
      event = fs.existsSync(fullPath) ? 'add' : 'unlink';
    } else {
      event = 'change';
    }

    this.logger.debug(`File ${event}: ${fullPath}`);
    this.emit(event, fullPath);
    this.emit('all', event, fullPath);
  }

  private shouldIgnore(filename: string): boolean {
    if (!this.options.ignored) return false;

    return this.options.ignored.some(pattern => {
      if (pattern.startsWith('.')) {
        return filename.includes(pattern);
      }
      return filename === pattern || filename.startsWith(pattern + '/');
    });
  }
}