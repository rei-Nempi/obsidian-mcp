import * as fs from 'fs/promises';
import * as path from 'path';

export interface TemplaterVariable {
  name: string;
  value: string | (() => string);
}

export class TemplaterPlugin {
  private vaultPath: string;
  private templatesFolder: string;
  private customFunctions: Map<string, Function>;

  constructor(vaultPath: string, templatesFolder: string = 'Templates') {
    this.vaultPath = vaultPath;
    this.templatesFolder = templatesFolder;
    this.customFunctions = new Map();
    this.initializeBuiltinFunctions();
  }

  private initializeBuiltinFunctions(): void {
    // Date functions
    this.customFunctions.set('date', () => new Date().toISOString().split('T')[0]);
    this.customFunctions.set('time', () => new Date().toLocaleTimeString());
    this.customFunctions.set('now', () => new Date().toLocaleString());
    
    // Date with format
    this.customFunctions.set('date:YYYY-MM-DD', () => new Date().toISOString().split('T')[0]);
    this.customFunctions.set('date:YYYYMMDD', () => {
      const d = new Date();
      return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    });
    this.customFunctions.set('date:YYYY', () => new Date().getFullYear().toString());
    this.customFunctions.set('date:MM', () => String(new Date().getMonth() + 1).padStart(2, '0'));
    this.customFunctions.set('date:DD', () => String(new Date().getDate()).padStart(2, '0'));
    
    // Day names
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    
    this.customFunctions.set('date:dddd', () => days[new Date().getDay()]);
    this.customFunctions.set('date:MMMM', () => months[new Date().getMonth()]);
    
    // File functions
    this.customFunctions.set('title', () => 'Untitled');
    this.customFunctions.set('folder', () => '');
    
    // Cursor positioning
    this.customFunctions.set('cursor', () => '');
  }

  async listTemplates(): Promise<Array<{ name: string; path: string; description?: string }>> {
    const templates: Array<{ name: string; path: string; description?: string }> = [];
    const templatesPath = path.join(this.vaultPath, this.templatesFolder);

    try {
      const files = await this.scanForTemplates(templatesPath, '');
      
      for (const file of files) {
        const fullPath = path.join(templatesPath, file);
        const content = await fs.readFile(fullPath, 'utf-8');
        
        // Extract description from frontmatter if present
        const descMatch = content.match(/^---\n[\s\S]*?description:\s*(.+?)\n[\s\S]*?---/);
        const description = descMatch ? descMatch[1] : undefined;
        
        templates.push({
          name: file.replace('.md', ''),
          path: file,
          description
        });
      }
    } catch (error) {
      // Templates folder doesn't exist
      return [];
    }

    return templates;
  }

  private async scanForTemplates(dir: string, prefix: string): Promise<string[]> {
    const files: string[] = [];
    
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = prefix ? path.join(prefix, entry.name) : entry.name;
        
        if (entry.isDirectory()) {
          const subFiles = await this.scanForTemplates(fullPath, relativePath);
          files.push(...subFiles);
        } else if (entry.name.endsWith('.md')) {
          files.push(relativePath);
        }
      }
    } catch (error) {
      // Ignore errors
    }
    
    return files;
  }

  async getTemplate(templateName: string): Promise<string | null> {
    const templatePath = path.join(
      this.vaultPath,
      this.templatesFolder,
      templateName.endsWith('.md') ? templateName : `${templateName}.md`
    );

    try {
      const content = await fs.readFile(templatePath, 'utf-8');
      return content;
    } catch (error) {
      return null;
    }
  }

  processTemplate(template: string, variables?: TemplaterVariable[]): string {
    let processed = template;

    // Add custom variables
    const allVariables = new Map<string, string | (() => string)>();
    
    // Add provided variables
    if (variables) {
      variables.forEach(v => {
        allVariables.set(v.name, v.value);
      });
    }

    // Process Templater syntax: <% tp.function %>
    processed = processed.replace(/<%\s*tp\.(\w+)(?::([^%>]+))?\s*%>/g, (match, func, args) => {
      const fullFunc = args ? `${func}:${args}` : func;
      
      if (this.customFunctions.has(fullFunc)) {
        const fn = this.customFunctions.get(fullFunc)!;
        return typeof fn === 'function' ? fn() : fn;
      }
      
      if (this.customFunctions.has(func)) {
        const fn = this.customFunctions.get(func)!;
        return typeof fn === 'function' ? fn() : fn;
      }
      
      return match; // Keep unrecognized functions as-is
    });

    // Process simple variables: {{variable}}
    processed = processed.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
      if (allVariables.has(varName)) {
        const value = allVariables.get(varName)!;
        return typeof value === 'function' ? value() : value;
      }
      return match;
    });

    // Process date format: {{date:format}}
    processed = processed.replace(/\{\{date:([^}]+)\}\}/g, (match, format) => {
      return this.formatDate(new Date(), format);
    });

    return processed;
  }

  private formatDate(date: Date, format: string): string {
    const replacements: Record<string, string> = {
      'YYYY': date.getFullYear().toString(),
      'YY': date.getFullYear().toString().slice(-2),
      'MM': String(date.getMonth() + 1).padStart(2, '0'),
      'M': String(date.getMonth() + 1),
      'DD': String(date.getDate()).padStart(2, '0'),
      'D': String(date.getDate()),
      'HH': String(date.getHours()).padStart(2, '0'),
      'H': String(date.getHours()),
      'mm': String(date.getMinutes()).padStart(2, '0'),
      'm': String(date.getMinutes()),
      'ss': String(date.getSeconds()).padStart(2, '0'),
      's': String(date.getSeconds()),
    };

    let formatted = format;
    for (const [key, value] of Object.entries(replacements)) {
      formatted = formatted.replace(new RegExp(key, 'g'), value);
    }

    return formatted;
  }

  registerCustomFunction(name: string, fn: Function): void {
    this.customFunctions.set(name, fn);
  }

  async createNoteFromTemplate(
    templateName: string,
    notePath: string,
    variables?: TemplaterVariable[]
  ): Promise<{ success: boolean; path?: string; error?: string }> {
    const template = await this.getTemplate(templateName);
    
    if (!template) {
      return { success: false, error: `Template not found: ${templateName}` };
    }

    // Add file-specific variables
    const fileVars: TemplaterVariable[] = [
      { name: 'title', value: path.basename(notePath, '.md') },
      { name: 'folder', value: path.dirname(notePath) },
      ...(variables || [])
    ];

    const processedContent = this.processTemplate(template, fileVars);
    const fullPath = path.join(this.vaultPath, notePath);

    try {
      // Create directory if needed
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      
      // Write the file
      await fs.writeFile(fullPath, processedContent, 'utf-8');
      
      return { success: true, path: notePath };
    } catch (error) {
      return { success: false, error: `Failed to create note: ${error}` };
    }
  }
}