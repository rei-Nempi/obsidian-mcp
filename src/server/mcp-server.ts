import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { RequestHandler } from './request-handler';
import { ConfigManager } from '../config/config.manager';
import { NoteService } from '../core/services/note.service';
import { TagService } from '../core/services/tag.service';
import { SearchService } from '../core/services/search.service';
import { Logger } from '../utils/logger';

export class MCPServer {
  private server: Server;
  private transport: StdioServerTransport;
  private requestHandler!: RequestHandler;
  private logger: Logger;

  constructor(private configManager: ConfigManager) {
    this.logger = new Logger('MCPServer');
    this.server = new Server(
      {
        name: 'obsidian-mcp',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );
    
    this.transport = new StdioServerTransport();
    this.initializeServices();
  }

  private initializeServices(): void {
    const noteService = new NoteService(this.configManager);
    const tagService = new TagService(this.configManager);
    const searchService = new SearchService(this.configManager);
    
    this.requestHandler = new RequestHandler(
      noteService,
      tagService,
      searchService
    );
    
    this.setupHandlers();
  }

  private setupHandlers(): void {
    // MCP SDK will handle request routing internally
    // We'll handle tool registration through the RequestHandler
  }

  async start(): Promise<void> {
    await this.server.connect(this.transport);
    this.logger.info('MCP Server connected to transport');
  }

  async stop(): Promise<void> {
    await this.server.close();
    this.logger.info('MCP Server stopped');
  }
}