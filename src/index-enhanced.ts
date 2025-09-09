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

// Enhanced MCP Server for Obsidian with Vault Discovery
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

  // Also check config file
  try {
    const configPath = path.join(os.homedir(), '.obsidian-mcp', 'config.yaml');
    const config = await fs.readFile(configPath, 'utf-8');
    const match = config.match(/path:\s*"([^"]+)"/);
    if (match) {
      const vaultPath = match[1].replace('~', os.homedir());
      if (!vaults.includes(vaultPath)) {
        vaults.push(vaultPath);
      }
    }
  } catch (error) {
    // Config not found
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

// Analyze folder structure
async function analyzeFolderStructure(vaultPath: string, relativePath: string = ''): Promise<any> {
  const fullPath = path.join(vaultPath, relativePath);
  const structure: any = {
    name: relativePath || path.basename(vaultPath),
    type: 'folder',
    path: relativePath,
    children: []
  };

  try {
    const entries = await fs.readdir(fullPath, { withFileTypes: true });
    
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue; // Skip hidden files
      
      const entryPath = relativePath ? path.join(relativePath, entry.name) : entry.name;
      
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules' && entry.name !== '.obsidian' && entry.name !== '.trash') {
          const subFolder = await analyzeFolderStructure(vaultPath, entryPath);
          structure.children.push(subFolder);
        }
      } else if (entry.name.endsWith('.md')) {
        structure.children.push({
          name: entry.name,
          type: 'file',
          path: entryPath
        });
      }
    }
    
    // Sort: folders first, then files
    structure.children.sort((a: any, b: any) => {
      if (a.type === b.type) return a.name.localeCompare(b.name);
      return a.type === 'folder' ? -1 : 1;
    });
    
  } catch (error) {
    console.error(`Error reading ${fullPath}:`, error);
  }

  return structure;
}

// Format folder structure as tree
function formatTree(node: any, prefix: string = '', isLast: boolean = true): string {
  let result = '';
  
  if (node.name) {
    const connector = isLast ? '└── ' : '├── ';
    const icon = node.type === 'folder' ? '📁 ' : '📄 ';
    result += prefix + connector + icon + node.name + '\n';
  }
  
  if (node.children && node.children.length > 0) {
    const childPrefix = node.name ? (prefix + (isLast ? '    ' : '│   ')) : '';
    node.children.forEach((child: any, index: number) => {
      const isLastChild = index === node.children.length - 1;
      result += formatTree(child, childPrefix, isLastChild);
    });
  }
  
  return result;
}

// Get statistics about vault
async function getVaultStats(vaultPath: string): Promise<any> {
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
  
  await walkDir(vaultPath);
  
  const topTags = Array.from(tagCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([tag, count]) => `${tag} (${count})`);
  
  return {
    totalNotes,
    totalFolders,
    totalSize: `${(totalSize / 1024 / 1024).toFixed(2)} MB`,
    topTags
  };
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
        name: 'analyze_vault',
        description: 'Analyze the folder structure and statistics of the selected vault',
        inputSchema: {
          type: 'object',
          properties: {
            show_tree: {
              type: 'boolean',
              description: 'Show folder tree structure',
              default: true,
            },
            show_stats: {
              type: 'boolean',
              description: 'Show vault statistics',
              default: true,
            },
          },
        },
      },
      {
        name: 'create_note',
        description: 'Create a new note in the selected vault',
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
        description: 'Read a note from the selected vault',
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
        name: 'list_notes',
        description: 'List notes in a specific folder',
        inputSchema: {
          type: 'object',
          properties: {
            folder: {
              type: 'string',
              description: 'The folder to list notes from (relative to vault root)',
            },
            recursive: {
              type: 'boolean',
              description: 'Include notes from subfolders',
              default: false,
            },
          },
        },
      },
      {
        name: 'search_notes',
        description: 'Search for notes containing specific text',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query',
            },
            folder: {
              type: 'string',
              description: 'Limit search to specific folder',
            },
          },
          required: ['query'],
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
              text: 'No Obsidian vaults found. Please create a vault first or check the paths.',
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
        
        // Quick stats
        const entries = await fs.readdir(vault_path);
        const mdFiles = entries.filter(e => e.endsWith('.md'));
        
        return {
          content: [
            {
              type: 'text',
              text: `Vault selected: ${vault_path}\n\nQuick info:\n- ${mdFiles.length} markdown files in root\n- Vault name: ${path.basename(vault_path)}\n\nYou can now use analyze_vault to see the full structure.`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: Could not access vault at ${vault_path}. Please check the path.`,
            },
          ],
        };
      }
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
      
      const { show_tree = true, show_stats = true } = args as any;
      let result = `# Vault Analysis: ${path.basename(selectedVault)}\n\n`;
      
      if (show_stats) {
        const stats = await getVaultStats(selectedVault);
        result += '## Statistics\n';
        result += `- Total Notes: ${stats.totalNotes}\n`;
        result += `- Total Folders: ${stats.totalFolders}\n`;
        result += `- Total Size: ${stats.totalSize}\n`;
        
        if (stats.topTags.length > 0) {
          result += `\n### Top Tags\n`;
          stats.topTags.forEach((tag: string) => {
            result += `- ${tag}\n`;
          });
        }
        result += '\n';
      }
      
      if (show_tree) {
        const structure = await analyzeFolderStructure(selectedVault);
        result += '## Folder Structure\n```\n';
        result += formatTree(structure);
        result += '```\n';
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
      
      const { title, content, folder = '' } = args as any;
      const notePath = path.join(selectedVault, folder, `${title}.md`);
      
      // Create directory if needed
      const dir = path.dirname(notePath);
      await fs.mkdir(dir, { recursive: true });
      
      // Write the note
      await fs.writeFile(notePath, content, 'utf-8');
      
      return {
        content: [
          {
            type: 'text',
            text: `Note created successfully!\n\nPath: ${path.relative(selectedVault, notePath)}\nVault: ${path.basename(selectedVault)}`,
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
        
        return {
          content: [
            {
              type: 'text',
              text: `# Note: ${path.basename(fullPath)}\n\nPath: ${notePath}\nModified: ${stats.mtime.toLocaleString()}\nSize: ${stats.size} bytes\n\n---\n\n${content}`,
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
      
      const { folder = '', recursive = false } = args as any;
      const searchPath = path.join(selectedVault, folder);
      
      async function findMdFiles(dir: string, baseDir: string): Promise<string[]> {
        const files: string[] = [];
        try {
          const entries = await fs.readdir(dir, { withFileTypes: true });
          
          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            
            if (entry.isDirectory() && recursive && !entry.name.startsWith('.')) {
              const subFiles = await findMdFiles(fullPath, baseDir);
              files.push(...subFiles);
            } else if (entry.isFile() && entry.name.endsWith('.md')) {
              files.push(path.relative(baseDir, fullPath));
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
              text: `No notes found in ${folder || 'vault root'}`,
            },
          ],
        };
      }
      
      return {
        content: [
          {
            type: 'text',
            text: `Found ${mdFiles.length} note(s) in ${folder || 'vault root'}:\n\n${mdFiles.join('\n')}`,
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
      
      const { query, folder = '' } = args as any;
      const searchPath = path.join(selectedVault, folder);
      const results: Array<{ path: string; matches: string[] }> = [];
      
      async function searchInDir(dir: string): Promise<void> {
        try {
          const entries = await fs.readdir(dir, { withFileTypes: true });
          
          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            
            if (entry.isDirectory() && !entry.name.startsWith('.')) {
              await searchInDir(fullPath);
            } else if (entry.isFile() && entry.name.endsWith('.md')) {
              const content = await fs.readFile(fullPath, 'utf-8');
              const lines = content.split('\n');
              const matches: string[] = [];
              
              lines.forEach((line, i) => {
                if (line.toLowerCase().includes(query.toLowerCase())) {
                  matches.push(`Line ${i + 1}: ${line.trim()}`);
                }
              });
              
              if (matches.length > 0) {
                results.push({
                  path: path.relative(selectedVault, fullPath),
                  matches: matches.slice(0, 3), // Show first 3 matches
                });
              }
            }
          }
        } catch (error) {
          // Ignore errors
        }
      }
      
      await searchInDir(searchPath);
      
      if (results.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: `No results found for "${query}"`,
            },
          ],
        };
      }
      
      let resultText = `Found "${query}" in ${results.length} note(s):\n\n`;
      results.forEach(r => {
        resultText += `📄 ${r.path}\n`;
        r.matches.forEach(m => {
          resultText += `   ${m}\n`;
        });
        resultText += '\n';
      });
      
      return {
        content: [
          {
            type: 'text',
            text: resultText,
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
  console.error('ObsidianMCP Enhanced Server running...');
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});