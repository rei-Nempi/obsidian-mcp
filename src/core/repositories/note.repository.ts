import * as fs from 'fs/promises';
import * as path from 'path';
import { Note, ListOptions } from '../../types/obsidian.types';
import { NoteModel } from '../models/note.model';
import { ConfigManager } from '../../config/config.manager';
import { FileHandler } from '../../infrastructure/file-system/file.handler';
import { CacheManager } from '../../infrastructure/cache/cache.manager';
import { Logger } from '../../utils/logger';

export class NoteRepository {
  private fileHandler: FileHandler;
  private cacheManager: CacheManager;
  private logger: Logger;

  constructor(private configManager: ConfigManager) {
    this.fileHandler = new FileHandler();
    this.cacheManager = new CacheManager();
    this.logger = new Logger('NoteRepository');
  }

  async save(note: Note): Promise<void> {
    try {
      const noteModel = new NoteModel(note);
      const content = noteModel.toMarkdown();
      
      await this.fileHandler.write(note.path, content);
      await this.cacheManager.set(note.path, note);
      
      this.logger.info(`Note saved: ${note.path}`);
    } catch (error) {
      this.logger.error(`Failed to save note: ${note.path}`, error);
      throw error;
    }
  }

  async load(filePath: string): Promise<Note> {
    try {
      const cached = await this.cacheManager.get(filePath);
      if (cached) {
        this.logger.debug(`Note loaded from cache: ${filePath}`);
        return cached as Note;
      }
      
      const content = await this.fileHandler.read(filePath);
      const note = NoteModel.fromMarkdown(filePath, content);
      
      await this.cacheManager.set(filePath, note);
      
      this.logger.info(`Note loaded: ${filePath}`);
      return note;
    } catch (error) {
      this.logger.error(`Failed to load note: ${filePath}`, error);
      throw error;
    }
  }

  async delete(filePath: string): Promise<void> {
    try {
      await this.fileHandler.delete(filePath);
      await this.cacheManager.delete(filePath);
      
      this.logger.info(`Note deleted: ${filePath}`);
    } catch (error) {
      this.logger.error(`Failed to delete note: ${filePath}`, error);
      throw error;
    }
  }

  async exists(filePath: string): Promise<boolean> {
    return await this.fileHandler.exists(filePath);
  }

  async list(directory: string, options?: ListOptions): Promise<Note[]> {
    try {
      const files = await this.findMarkdownFiles(directory, options?.recursive);
      const notes: Note[] = [];
      
      for (const file of files) {
        try {
          const note = await this.load(file);
          
          if (this.matchesFilter(note, options)) {
            notes.push(note);
          }
        } catch (error) {
          this.logger.warn(`Failed to load note during listing: ${file}`, error);
        }
      }
      
      return this.sortNotes(notes, options?.sortBy, options?.sortOrder);
    } catch (error) {
      this.logger.error(`Failed to list notes in: ${directory}`, error);
      throw error;
    }
  }

  private async findMarkdownFiles(directory: string, recursive: boolean = false): Promise<string[]> {
    const files: string[] = [];
    
    try {
      const entries = await fs.readdir(directory, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(directory, entry.name);
        
        if (entry.isDirectory()) {
          if (recursive && !this.isExcludedFolder(entry.name)) {
            const subFiles = await this.findMarkdownFiles(fullPath, recursive);
            files.push(...subFiles);
          }
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          files.push(fullPath);
        }
      }
    } catch (error) {
      this.logger.error(`Failed to read directory: ${directory}`, error);
    }
    
    return files;
  }

  private isExcludedFolder(folderName: string): boolean {
    const vault = this.configManager.getActiveVaultSync();
    const excludeFolders = vault?.config.excludeFolders || ['.obsidian', '.trash'];
    return excludeFolders.includes(folderName);
  }

  private matchesFilter(note: Note, options?: ListOptions): boolean {
    if (!options) return true;
    
    if (options.tags && options.tags.length > 0) {
      const noteTags = new Set(note.tags.map(t => t.name));
      const hasAllTags = options.tags.every(tag => noteTags.has(tag));
      if (!hasAllTags) return false;
    }
    
    if (options.afterDate && note.modifiedAt < options.afterDate) {
      return false;
    }
    
    if (options.beforeDate && note.modifiedAt > options.beforeDate) {
      return false;
    }
    
    return true;
  }

  private sortNotes(
    notes: Note[], 
    sortBy: 'title' | 'modified' | 'created' = 'modified',
    sortOrder: 'asc' | 'desc' = 'desc'
  ): Note[] {
    const sorted = [...notes].sort((a, b) => {
      let comparison = 0;
      
      switch (sortBy) {
        case 'title':
          comparison = a.title.localeCompare(b.title);
          break;
        case 'created':
          comparison = a.createdAt.getTime() - b.createdAt.getTime();
          break;
        case 'modified':
        default:
          comparison = a.modifiedAt.getTime() - b.modifiedAt.getTime();
          break;
      }
      
      return sortOrder === 'asc' ? comparison : -comparison;
    });
    
    return sorted;
  }
}