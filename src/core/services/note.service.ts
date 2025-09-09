import * as path from 'path';
import { Note, CreateNoteParams, UpdateMode, ListOptions } from '../../types/obsidian.types';
import { NoteRepository } from '../repositories/note.repository';
import { ConfigManager } from '../../config/config.manager';
import { Logger } from '../../utils/logger';
import { Validator } from '../../utils/validator';

export class NoteService {
  private repository: NoteRepository;
  private logger: Logger;

  constructor(private configManager: ConfigManager) {
    this.repository = new NoteRepository(configManager);
    this.logger = new Logger('NoteService');
  }

  async create(params: CreateNoteParams): Promise<Note> {
    this.logger.info(`Creating note: ${params.title}`);
    
    Validator.validateNoteTitle(params.title);
    
    const vault = await this.configManager.getActiveVault();
    const folder = params.folder || vault.config.defaultFolder || '';
    const filePath = path.join(vault.path, folder, `${params.title}.md`);
    
    if (await this.repository.exists(filePath)) {
      throw new Error(`Note already exists: ${params.title}`);
    }
    
    const note: Note = {
      path: filePath,
      title: params.title,
      content: params.content,
      metadata: params.metadata || {},
      tags: (params.tags || []).map(tag => ({
        name: tag,
        count: 1,
        nested: tag.includes('/'),
        parent: tag.includes('/') ? tag.split('/')[0] : undefined,
      })),
      links: [],
      createdAt: new Date(),
      modifiedAt: new Date(),
    };
    
    await this.repository.save(note);
    return note;
  }

  async read(identifier: string): Promise<Note> {
    this.logger.info(`Reading note: ${identifier}`);
    
    const vault = await this.configManager.getActiveVault();
    const filePath = this.resolvePath(identifier, vault.path);
    
    if (!await this.repository.exists(filePath)) {
      throw new Error(`Note not found: ${identifier}`);
    }
    
    return await this.repository.load(filePath);
  }

  async update(path: string, content: string, mode: UpdateMode = 'replace'): Promise<Note> {
    this.logger.info(`Updating note: ${path} (mode: ${mode})`);
    
    const note = await this.read(path);
    
    if (mode === 'append') {
      note.content += '\n' + content;
    } else {
      note.content = content;
    }
    
    note.modifiedAt = new Date();
    
    await this.repository.save(note);
    return note;
  }

  async delete(path: string, confirm: boolean = false): Promise<void> {
    this.logger.info(`Deleting note: ${path}`);
    
    if (!confirm) {
      throw new Error('Deletion requires confirmation');
    }
    
    const vault = await this.configManager.getActiveVault();
    const filePath = this.resolvePath(path, vault.path);
    
    if (!await this.repository.exists(filePath)) {
      throw new Error(`Note not found: ${path}`);
    }
    
    await this.repository.delete(filePath);
  }

  async list(folder?: string, options?: ListOptions): Promise<Note[]> {
    this.logger.info(`Listing notes in: ${folder || 'vault root'}`);
    
    const vault = await this.configManager.getActiveVault();
    const searchPath = folder ? path.join(vault.path, folder) : vault.path;
    
    return await this.repository.list(searchPath, options);
  }

  private resolvePath(identifier: string, vaultPath: string): string {
    if (path.isAbsolute(identifier)) {
      return identifier;
    }
    
    if (identifier.endsWith('.md')) {
      return path.join(vaultPath, identifier);
    }
    
    return path.join(vaultPath, `${identifier}.md`);
  }
}