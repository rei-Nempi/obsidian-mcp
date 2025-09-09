import { Note, TagStats } from '../../types/obsidian.types';
import { NoteRepository } from '../repositories/note.repository';
import { ConfigManager } from '../../config/config.manager';
import { Logger } from '../../utils/logger';

export class TagService {
  private repository: NoteRepository;
  private logger: Logger;

  constructor(private configManager: ConfigManager) {
    this.repository = new NoteRepository(configManager);
    this.logger = new Logger('TagService');
  }

  async add(tags: string[], path?: string): Promise<void> {
    this.logger.info(`Adding tags: ${tags.join(', ')} to ${path || 'current note'}`);
    
    if (!path) {
      throw new Error('Note path is required');
    }
    
    const note = await this.repository.load(path);
    const existingTags = new Set(note.tags.map(t => t.name));
    
    for (const tag of tags) {
      if (!existingTags.has(tag)) {
        note.tags.push({
          name: tag,
          count: 1,
          nested: tag.includes('/'),
          parent: tag.includes('/') ? tag.split('/')[0] : undefined,
        });
      }
    }
    
    await this.repository.save(note);
  }

  async remove(tags: string[], path?: string): Promise<void> {
    this.logger.info(`Removing tags: ${tags.join(', ')} from ${path || 'current note'}`);
    
    if (!path) {
      throw new Error('Note path is required');
    }
    
    const note = await this.repository.load(path);
    const tagsToRemove = new Set(tags);
    
    note.tags = note.tags.filter(tag => !tagsToRemove.has(tag.name));
    
    await this.repository.save(note);
  }

  async search(tag: string): Promise<Note[]> {
    this.logger.info(`Searching notes by tag: ${tag}`);
    
    const vault = await this.configManager.getActiveVault();
    const allNotes = await this.repository.list(vault.path, { recursive: true });
    
    return allNotes.filter(note => 
      note.tags.some(t => t.name === tag || t.name.startsWith(`${tag}/`))
    );
  }

  async getStats(tag?: string): Promise<TagStats> {
    this.logger.info(`Getting tag stats${tag ? ` for: ${tag}` : ''}`);
    
    const vault = await this.configManager.getActiveVault();
    const allNotes = await this.repository.list(vault.path, { recursive: true });
    
    const tagCounts = new Map<string, number>();
    
    for (const note of allNotes) {
      for (const noteTag of note.tags) {
        if (!tag || noteTag.name === tag || noteTag.name.startsWith(`${tag}/`)) {
          tagCounts.set(noteTag.name, (tagCounts.get(noteTag.name) || 0) + 1);
        }
      }
    }
    
    return {
      totalTags: tagCounts.size,
      tags: Array.from(tagCounts.entries()).map(([name, count]) => ({
        name,
        count,
        nested: name.includes('/'),
      })),
    };
  }
}