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
import { TemplaterPlugin, TemplaterVariable } from './plugins/templater';
import { BookSearchPlugin, BookMetadata } from './plugins/book-search';

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

// Store last book search results for easy selection
let lastBookSearchResults: BookMetadata[] = [];

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

// Initialize plugins
async function initializePlugins(): Promise<void> {
  if (!selectedVault) return;
  
  // Initialize Templater plugin
  templaterPlugin = new TemplaterPlugin(selectedVault);
  
  // Initialize Book Search plugin (with optional Google Books API key from env)
  const googleApiKey = process.env.GOOGLE_BOOKS_API_KEY;
  bookSearchPlugin = new BookSearchPlugin(googleApiKey);
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
        },
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
        },
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
              default: false,
            },
            template: {
              type: 'string',
              description: 'Template name for the book note',
            },
            folder: {
              type: 'string',
              description: 'Folder for the book note',
              default: 'Books',
            },
          },
          required: ['isbn'],
        },
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
              default: 5,
            },
          },
          required: ['title'],
        },
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
              default: 'Books',
            },
          },
        },
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
      
      // Verify template exists if specified
      if (template && templaterPlugin) {
        const templates = await templaterPlugin.listTemplates();
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
      
      if (template && templaterPlugin) {
        const templateContent = await templaterPlugin.getTemplate(template);
        if (templateContent) {
          // Use template format ONLY - no additional formatting
          content = bookSearchPlugin.formatAsMarkdown(book, templateContent);
          useDefaultFormat = false;
        }
      }
      
      if (useDefaultFormat) {
        // Only use default format if no template is specified or found
        if (template) {
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
      
      const { title, content, folder = '', metadata } = args as any;
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
      fullContent += content;
      
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