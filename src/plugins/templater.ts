import * as fs from 'fs/promises';
import * as path from 'path';

export interface TemplaterVariable {
  name: string;
  value: string | (() => string);
}

export interface TemplateMetadata {
  name: string;
  description?: string;
  category?: string;
  variables: TemplaterVariable[];
  createdDate: string;
  lastUsed?: string;
  useCount: number;
}

export interface CustomTemplate {
  name: string;
  content: string;
  metadata: TemplateMetadata;
  filePath: string;
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
      
      // Update template usage statistics
      await this.updateTemplateUsage(templateName);
      
      return { success: true, path: notePath };
    } catch (error) {
      return { success: false, error: `Failed to create note: ${error}` };
    }
  }

  /**
   * Create a custom template
   */
  async createCustomTemplate(
    name: string,
    content: string,
    metadata: Partial<TemplateMetadata>,
    customFolder?: string
  ): Promise<{ success: boolean; path?: string; error?: string }> {
    const saveFolder = customFolder || this.templatesFolder;
    const templatePath = path.join(this.vaultPath, saveFolder, `${name}.md`);
    
    try {
      // Ensure save folder exists
      await fs.mkdir(path.join(this.vaultPath, saveFolder), { recursive: true });
      
      // Create frontmatter with metadata
      const fullMetadata: TemplateMetadata = {
        name,
        description: metadata.description || '',
        category: metadata.category || 'custom',
        variables: metadata.variables || [],
        createdDate: new Date().toISOString(),
        useCount: 0,
        ...metadata
      };

      const frontmatter = this.createTemplateFrontmatter(fullMetadata);
      const fullContent = `${frontmatter}\n\n${content}`;
      
      await fs.writeFile(templatePath, fullContent, 'utf-8');
      
      return { success: true, path: path.relative(this.vaultPath, templatePath) };
    } catch (error) {
      return { success: false, error: `Failed to create template: ${error}` };
    }
  }

  /**
   * Get all available templates with detailed metadata
   */
  async getAvailableTemplates(): Promise<CustomTemplate[]> {
    const templates: CustomTemplate[] = [];
    const templatesPath = path.join(this.vaultPath, this.templatesFolder);

    try {
      const files = await this.scanForTemplates(templatesPath, '');
      
      for (const file of files) {
        const fullPath = path.join(templatesPath, file);
        const content = await fs.readFile(fullPath, 'utf-8');
        
        const metadata = this.parseTemplateMetadata(content);
        const bodyContent = this.extractTemplateBody(content);
        
        templates.push({
          name: file.replace('.md', ''),
          content: bodyContent,
          metadata,
          filePath: file
        });
      }
    } catch (error) {
      // Templates folder doesn't exist
      return [];
    }

    return templates.sort((a, b) => b.metadata.useCount - a.metadata.useCount);
  }

  /**
   * Apply template to existing note
   */
  async applyTemplateToNote(
    templateName: string,
    notePath: string,
    variables?: TemplaterVariable[],
    mode: 'replace' | 'prepend' | 'append' = 'replace'
  ): Promise<{ success: boolean; error?: string }> {
    const template = await this.getTemplate(templateName);
    
    if (!template) {
      return { success: false, error: `Template not found: ${templateName}` };
    }

    const fullPath = path.join(this.vaultPath, notePath);
    
    try {
      // Add file-specific variables
      const fileVars: TemplaterVariable[] = [
        { name: 'title', value: path.basename(notePath, '.md') },
        { name: 'folder', value: path.dirname(notePath) },
        ...(variables || [])
      ];

      const processedContent = this.processTemplate(template, fileVars);
      
      if (mode === 'replace') {
        await fs.writeFile(fullPath, processedContent, 'utf-8');
      } else {
        const existingContent = await fs.readFile(fullPath, 'utf-8');
        const newContent = mode === 'prepend' 
          ? `${processedContent}\n\n${existingContent}`
          : `${existingContent}\n\n${processedContent}`;
        await fs.writeFile(fullPath, newContent, 'utf-8');
      }
      
      // Update template usage
      await this.updateTemplateUsage(templateName);
      
      return { success: true };
    } catch (error) {
      return { success: false, error: `Failed to apply template: ${error}` };
    }
  }

  /**
   * Generate default template suggestions
   */
  generateTemplateProposals(): {
    dailyNote: string;
    weeklyNote: string;
    meetingNote: string;
    projectNote: string;
    taskNote: string;
  } {
    return {
      dailyNote: `---
description: Daily note template
category: daily
variables:
  - name: date
    value: "{{date:YYYY-MM-DD}}"
---

# {{date:YYYY-MM-DD dddd}}

## 📅 Today's Plan
- [ ] 

## 🎯 Priority Tasks
1. 
2. 
3. 

## 📝 Notes


## 🌟 Today's Wins


## 🔄 Tomorrow's Focus


---
Created: {{date:YYYY-MM-DD HH:mm}}`,

      weeklyNote: `---
description: Weekly review and planning template
category: weekly
variables:
  - name: week_start
    value: "{{date:YYYY-MM-DD}}"
---

# Week of {{date:YYYY-MM-DD}}

## 📊 Last Week Review

### ✅ Completed
- 

### ⏸️ In Progress
- 

### ❌ Not Started
- 

## 🎯 This Week's Goals

### 🔥 High Priority
1. 
2. 
3. 

### 📝 Other Tasks
- 

## 📈 Metrics & Insights


## 🧠 Learnings & Notes


---
Created: {{date:YYYY-MM-DD HH:mm}}`,

      meetingNote: `---
description: Meeting notes template
category: meeting
variables:
  - name: meeting_title
    value: "Meeting Title"
  - name: attendees
    value: "Attendee Names"
---

# {{meeting_title}}

**Date:** {{date:YYYY-MM-DD}}  
**Time:** {{time}}  
**Attendees:** {{attendees}}

## 📋 Agenda
1. 
2. 
3. 

## 📝 Discussion Notes

### Topic 1


### Topic 2


## ✅ Action Items
- [ ] **Person:** Task description - Due: 
- [ ] **Person:** Task description - Due: 

## 🔗 Related Links


## 📎 Attachments


---
Next Meeting: 
Created: {{date:YYYY-MM-DD HH:mm}}`,

      projectNote: `---
description: Project planning template
category: project
variables:
  - name: project_name
    value: "Project Name"
  - name: project_owner
    value: "Project Owner"
---

# 📋 {{project_name}}

**Owner:** {{project_owner}}  
**Start Date:** {{date:YYYY-MM-DD}}  
**Status:** 🟡 Planning

## 🎯 Project Overview

### Objective


### Success Criteria
- 
- 
- 

## 📊 Project Details

**Timeline:**  
**Budget:**  
**Team:**  

## 📋 Tasks

### 🔥 Phase 1: Planning
- [ ] 
- [ ] 
- [ ] 

### 🚀 Phase 2: Execution
- [ ] 
- [ ] 
- [ ] 

### ✅ Phase 3: Completion
- [ ] 
- [ ] 
- [ ] 

## 🎯 Milestones
| Date | Milestone | Status |
|------|-----------|--------|
| {{date:YYYY-MM-DD}} | Project Start | ⏳ |
|  |  |  |
|  |  |  |

## 📝 Notes & Updates


## 🔗 Related Resources


---
Created: {{date:YYYY-MM-DD HH:mm}}`,

      taskNote: `---
description: Task note template for TaskNotes integration
category: task
variables:
  - name: task_title
    value: "Task Title"
status: todo
priority: medium
---

# {{task_title}}

**Created:** {{date:YYYY-MM-DD}}  
**Priority:** Medium  
**Status:** Todo  

## 📝 Description


## ✅ Acceptance Criteria
- [ ] 
- [ ] 
- [ ] 

## 📋 Subtasks
- [ ] 
- [ ] 
- [ ] 

## 🔗 Related
- 

## 📎 Resources
- 

## 📝 Progress Notes


---
Created: {{date:YYYY-MM-DD HH:mm}}`
    };
  }

  // Private helper methods for template management

  private createTemplateFrontmatter(metadata: TemplateMetadata): string {
    const lines = ['---'];
    lines.push(`description: "${metadata.description}"`);
    lines.push(`category: ${metadata.category}`);
    lines.push(`created: ${metadata.createdDate}`);
    lines.push(`useCount: ${metadata.useCount}`);
    
    if (metadata.lastUsed) {
      lines.push(`lastUsed: ${metadata.lastUsed}`);
    }
    
    if (metadata.variables.length > 0) {
      lines.push('variables:');
      metadata.variables.forEach(variable => {
        lines.push(`  - name: ${variable.name}`);
        lines.push(`    value: "${variable.value}"`);
      });
    }
    
    lines.push('---');
    return lines.join('\n');
  }

  private parseTemplateMetadata(content: string): TemplateMetadata {
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    
    if (!frontmatterMatch) {
      return {
        name: 'Unknown Template',
        description: '',
        category: 'uncategorized',
        variables: [],
        createdDate: new Date().toISOString(),
        useCount: 0
      };
    }

    const yamlContent = frontmatterMatch[1];
    const metadata: Partial<TemplateMetadata> = {
      variables: []
    };
    
    // Simple YAML parsing
    yamlContent.split('\n').forEach(line => {
      const match = line.match(/^(\w+):\s*(.+)$/);
      if (match) {
        const [, key, value] = match;
        switch (key) {
          case 'description':
            metadata.description = value.replace(/['"]/g, '');
            break;
          case 'category':
            metadata.category = value;
            break;
          case 'created':
            metadata.createdDate = value;
            break;
          case 'useCount':
            metadata.useCount = parseInt(value) || 0;
            break;
          case 'lastUsed':
            metadata.lastUsed = value;
            break;
        }
      }
    });

    return {
      name: metadata.name || 'Unknown Template',
      description: metadata.description || '',
      category: metadata.category || 'uncategorized',
      variables: metadata.variables || [],
      createdDate: metadata.createdDate || new Date().toISOString(),
      useCount: metadata.useCount || 0,
      lastUsed: metadata.lastUsed
    };
  }

  private extractTemplateBody(content: string): string {
    const frontmatterRegex = /^---\n[\s\S]*?\n---\n/;
    return content.replace(frontmatterRegex, '').trim();
  }

  private async updateTemplateUsage(templateName: string): Promise<void> {
    try {
      const templatePath = path.join(
        this.vaultPath,
        this.templatesFolder,
        templateName.endsWith('.md') ? templateName : `${templateName}.md`
      );
      
      const content = await fs.readFile(templatePath, 'utf-8');
      const frontmatterMatch = content.match(/^(---\n[\s\S]*?\n---\n)([\s\S]*)$/);
      
      if (frontmatterMatch) {
        let frontmatter = frontmatterMatch[1];
        const body = frontmatterMatch[2];
        
        // Update useCount and lastUsed
        const now = new Date().toISOString();
        frontmatter = frontmatter.replace(/useCount:\s*(\d+)/, (match, count) => {
          return `useCount: ${parseInt(count) + 1}`;
        });
        
        if (frontmatter.includes('lastUsed:')) {
          frontmatter = frontmatter.replace(/lastUsed:.*/, `lastUsed: ${now}`);
        } else {
          frontmatter = frontmatter.replace('---', `lastUsed: ${now}\n---`);
        }
        
        await fs.writeFile(templatePath, frontmatter + body, 'utf-8');
      }
    } catch (error) {
      // Ignore errors in usage tracking
    }
  }
}