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
import * as crypto from 'crypto';

// Complete MCP Server for Obsidian with all Phase 1 features
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

// File locks for concurrent editing detection
const fileLocks: Map<string, { timestamp: number; sessionId: string }> = new Map();
const sessionId = crypto.randomBytes(16).toString('hex');

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

// Check for file conflicts
function checkFileLock(filePath: string): { locked: boolean; by?: string } {
  const lock = fileLocks.get(filePath);
  
  if (!lock) {
    return { locked: false };
  }
  
  // Lock expires after 5 minutes
  const lockExpired = Date.now() - lock.timestamp > 5 * 60 * 1000;
  
  if (lockExpired) {
    fileLocks.delete(filePath);
    return { locked: false };
  }
  
  if (lock.sessionId === sessionId) {
    return { locked: false }; // Same session, allow
  }
  
  return { locked: true, by: lock.sessionId };
}

function acquireLock(filePath: string): void {
  fileLocks.set(filePath, {
    timestamp: Date.now(),
    sessionId: sessionId,
  });
}

function releaseLock(filePath: string): void {
  const lock = fileLocks.get(filePath);
  if (lock && lock.sessionId === sessionId) {
    fileLocks.delete(filePath);
  }
}

// Find backlinks to a note
async function findBacklinks(vaultPath: string, notePath: string): Promise<string[]> {
  const backlinks: string[] = [];
  const noteBasename = path.basename(notePath, '.md');
  
  async function searchDir(dir: string): Promise<void> {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          await searchDir(fullPath);
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          const content = await fs.readFile(fullPath, 'utf-8');
          
          // Check for wiki links
          const wikiLinkRegex = new RegExp(`\\[\\[${noteBasename}(\\|[^\\]]+)?\\]\\]`, 'g');
          // Check for markdown links
          const mdLinkRegex = new RegExp(`\\[([^\\]]+)\\]\\(${noteBasename}\\.md\\)`, 'g');
          
          if (wikiLinkRegex.test(content) || mdLinkRegex.test(content)) {
            backlinks.push(path.relative(vaultPath, fullPath));
          }
        }
      }
    } catch (error) {
      // Ignore errors
    }
  }
  
  await searchDir(vaultPath);
  return backlinks;
}

// Tool definitions
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
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
            handle_duplicate: {
              type: 'string',
              enum: ['error', 'rename', 'overwrite'],
              description: 'How to handle duplicate filenames',
              default: 'rename',
            },
          },
          required: ['title', 'content'],
        },
      },
      {
        name: 'read_note',
        description: 'Read a note with parsed frontmatter and tags',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'The path to the note (relative to vault root)',
            },
          },
          required: ['path'],
        },
      },
      {
        name: 'update_note',
        description: 'Update an existing note with conflict detection',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'The path to the note',
            },
            content: {
              type: 'string',
              description: 'The new content',
            },
            mode: {
              type: 'string',
              enum: ['replace', 'append', 'prepend'],
              description: 'Update mode',
              default: 'replace',
            },
            metadata: {
              type: 'object',
              description: 'Update frontmatter metadata',
            },
            force: {
              type: 'boolean',
              description: 'Force update even if locked',
              default: false,
            },
          },
          required: ['path', 'content'],
        },
      },
      {
        name: 'delete_note',
        description: 'Delete a note with optional trash/backlink handling',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'The path to the note',
            },
            confirm: {
              type: 'boolean',
              description: 'Confirm deletion',
              default: false,
            },
            to_trash: {
              type: 'boolean',
              description: 'Move to .trash instead of permanent delete',
              default: true,
            },
            check_backlinks: {
              type: 'boolean',
              description: 'Check for backlinks before deletion',
              default: true,
            },
          },
          required: ['path', 'confirm'],
        },
      },
      {
        name: 'list_notes',
        description: 'List notes with filtering options',
        inputSchema: {
          type: 'object',
          properties: {
            folder: {
              type: 'string',
              description: 'The folder to list notes from',
            },
            recursive: {
              type: 'boolean',
              description: 'Include notes from subfolders',
              default: false,
            },
            filter: {
              type: 'object',
              properties: {
                modified_after: {
                  type: 'string',
                  description: 'ISO date string for modified after filter',
                },
                modified_before: {
                  type: 'string',
                  description: 'ISO date string for modified before filter',
                },
                extension: {
                  type: 'string',
                  description: 'File extension filter',
                  default: '.md',
                },
              },
            },
          },
        },
      },
      {
        name: 'analyze_vault',
        description: 'Analyze vault structure and statistics',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
    ],
  };
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
        
        return {
          content: [
            {
              type: 'text',
              text: `Vault selected: ${vault_path}\n\nVault name: ${path.basename(vault_path)}`,
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
      
      const { title, content, folder = '', metadata, handle_duplicate = 'rename' } = args as any;
      let fileName = `${title}.md`;
      let notePath = path.join(selectedVault, folder, fileName);
      
      // Handle duplicate filenames
      if (await fs.access(notePath).then(() => true).catch(() => false)) {
        switch (handle_duplicate) {
          case 'error':
            return {
              content: [
                {
                  type: 'text',
                  text: `Error: Note "${fileName}" already exists in ${folder || 'vault root'}`,
                },
              ],
            };
          
          case 'rename':
            let counter = 1;
            while (await fs.access(notePath).then(() => true).catch(() => false)) {
              fileName = `${title} ${counter}.md`;
              notePath = path.join(selectedVault, folder, fileName);
              counter++;
            }
            break;
          
          case 'overwrite':
            // Will overwrite existing file
            break;
        }
      }
      
      // Create directory if needed
      const dir = path.dirname(notePath);
      await fs.mkdir(dir, { recursive: true });
      
      // Build note content with frontmatter
      let fullContent = '';
      if (metadata && Object.keys(metadata).length > 0) {
        // Add creation date if not present
        if (!metadata.created) {
          metadata.created = new Date().toISOString();
        }
        fullContent = createFrontmatter(metadata);
      }
      fullContent += content;
      
      // Write the note
      await fs.writeFile(notePath, fullContent, 'utf-8');
      
      return {
        content: [
          {
            type: 'text',
            text: `Note created successfully!\n\nPath: ${path.relative(selectedVault, notePath)}\nVault: ${path.basename(selectedVault)}${handle_duplicate === 'rename' && fileName !== `${title}.md` ? `\n\nNote: Renamed to "${fileName}" to avoid duplicate` : ''}`,
          },
        ],
      };
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
      
      const { path: notePath } = args as any;
      const fullPath = path.join(selectedVault, notePath.endsWith('.md') ? notePath : `${notePath}.md`);
      
      try {
        const content = await fs.readFile(fullPath, 'utf-8');
        const stats = await fs.stat(fullPath);
        const { metadata, body } = parseFrontmatter(content);
        
        // Extract tags from content
        const tags = (body.match(/#[a-zA-Z0-9_\-\/]+/g) || []).filter((tag, index, self) => self.indexOf(tag) === index);
        
        let result = `# Note: ${path.basename(fullPath)}\n\n`;
        result += `**Path**: ${notePath}\n`;
        result += `**Modified**: ${stats.mtime.toLocaleString()}\n`;
        result += `**Size**: ${stats.size} bytes\n`;
        
        if (Object.keys(metadata).length > 0) {
          result += `\n## Frontmatter\n\`\`\`yaml\n`;
          for (const [key, value] of Object.entries(metadata)) {
            result += `${key}: ${Array.isArray(value) ? `[${value.join(', ')}]` : value}\n`;
          }
          result += `\`\`\`\n`;
        }
        
        if (tags.length > 0) {
          result += `\n**Tags**: ${tags.join(', ')}\n`;
        }
        
        result += `\n---\n\n${body}`;
        
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
              text: `Error: Note not found at ${notePath}`,
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
      
      const { path: notePath, content, mode = 'replace', metadata, force = false } = args as any;
      const fullPath = path.join(selectedVault, notePath.endsWith('.md') ? notePath : `${notePath}.md`);
      
      // Check for concurrent editing
      const lockStatus = checkFileLock(fullPath);
      if (lockStatus.locked && !force) {
        return {
          content: [
            {
              type: 'text',
              text: `Warning: This note is currently being edited by another session.\n\nSession ID: ${lockStatus.by}\n\nUse force=true to override, or wait for the lock to expire.`,
            },
          ],
        };
      }
      
      try {
        // Acquire lock
        acquireLock(fullPath);
        
        let currentContent = await fs.readFile(fullPath, 'utf-8');
        const { metadata: currentMetadata, body: currentBody } = parseFrontmatter(currentContent);
        
        // Merge metadata if provided
        const finalMetadata = metadata ? { ...currentMetadata, ...metadata } : currentMetadata;
        
        // Update modified date
        finalMetadata.modified = new Date().toISOString();
        
        // Build new content based on mode
        let newBody = currentBody;
        switch (mode) {
          case 'replace':
            newBody = content;
            break;
          case 'append':
            newBody = currentBody + '\n\n' + content;
            break;
          case 'prepend':
            newBody = content + '\n\n' + currentBody;
            break;
        }
        
        // Build final content
        const finalContent = createFrontmatter(finalMetadata) + newBody;
        
        // Write the note
        await fs.writeFile(fullPath, finalContent, 'utf-8');
        
        // Release lock
        releaseLock(fullPath);
        
        return {
          content: [
            {
              type: 'text',
              text: `Note updated successfully!\n\nPath: ${notePath}\nMode: ${mode}\nMetadata updated: ${metadata ? 'Yes' : 'No'}`,
            },
          ],
        };
      } catch (error) {
        releaseLock(fullPath);
        return {
          content: [
            {
              type: 'text',
              text: `Error updating note: ${error}`,
            },
          ],
        };
      }
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
      
      const { path: notePath, confirm = false, to_trash = true, check_backlinks = true } = args as any;
      
      if (!confirm) {
        return {
          content: [
            {
              type: 'text',
              text: 'Deletion requires confirmation. Set confirm=true to proceed.',
            },
          ],
        };
      }
      
      const fullPath = path.join(selectedVault, notePath.endsWith('.md') ? notePath : `${notePath}.md`);
      
      try {
        // Check if file exists
        await fs.access(fullPath);
        
        // Check for backlinks if requested
        if (check_backlinks) {
          const backlinks = await findBacklinks(selectedVault, notePath);
          if (backlinks.length > 0) {
            return {
              content: [
                {
                  type: 'text',
                  text: `Warning: This note has ${backlinks.length} backlink(s):\n\n${backlinks.join('\n')}\n\nProceed with deletion? Set check_backlinks=false to skip this check.`,
                },
              ],
            };
          }
        }
        
        if (to_trash) {
          // Move to trash
          const trashPath = path.join(selectedVault, '.trash');
          await fs.mkdir(trashPath, { recursive: true });
          
          const trashFile = path.join(trashPath, `${path.basename(notePath, '.md')}_${Date.now()}.md`);
          await fs.rename(fullPath, trashFile);
          
          return {
            content: [
              {
                type: 'text',
                text: `Note moved to trash successfully.\n\nOriginal: ${notePath}\nTrash: ${path.relative(selectedVault, trashFile)}`,
              },
            ],
          };
        } else {
          // Permanent delete
          await fs.unlink(fullPath);
          
          return {
            content: [
              {
                type: 'text',
                text: `Note permanently deleted: ${notePath}`,
              },
            ],
          };
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error deleting note: ${error}`,
            },
          ],
        };
      }
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
      
      const { folder = '', recursive = false, filter = {} } = args as any;
      const searchPath = path.join(selectedVault, folder);
      
      async function findMdFiles(dir: string, baseDir: string): Promise<Array<{path: string; stats: any}>> {
        const files: Array<{path: string; stats: any}> = [];
        try {
          const entries = await fs.readdir(dir, { withFileTypes: true });
          
          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            
            if (entry.isDirectory() && recursive && !entry.name.startsWith('.')) {
              const subFiles = await findMdFiles(fullPath, baseDir);
              files.push(...subFiles);
            } else if (entry.isFile()) {
              // Apply extension filter
              const ext = filter.extension || '.md';
              if (entry.name.endsWith(ext)) {
                const stats = await fs.stat(fullPath);
                const relativePath = path.relative(baseDir, fullPath);
                
                // Apply date filters
                let include = true;
                if (filter.modified_after) {
                  include = include && stats.mtime >= new Date(filter.modified_after);
                }
                if (filter.modified_before) {
                  include = include && stats.mtime <= new Date(filter.modified_before);
                }
                
                if (include) {
                  files.push({ path: relativePath, stats });
                }
              }
            }
          }
        } catch (error) {
          // Ignore errors
        }
        return files;
      }
      
      const mdFiles = await findMdFiles(searchPath, selectedVault);
      
      if (mdFiles.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: `No notes found in ${folder || 'vault root'} with the specified filters.`,
            },
          ],
        };
      }
      
      // Sort by modification date (newest first)
      mdFiles.sort((a, b) => b.stats.mtime.getTime() - a.stats.mtime.getTime());
      
      let result = `Found ${mdFiles.length} note(s) in ${folder || 'vault root'}:\n\n`;
      mdFiles.forEach(file => {
        result += `📄 ${file.path} (${file.stats.mtime.toLocaleDateString()})\n`;
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

    case 'analyze_vault': {
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
      
      let totalNotes = 0;
      let totalFolders = 0;
      let totalSize = 0;
      const tagCounts: Map<string, number> = new Map();
      
      async function walkDir(dir: string): Promise<void> {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          
          if (entry.isDirectory()) {
            if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
              totalFolders++;
              await walkDir(fullPath);
            }
          } else if (entry.name.endsWith('.md')) {
            totalNotes++;
            const stats = await fs.stat(fullPath);
            totalSize += stats.size;
            
            // Extract tags
            try {
              const content = await fs.readFile(fullPath, 'utf-8');
              const tags = content.match(/#[a-zA-Z0-9_\-\/]+/g) || [];
              tags.forEach(tag => {
                tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
              });
            } catch (error) {
              // Ignore read errors
            }
          }
        }
      }
      
      await walkDir(selectedVault);
      
      const topTags = Array.from(tagCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);
      
      let result = `# Vault Analysis: ${path.basename(selectedVault)}\n\n`;
      result += `## Statistics\n`;
      result += `- **Total Notes**: ${totalNotes}\n`;
      result += `- **Total Folders**: ${totalFolders}\n`;
      result += `- **Total Size**: ${(totalSize / 1024 / 1024).toFixed(2)} MB\n`;
      result += `- **Average Note Size**: ${totalNotes > 0 ? (totalSize / totalNotes / 1024).toFixed(2) : 0} KB\n`;
      
      if (topTags.length > 0) {
        result += `\n## Top 10 Tags\n`;
        topTags.forEach(([tag, count]) => {
          result += `- ${tag} (${count} occurrences)\n`;
        });
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

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('ObsidianMCP Complete Server running with all Phase 1 features...');
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});