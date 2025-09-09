import { Note, SearchOptions, SearchResult } from '../../types/obsidian.types';
import { NoteRepository } from '../repositories/note.repository';
import { ConfigManager } from '../../config/config.manager';
import { Logger } from '../../utils/logger';

export class SearchService {
  private repository: NoteRepository;
  private logger: Logger;

  constructor(private configManager: ConfigManager) {
    this.repository = new NoteRepository(configManager);
    this.logger = new Logger('SearchService');
  }

  async search(query: string, options?: SearchOptions): Promise<SearchResult[]> {
    this.logger.info(`Searching for: ${query}`);
    
    const vault = await this.configManager.getActiveVault();
    const allNotes = await this.repository.list(vault.path, { recursive: true });
    
    const results: SearchResult[] = [];
    
    for (const note of allNotes) {
      const matches = this.findMatches(note, query, options);
      if (matches.length > 0) {
        results.push({
          note,
          matches,
          score: this.calculateScore(note, query, matches),
        });
      }
    }
    
    return results.sort((a, b) => b.score - a.score);
  }

  private findMatches(note: Note, query: string, options?: SearchOptions): string[] {
    const matches: string[] = [];
    const content = note.content;
    const caseSensitive = options?.caseSensitive || false;
    const regex = options?.regex || false;
    
    if (regex) {
      try {
        const pattern = new RegExp(query, caseSensitive ? 'g' : 'gi');
        const found = content.match(pattern);
        if (found) {
          matches.push(...found);
        }
      } catch (error) {
        this.logger.error('Invalid regex pattern', error);
      }
    } else {
      const searchContent = caseSensitive ? content : content.toLowerCase();
      const searchQuery = caseSensitive ? query : query.toLowerCase();
      
      let index = searchContent.indexOf(searchQuery);
      while (index !== -1) {
        const start = Math.max(0, index - 50);
        const end = Math.min(content.length, index + query.length + 50);
        matches.push(content.substring(start, end));
        index = searchContent.indexOf(searchQuery, index + 1);
      }
    }
    
    return matches;
  }

  private calculateScore(note: Note, query: string, matches: string[]): number {
    let score = matches.length * 10;
    
    if (note.title.toLowerCase().includes(query.toLowerCase())) {
      score += 50;
    }
    
    if (note.tags.some(tag => tag.name.toLowerCase().includes(query.toLowerCase()))) {
      score += 20;
    }
    
    const queryWords = query.toLowerCase().split(/\s+/);
    const titleWords = note.title.toLowerCase().split(/\s+/);
    const commonWords = queryWords.filter(word => titleWords.includes(word));
    score += commonWords.length * 5;
    
    return score;
  }
}