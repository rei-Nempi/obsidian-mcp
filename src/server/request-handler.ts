import { NoteService } from '../core/services/note.service';
import { TagService } from '../core/services/tag.service';
import { SearchService } from '../core/services/search.service';
import { Logger } from '../utils/logger';

export class RequestHandler {
  private logger: Logger;
  private tools!: Map<string, Function>;

  constructor(
    private noteService: NoteService,
    private tagService: TagService,
    private searchService: SearchService
  ) {
    this.logger = new Logger('RequestHandler');
    this.registerTools();
  }

  private registerTools(): void {
    this.tools = new Map<string, Function>([
      ['create_note', (args: any) => this.noteService.create(args)],
      ['read_note', (args: any) => this.noteService.read(args.path || args.identifier)],
      ['update_note', (args: any) => this.noteService.update(args.path, args.content, args.mode)],
      ['delete_note', (args: any) => this.noteService.delete(args.path, args.confirm)],
      ['list_notes', (args: any) => this.noteService.list(args.folder, args.options)],
      ['add_tags', (args: any) => this.tagService.add(args.tags, args.path)],
      ['remove_tags', (args: any) => this.tagService.remove(args.tags, args.path)],
      ['search_by_tag', (args: any) => this.tagService.search(args.tag)],
      ['search_notes', (args: any) => this.searchService.search(args.query, args.options)],
    ]);
  }

  async handle(request: any): Promise<any> {
    try {
      if (request.method === 'tools/list') {
        return this.handleListTools();
      }
      
      if (request.method === 'tools/call') {
        return this.handleCallTool(request.params);
      }
      
      throw new Error(`Unknown method: ${request.method}`);
    } catch (error) {
      this.logger.error('Request handling failed', error);
      throw error;
    }
  }

  private handleListTools(): any {
    return {
      tools: Array.from(this.tools.keys()).map(name => ({
        name,
        description: this.getToolDescription(name),
        inputSchema: this.getToolSchema(name),
      })),
    };
  }

  private async handleCallTool(params: any): Promise<any> {
    const { name, arguments: args } = params;
    
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Unknown tool: ${name}`);
    }
    
    return await tool(args);
  }

  private getToolDescription(name: string): string {
    const descriptions: Record<string, string> = {
      create_note: 'Create a new note in Obsidian vault',
      read_note: 'Read an existing note from Obsidian vault',
      update_note: 'Update an existing note in Obsidian vault',
      delete_note: 'Delete a note from Obsidian vault',
      list_notes: 'List notes in a folder',
      add_tags: 'Add tags to a note',
      remove_tags: 'Remove tags from a note',
      search_by_tag: 'Search notes by tag',
      search_notes: 'Search notes by content',
    };
    
    return descriptions[name] || 'No description available';
  }

  private getToolSchema(name: string): any {
    const schemas: Record<string, any> = {
      create_note: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          content: { type: 'string' },
          folder: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } },
        },
        required: ['title', 'content'],
      },
      read_note: {
        type: 'object',
        properties: {
          path: { type: 'string' },
        },
        required: ['path'],
      },
      update_note: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          content: { type: 'string' },
          mode: { type: 'string', enum: ['replace', 'append'] },
        },
        required: ['path', 'content'],
      },
      delete_note: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          confirm: { type: 'boolean' },
        },
        required: ['path'],
      },
      list_notes: {
        type: 'object',
        properties: {
          folder: { type: 'string' },
          recursive: { type: 'boolean' },
        },
      },
      add_tags: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } },
        },
        required: ['tags'],
      },
      remove_tags: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } },
        },
        required: ['tags'],
      },
      search_by_tag: {
        type: 'object',
        properties: {
          tag: { type: 'string' },
        },
        required: ['tag'],
      },
      search_notes: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          options: {
            type: 'object',
            properties: {
              caseSensitive: { type: 'boolean' },
              regex: { type: 'boolean' },
            },
          },
        },
        required: ['query'],
      },
    };
    
    return schemas[name] || {};
  }
}