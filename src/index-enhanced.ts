#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { 
  CallToolRequestSchema, 
  ListToolsRequestSchema 
} from '@modelcontextprotocol/sdk/types.js';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import * as os from 'os';
// import * as crypto from 'crypto'; // Reserved for future use
import { TemplaterPlugin, TemplaterVariable } from './plugins/templater';
import { BookSearchPlugin, BookMetadata } from './plugins/book-search';
import { TaskNotesPlugin, TaskMetadata } from './plugins/tasknotes';
import { VaultAnalyticsPlugin } from './plugins/vault-analytics';
import { AIAnalysisPlugin } from './plugins/ai-analysis';

// Full MCP Server for Obsidian with all features including plugins
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

// Store discovered vaults and selected vault
let discoveredVaults: string[] = [];
let selectedVault: string | null = null;

// Plugin instances
let templaterPlugin: TemplaterPlugin | null = null;
let bookSearchPlugin: BookSearchPlugin | null = null;
let taskNotesPlugin: TaskNotesPlugin | null = null;
let vaultAnalyticsPlugin: VaultAnalyticsPlugin | null = null;
let aiAnalysisPlugin: AIAnalysisPlugin | null = null;

// Store last book search results for easy selection
let lastBookSearchResults: BookMetadata[] = [];

// File locks for concurrent editing detection (reserved for future use)
// const fileLocks: Map<string, { timestamp: number; sessionId: string }> = new Map();
// const sessionId = crypto.randomBytes(16).toString('hex');

// Helper function to update Obsidian links in content
async function updateObsidianLinks(vaultPath: string, oldPath: string, newPath: string): Promise<number> {
  let updatedCount = 0;
  
  // Convert paths to link formats
  const oldLinkName = path.basename(oldPath, '.md');
  const newLinkName = path.basename(newPath, '.md');
  const oldRelativePath = oldPath.replace(/\.md$/, '');
  const newRelativePath = newPath.replace(/\.md$/, '');
  
  // Function to recursively find and update links in all markdown files
  async function updateLinksInDir(dir: string): Promise<void> {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          await updateLinksInDir(fullPath);
        } else if (entry.isFile() && entry.name.endsWith('.md') && fullPath !== path.join(vaultPath, newPath)) {
          try {
            const content = await fs.readFile(fullPath, 'utf-8');
            let modified = false;
            let newContent = content;
            
            // Update wiki-style links [[note]] and [[note|alias]]
            const wikiLinkRegex = new RegExp(`\\[\\[${oldLinkName}(\\|[^\\]]*)?\\]\\]`, 'g');
            if (wikiLinkRegex.test(content)) {
              newContent = newContent.replace(wikiLinkRegex, (match, alias) => {
                modified = true;
                return `[[${newLinkName}${alias || ''}]]`;
              });
            }
            
            // Update relative path links [[folder/note]]
            const pathLinkRegex = new RegExp(`\\[\\[${oldRelativePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\|[^\\]]*)?\\]\\]`, 'g');
            if (pathLinkRegex.test(content)) {
              newContent = newContent.replace(pathLinkRegex, (match, alias) => {
                modified = true;
                return `[[${newRelativePath}${alias || ''}]]`;
              });
            }
            
            // Update markdown-style links [text](note.md)
            const markdownLinkRegex = new RegExp(`\\]\\(${oldPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)`, 'g');
            if (markdownLinkRegex.test(content)) {
              newContent = newContent.replace(markdownLinkRegex, `](${newPath})`);
              modified = true;
            }
            
            if (modified) {
              await fs.writeFile(fullPath, newContent, 'utf-8');
              updatedCount++;
            }
          } catch (error) {
            // Skip files that can't be read/written
          }
        }
      }
    } catch (error) {
      // Skip directories that can't be accessed
    }
  }
  
  await updateLinksInDir(vaultPath);
  return updatedCount;
}

// Helper function to parse frontmatter
function parseFrontmatter(content: string): { metadata: any; body: string } {
  const frontmatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);
  
  if (match) {
    const yamlContent = match[1];
    const body = match[2];
    const metadata: any = {};
    
    // Simple YAML parser for basic key-value pairs
    yamlContent.split('\n').forEach(line => {
      const kvMatch = line.match(/^(\w+):\s*(.*)$/);
      if (kvMatch) {
        const [, key, value] = kvMatch;
        // Parse arrays
        if (value.startsWith('[') && value.endsWith(']')) {
          metadata[key] = value.slice(1, -1).split(',').map(v => v.trim());
        } else {
          metadata[key] = value;
        }
      }
    });
    
    return { metadata, body };
  }
  
  return { metadata: {}, body: content };
}

// Helper function to create frontmatter
function createFrontmatter(metadata: any): string {
  if (!metadata || Object.keys(metadata).length === 0) {
    return '';
  }
  
  let frontmatter = '---\n';
  for (const [key, value] of Object.entries(metadata)) {
    if (Array.isArray(value)) {
      frontmatter += `${key}: [${value.join(', ')}]\n`;
    } else {
      frontmatter += `${key}: ${value}\n`;
    }
  }
  frontmatter += '---\n\n';
  
  return frontmatter;
}

// Initialize plugins
async function initializePlugins(): Promise<void> {
  if (!selectedVault) return;
  
  // Initialize Templater plugin
  templaterPlugin = new TemplaterPlugin(selectedVault);
  
  // Initialize Book Search plugin (with optional Google Books API key from env)
  const googleApiKey = process.env.GOOGLE_BOOKS_API_KEY;
  bookSearchPlugin = new BookSearchPlugin(googleApiKey);
  
  // Initialize TaskNotes plugin
  taskNotesPlugin = new TaskNotesPlugin(selectedVault);
  
  // Initialize Vault Analytics plugin
  vaultAnalyticsPlugin = new VaultAnalyticsPlugin(selectedVault);
  
  // Initialize AI Analysis plugin
  aiAnalysisPlugin = new AIAnalysisPlugin(selectedVault);
}

// Check if plugins are available
async function checkPluginAvailability(): Promise<{ templater: boolean; bookSearch: boolean }> {
  if (!selectedVault) {
    return { templater: false, bookSearch: false };
  }
  
  // Check for Templater templates folder
  const templaterAvailable = await fs.access(path.join(selectedVault, 'Templates'))
    .then(() => true)
    .catch(() => false);
  
  // Book Search is always available (uses public APIs)
  const bookSearchAvailable = true;
  
  return { templater: templaterAvailable, bookSearch: bookSearchAvailable };
}

// Find all Obsidian vaults
async function findVaults(): Promise<string[]> {
  const vaults: string[] = [];
  
  // Check environment variable first
  const envVault = process.env.OBSIDIAN_VAULT_PATH;
  if (envVault) {
    const expandedPath = envVault.replace('~', os.homedir());
    if (await isValidVault(expandedPath)) {
      vaults.push(expandedPath);
    }
  }
  
  const searchPaths = [
    path.join(os.homedir(), 'Documents'),
    path.join(os.homedir(), 'Desktop'),
    path.join(os.homedir(), 'Obsidian'),
    path.join(os.homedir(), 'Library', 'Mobile Documents', 'iCloud~md~obsidian', 'Documents'), // iCloud
  ];

  for (const searchPath of searchPaths) {
    try {
      await scanForVaults(searchPath, vaults, 0, 3);
    } catch (error) {
      // Ignore errors for non-existent paths
    }
  }

  return vaults;
}

async function isValidVault(vaultPath: string): Promise<boolean> {
  try {
    const stats = await fs.stat(vaultPath);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

async function scanForVaults(dir: string, vaults: string[], depth: number, maxDepth: number): Promise<void> {
  if (depth > maxDepth) return;

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    
    // Check if this directory contains .obsidian folder
    if (entries.some(e => e.name === '.obsidian' && e.isDirectory())) {
      vaults.push(dir);
      return; // Don't scan subdirectories of a vault
    }

    // Recursively scan subdirectories
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        await scanForVaults(path.join(dir, entry.name), vaults, depth + 1, maxDepth);
      }
    }
  } catch (error) {
    // Ignore permission errors
  }
}

// Tool definitions
server.setRequestHandler(ListToolsRequestSchema, async () => {
  const pluginStatus = await checkPluginAvailability();
  
  const tools = [
    {
      name: 'list_vaults',
      description: 'List all discovered Obsidian vaults on the system',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'select_vault',
      description: 'Select a specific vault to work with',
      inputSchema: {
        type: 'object',
        properties: {
          vault_path: {
            type: 'string',
            description: 'The path to the vault to select',
          },
        },
        required: ['vault_path'],
      },
    },
    {
      name: 'create_note',
      description: 'Create a new note with optional frontmatter',
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
          metadata: {
            type: 'object',
            description: 'Frontmatter metadata (tags, date, etc)',
          },
        },
        required: ['title', 'content'],
      },
    },
    {
      name: 'delete_note',
      description: 'Delete a note from the vault',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path to the note file (relative to vault root)',
          },
          title: {
            type: 'string',
            description: 'Title of the note (alternative to path)',
          },
          folder: {
            type: 'string',
            description: 'Folder containing the note (used with title)',
          },
          confirm: {
            type: 'boolean',
            description: 'Skip confirmation prompt',
            default: false,
          },
          trash: {
            type: 'boolean',
            description: 'Move to .trash folder instead of permanent deletion',
            default: true,
          },
        },
      },
    },
    {
      name: 'read_note',
      description: 'Read the content of a note',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path to the note file (relative to vault root)',
          },
          title: {
            type: 'string',
            description: 'Title of the note (alternative to path)',
          },
          folder: {
            type: 'string',
            description: 'Folder containing the note (used with title)',
          },
        },
      },
    },
    {
      name: 'update_note',
      description: 'Update the content of an existing note',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path to the note file (relative to vault root)',
          },
          title: {
            type: 'string',
            description: 'Title of the note (alternative to path)',
          },
          folder: {
            type: 'string',
            description: 'Folder containing the note (used with title)',
          },
          content: {
            type: 'string',
            description: 'New content for the note',
          },
          append: {
            type: 'boolean',
            description: 'Append to existing content instead of replacing',
            default: false,
          },
          metadata: {
            type: 'object',
            description: 'Update frontmatter metadata',
          },
        },
        required: ['content'],
      },
    },
    {
      name: 'list_notes',
      description: 'List notes in a folder or entire vault',
      inputSchema: {
        type: 'object',
        properties: {
          folder: {
            type: 'string',
            description: 'Folder to list notes from (empty for entire vault)',
          },
          recursive: {
            type: 'boolean',
            description: 'Include notes from subfolders',
            default: true,
          },
        },
      },
    },
    {
      name: 'search_notes',
      description: 'Search notes by content, with optional folder and tag filtering',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search query to look for in note content',
          },
          folder: {
            type: 'string',
            description: 'Folder to search in (optional)',
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Tags to filter by (optional)',
          },
          recursive: {
            type: 'boolean',
            description: 'Include subfolders in search',
          },
        },
        required: ['query'],
      } as any,
    },
    {
      name: 'get_all_tags',
      description: 'Get all tags used in the vault with their frequency',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'search_by_tag',
      description: 'Find all notes that contain a specific tag',
      inputSchema: {
        type: 'object',
        properties: {
          tag: {
            type: 'string',
            description: 'Tag to search for',
          },
          folder: {
            type: 'string',
            description: 'Folder to search in (optional)',
          },
        },
        required: ['tag'],
      } as any,
    },
    {
      name: 'add_tag_to_note',
      description: 'Add tags to an existing note',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path to the note file',
          },
          title: {
            type: 'string',
            description: 'Title of the note (alternative to path)',
          },
          folder: {
            type: 'string',
            description: 'Folder containing the note (used with title)',
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Tags to add to the note',
          },
        },
        required: ['tags'],
      } as any,
    },
    {
      name: 'move_note',
      description: 'Move a note to a different folder with safety checks and link updates',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Current path to the note file',
          },
          title: {
            type: 'string',
            description: 'Title of the note (alternative to path)',
          },
          folder: {
            type: 'string',
            description: 'Current folder containing the note (used with title)',
          },
          to_folder: {
            type: 'string',
            description: 'Destination folder path',
          },
          rename: {
            type: 'string',
            description: 'New name for the note (optional)',
          },
          update_links: {
            type: 'boolean',
            description: 'Update Obsidian links in other notes',
          },
          confirm: {
            type: 'boolean',
            description: 'Skip confirmation prompt',
          },
        },
        required: ['to_folder'],
      } as any,
    },
    {
      name: 'bulk_move_notes',
      description: 'Move multiple notes with batch link updates',
      inputSchema: {
        type: 'object',
        properties: {
          moves: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                from: { type: 'string' },
                to: { type: 'string' },
              },
              required: ['from', 'to'],
            },
            description: 'Array of move operations {from: path, to: path}',
          },
          update_links: {
            type: 'boolean',
            description: 'Update Obsidian links in other notes',
          },
          confirm: {
            type: 'boolean',
            description: 'Skip confirmation prompt',
          },
        },
        required: ['moves'],
      } as any,
    },
    {
      name: 'move_folder',
      description: 'Move an entire folder with all contents and update links',
      inputSchema: {
        type: 'object',
        properties: {
          from_folder: {
            type: 'string',
            description: 'Source folder path',
          },
          to_folder: {
            type: 'string',
            description: 'Destination folder path',
          },
          update_links: {
            type: 'boolean',
            description: 'Update Obsidian links in other notes',
          },
          confirm: {
            type: 'boolean',
            description: 'Skip confirmation prompt',
          },
        },
        required: ['from_folder', 'to_folder'],
      } as any,
    },
    {
      name: 'create_task',
      description: 'Create a new task with metadata and time tracking capabilities',
      inputSchema: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'Task title',
          },
          content: {
            type: 'string',
            description: 'Task description/content',
          },
          status: {
            type: 'string',
            enum: ['todo', 'in-progress', 'waiting', 'done', 'cancelled'],
            description: 'Task status',
            default: 'todo',
          },
          priority: {
            type: 'string',
            enum: ['low', 'medium', 'high', 'urgent'],
            description: 'Task priority',
            default: 'medium',
          },
          due: {
            type: 'string',
            description: 'Due date (ISO format: YYYY-MM-DD)',
          },
          project: {
            type: 'string',
            description: 'Project name',
          },
          assignee: {
            type: 'string',
            description: 'Assignee name',
          },
          estimate: {
            type: 'number',
            description: 'Estimated time in minutes',
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Task tags',
          },
          dependencies: {
            type: 'array',
            items: { type: 'string' },
            description: 'Dependent task titles or IDs',
          },
        },
        required: ['title'],
      } as any,
    },
    {
      name: 'list_tasks',
      description: 'List tasks with optional filtering',
      inputSchema: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['todo', 'in-progress', 'waiting', 'done', 'cancelled'],
            description: 'Filter by status',
          },
          project: {
            type: 'string',
            description: 'Filter by project',
          },
          priority: {
            type: 'string',
            enum: ['low', 'medium', 'high', 'urgent'],
            description: 'Filter by priority',
          },
          assignee: {
            type: 'string',
            description: 'Filter by assignee',
          },
          due_before: {
            type: 'string',
            description: 'Filter tasks due before date (ISO format)',
          },
          due_after: {
            type: 'string',
            description: 'Filter tasks due after date (ISO format)',
          },
        },
      } as any,
    },
    {
      name: 'read_task',
      description: 'Read a specific task',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path to task file (relative to vault)',
          },
        },
        required: ['path'],
      } as any,
    },
    {
      name: 'update_task_status',
      description: 'Update task status',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path to task file',
          },
          status: {
            type: 'string',
            enum: ['todo', 'in-progress', 'waiting', 'done', 'cancelled'],
            description: 'New status',
          },
        },
        required: ['path', 'status'],
      } as any,
    },
    {
      name: 'update_task_metadata',
      description: 'Update task metadata (title, priority, due date, etc.)',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path to task file',
          },
          title: {
            type: 'string',
            description: 'New task title',
          },
          priority: {
            type: 'string',
            enum: ['low', 'medium', 'high', 'urgent'],
            description: 'New priority',
          },
          due: {
            type: 'string',
            description: 'New due date (ISO format)',
          },
          project: {
            type: 'string',
            description: 'New project name',
          },
          assignee: {
            type: 'string',
            description: 'New assignee',
          },
          estimate: {
            type: 'number',
            description: 'New time estimate in minutes',
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'New tags list',
          },
        },
        required: ['path'],
      } as any,
    },
    {
      name: 'start_task_timer',
      description: 'Start time tracking for a task',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path to task file',
          },
          description: {
            type: 'string',
            description: 'Optional description for this work session',
          },
        },
        required: ['path'],
      } as any,
    },
    {
      name: 'stop_task_timer',
      description: 'Stop time tracking for a task',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path to task file',
          },
        },
        required: ['path'],
      } as any,
    },
    {
      name: 'get_task_stats',
      description: 'Get task statistics and analytics',
      inputSchema: {
        type: 'object',
        properties: {},
      } as any,
    },
    {
      name: 'get_overdue_tasks',
      description: 'Get list of overdue tasks',
      inputSchema: {
        type: 'object',
        properties: {},
      } as any,
    },
    {
      name: 'get_tasks_by_project',
      description: 'Get tasks grouped by project',
      inputSchema: {
        type: 'object',
        properties: {},
      } as any,
    },
    {
      name: 'analyze_vault_structure',
      description: 'Analyze vault folder structure and statistics',
      inputSchema: {
        type: 'object',
        properties: {},
      } as any,
    },
    {
      name: 'get_writing_stats',
      description: 'Get comprehensive writing statistics for the vault',
      inputSchema: {
        type: 'object',
        properties: {},
      } as any,
    },
    {
      name: 'find_orphan_notes',
      description: 'Find notes with no incoming or outgoing links',
      inputSchema: {
        type: 'object',
        properties: {},
      } as any,
    },
    {
      name: 'get_link_graph',
      description: 'Generate link relationship graph data for visualization',
      inputSchema: {
        type: 'object',
        properties: {},
      } as any,
    },
    {
      name: 'create_custom_template',
      description: 'Create and save a custom template',
      inputSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Template name',
          },
          content: {
            type: 'string',
            description: 'Template content with Templater syntax',
          },
          description: {
            type: 'string',
            description: 'Template description',
          },
          category: {
            type: 'string',
            description: 'Template category',
            default: 'custom',
          },
          save_folder: {
            type: 'string',
            description: 'Custom folder path to save template (relative to vault root, defaults to Templates/)',
          },
        },
        required: ['name', 'content'],
      } as any,
    },
    {
      name: 'list_available_templates',
      description: 'List all available templates with metadata',
      inputSchema: {
        type: 'object',
        properties: {},
      } as any,
    },
    {
      name: 'apply_template_to_note',
      description: 'Apply template to existing note',
      inputSchema: {
        type: 'object',
        properties: {
          template_name: {
            type: 'string',
            description: 'Name of template to apply',
          },
          note_path: {
            type: 'string',
            description: 'Path to target note',
          },
          mode: {
            type: 'string',
            enum: ['replace', 'prepend', 'append'],
            description: 'How to apply template',
            default: 'replace',
          },
        },
        required: ['template_name', 'note_path'],
      } as any,
    },
    {
      name: 'summarize_note',
      description: 'Generate AI-powered summary of note content',
      inputSchema: {
        type: 'object',
        properties: {
          note_path: {
            type: 'string',
            description: 'Path to note to summarize',
          },
          max_length: {
            type: 'number',
            description: 'Maximum summary length in characters',
            default: 200,
          },
        },
        required: ['note_path'],
      } as any,
    },
    {
      name: 'generate_note_outline',
      description: 'Generate structured outline for note content',
      inputSchema: {
        type: 'object',
        properties: {
          note_path: {
            type: 'string',
            description: 'Path to note to outline',
          },
        },
        required: ['note_path'],
      } as any,
    },
    {
      name: 'suggest_tags',
      description: 'AI-powered tag suggestions based on content',
      inputSchema: {
        type: 'object',
        properties: {
          note_path: {
            type: 'string',
            description: 'Path to note for tag suggestions',
          },
          max_tags: {
            type: 'number',
            description: 'Maximum number of tags to suggest',
            default: 8,
          },
        },
        required: ['note_path'],
      } as any,
    },
    {
      name: 'create_daily_note',
      description: 'Create daily note with template selection prompt',
      inputSchema: {
        type: 'object',
        properties: {
          date: {
            type: 'string',
            description: 'Date for daily note (YYYY-MM-DD format, defaults to today)',
          },
          template_name: {
            type: 'string',
            description: 'Optional template to use',
          },
          force_create: {
            type: 'boolean',
            description: 'Skip template selection prompt',
            default: false,
          },
        },
      } as any,
    },
    {
      name: 'create_weekly_note',
      description: 'Create weekly note with template selection prompt',
      inputSchema: {
        type: 'object',
        properties: {
          week_start: {
            type: 'string',
            description: 'Start date of week (YYYY-MM-DD format)',
          },
          template_name: {
            type: 'string',
            description: 'Optional template to use',
          },
          force_create: {
            type: 'boolean',
            description: 'Skip template selection prompt',
            default: false,
          },
        },
      } as any,
    },
    {
      name: 'get_notes_by_date_range',
      description: 'Get notes created within specified date range',
      inputSchema: {
        type: 'object',
        properties: {
          start_date: {
            type: 'string',
            description: 'Start date (YYYY-MM-DD)',
          },
          end_date: {
            type: 'string',
            description: 'End date (YYYY-MM-DD)',
          },
          date_field: {
            type: 'string',
            description: 'Date field to search by: created, modified, or filename',
            default: 'modified',
          },
          include_content: {
            type: 'boolean',
            description: 'Include note content in results',
            default: false,
          },
          sort_by: {
            type: 'string',
            description: 'Sort results by: date, name, size',
            default: 'date',
          },
          folder_filter: {
            type: 'string',
            description: 'Filter by specific folder (optional)',
          },
        },
        required: ['start_date', 'end_date'],
      } as any,
    },
    {
      name: 'validate_broken_links',
      description: 'Validate and repair broken links in the vault',
      inputSchema: {
        type: 'object',
        properties: {
          fix_links: {
            type: 'boolean',
            description: 'Automatically fix broken links when possible',
            default: false,
          },
          scan_folder: {
            type: 'string',
            description: 'Specific folder to scan (optional)',
          },
          link_types: {
            type: 'array',
            description: 'Link types to check: wiki, markdown, or both',
            items: {
              type: 'string',
            },
            default: ['wiki', 'markdown'],
          },
          create_report: {
            type: 'boolean',
            description: 'Create a detailed report of broken links',
            default: true,
          },
        },
        required: [],
      } as any,
    },
  ];
  
  // Add Templater tools if available
  if (pluginStatus.templater) {
    tools.push(
      {
        name: 'list_templates',
        description: 'List available Templater templates',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'create_from_template',
        description: 'Create a note from a Templater template',
        inputSchema: {
          type: 'object',
          properties: {
            template_name: {
              type: 'string',
              description: 'Name of the template to use',
            },
            title: {
              type: 'string',
              description: 'Title for the new note',
            },
            folder: {
              type: 'string',
              description: 'Folder to create the note in',
            },
            variables: {
              type: 'array',
              description: 'Custom variables for the template',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  value: { type: 'string' },
                },
              },
            },
          },
          required: ['template_name', 'title'],
        } as any,
      },
      {
        name: 'process_template',
        description: 'Process a template string with Templater syntax',
        inputSchema: {
          type: 'object',
          properties: {
            template: {
              type: 'string',
              description: 'Template string with Templater syntax',
            },
            variables: {
              type: 'array',
              description: 'Variables to replace in the template',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  value: { type: 'string' },
                },
              },
            },
          },
          required: ['template'],
        } as any,
      }
    );
  }
  
  // Add Book Search tools if available
  if (pluginStatus.bookSearch) {
    tools.push(
      {
        name: 'search_book_by_isbn',
        description: 'Search for a book by ISBN',
        inputSchema: {
          type: 'object',
          properties: {
            isbn: {
              type: 'string',
              description: 'ISBN-10 or ISBN-13',
            },
            create_note: {
              type: 'boolean',
              description: 'Create a note for the book',
            },
            template: {
              type: 'string',
              description: 'Template name for the book note',
            },
            folder: {
              type: 'string',
              description: 'Folder for the book note',
            },
          },
          required: ['isbn'],
        } as any,
      },
      {
        name: 'search_book_by_title',
        description: 'Search for books by title and optionally author',
        inputSchema: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description: 'Book title to search for',
            },
            author: {
              type: 'string',
              description: 'Author name (optional)',
            },
            max_results: {
              type: 'number',
              description: 'Maximum number of results',
            },
          },
          required: ['title'],
        } as any,
      },
      {
        name: 'create_book_note',
        description: 'Create a note from book metadata or search result',
        inputSchema: {
          type: 'object',
          properties: {
            book_data: {
              type: 'object',
              description: 'Book metadata object (from search results)',
            },
            option_number: {
              type: 'number',
              description: 'Option number from previous search (1-5)',
            },
            template: {
              type: 'string',
              description: 'Template to use for the note',
            },
            folder: {
              type: 'string',
              description: 'Folder for the note',
            },
          },
        } as any,
      }
    );
  }
  
  return { tools };
});

// Tool handlers
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case 'list_vaults': {
      discoveredVaults = await findVaults();
      
      if (discoveredVaults.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: 'No Obsidian vaults found. Please create a vault first.',
            },
          ],
        };
      }
      
      const vaultList = discoveredVaults.map((v, i) => `${i + 1}. ${v}`).join('\n');
      return {
        content: [
          {
            type: 'text',
            text: `Found ${discoveredVaults.length} Obsidian vault(s):\n\n${vaultList}\n\nUse 'select_vault' with the vault path to select one.`,
          },
        ],
      };
    }

    case 'select_vault': {
      const { vault_path } = args as any;
      
      // Validate vault exists
      try {
        const stats = await fs.stat(vault_path);
        if (!stats.isDirectory()) {
          throw new Error('Not a directory');
        }
        
        selectedVault = vault_path;
        await initializePlugins();
        
        const pluginStatus = await checkPluginAvailability();
        
        return {
          content: [
            {
              type: 'text',
              text: `Vault selected: ${vault_path}\n\nVault name: ${path.basename(vault_path)}\n\nPlugins available:\n- Templater: ${pluginStatus.templater ? '✅' : '❌'}\n- Book Search: ${pluginStatus.bookSearch ? '✅' : '❌'}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: Could not access vault at ${vault_path}`,
            },
          ],
        };
      }
    }

    case 'list_templates': {
      if (!selectedVault || !templaterPlugin) {
        return {
          content: [
            {
              type: 'text',
              text: 'No vault selected or Templater not available.',
            },
          ],
        };
      }
      
      const templates = await templaterPlugin.listTemplates();
      
      if (templates.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: 'No templates found in the Templates folder.',
            },
          ],
        };
      }
      
      let result = `Found ${templates.length} template(s):\n\n`;
      templates.forEach(t => {
        result += `📝 ${t.name}`;
        if (t.description) {
          result += ` - ${t.description}`;
        }
        result += '\n';
      });
      
      return {
        content: [
          {
            type: 'text',
            text: result,
          },
        ],
      };
    }

    case 'create_from_template': {
      if (!selectedVault || !templaterPlugin) {
        return {
          content: [
            {
              type: 'text',
              text: 'No vault selected or Templater not available.',
            },
          ],
        };
      }
      
      const { template_name, title, folder = '', variables = [] } = args as any;
      const notePath = path.join(folder, `${title}.md`);
      
      const templaterVars: TemplaterVariable[] = variables.map((v: any) => ({
        name: v.name,
        value: v.value,
      }));
      
      const result = await templaterPlugin.createNoteFromTemplate(
        template_name,
        notePath,
        templaterVars
      );
      
      if (result.success) {
        return {
          content: [
            {
              type: 'text',
              text: `Note created from template!\n\nTemplate: ${template_name}\nPath: ${result.path}`,
            },
          ],
        };
      } else {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${result.error}`,
            },
          ],
        };
      }
    }

    case 'process_template': {
      if (!selectedVault || !templaterPlugin) {
        return {
          content: [
            {
              type: 'text',
              text: 'No vault selected or Templater not available.',
            },
          ],
        };
      }
      
      const { template, variables = [] } = args as any;
      
      const templaterVars: TemplaterVariable[] = variables.map((v: any) => ({
        name: v.name,
        value: v.value,
      }));
      
      const processed = templaterPlugin.processTemplate(template, templaterVars);
      
      return {
        content: [
          {
            type: 'text',
            text: processed,
          },
        ],
      };
    }

    case 'search_book_by_isbn': {
      if (!bookSearchPlugin) {
        return {
          content: [
            {
              type: 'text',
              text: 'Book Search plugin not available.',
            },
          ],
        };
      }
      
      const { isbn, create_note = false, template, folder = 'Books' } = args as any;
      
      // First try exact ISBN search
      let book = await bookSearchPlugin.searchByISBN(isbn);
      
      if (!book) {
        // If ISBN search fails, try title search with the ISBN (sometimes books are listed differently)
        const alternativeResults = await bookSearchPlugin.searchByTitle(isbn);
        
        if (alternativeResults.length > 0) {
          // Show up to 5 alternatives
          const limitedResults = alternativeResults.slice(0, 5);
          let result = `Direct ISBN search failed, but found ${limitedResults.length} possible match(es):\n\n`;
          
          // Store results for easy selection
          lastBookSearchResults = limitedResults;
          
          limitedResults.forEach((b, index) => {
            result += `## 📚 Option ${index + 1}: ${b.title}\n`;
            result += `- **Author**: ${b.author.join(', ')}\n`;
            if (b.isbn && b.isbn !== isbn) result += `- **ISBN**: ${b.isbn}\n`;
            if (b.publishedDate) result += `- **Published**: ${b.publishedDate}\n`;
            if (b.publisher) result += `- **Publisher**: ${b.publisher}\n`;
            if (b.pageCount) result += `- **Pages**: ${b.pageCount}\n`;
            if (b.rating) result += `- **Rating**: ${b.rating}/5\n`;
            result += '\n';
          });
          
          result += `\n💡 **To create a note**: Use 'create_book_note' with option_number: 1-${limitedResults.length}`;
          
          return {
            content: [
              {
                type: 'text',
                text: result,
              },
            ],
          };
        }
        
        return {
          content: [
            {
              type: 'text',
              text: `No book found with ISBN: ${isbn}`,
            },
          ],
        };
      }
      
      let result = `Found book:\n\n${bookSearchPlugin.formatAsMarkdown(book)}`;
      
      if (create_note && selectedVault) {
        const noteTitle = `${book.title} - ${book.author.join(', ')}`;
        const notePath = path.join(selectedVault, folder, `${noteTitle}.md`);
        
        let content: string;
        if (template && templaterPlugin) {
          const templateContent = await templaterPlugin.getTemplate(template);
          if (templateContent) {
            content = bookSearchPlugin.formatAsMarkdown(book, templateContent);
          } else {
            content = bookSearchPlugin.formatAsMarkdown(book);
          }
        } else {
          content = bookSearchPlugin.formatAsMarkdown(book);
        }
        
        // Add metadata
        const metadata = {
          tags: ['book', 'reading'],
          isbn: book.isbn,
          author: book.author,
          rating: book.rating,
          created: new Date().toISOString(),
        };
        
        const fullContent = createFrontmatter(metadata) + content;
        
        await fs.mkdir(path.dirname(notePath), { recursive: true });
        await fs.writeFile(notePath, fullContent, 'utf-8');
        
        result += `\n\nNote created at: ${path.relative(selectedVault, notePath)}`;
      }
      
      return {
        content: [
          {
            type: 'text',
            text: result,
          },
        ],
      };
    }

    case 'search_book_by_title': {
      if (!bookSearchPlugin) {
        return {
          content: [
            {
              type: 'text',
              text: 'Book Search plugin not available.',
            },
          ],
        };
      }
      
      const { title, author, max_results = 5 } = args as any;
      
      const books = await bookSearchPlugin.searchByTitle(title, author);
      
      if (books.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: `No books found for: ${title}${author ? ` by ${author}` : ''}`,
            },
          ],
        };
      }
      
      const limitedBooks = books.slice(0, Math.min(max_results, 5));
      
      // Store results for easy selection
      lastBookSearchResults = limitedBooks;
      
      let result = `Found ${books.length} book(s), showing top ${limitedBooks.length}:\n\n`;
      
      limitedBooks.forEach((book, index) => {
        result += `## 📚 Option ${index + 1}: ${book.title}\n`;
        result += `- **Author(s)**: ${book.author.join(', ')}\n`;
        if (book.isbn) result += `- **ISBN**: ${book.isbn}\n`;
        if (book.publishedDate) result += `- **Published**: ${book.publishedDate}\n`;
        if (book.publisher) result += `- **Publisher**: ${book.publisher}\n`;
        if (book.pageCount) result += `- **Pages**: ${book.pageCount}\n`;
        if (book.categories && book.categories.length > 0) {
          result += `- **Categories**: ${book.categories.slice(0, 3).join(', ')}\n`;
        }
        if (book.rating) result += `- **Rating**: ⭐ ${book.rating}/5\n`;
        if (book.description) {
          const shortDesc = book.description.length > 200 
            ? book.description.substring(0, 200) + '...' 
            : book.description;
          result += `- **Description**: ${shortDesc}\n`;
        }
        result += '\n';
      });
      
      result += `---\n\n`;
      result += `💡 **Next Steps:**\n`;
      result += `1. To create a note: Use 'create_book_note' with **option_number: 1-${limitedBooks.length}**\n`;
      result += `   Example: create_book_note(option_number: 1)\n`;
      result += `2. To search by ISBN for more accurate results, use 'search_book_by_isbn'\n`;
      result += `3. To refine your search, try adding the author name or being more specific\n`;
      
      if (books.length > max_results) {
        result += `\n📊 *Showing ${limitedBooks.length} of ${books.length} total results. Adjust max_results parameter to see more.*`;
      }
      
      return {
        content: [
          {
            type: 'text',
            text: result,
          },
        ],
      };
    }

    case 'create_book_note': {
      if (!selectedVault || !bookSearchPlugin) {
        return {
          content: [
            {
              type: 'text',
              text: 'No vault selected or Book Search not available.',
            },
          ],
        };
      }
      
      const { book_data, option_number, template, folder = 'Books' } = args as any;
      
      // Check if template is specified and templater is available
      if (templaterPlugin) {
        const templates = await templaterPlugin.listTemplates();
        
        if (template) {
          // Verify specified template exists
          const templateExists = templates.some(t => 
            t.name.toLowerCase() === template.toLowerCase() || 
            t.name.toLowerCase() === `${template.toLowerCase()}.md`
          );
          
          if (!templateExists) {
            const availableTemplates = templates.map(t => t.name).join('\n- ');
            return {
              content: [
                {
                  type: 'text',
                  text: `Template '${template}' not found.\n\nAvailable templates:\n- ${availableTemplates}\n\nPlease use one of the available templates or create the template first.`,
                },
              ],
            };
          }
        } else if (templates.length > 0) {
          // No template specified but templates are available - prompt user to select
          const templateList = templates.map((t, index) => `${index + 1}. ${t.name}`).join('\n');
          return {
            content: [
              {
                type: 'text',
                text: `テンプレートが指定されていません。保管庫内で利用可能なテンプレートから選択してください:\n\n${templateList}\n\nテンプレートを使用する場合は、template パラメータを指定して再実行してください。\n例: create_book_note(option_number: ${option_number || 1}, template: "Book Review")\n\nテンプレートを使用せずにデフォルト形式で作成する場合は、template: "none" を指定してください。`,
              },
            ],
          };
        }
      }
      
      let book: BookMetadata;
      
      // Check if using option_number from last search
      if (option_number && !book_data) {
        if (lastBookSearchResults.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: 'No recent search results. Please search for a book first.',
              },
            ],
          };
        }
        
        const index = option_number - 1;
        if (index < 0 || index >= lastBookSearchResults.length) {
          return {
            content: [
              {
                type: 'text',
                text: `Invalid option number. Please choose between 1 and ${lastBookSearchResults.length}`,
              },
            ],
          };
        }
        
        book = lastBookSearchResults[index];
      } else if (book_data) {
        book = book_data as BookMetadata;
      } else {
        return {
          content: [
            {
              type: 'text',
              text: 'Please provide either book_data or option_number from a previous search.',
            },
          ],
        };
      }
      
      const noteTitle = `${book.title} - ${book.author.join(', ')}`;
      const notePath = path.join(selectedVault, folder, `${noteTitle}.md`);
      
      let content: string;
      let useDefaultFormat = true;
      
      if (template && template.toLowerCase() !== 'none' && templaterPlugin) {
        const templateContent = await templaterPlugin.getTemplate(template);
        if (templateContent) {
          // Use template format ONLY - no additional formatting
          content = bookSearchPlugin.formatAsMarkdown(book, templateContent);
          useDefaultFormat = false;
        }
      }
      
      if (useDefaultFormat) {
        // Only use default format if no template is specified, template is "none", or template not found
        if (template && template.toLowerCase() !== 'none') {
          return {
            content: [
              {
                type: 'text',
                text: `Template '${template}' was specified but no template content found. Please create the template first or use 'list_templates' to see available templates.`,
              },
            ],
          };
        }
        content = bookSearchPlugin.formatAsMarkdown(book);
        
        // Add metadata only for default format
        const metadata = {
          tags: ['book', 'reading'],
          isbn: book.isbn,
          author: book.author,
          rating: book.rating,
          created: new Date().toISOString(),
        };
        content = createFrontmatter(metadata) + content;
      }
      
      const fullContent = content;
      
      await fs.mkdir(path.dirname(notePath), { recursive: true });
      await fs.writeFile(notePath, fullContent, 'utf-8');
      
      return {
        content: [
          {
            type: 'text',
            text: `Book note created${template ? ` using template '${template}'` : ''}!\n\nTitle: ${book.title}\nPath: ${path.relative(selectedVault, notePath)}`,
          },
        ],
      };
    }

    case 'create_note': {
      if (!selectedVault) {
        return {
          content: [
            {
              type: 'text',
              text: 'No vault selected. Please use "list_vaults" and then "select_vault" first.',
            },
          ],
        };
      }
      
      const { title, content, folder = '', metadata, force_create = false } = args as any;
      
      // Check if templater is available and suggest templates
      if (!force_create && templaterPlugin) {
        const templates = await templaterPlugin.listTemplates();
        
        if (templates.length > 0) {
          const templateList = templates.map((t, index) => `${index + 1}. ${t.name}`).join('\n');
          return {
            content: [
              {
                type: 'text',
                text: `利用可能なテンプレート：\n\n${templateList}\n\nテンプレートを使用しますか？\n- 使用する場合: create_from_template(template_name: "Daily Note", title: "${title}", folder: "${folder}")\n- 使用しない場合: create_note(title: "${title}", content: "${content || '内容を入力してください'}", folder: "${folder}", force_create: true)`,
              },
            ],
          };
        }
      }
      
      if (!content && !force_create) {
        return {
          content: [
            {
              type: 'text',
              text: 'ノートの内容（content）が指定されていません。内容を指定してください。',
            },
          ],
        };
      }
      
      const notePath = path.join(selectedVault, folder, `${title}.md`);
      
      // Create directory if needed
      const dir = path.dirname(notePath);
      await fs.mkdir(dir, { recursive: true });
      
      // Build note content with frontmatter
      let fullContent = '';
      if (metadata && Object.keys(metadata).length > 0) {
        if (!metadata.created) {
          metadata.created = new Date().toISOString();
        }
        fullContent = createFrontmatter(metadata);
      }
      fullContent += content || '';
      
      // Write the note
      await fs.writeFile(notePath, fullContent, 'utf-8');
      
      return {
        content: [
          {
            type: 'text',
            text: `Note created successfully!\n\nPath: ${path.relative(selectedVault, notePath)}`,
          },
        ],
      };
    }

    case 'delete_note': {
      if (!selectedVault) {
        return {
          content: [
            {
              type: 'text',
              text: 'No vault selected. Please use "list_vaults" and then "select_vault" first.',
            },
          ],
        };
      }

      const { path: notePath, title, folder = '', confirm = false, trash = true } = args as any;
      
      // Determine the file path
      let targetPath: string;
      if (notePath) {
        targetPath = path.join(selectedVault, notePath);
      } else if (title) {
        const fileName = title.endsWith('.md') ? title : `${title}.md`;
        targetPath = path.join(selectedVault, folder, fileName);
      } else {
        return {
          content: [
            {
              type: 'text',
              text: 'Please provide either "path" or "title" to identify the note to delete.',
            },
          ],
        };
      }

      // Check if file exists
      try {
        await fs.access(targetPath);
      } catch {
        return {
          content: [
            {
              type: 'text',
              text: `Note not found: ${path.relative(selectedVault, targetPath)}`,
            },
          ],
        };
      }

      // Read the file to show what will be deleted
      const content = await fs.readFile(targetPath, 'utf-8');
      const lines = content.split('\n').slice(0, 5);
      const preview = lines.join('\n') + (content.split('\n').length > 5 ? '\n...' : '');

      if (!confirm) {
        return {
          content: [
            {
              type: 'text',
              text: `⚠️ Confirm deletion of note:\n\nPath: ${path.relative(selectedVault, targetPath)}\n\nPreview:\n${preview}\n\nTo confirm deletion, use the same command with "confirm: true"`,
            },
          ],
        };
      }

      if (trash) {
        // Move to trash folder
        const trashDir = path.join(selectedVault, '.trash');
        await fs.mkdir(trashDir, { recursive: true });
        
        const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
        const trashName = `${path.basename(targetPath, '.md')}_${timestamp}.md`;
        const trashPath = path.join(trashDir, trashName);
        
        await fs.rename(targetPath, trashPath);
        
        return {
          content: [
            {
              type: 'text',
              text: `Note moved to trash successfully!\n\nOriginal: ${path.relative(selectedVault, targetPath)}\nTrash: ${path.relative(selectedVault, trashPath)}`,
            },
          ],
        };
      } else {
        // Permanent deletion
        await fs.unlink(targetPath);
        
        return {
          content: [
            {
              type: 'text',
              text: `Note permanently deleted!\n\nPath: ${path.relative(selectedVault, targetPath)}`,
            },
          ],
        };
      }
    }

    case 'read_note': {
      if (!selectedVault) {
        return {
          content: [
            {
              type: 'text',
              text: 'No vault selected. Please use "list_vaults" and then "select_vault" first.',
            },
          ],
        };
      }

      const { path: notePath, title, folder = '' } = args as any;
      
      // Determine the file path
      let targetPath: string;
      if (notePath) {
        targetPath = path.join(selectedVault, notePath);
      } else if (title) {
        const fileName = title.endsWith('.md') ? title : `${title}.md`;
        targetPath = path.join(selectedVault, folder, fileName);
      } else {
        return {
          content: [
            {
              type: 'text',
              text: 'Please provide either "path" or "title" to identify the note to read.',
            },
          ],
        };
      }

      // Read the file
      try {
        const content = await fs.readFile(targetPath, 'utf-8');
        const { metadata, body } = parseFrontmatter(content);
        
        let result = `# Note: ${path.basename(targetPath, '.md')}\n\n`;
        result += `**Path**: ${path.relative(selectedVault, targetPath)}\n\n`;
        
        if (Object.keys(metadata).length > 0) {
          result += `## Metadata\n`;
          for (const [key, value] of Object.entries(metadata)) {
            result += `- **${key}**: ${Array.isArray(value) ? value.join(', ') : value}\n`;
          }
          result += '\n';
        }
        
        result += `## Content\n\n${body}`;
        
        return {
          content: [
            {
              type: 'text',
              text: result,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error reading note: ${path.relative(selectedVault, targetPath)}\n\n${error}`,
            },
          ],
        };
      }
    }

    case 'update_note': {
      if (!selectedVault) {
        return {
          content: [
            {
              type: 'text',
              text: 'No vault selected. Please use "list_vaults" and then "select_vault" first.',
            },
          ],
        };
      }

      const { path: notePath, title, folder = '', content: newContent, append = false, metadata: newMetadata } = args as any;
      
      // Determine the file path
      let targetPath: string;
      if (notePath) {
        targetPath = path.join(selectedVault, notePath);
      } else if (title) {
        const fileName = title.endsWith('.md') ? title : `${title}.md`;
        targetPath = path.join(selectedVault, folder, fileName);
      } else {
        return {
          content: [
            {
              type: 'text',
              text: 'Please provide either "path" or "title" to identify the note to update.',
            },
          ],
        };
      }

      // Check if file exists
      let existingContent = '';
      let existingMetadata = {};
      
      try {
        existingContent = await fs.readFile(targetPath, 'utf-8');
        const parsed = parseFrontmatter(existingContent);
        existingMetadata = parsed.metadata;
        if (append) {
          existingContent = parsed.body;
        }
      } catch {
        // File doesn't exist, will create new
      }

      // Merge metadata if provided
      const finalMetadata = newMetadata ? { ...existingMetadata, ...newMetadata } : existingMetadata;
      if (!finalMetadata.modified) {
        finalMetadata.modified = new Date().toISOString();
      }

      // Build final content
      let fullContent = '';
      if (Object.keys(finalMetadata).length > 0) {
        fullContent = createFrontmatter(finalMetadata);
      }
      
      if (append && existingContent) {
        fullContent += existingContent + '\n\n' + newContent;
      } else {
        fullContent += newContent;
      }

      // Write the updated note
      await fs.writeFile(targetPath, fullContent, 'utf-8');
      
      return {
        content: [
          {
            type: 'text',
            text: `Note updated successfully!\n\nPath: ${path.relative(selectedVault, targetPath)}\nMode: ${append ? 'Append' : 'Replace'}`,
          },
        ],
      };
    }

    case 'list_notes': {
      if (!selectedVault) {
        return {
          content: [
            {
              type: 'text',
              text: 'No vault selected. Please use "list_vaults" and then "select_vault" first.',
            },
          ],
        };
      }

      const { folder = '', recursive = true } = args as any;
      const searchDir = path.join(selectedVault, folder);
      
      // Function to recursively find markdown files
      async function findMarkdownFiles(dir: string, baseDir: string): Promise<string[]> {
        const files: string[] = [];
        
        try {
          const entries = await fs.readdir(dir, { withFileTypes: true });
          
          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            
            if (entry.isDirectory() && !entry.name.startsWith('.')) {
              if (recursive) {
                const subFiles = await findMarkdownFiles(fullPath, baseDir);
                files.push(...subFiles);
              }
            } else if (entry.isFile() && entry.name.endsWith('.md')) {
              files.push(path.relative(baseDir, fullPath));
            }
          }
        } catch (error) {
          // Directory doesn't exist or permission error
        }
        
        return files;
      }

      const notes = await findMarkdownFiles(searchDir, selectedVault);
      
      if (notes.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: `No notes found in ${folder || 'vault root'}`,
            },
          ],
        };
      }

      // Group by folder
      const grouped: { [key: string]: string[] } = {};
      for (const note of notes) {
        const dir = path.dirname(note);
        const key = dir === '.' ? 'Root' : dir;
        if (!grouped[key]) {
          grouped[key] = [];
        }
        grouped[key].push(path.basename(note, '.md'));
      }

      let result = `Found ${notes.length} note(s) in ${folder || 'vault'}:\n\n`;
      
      for (const [dir, files] of Object.entries(grouped)) {
        result += `📁 **${dir}**\n`;
        for (const file of files.sort()) {
          result += `  📝 ${file}\n`;
        }
        result += '\n';
      }
      
      return {
        content: [
          {
            type: 'text',
            text: result,
          },
        ],
      };
    }

    case 'search_notes': {
      if (!selectedVault) {
        return {
          content: [
            {
              type: 'text',
              text: 'No vault selected. Please use "list_vaults" and then "select_vault" first.',
            },
          ],
        };
      }

      const { query, folder = '', tags = [], recursive = true } = args as any;
      const searchDir = path.join(selectedVault, folder);
      
      // Function to recursively find and search markdown files
      async function searchInFiles(dir: string, baseDir: string): Promise<Array<{path: string, matches: Array<{line: number, content: string}>}>> {
        const results: Array<{path: string, matches: Array<{line: number, content: string}>}> = [];
        
        try {
          const entries = await fs.readdir(dir, { withFileTypes: true });
          
          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            
            if (entry.isDirectory() && !entry.name.startsWith('.')) {
              if (recursive) {
                const subResults = await searchInFiles(fullPath, baseDir);
                results.push(...subResults);
              }
            } else if (entry.isFile() && entry.name.endsWith('.md')) {
              try {
                const content = await fs.readFile(fullPath, 'utf-8');
                const { metadata, body } = parseFrontmatter(content);
                
                // Filter by tags if specified
                if (tags.length > 0) {
                  const noteTags = metadata.tags || [];
                  const hasMatchingTag = tags.some(tag => 
                    noteTags.includes(tag) || noteTags.includes(`#${tag}`)
                  );
                  if (!hasMatchingTag) continue;
                }
                
                // Search in content
                const lines = body.split('\n');
                const matches: Array<{line: number, content: string}> = [];
                
                lines.forEach((line, index) => {
                  if (line.toLowerCase().includes(query.toLowerCase())) {
                    matches.push({
                      line: index + 1,
                      content: line.trim()
                    });
                  }
                });
                
                if (matches.length > 0) {
                  results.push({
                    path: path.relative(baseDir, fullPath),
                    matches: matches
                  });
                }
              } catch (error) {
                // Skip files that can't be read
              }
            }
          }
        } catch (error) {
          // Directory doesn't exist or permission error
        }
        
        return results;
      }

      const searchResults = await searchInFiles(searchDir, selectedVault);
      
      if (searchResults.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: `No matches found for "${query}"${folder ? ` in ${folder}` : ''}${tags.length > 0 ? ` with tags: ${tags.join(', ')}` : ''}`,
            },
          ],
        };
      }

      let result = `Found ${searchResults.length} note(s) matching "${query}"${folder ? ` in ${folder}` : ''}${tags.length > 0 ? ` with tags: ${tags.join(', ')}` : ''}:\n\n`;
      
      for (const note of searchResults) {
        result += `📝 **${note.path}**\n`;
        note.matches.slice(0, 3).forEach(match => {
          result += `   Line ${match.line}: ${match.content}\n`;
        });
        if (note.matches.length > 3) {
          result += `   ... and ${note.matches.length - 3} more matches\n`;
        }
        result += '\n';
      }
      
      return {
        content: [
          {
            type: 'text',
            text: result,
          },
        ],
      };
    }

    case 'get_all_tags': {
      if (!selectedVault) {
        return {
          content: [
            {
              type: 'text',
              text: 'No vault selected. Please use "list_vaults" and then "select_vault" first.',
            },
          ],
        };
      }

      // Function to recursively find tags in markdown files
      async function collectTags(dir: string): Promise<Map<string, number>> {
        const tagCounts = new Map<string, number>();
        
        try {
          const entries = await fs.readdir(dir, { withFileTypes: true });
          
          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            
            if (entry.isDirectory() && !entry.name.startsWith('.')) {
              const subTags = await collectTags(fullPath);
              for (const [tag, count] of subTags) {
                tagCounts.set(tag, (tagCounts.get(tag) || 0) + count);
              }
            } else if (entry.isFile() && entry.name.endsWith('.md')) {
              try {
                const content = await fs.readFile(fullPath, 'utf-8');
                const { metadata, body } = parseFrontmatter(content);
                
                // Extract tags from frontmatter
                if (metadata.tags && Array.isArray(metadata.tags)) {
                  for (const tag of metadata.tags) {
                    const cleanTag = tag.replace(/^#/, '');
                    tagCounts.set(cleanTag, (tagCounts.get(cleanTag) || 0) + 1);
                  }
                }
                
                // Extract hashtags from content
                const hashtagRegex = /#([a-zA-Z0-9_-]+)/g;
                let match;
                while ((match = hashtagRegex.exec(body)) !== null) {
                  const tag = match[1];
                  tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
                }
              } catch (error) {
                // Skip files that can't be read
              }
            }
          }
        } catch (error) {
          // Directory doesn't exist or permission error
        }
        
        return tagCounts;
      }

      const allTags = await collectTags(selectedVault);
      
      if (allTags.size === 0) {
        return {
          content: [
            {
              type: 'text',
              text: 'No tags found in the vault.',
            },
          ],
        };
      }

      // Sort tags by frequency
      const sortedTags = Array.from(allTags.entries()).sort((a, b) => b[1] - a[1]);
      
      let result = `Found ${allTags.size} unique tag(s) in the vault:\n\n`;
      
      for (const [tag, count] of sortedTags) {
        result += `🏷️ **${tag}** (${count} note${count > 1 ? 's' : ''})\n`;
      }
      
      return {
        content: [
          {
            type: 'text',
            text: result,
          },
        ],
      };
    }

    case 'search_by_tag': {
      if (!selectedVault) {
        return {
          content: [
            {
              type: 'text',
              text: 'No vault selected. Please use "list_vaults" and then "select_vault" first.',
            },
          ],
        };
      }

      const { tag, folder = '' } = args as any;
      const searchDir = path.join(selectedVault, folder);
      const cleanTag = tag.replace(/^#/, '');
      
      // Function to find notes with specific tag
      async function findNotesByTag(dir: string, baseDir: string): Promise<string[]> {
        const results: string[] = [];
        
        try {
          const entries = await fs.readdir(dir, { withFileTypes: true });
          
          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            
            if (entry.isDirectory() && !entry.name.startsWith('.')) {
              const subResults = await findNotesByTag(fullPath, baseDir);
              results.push(...subResults);
            } else if (entry.isFile() && entry.name.endsWith('.md')) {
              try {
                const content = await fs.readFile(fullPath, 'utf-8');
                const { metadata, body } = parseFrontmatter(content);
                
                let hasTag = false;
                
                // Check frontmatter tags
                if (metadata.tags && Array.isArray(metadata.tags)) {
                  hasTag = metadata.tags.some(t => 
                    t === cleanTag || t === `#${cleanTag}` || t.replace(/^#/, '') === cleanTag
                  );
                }
                
                // Check hashtags in content
                if (!hasTag) {
                  const hashtagRegex = new RegExp(`#${cleanTag}\\b`, 'i');
                  hasTag = hashtagRegex.test(body);
                }
                
                if (hasTag) {
                  results.push(path.relative(baseDir, fullPath));
                }
              } catch (error) {
                // Skip files that can't be read
              }
            }
          }
        } catch (error) {
          // Directory doesn't exist or permission error
        }
        
        return results;
      }

      const taggedNotes = await findNotesByTag(searchDir, selectedVault);
      
      if (taggedNotes.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: `No notes found with tag "${cleanTag}"${folder ? ` in ${folder}` : ''}`,
            },
          ],
        };
      }

      let result = `Found ${taggedNotes.length} note(s) with tag "${cleanTag}"${folder ? ` in ${folder}` : ''}:\n\n`;
      
      for (const notePath of taggedNotes) {
        const dir = path.dirname(notePath);
        const fileName = path.basename(notePath, '.md');
        result += `📝 ${dir === '.' ? fileName : `${dir}/${fileName}`}\n`;
      }
      
      return {
        content: [
          {
            type: 'text',
            text: result,
          },
        ],
      };
    }

    case 'add_tag_to_note': {
      if (!selectedVault) {
        return {
          content: [
            {
              type: 'text',
              text: 'No vault selected. Please use "list_vaults" and then "select_vault" first.',
            },
          ],
        };
      }

      const { path: notePath, title, folder = '', tags } = args as any;
      
      // Determine the file path
      let targetPath: string;
      if (notePath) {
        targetPath = path.join(selectedVault, notePath);
      } else if (title) {
        const fileName = title.endsWith('.md') ? title : `${title}.md`;
        targetPath = path.join(selectedVault, folder, fileName);
      } else {
        return {
          content: [
            {
              type: 'text',
              text: 'Please provide either "path" or "title" to identify the note.',
            },
          ],
        };
      }

      // Read the existing file
      try {
        const content = await fs.readFile(targetPath, 'utf-8');
        const { metadata, body } = parseFrontmatter(content);
        
        // Add tags to metadata
        const existingTags = metadata.tags || [];
        const newTags = [...existingTags];
        
        for (const tag of tags) {
          const cleanTag = tag.replace(/^#/, '');
          if (!newTags.includes(cleanTag) && !newTags.includes(`#${cleanTag}`)) {
            newTags.push(cleanTag);
          }
        }
        
        metadata.tags = newTags;
        metadata.modified = new Date().toISOString();
        
        // Rebuild content with updated metadata
        const newContent = createFrontmatter(metadata) + body;
        
        // Write the updated file
        await fs.writeFile(targetPath, newContent, 'utf-8');
        
        return {
          content: [
            {
              type: 'text',
              text: `Tags added successfully!\n\nNote: ${path.relative(selectedVault, targetPath)}\nAdded tags: ${tags.join(', ')}\nAll tags: ${newTags.join(', ')}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: Could not read note at ${path.relative(selectedVault, targetPath)}\n\n${error}`,
            },
          ],
        };
      }
    }

    case 'move_note': {
      if (!selectedVault) {
        return {
          content: [
            {
              type: 'text',
              text: 'No vault selected. Please select a vault first using select_vault.',
            },
          ],
        };
      }

      const sourcePath = args?.source_path as string;
      const destinationPath = args?.destination_path as string;
      const force = args?.force as boolean || false;

      if (!sourcePath || !destinationPath) {
        return {
          content: [
            {
              type: 'text',
              text: 'Error: Both source_path and destination_path are required.',
            },
          ],
        };
      }

      try {
        const sourceFullPath = path.resolve(selectedVault, sourcePath);
        const destFullPath = path.resolve(selectedVault, destinationPath);

        // 安全性チェック: ファイルがvault内にあるか確認
        if (!sourceFullPath.startsWith(selectedVault) || !destFullPath.startsWith(selectedVault)) {
          return {
            content: [
              {
                type: 'text',
                text: 'Error: File paths must be within the selected vault.',
              },
            ],
          };
        }

        // ソースファイルが存在するか確認
        if (!fsSync.existsSync(sourceFullPath)) {
          return {
            content: [
              {
                type: 'text',
                text: `Error: Source file does not exist: ${sourcePath}`,
              },
            ],
          };
        }

        // 拡張子が.mdでない場合は警告
        if (!sourcePath.endsWith('.md')) {
          return {
            content: [
              {
                type: 'text',
                text: 'Error: Only markdown files (.md) can be moved.',
              },
            ],
        };
        }

        // 移動先ディレクトリが存在しない場合は作成
        const destDir = path.dirname(destFullPath);
        if (!fsSync.existsSync(destDir)) {
          fsSync.mkdirSync(destDir, { recursive: true });
        }

        // 競合チェック
        if (fsSync.existsSync(destFullPath) && !force) {
          return {
            content: [
              {
                type: 'text',
                text: `移動先にファイルが既に存在します: ${destinationPath}\n\n上書きする場合は force パラメータを true に設定してください。`,
              },
            ],
          };
        }

        // ファイル移動を実行
        fsSync.renameSync(sourceFullPath, destFullPath);

        // Obsidianリンクを更新
        const linksUpdated = await updateObsidianLinks(selectedVault, sourcePath, destinationPath);

        return {
          content: [
            {
              type: 'text',
              text: `✅ ノートを正常に移動しました:\n${sourcePath} → ${destinationPath}\n\n📝 更新されたリンク数: ${linksUpdated}`,
            },
          ],
        };

      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error moving note: ${error}`,
            },
          ],
        };
      }
    }

    case 'bulk_move_notes': {
      if (!selectedVault) {
        return {
          content: [
            {
              type: 'text',
              text: 'No vault selected. Please select a vault first using select_vault.',
            },
          ],
        };
      }

      const sourcePattern = args?.source_pattern as string;
      const destinationFolder = args?.destination_folder as string;
      const force = args?.force as boolean || false;
      const dryRun = args?.dry_run as boolean || false;

      if (!sourcePattern || !destinationFolder) {
        return {
          content: [
            {
              type: 'text',
              text: 'Error: Both source_pattern and destination_folder are required.',
            },
          ],
        };
      }

      try {
        const destFolderPath = path.resolve(selectedVault, destinationFolder);

        // 移動先フォルダがvault内にあるか確認
        if (!destFolderPath.startsWith(selectedVault)) {
          return {
            content: [
              {
                type: 'text',
                text: 'Error: Destination folder must be within the selected vault.',
              },
            ],
          };
        }

        // パターンにマッチするファイルを検索
        const glob = require('glob');
        const pattern = path.resolve(selectedVault, sourcePattern);
        const matchingFiles = glob.sync(pattern, { nodir: true })
          .filter((file: string) => file.endsWith('.md'))
          .filter((file: string) => file.startsWith(selectedVault));

        if (matchingFiles.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: `パターンにマッチするマークダウンファイルが見つかりません: ${sourcePattern}`,
              },
            ],
          };
        }

        // 競合チェック
        const conflicts: string[] = [];
        const moves: Array<{ source: string, dest: string }> = [];

        for (const sourceFile of matchingFiles) {
          const fileName = path.basename(sourceFile);
          const destFile = path.join(destFolderPath, fileName);
          const sourcePath = path.relative(selectedVault, sourceFile);
          const destPath = path.relative(selectedVault, destFile);

          moves.push({ source: sourcePath, dest: destPath });

          if (fsSync.existsSync(destFile) && !force) {
            conflicts.push(`${sourcePath} → ${destPath}`);
          }
        }

        if (conflicts.length > 0 && !force) {
          return {
            content: [
              {
                type: 'text',
                text: `以下のファイルで競合が発生しています:\n\n${conflicts.join('\n')}\n\n上書きする場合は force パラメータを true に設定してください。`,
              },
            ],
          };
        }

        // ドライランモード
        if (dryRun) {
          const moveList = moves.map(m => `${m.source} → ${m.dest}`).join('\n');
          return {
            content: [
              {
                type: 'text',
                text: `🔍 ドライラン結果 (${moves.length}個のファイル):\n\n${moveList}\n\n実際に移動するには dry_run を false に設定してください。`,
              },
            ],
          };
        }

        // 移動先フォルダを作成
        if (!fsSync.existsSync(destFolderPath)) {
          fsSync.mkdirSync(destFolderPath, { recursive: true });
        }

        // ファイルを一括移動
        let totalLinksUpdated = 0;
        const movedFiles: string[] = [];

        for (const move of moves) {
          const sourceFullPath = path.resolve(selectedVault, move.source);
          const destFullPath = path.resolve(selectedVault, move.dest);

          fsSync.renameSync(sourceFullPath, destFullPath);
          movedFiles.push(`${move.source} → ${move.dest}`);

          // リンクを更新
          const linksUpdated = await updateObsidianLinks(selectedVault, move.source, move.dest);
          totalLinksUpdated += linksUpdated;
        }

        return {
          content: [
            {
              type: 'text',
              text: `✅ ${movedFiles.length}個のノートを正常に移動しました:\n\n${movedFiles.join('\n')}\n\n📝 更新されたリンク数: ${totalLinksUpdated}`,
            },
          ],
        };

      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error during bulk move: ${error}`,
            },
          ],
        };
      }
    }

    case 'move_folder': {
      if (!selectedVault) {
        return {
          content: [
            {
              type: 'text',
              text: 'No vault selected. Please select a vault first using select_vault.',
            },
          ],
        };
      }

      const sourceFolderPath = args?.source_folder_path as string;
      const destinationFolderPath = args?.destination_folder_path as string;
      const force = args?.force as boolean || false;
      const dryRun = args?.dry_run as boolean || false;

      if (!sourceFolderPath || !destinationFolderPath) {
        return {
          content: [
            {
              type: 'text',
              text: 'Error: Both source_folder_path and destination_folder_path are required.',
            },
          ],
        };
      }

      try {
        const sourceFullPath = path.resolve(selectedVault, sourceFolderPath);
        const destFullPath = path.resolve(selectedVault, destinationFolderPath);

        // 安全性チェック
        if (!sourceFullPath.startsWith(selectedVault) || !destFullPath.startsWith(selectedVault)) {
          return {
            content: [
              {
                type: 'text',
                text: 'Error: Folder paths must be within the selected vault.',
              },
            ],
        };
        }

        // ソースフォルダが存在するか確認
        if (!fsSync.existsSync(sourceFullPath) || !fsSync.lstatSync(sourceFullPath).isDirectory()) {
          return {
            content: [
              {
                type: 'text',
                text: `Error: Source folder does not exist: ${sourceFolderPath}`,
              },
            ],
        };
        }

        // 自己参照チェック
        if (destFullPath.startsWith(sourceFullPath + path.sep) || destFullPath === sourceFullPath) {
          return {
            content: [
              {
                type: 'text',
                text: 'Error: Cannot move folder into itself or its subdirectory.',
              },
            ],
        };
        }

        // 競合チェック
        if (fsSync.existsSync(destFullPath) && !force) {
          return {
            content: [
              {
                type: 'text',
                text: `移動先フォルダが既に存在します: ${destinationFolderPath}\n\nマージする場合は force パラメータを true に設定してください。`,
              },
            ],
        };
        }

        // フォルダ内のマークダウンファイルを収集
        function collectMarkdownFiles(dir: string, basePath: string): Array<{ source: string, dest: string }> {
          const files: Array<{ source: string, dest: string }> = [];
          const entries = fsSync.readdirSync(dir);

          for (const entry of entries) {
            const fullPath = path.join(dir, entry);
            const stat = fsSync.lstatSync(fullPath);

            if (stat.isDirectory()) {
              const subFiles = collectMarkdownFiles(fullPath, basePath);
              files.push(...subFiles);
            } else if (entry.endsWith('.md')) {
              const relativePath = path.relative(selectedVault, fullPath);
              const newPath = relativePath.replace(sourceFolderPath, destinationFolderPath);
              files.push({ source: relativePath, dest: newPath });
            }
          }

          return files;
        }

        const markdownFiles = collectMarkdownFiles(sourceFullPath, selectedVault);

        // ドライランモード
        if (dryRun) {
          const filesList = markdownFiles.map(f => `  ${f.source} → ${f.dest}`).join('\n');
          return {
            content: [
              {
                type: 'text',
                text: `🔍 フォルダ移動のドライラン結果:\n\nフォルダ: ${sourceFolderPath} → ${destinationFolderPath}\n\nマークダウンファイル (${markdownFiles.length}個):\n${filesList}\n\n実際に移動するには dry_run を false に設定してください。`,
              },
            ],
          };
        }

        // フォルダ移動を実行
        if (fsSync.existsSync(destFullPath)) {
          // マージの場合: ファイルを個別に移動
          const destParent = path.dirname(destFullPath);
          if (!fsSync.existsSync(destParent)) {
            fsSync.mkdirSync(destParent, { recursive: true });
          }

          function moveDirectory(src: string, dest: string): void {
            if (!fsSync.existsSync(dest)) {
              fsSync.mkdirSync(dest, { recursive: true });
            }

            const entries = fsSync.readdirSync(src);
            for (const entry of entries) {
              const srcPath = path.join(src, entry);
              const destPath = path.join(dest, entry);
              const stat = fsSync.lstatSync(srcPath);

              if (stat.isDirectory()) {
                moveDirectory(srcPath, destPath);
              } else {
                fsSync.renameSync(srcPath, destPath);
              }
            }

            // 元のディレクトリを削除
            if (fsSync.readdirSync(src).length === 0) {
              fsSync.rmdirSync(src);
            }
          }

          moveDirectory(sourceFullPath, destFullPath);
        } else {
          // 新しい場所への移動
          const destParent = path.dirname(destFullPath);
          if (!fsSync.existsSync(destParent)) {
            fsSync.mkdirSync(destParent, { recursive: true });
          }
          fsSync.renameSync(sourceFullPath, destFullPath);
        }

        // マークダウンファイルのリンクを更新
        let totalLinksUpdated = 0;
        for (const file of markdownFiles) {
          const linksUpdated = await updateObsidianLinks(selectedVault, file.source, file.dest);
          totalLinksUpdated += linksUpdated;
        }

        return {
          content: [
            {
              type: 'text',
              text: `✅ フォルダを正常に移動しました:\n${sourceFolderPath} → ${destinationFolderPath}\n\n📁 マークダウンファイル数: ${markdownFiles.length}\n📝 更新されたリンク数: ${totalLinksUpdated}`,
            },
          ],
        };

      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error moving folder: ${error}`,
            },
          ],
        };
      }
    }

    case 'create_task': {
      if (!selectedVault) {
        return {
          content: [
            {
              type: 'text',
              text: 'No vault selected. Please select a vault first using select_vault.',
            },
          ],
        };
      }

      if (!taskNotesPlugin) {
        return {
          content: [
            {
              type: 'text',
              text: 'TaskNotes plugin not initialized.',
            },
          ],
        };
      }

      try {
        const metadata: Partial<TaskMetadata> = {
          title: args?.title as string,
          status: (args?.status as TaskMetadata['status']) || 'todo',
          priority: (args?.priority as TaskMetadata['priority']) || 'medium',
          due: args?.due as string,
          project: args?.project as string,
          assignee: args?.assignee as string,
          estimate: args?.estimate as number,
          tags: args?.tags as string[],
          dependencies: args?.dependencies as string[],
        };

        const content = args?.content as string || '';
        const task = await taskNotesPlugin.createTask(metadata, content);

        return {
          content: [
            {
              type: 'text',
              text: `✅ タスクを作成しました:\n\n**${task.metadata.title}**\n- ステータス: ${task.metadata.status}\n- 優先度: ${task.metadata.priority}\n- ファイルパス: ${task.filePath}${task.metadata.due ? `\n- 期限: ${task.metadata.due}` : ''}${task.metadata.project ? `\n- プロジェクト: ${task.metadata.project}` : ''}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error creating task: ${error}`,
            },
          ],
        };
      }
    }

    case 'list_tasks': {
      if (!selectedVault || !taskNotesPlugin) {
        return {
          content: [
            {
              type: 'text',
              text: 'No vault selected or TaskNotes plugin not initialized.',
            },
          ],
        };
      }

      try {
        const filters = {
          status: args?.status as string,
          project: args?.project as string,
          priority: args?.priority as string,
          assignee: args?.assignee as string,
          dueBefore: args?.due_before as string,
          dueAfter: args?.due_after as string,
        };

        const tasks = await taskNotesPlugin.listTasks(filters);

        if (tasks.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: '📝 該当するタスクが見つかりません。',
              },
            ],
          };
        }

        const taskList = tasks.map(task => {
          const statusIcon = {
            'todo': '⭕',
            'in-progress': '🔄',
            'waiting': '⏳',
            'done': '✅',
            'cancelled': '❌'
          }[task.metadata.status];

          const priorityIcon = {
            'low': '🔵',
            'medium': '🟡',
            'high': '🟠',
            'urgent': '🔴'
          }[task.metadata.priority];

          const timeSpent = task.metadata.timeEntries?.reduce((total, entry) => total + (entry.duration || 0), 0) || 0;
          
          return `${statusIcon} **${task.metadata.title}** ${priorityIcon}\n  📁 ${task.filePath}${task.metadata.due ? `\n  📅 期限: ${task.metadata.due}` : ''}${task.metadata.project ? `\n  📋 プロジェクト: ${task.metadata.project}` : ''}${timeSpent > 0 ? `\n  ⏱️ 作業時間: ${timeSpent}分` : ''}`;
        }).join('\n\n');

        return {
          content: [
            {
              type: 'text',
              text: `📝 タスク一覧 (${tasks.length}件):\n\n${taskList}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error listing tasks: ${error}`,
            },
          ],
        };
      }
    }

    case 'read_task': {
      if (!selectedVault || !taskNotesPlugin) {
        return {
          content: [
            {
              type: 'text',
              text: 'No vault selected or TaskNotes plugin not initialized.',
            },
          ],
        };
      }

      try {
        const taskPath = args?.path as string;
        const task = await taskNotesPlugin.readTask(taskPath);

        if (!task) {
          return {
            content: [
              {
                type: 'text',
                text: `タスクが見つかりません: ${taskPath}`,
              },
            ],
          };
        }

        const statusIcon = {
          'todo': '⭕',
          'in-progress': '🔄',
          'waiting': '⏳',
          'done': '✅',
          'cancelled': '❌'
        }[task.metadata.status];

        const priorityIcon = {
          'low': '🔵',
          'medium': '🟡',
          'high': '🟠',
          'urgent': '🔴'
        }[task.metadata.priority];

        const timeSpent = task.metadata.timeEntries?.reduce((total, entry) => total + (entry.duration || 0), 0) || 0;
        const activeTimer = task.metadata.timeEntries?.find(entry => !entry.endTime);

        let taskDetails = `# ${statusIcon} ${task.metadata.title} ${priorityIcon}\n\n`;
        taskDetails += `**ステータス:** ${task.metadata.status}\n`;
        taskDetails += `**優先度:** ${task.metadata.priority}\n`;
        taskDetails += `**作成日:** ${task.metadata.created}\n`;
        taskDetails += `**更新日:** ${task.metadata.updated}\n`;
        
        if (task.metadata.due) taskDetails += `**期限:** ${task.metadata.due}\n`;
        if (task.metadata.project) taskDetails += `**プロジェクト:** ${task.metadata.project}\n`;
        if (task.metadata.assignee) taskDetails += `**担当者:** ${task.metadata.assignee}\n`;
        if (task.metadata.estimate) taskDetails += `**見積もり:** ${task.metadata.estimate}分\n`;
        
        if (timeSpent > 0) taskDetails += `**作業時間:** ${timeSpent}分\n`;
        if (activeTimer) taskDetails += `**⏰ タイマー実行中** (開始: ${new Date(activeTimer.startTime).toLocaleString()})\n`;
        
        if (task.metadata.tags && task.metadata.tags.length > 0) {
          taskDetails += `**タグ:** ${task.metadata.tags.join(', ')}\n`;
        }
        
        if (task.metadata.dependencies && task.metadata.dependencies.length > 0) {
          taskDetails += `**依存関係:** ${task.metadata.dependencies.join(', ')}\n`;
        }

        if (task.content) {
          taskDetails += `\n## 詳細\n\n${task.content}`;
        }

        if (task.metadata.timeEntries && task.metadata.timeEntries.length > 0) {
          taskDetails += `\n## 作業履歴\n\n`;
          task.metadata.timeEntries.forEach((entry, index) => {
            const start = new Date(entry.startTime).toLocaleString();
            const end = entry.endTime ? new Date(entry.endTime).toLocaleString() : '実行中';
            const duration = entry.duration ? `(${entry.duration}分)` : '';
            taskDetails += `${index + 1}. ${start} - ${end} ${duration}${entry.description ? ` - ${entry.description}` : ''}\n`;
          });
        }

        return {
          content: [
            {
              type: 'text',
              text: taskDetails,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error reading task: ${error}`,
            },
          ],
        };
      }
    }

    case 'update_task_status': {
      if (!selectedVault || !taskNotesPlugin) {
        return {
          content: [
            {
              type: 'text',
              text: 'No vault selected or TaskNotes plugin not initialized.',
            },
          ],
        };
      }

      try {
        const taskPath = args?.path as string;
        const newStatus = args?.status as TaskMetadata['status'];
        
        const success = await taskNotesPlugin.updateTaskStatus(taskPath, newStatus);
        
        if (success) {
          const statusIcon = {
            'todo': '⭕',
            'in-progress': '🔄',
            'waiting': '⏳',
            'done': '✅',
            'cancelled': '❌'
          }[newStatus];

          return {
            content: [
              {
                type: 'text',
                text: `${statusIcon} タスクステータスを更新しました: ${newStatus}\n📁 ${taskPath}`,
              },
            ],
          };
        } else {
          return {
            content: [
              {
                type: 'text',
                text: `タスクステータスの更新に失敗しました: ${taskPath}`,
              },
            ],
          };
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error updating task status: ${error}`,
            },
          ],
        };
      }
    }

    case 'update_task_metadata': {
      if (!selectedVault || !taskNotesPlugin) {
        return {
          content: [
            {
              type: 'text',
              text: 'No vault selected or TaskNotes plugin not initialized.',
            },
          ],
        };
      }

      try {
        const taskPath = args?.path as string;
        const updates: Partial<TaskMetadata> = {};
        
        if (args?.title) updates.title = args.title as string;
        if (args?.priority) updates.priority = args.priority as TaskMetadata['priority'];
        if (args?.due) updates.due = args.due as string;
        if (args?.project) updates.project = args.project as string;
        if (args?.assignee) updates.assignee = args.assignee as string;
        if (args?.estimate) updates.estimate = args.estimate as number;
        if (args?.tags) updates.tags = args.tags as string[];
        
        const success = await taskNotesPlugin.updateTaskMetadata(taskPath, updates);
        
        if (success) {
          const updatesList = Object.entries(updates).map(([key, value]) => 
            `- ${key}: ${Array.isArray(value) ? value.join(', ') : value}`
          ).join('\n');

          return {
            content: [
              {
                type: 'text',
                text: `✅ タスクメタデータを更新しました:\n📁 ${taskPath}\n\n更新内容:\n${updatesList}`,
              },
            ],
          };
        } else {
          return {
            content: [
              {
                type: 'text',
                text: `タスクメタデータの更新に失敗しました: ${taskPath}`,
              },
            ],
          };
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error updating task metadata: ${error}`,
            },
          ],
        };
      }
    }

    case 'start_task_timer': {
      if (!selectedVault || !taskNotesPlugin) {
        return {
          content: [
            {
              type: 'text',
              text: 'No vault selected or TaskNotes plugin not initialized.',
            },
          ],
        };
      }

      try {
        const taskPath = args?.path as string;
        const description = args?.description as string;
        
        const success = await taskNotesPlugin.startTaskTimer(taskPath, description);
        
        if (success) {
          return {
            content: [
              {
                type: 'text',
                text: `⏰ タイマーを開始しました!\n📁 ${taskPath}${description ? `\n📝 説明: ${description}` : ''}\n\n作業開始時刻: ${new Date().toLocaleString()}`,
              },
            ],
          };
        } else {
          return {
            content: [
              {
                type: 'text',
                text: `タイマーの開始に失敗しました。既にタイマーが実行中の可能性があります。\n📁 ${taskPath}`,
              },
            ],
          };
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error starting task timer: ${error}`,
            },
          ],
        };
      }
    }

    case 'stop_task_timer': {
      if (!selectedVault || !taskNotesPlugin) {
        return {
          content: [
            {
              type: 'text',
              text: 'No vault selected or TaskNotes plugin not initialized.',
            },
          ],
        };
      }

      try {
        const taskPath = args?.path as string;
        const result = await taskNotesPlugin.stopTaskTimer(taskPath);
        
        if (result.success && result.duration) {
          const hours = Math.floor(result.duration / 60);
          const minutes = result.duration % 60;
          const timeString = hours > 0 ? `${hours}時間${minutes}分` : `${minutes}分`;

          return {
            content: [
              {
                type: 'text',
                text: `⏹️ タイマーを停止しました!\n📁 ${taskPath}\n\n⏱️ 作業時間: ${timeString}\n終了時刻: ${new Date().toLocaleString()}`,
              },
            ],
          };
        } else {
          return {
            content: [
              {
                type: 'text',
                text: `タイマーの停止に失敗しました。アクティブなタイマーがない可能性があります。\n📁 ${taskPath}`,
              },
            ],
          };
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error stopping task timer: ${error}`,
            },
          ],
        };
      }
    }

    case 'get_task_stats': {
      if (!selectedVault || !taskNotesPlugin) {
        return {
          content: [
            {
              type: 'text',
              text: 'No vault selected or TaskNotes plugin not initialized.',
            },
          ],
        };
      }

      try {
        const stats = await taskNotesPlugin.getTaskStats();
        
        const totalHours = Math.floor(stats.totalTimeSpent / 60);
        const totalMinutes = stats.totalTimeSpent % 60;
        const avgHours = Math.floor(stats.averageTimePerTask / 60);
        const avgMinutes = Math.floor(stats.averageTimePerTask % 60);

        let statsText = `📊 **タスク統計**\n\n`;
        statsText += `📝 **総タスク数:** ${stats.total}\n`;
        statsText += `⏱️ **総作業時間:** ${totalHours}時間${totalMinutes}分\n`;
        statsText += `📈 **平均作業時間/タスク:** ${avgHours}時間${avgMinutes}分\n`;
        statsText += `⚠️ **期限切れタスク:** ${stats.overdueTasks}件\n\n`;

        statsText += `**ステータス別:**\n`;
        Object.entries(stats.byStatus).forEach(([status, count]) => {
          const icon = {
            'todo': '⭕',
            'in-progress': '🔄',
            'waiting': '⏳',
            'done': '✅',
            'cancelled': '❌'
          }[status] || '📝';
          statsText += `- ${icon} ${status}: ${count}件\n`;
        });

        statsText += `\n**優先度別:**\n`;
        Object.entries(stats.byPriority).forEach(([priority, count]) => {
          const icon = {
            'low': '🔵',
            'medium': '🟡',
            'high': '🟠',
            'urgent': '🔴'
          }[priority] || '⚪';
          statsText += `- ${icon} ${priority}: ${count}件\n`;
        });

        return {
          content: [
            {
              type: 'text',
              text: statsText,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error getting task stats: ${error}`,
            },
          ],
        };
      }
    }

    case 'get_overdue_tasks': {
      if (!selectedVault || !taskNotesPlugin) {
        return {
          content: [
            {
              type: 'text',
              text: 'No vault selected or TaskNotes plugin not initialized.',
            },
          ],
        };
      }

      try {
        const overdueTasks = await taskNotesPlugin.getOverdueTasks();
        
        if (overdueTasks.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: '🎉 期限切れのタスクはありません！',
              },
            ],
          };
        }

        const taskList = overdueTasks.map(task => {
          const daysDue = Math.floor((new Date().getTime() - new Date(task.metadata.due!).getTime()) / (1000 * 60 * 60 * 24));
          const priorityIcon = {
            'low': '🔵',
            'medium': '🟡',
            'high': '🟠',
            'urgent': '🔴'
          }[task.metadata.priority];

          return `⚠️ **${task.metadata.title}** ${priorityIcon}\n  📅 期限: ${task.metadata.due} (${daysDue}日経過)\n  📁 ${task.filePath}${task.metadata.project ? `\n  📋 プロジェクト: ${task.metadata.project}` : ''}`;
        }).join('\n\n');

        return {
          content: [
            {
              type: 'text',
              text: `⚠️ **期限切れタスク** (${overdueTasks.length}件)\n\n${taskList}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error getting overdue tasks: ${error}`,
            },
          ],
        };
      }
    }

    case 'get_tasks_by_project': {
      if (!selectedVault || !taskNotesPlugin) {
        return {
          content: [
            {
              type: 'text',
              text: 'No vault selected or TaskNotes plugin not initialized.',
            },
          ],
        };
      }

      try {
        const tasksByProject = await taskNotesPlugin.getTasksByProject();
        
        if (Object.keys(tasksByProject).length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: '📝 プロジェクトタスクが見つかりません。',
              },
            ],
          };
        }

        let projectsText = '📋 **プロジェクト別タスク**\n\n';
        
        Object.entries(tasksByProject).forEach(([project, tasks]) => {
          const completedTasks = tasks.filter(t => t.metadata.status === 'done').length;
          const totalTasks = tasks.length;
          const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
          
          projectsText += `## 📂 ${project} (${completedTasks}/${totalTasks} - ${progress}%)\n\n`;
          
          tasks.forEach(task => {
            const statusIcon = {
              'todo': '⭕',
              'in-progress': '🔄',
              'waiting': '⏳',
              'done': '✅',
              'cancelled': '❌'
            }[task.metadata.status];

            const priorityIcon = {
              'low': '🔵',
              'medium': '🟡',
              'high': '🟠',
              'urgent': '🔴'
            }[task.metadata.priority];

            projectsText += `${statusIcon} ${task.metadata.title} ${priorityIcon}${task.metadata.due ? ` 📅 ${task.metadata.due}` : ''}\n`;
          });
          
          projectsText += '\n';
        });

        return {
          content: [
            {
              type: 'text',
              text: projectsText,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error getting tasks by project: ${error}`,
            },
          ],
        };
      }
    }

    case 'create_daily_note': {
      if (!selectedVault) {
        return {
          content: [
            {
              type: 'text',
              text: 'No vault selected. Please select a vault first.',
            },
          ],
        };
      }

      if (!taskNotesPlugin || !templaterPlugin) {
        return {
          content: [
            {
              type: 'text',
              text: 'TaskNotes or Templater plugin not available.',
            },
          ],
        };
      }

      try {
        const { 
          date = new Date().toISOString().split('T')[0],
          template_name,
          use_template = true,
          create_new_template = false
        } = args as any;

        // Template selection confirmation process
        let selectedTemplate = template_name;
        let templateContent = '';

        if (use_template) {
          if (!selectedTemplate && !create_new_template) {
            // List available templates and ask user to select
            const templates = await templaterPlugin.listTemplates();
            
            if (templates.length === 0) {
              return {
                content: [
                  {
                    type: 'text',
                    text: 'No templates found. Would you like to create a new daily note template?\n\nOptions:\n1. Create a new template (set create_new_template: true)\n2. Continue without template (set use_template: false)',
                  },
                ],
              };
            }

            const templateList = templates.map((t, i) => `${i + 1}. ${t.name} - ${t.description || 'No description'}`).join('\n');
            return {
              content: [
                {
                  type: 'text',
                  text: `Please select a template for the daily note:\n\n${templateList}\n\nUse template_name parameter to specify the template, or set create_new_template: true to create a new one.`,
                },
              ],
            };
          }

          if (create_new_template) {
            return {
              content: [
                {
                  type: 'text',
                  text: 'Please provide the template content and specify the template_folder parameter for where to save it, or it will be saved to the default Templates folder.',
                },
              ],
            };
          }

          if (selectedTemplate) {
            // Load the selected template
            const templates = await templaterPlugin.listTemplates();
            const template = templates.find(t => t.name === selectedTemplate);
            
            if (!template) {
              return {
                content: [
                  {
                    type: 'text',
                    text: `Template '${selectedTemplate}' not found. Available templates: ${templates.map(t => t.name).join(', ')}`,
                  },
                ],
              };
            }
            
            // Read template content from file
            const templatePath = path.join(selectedVault!, 'Templates', template.path);
            try {
              templateContent = await fs.readFile(templatePath, 'utf-8');
            } catch (error) {
              templateContent = `# ${template.name}\n\nTemplate content could not be loaded.`;
            }
          }
        }

        // Create the daily note
        const dailyNoteName = `Daily Note - ${date}.md`;
        const dailyNotePath = path.join(selectedVault, dailyNoteName);
        
        let finalContent = templateContent;
        if (!finalContent) {
          finalContent = `# Daily Note - ${date}\n\n## Goals\n- [ ] \n\n## Notes\n\n## Reflection\n`;
        }
        
        let result;
        try {
          await fs.writeFile(dailyNotePath, finalContent, 'utf-8');
          result = { success: true, notePath: dailyNoteName };
        } catch (error) {
          result = { success: false, error: String(error) };
        }
        
        if (result.success) {
          return {
            content: [
              {
                type: 'text',
                text: `✅ Daily note created successfully!\n\nFile: ${result.notePath}\nDate: ${date}\nTemplate used: ${selectedTemplate || 'None'}`,
              },
            ],
          };
        } else {
          return {
            content: [
              {
                type: 'text',
                text: `❌ Failed to create daily note: ${result.error}`,
              },
            ],
          };
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error creating daily note: ${error}`,
            },
          ],
        };
      }
    }

    case 'analyze_vault_structure': {
      if (!selectedVault) {
        return {
          content: [
            {
              type: 'text',
              text: 'No vault selected. Please select a vault first.',
            },
          ],
        };
      }

      if (!vaultAnalyticsPlugin) {
        return {
          content: [
            {
              type: 'text',
              text: 'Vault Analytics plugin not available.',
            },
          ],
        };
      }

      try {
        const { include_file_details = false } = args as any;
        const structure = await vaultAnalyticsPlugin.analyzeVaultStructure();
        
        return {
          content: [
            {
              type: 'text',
              text: `📁 **Vault Structure Analysis**\n\n**Analysis Results:**\n${(structure as any)?.name ? `Vault: ${(structure as any).name}` : 'Structure analyzed'}\n${(structure as any)?.fileCount ? `Files: ${(structure as any).fileCount}` : 'File count unavailable'}\n${(structure as any)?.size ? `Size: ${((structure as any).size / 1024).toFixed(1)} KB` : 'Size calculation unavailable'}\n\n**Analysis:** Complete vault structure scan performed`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error analyzing vault structure: ${error}`,
            },
          ],
        };
      }
    }

    case 'get_writing_stats': {
      if (!selectedVault) {
        return {
          content: [
            {
              type: 'text',
              text: 'No vault selected. Please select a vault first.',
            },
          ],
        };
      }

      if (!vaultAnalyticsPlugin) {
        return {
          content: [
            {
              type: 'text',
              text: 'Vault Analytics plugin not available.',
            },
          ],
        };
      }

      try {
        const { days = 30 } = args as any;
        const stats = await vaultAnalyticsPlugin.getWritingStats();
        
        return {
          content: [
            {
              type: 'text',
              text: `📊 **Writing Statistics**\n\n**Statistics:**\n**Total Notes:** ${stats?.totalNotes || 'N/A'}\n**Total Words:** ${stats?.totalWords?.toLocaleString() || 'N/A'}\n**Total Characters:** ${stats?.totalCharacters?.toLocaleString() || 'N/A'}\n**Average Words per Note:** ${stats?.averageWordsPerNote || 'N/A'}\n\n**Analysis:** Writing statistics calculated from vault content`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error getting writing stats: ${error}`,
            },
          ],
        };
      }
    }

    case 'find_orphan_notes': {
      if (!selectedVault) {
        return {
          content: [
            {
              type: 'text',
              text: 'No vault selected. Please select a vault first.',
            },
          ],
        };
      }

      if (!vaultAnalyticsPlugin) {
        return {
          content: [
            {
              type: 'text',
              text: 'Vault Analytics plugin not available.',
            },
          ],
        };
      }

      try {
        const { exclude_folders = [] } = args as any;
        const orphans = await vaultAnalyticsPlugin.findOrphanNotes();
        
        if (orphans.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: '✅ No orphan notes found! All notes are properly linked.',
              },
            ],
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: `🔍 **Found ${orphans.length} Orphan Notes**\n\n${orphans.map((o: any) => `- **${o.name || 'Unknown'}**\n  Path: ${o.path || 'Unknown path'}\n  Size: ${o.size || 0} bytes\n  Modified: ${o.modified || 'Unknown'}\n`).join('\n')}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error finding orphan notes: ${error}`,
            },
          ],
        };
      }
    }

    case 'get_link_graph': {
      if (!selectedVault) {
        return {
          content: [
            {
              type: 'text',
              text: 'No vault selected. Please select a vault first.',
            },
          ],
        };
      }

      if (!vaultAnalyticsPlugin) {
        return {
          content: [
            {
              type: 'text',
              text: 'Vault Analytics plugin not available.',
            },
          ],
        };
      }

      try {
        const { max_depth = 3, include_external = false } = args as any;
        const graph = await vaultAnalyticsPlugin.getLinkGraph();
        
        return {
          content: [
            {
              type: 'text',
              text: `🔗 **Link Graph Analysis**\n\n**Analysis Results:**\n**Nodes:** ${(graph as any)?.nodes?.length || 0}\n**Connections:** ${(graph as any)?.connections?.length || 0}\n**Network Density:** ${(graph as any)?.density?.toFixed(3) || 'N/A'}\n\n**Analysis:** Link relationship graph generated from vault structure`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error generating link graph: ${error}`,
            },
          ],
        };
      }
    }

    case 'summarize_note': {
      if (!selectedVault) {
        return {
          content: [
            {
              type: 'text',
              text: 'No vault selected. Please select a vault first.',
            },
          ],
        };
      }

      if (!aiAnalysisPlugin) {
        return {
          content: [
            {
              type: 'text',
              text: 'AI Analysis plugin not available.',
            },
          ],
        };
      }

      try {
        const { note_path, max_length = 200 } = args as any;
        
        if (!note_path) {
          return {
            content: [
              {
                type: 'text',
                text: 'Please provide note_path parameter.',
              },
            ],
          };
        }

        const summary = await aiAnalysisPlugin.summarizeNote(note_path);
        
        return {
          content: [
            {
              type: 'text',
              text: `📝 **Note Summary**\n\n**File:** ${note_path}\n\n**Summary:**\n${summary?.summary || 'Unable to generate summary'}\n\n**Key Points:**\n${summary?.keyPoints?.map((p: string) => `• ${p}`).join('\n') || 'No key points identified'}\n\n**Analysis:** Generated using heuristic content analysis`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error summarizing note: ${error}`,
            },
          ],
        };
      }
    }

    case 'generate_note_outline': {
      if (!selectedVault) {
        return {
          content: [
            {
              type: 'text',
              text: 'No vault selected. Please select a vault first.',
            },
          ],
        };
      }

      if (!aiAnalysisPlugin) {
        return {
          content: [
            {
              type: 'text',
              text: 'AI Analysis plugin not available.',
            },
          ],
        };
      }

      try {
        const { note_path, max_levels = 3 } = args as any;
        
        if (!note_path) {
          return {
            content: [
              {
                type: 'text',
                text: 'Please provide note_path parameter.',
              },
            ],
          };
        }

        const outline = await aiAnalysisPlugin.generateNoteOutline(note_path);
        
        const formatOutline = (sections: any[], level = 0) => {
          return sections.map(section => {
            const indent = '  '.repeat(level);
            const prefix = level === 0 ? '#'.repeat(level + 1) : '-';
            let result = `${indent}${prefix} ${section.title}`;
            if (section.summary) {
              result += `\n${indent}  ${section.summary}`;
            }
            if (section.subsections && section.subsections.length > 0) {
              result += '\n' + formatOutline(section.subsections, level + 1);
            }
            return result;
          }).join('\n\n');
        };

        return {
          content: [
            {
              type: 'text',
              text: `📋 **Note Outline**\n\n**File:** ${note_path}\n\n**Outline:**\n\n${(outline as any)?.sections ? formatOutline((outline as any).sections) : 'Unable to generate outline'}\n\n**Analysis:** Generated using content structure analysis`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error generating outline: ${error}`,
            },
          ],
        };
      }
    }

    case 'suggest_tags': {
      if (!selectedVault) {
        return {
          content: [
            {
              type: 'text',
              text: 'No vault selected. Please select a vault first.',
            },
          ],
        };
      }

      if (!aiAnalysisPlugin) {
        return {
          content: [
            {
              type: 'text',
              text: 'AI Analysis plugin not available.',
            },
          ],
        };
      }

      try {
        const { note_path, max_tags = 10, min_confidence = 0.5 } = args as any;
        
        if (!note_path) {
          return {
            content: [
              {
                type: 'text',
                text: 'Please provide note_path parameter.',
              },
            ],
          };
        }

        const suggestions = await aiAnalysisPlugin.suggestTags(note_path);
        
        const formatTagsByCategory = (tags: any[]) => {
          const categories = tags.reduce((acc, tag) => {
            if (!acc[tag.category]) {
              acc[tag.category] = [];
            }
            acc[tag.category].push(tag);
            return acc;
          }, {});

          return Object.entries(categories).map(([category, categoryTags]: [string, any[]]) => {
            const tagList = categoryTags
              .sort((a, b) => b.confidence - a.confidence)
              .map(tag => `  • #${tag.tag} (${(tag.confidence * 100).toFixed(0)}%)`)
              .join('\n');
            return `**${category.charAt(0).toUpperCase() + category.slice(1)}:**\n${tagList}`;
          }).join('\n\n');
        };

        return {
          content: [
            {
              type: 'text',
              text: `🏷️ **Tag Suggestions**\n\n**File:** ${note_path}\n\n**Suggested Tags:**\n\n${Array.isArray(suggestions) && suggestions.length > 0 ? suggestions.slice(0, 10).map((t: any) => `• #${t.tag || 'unknown'} (${t.category || 'general'})`).join('\n') : 'No tag suggestions available'}\n\n**Analysis:** Generated using content analysis`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error suggesting tags: ${error}`,
            },
          ],
        };
      }
    }

    case 'get_notes_by_date_range': {
      if (!selectedVault) {
        return {
          content: [
            {
              type: 'text',
              text: 'No vault selected. Please select a vault first.',
            },
          ],
        };
      }

      try {
        const { 
          start_date, 
          end_date, 
          date_field = 'modified',
          include_content = false,
          sort_by = 'date',
          folder_filter 
        } = args as any;

        const startDate = new Date(start_date);
        const endDate = new Date(end_date);
        
        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
          return {
            content: [
              {
                type: 'text',
                text: 'Invalid date format. Please use YYYY-MM-DD format.',
              },
            ],
          };
        }

        const searchDir = folder_filter ? path.join(selectedVault!, folder_filter) : selectedVault!;
        const matchingNotes: any[] = [];

        async function scanDirectory(dir: string): Promise<void> {
          try {
            const entries = await fs.readdir(dir, { withFileTypes: true });
            
            for (const entry of entries) {
              const fullPath = path.join(dir, entry.name);
              
              if (entry.isDirectory() && !entry.name.startsWith('.')) {
                await scanDirectory(fullPath);
              } else if (entry.isFile() && entry.name.endsWith('.md')) {
                const stats = await fs.stat(fullPath);
                let dateToCheck: Date;
                
                switch (date_field) {
                  case 'created':
                    dateToCheck = stats.birthtime;
                    break;
                  case 'modified':
                    dateToCheck = stats.mtime;
                    break;
                  case 'filename':
                    // Extract date from filename if possible (YYYY-MM-DD format)
                    const dateMatch = entry.name.match(/(\d{4}-\d{2}-\d{2})/);
                    if (dateMatch) {
                      dateToCheck = new Date(dateMatch[1]);
                    } else {
                      dateToCheck = stats.mtime; // fallback
                    }
                    break;
                  default:
                    dateToCheck = stats.mtime;
                }
                
                if (dateToCheck >= startDate && dateToCheck <= endDate) {
                  const relativePath = path.relative(selectedVault!, fullPath);
                  const noteData: any = {
                    name: entry.name,
                    path: relativePath,
                    created: stats.birthtime.toISOString(),
                    modified: stats.mtime.toISOString(),
                    size: stats.size,
                  };
                  
                  if (include_content) {
                    try {
                      const content = await fs.readFile(fullPath, 'utf-8');
                      noteData.content = content;
                      noteData.wordCount = content.split(/\s+/).length;
                    } catch (error) {
                      noteData.content = 'Error reading file';
                    }
                  }
                  
                  matchingNotes.push(noteData);
                }
              }
            }
          } catch (error) {
            // Skip directories that can't be read
          }
        }

        await scanDirectory(searchDir);
        
        // Sort results
        matchingNotes.sort((a, b) => {
          switch (sort_by) {
            case 'name':
              return a.name.localeCompare(b.name);
            case 'size':
              return b.size - a.size;
            case 'date':
            default:
              return new Date(b.modified).getTime() - new Date(a.modified).getTime();
          }
        });

        return {
          content: [
            {
              type: 'text',
              text: `📅 **Notes by Date Range**\n\n**Period:** ${start_date} to ${end_date}\n**Date Field:** ${date_field}\n**Found:** ${matchingNotes.length} notes\n${folder_filter ? `**Folder:** ${folder_filter}\n` : ''}\n**Results:**\n\n${matchingNotes.map(note => {
                const date = date_field === 'created' ? note.created : note.modified;
                const dateStr = new Date(date).toLocaleDateString();
                return `• **${note.name}** (${dateStr})\n  Path: ${note.path}\n  Size: ${note.size} bytes${note.wordCount ? `\n  Words: ${note.wordCount}` : ''}`;
              }).join('\n\n')}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error searching notes by date range: ${error}`,
            },
          ],
        };
      }
    }

    case 'validate_broken_links': {
      if (!selectedVault) {
        return {
          content: [
            {
              type: 'text',
              text: 'No vault selected. Please select a vault first.',
            },
          ],
        };
      }

      try {
        const { 
          fix_links = false,
          scan_folder,
          link_types = ['wiki', 'markdown']
        } = args as any;

        const searchDir = scan_folder ? path.join(selectedVault!, scan_folder) : selectedVault!;
        const brokenLinks: any[] = [];
        const fixedLinks: any[] = [];
        
        // Get all markdown files for reference
        const allFiles = new Set<string>();
        async function collectFiles(dir: string): Promise<void> {
          try {
            const entries = await fs.readdir(dir, { withFileTypes: true });
            for (const entry of entries) {
              const fullPath = path.join(dir, entry.name);
              if (entry.isDirectory() && !entry.name.startsWith('.')) {
                await collectFiles(fullPath);
              } else if (entry.isFile() && entry.name.endsWith('.md')) {
                const relativePath = path.relative(selectedVault!, fullPath);
                allFiles.add(relativePath.replace(/\.md$/, ''));
              }
            }
          } catch (error) {
            // Skip directories that can't be read
          }
        }
        
        await collectFiles(selectedVault!);
        
        async function scanForBrokenLinks(dir: string): Promise<void> {
          try {
            const entries = await fs.readdir(dir, { withFileTypes: true });
            
            for (const entry of entries) {
              const fullPath = path.join(dir, entry.name);
              
              if (entry.isDirectory() && !entry.name.startsWith('.')) {
                await scanForBrokenLinks(fullPath);
              } else if (entry.isFile() && entry.name.endsWith('.md')) {
                try {
                  const content = await fs.readFile(fullPath, 'utf-8');
                  const relativePath = path.relative(selectedVault!, fullPath);
                  let updatedContent = content;
                  let hasChanges = false;
                  
                  // Check wiki-style links [[note]]
                  if (link_types.includes('wiki')) {
                    const wikiLinks = content.match(/\[\[([^\]]+)\]\]/g) || [];
                    for (const link of wikiLinks) {
                      const linkTarget = link.slice(2, -2).split('|')[0].trim();
                      
                      if (!allFiles.has(linkTarget)) {
                        // Try to find similar files
                        const similarFiles = Array.from(allFiles).filter(file => 
                          file.toLowerCase().includes(linkTarget.toLowerCase()) ||
                          linkTarget.toLowerCase().includes(file.toLowerCase())
                        );
                        
                        const brokenLink = {
                          file: relativePath,
                          link: link,
                          target: linkTarget,
                          type: 'wiki',
                          suggestions: similarFiles.slice(0, 3)
                        };
                        
                        if (fix_links && similarFiles.length === 1) {
                          // Auto-fix if there's exactly one similar file
                          const fixedLink = link.replace(linkTarget, similarFiles[0]);
                          updatedContent = updatedContent.replace(link, fixedLink);
                          hasChanges = true;
                          
                          fixedLinks.push({
                            ...brokenLink,
                            fixedTo: similarFiles[0]
                          });
                        } else {
                          brokenLinks.push(brokenLink);
                        }
                      }
                    }
                  }
                  
                  // Check markdown-style links [text](note.md)
                  if (link_types.includes('markdown')) {
                    const markdownLinks = content.match(/\[([^\]]+)\]\(([^)]+\.md)\)/g) || [];
                    for (const link of markdownLinks) {
                      const match = link.match(/\[([^\]]+)\]\(([^)]+\.md)\)/);
                      if (match) {
                        const linkTarget = match[2].replace(/\.md$/, '');
                        
                        if (!allFiles.has(linkTarget)) {
                          brokenLinks.push({
                            file: relativePath,
                            link: link,
                            target: linkTarget,
                            type: 'markdown',
                            suggestions: []
                          });
                        }
                      }
                    }
                  }
                  
                  // Write back fixed content
                  if (hasChanges && fix_links) {
                    await fs.writeFile(fullPath, updatedContent, 'utf-8');
                  }
                  
                } catch (error) {
                  // Skip files that can't be read
                }
              }
            }
          } catch (error) {
            // Skip directories that can't be read
          }
        }

        await scanForBrokenLinks(searchDir);
        
        let reportText = `🔗 **Broken Links Validation Report**\n\n`;
        reportText += `**Scanned:** ${scan_folder || 'Entire vault'}\n`;
        reportText += `**Link Types:** ${link_types.join(', ')}\n`;
        reportText += `**Broken Links Found:** ${brokenLinks.length}\n`;
        reportText += `**Links Fixed:** ${fixedLinks.length}\n\n`;
        
        if (fixedLinks.length > 0) {
          reportText += `**✅ Fixed Links:**\n`;
          fixedLinks.forEach(fix => {
            reportText += `• ${fix.file}: ${fix.link} → [[${fix.fixedTo}]]\n`;
          });
          reportText += `\n`;
        }
        
        if (brokenLinks.length > 0) {
          reportText += `**❌ Broken Links:**\n`;
          brokenLinks.forEach(broken => {
            reportText += `• **${broken.file}**\n`;
            reportText += `  Link: ${broken.link}\n`;
            reportText += `  Target: ${broken.target}\n`;
            if (broken.suggestions.length > 0) {
              reportText += `  Suggestions: ${broken.suggestions.join(', ')}\n`;
            }
            reportText += `\n`;
          });
        } else if (fixedLinks.length === 0) {
          reportText += `✅ No broken links found!`;
        }

        return {
          content: [
            {
              type: 'text',
              text: reportText,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error validating broken links: ${error}`,
            },
          ],
        };
      }
    }

    default:
      return {
        content: [
          {
            type: 'text',
            text: `Unknown tool: ${name}`,
          },
        ],
      };
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('ObsidianMCP Full Server running with all features including plugins...');
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});