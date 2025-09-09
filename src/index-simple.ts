#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { 
  CallToolRequestSchema, 
  ListToolsRequestSchema 
} from '@modelcontextprotocol/sdk/types.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

// Simple MCP Server for Obsidian
const server = new Server(
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

// Get vault path from config or environment
async function getVaultPath(): Promise<string> {
  const configPath = path.join(os.homedir(), '.obsidian-mcp', 'config.yaml');
  try {
    const config = await fs.readFile(configPath, 'utf-8');
    const match = config.match(/path:\s*"([^"]+)"/);
    if (match) {
      return match[1].replace('~', os.homedir());
    }
  } catch (error) {
    console.error('Config not found. Please run setup first.');
  }
  return path.join(os.homedir(), 'Documents', 'Obsidian');
}

// Tool definitions
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'create_note',
        description: 'Create a new note in Obsidian vault',
        inputSchema: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description: 'The title of the note',
            },
            content: {
              type: 'string',
              description: 'The content of the note',
            },
            folder: {
              type: 'string',
              description: 'The folder to create the note in',
            },
          },
          required: ['title', 'content'],
        },
      },
      {
        name: 'read_note',
        description: 'Read a note from Obsidian vault',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'The path to the note',
            },
          },
          required: ['path'],
        },
      },
      {
        name: 'list_notes',
        description: 'List notes in a folder',
        inputSchema: {
          type: 'object',
          properties: {
            folder: {
              type: 'string',
              description: 'The folder to list notes from',
            },
          },
        },
      },
    ],
  };
});

// Tool handlers
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const vaultPath = await getVaultPath();
  const { name, arguments: args } = request.params;

  switch (name) {
    case 'create_note': {
      const { title, content, folder = '' } = args as any;
      const notePath = path.join(vaultPath, folder, `${title}.md`);
      
      // Create directory if needed
      const dir = path.dirname(notePath);
      await fs.mkdir(dir, { recursive: true });
      
      // Write the note
      await fs.writeFile(notePath, content, 'utf-8');
      
      return {
        content: [
          {
            type: 'text',
            text: `Note created: ${notePath}`,
          },
        ],
      };
    }

    case 'read_note': {
      const { path: notePath } = args as any;
      const fullPath = path.isAbsolute(notePath) 
        ? notePath 
        : path.join(vaultPath, notePath.endsWith('.md') ? notePath : `${notePath}.md`);
      
      try {
        const content = await fs.readFile(fullPath, 'utf-8');
        return {
          content: [
            {
              type: 'text',
              text: content,
            },
          ],
        };
      } catch (error) {
        throw new Error(`Note not found: ${fullPath}`);
      }
    }

    case 'list_notes': {
      const { folder = '' } = args as any;
      const searchPath = path.join(vaultPath, folder);
      
      try {
        const files = await fs.readdir(searchPath);
        const mdFiles = files.filter(f => f.endsWith('.md'));
        
        return {
          content: [
            {
              type: 'text',
              text: mdFiles.join('\n'),
            },
          ],
        };
      } catch (error) {
        throw new Error(`Folder not found: ${searchPath}`);
      }
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('ObsidianMCP Server running...');
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});