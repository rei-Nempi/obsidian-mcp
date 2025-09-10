import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Daily Notes plugin for creating and managing daily notes
 * Compatible with Obsidian's Daily Notes core plugin
 */
export class DailyNotesPlugin {
  private vaultPath: string;
  private dailyNotesFolder: string;
  private templatePath?: string;
  private dateFormat: string;

  constructor(vaultPath: string, dailyNotesFolder: string = 'Daily Notes', dateFormat: string = 'YYYY-MM-DD') {
    this.vaultPath = vaultPath;
    this.dailyNotesFolder = dailyNotesFolder;
    this.dateFormat = dateFormat;
  }

  /**
   * Create a daily note for the specified date
   */
  async createDailyNote(
    date?: string, 
    template?: string, 
    customFolder?: string,
    variables: { [key: string]: string } = {}
  ): Promise<{ success: boolean; path?: string; error?: string }> {
    try {
      const targetDate = date ? new Date(date) : new Date();
      const dateStr = this.formatDate(targetDate);
      const folder = customFolder || this.dailyNotesFolder;
      
      const dailyNotesDir = path.join(this.vaultPath, folder);
      await fs.mkdir(dailyNotesDir, { recursive: true });
      
      const noteFileName = `${dateStr}.md`;
      const notePath = path.join(dailyNotesDir, noteFileName);
      
      // Check if daily note already exists
      try {
        await fs.access(notePath);
        return {
          success: false,
          error: `Daily note for ${dateStr} already exists at: ${path.relative(this.vaultPath, notePath)}`
        };
      } catch {
        // File doesn't exist, proceed with creation
      }
      
      let content = '';
      
      if (template) {
        // Use provided template
        content = this.processTemplate(template, targetDate, variables);
      } else {
        // Use default daily note template
        content = this.createDefaultDailyNoteContent(targetDate);
      }
      
      await fs.writeFile(notePath, content, 'utf-8');
      
      return {
        success: true,
        path: path.relative(this.vaultPath, notePath)
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to create daily note: ${error}`
      };
    }
  }

  /**
   * Get the path for a daily note on a specific date
   */
  getDailyNotePath(date?: string, customFolder?: string): string {
    const targetDate = date ? new Date(date) : new Date();
    const dateStr = this.formatDate(targetDate);
    const folder = customFolder || this.dailyNotesFolder;
    
    return path.join(this.vaultPath, folder, `${dateStr}.md`);
  }

  /**
   * Check if a daily note exists for the specified date
   */
  async dailyNoteExists(date?: string, customFolder?: string): Promise<boolean> {
    const notePath = this.getDailyNotePath(date, customFolder);
    
    try {
      await fs.access(notePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get a list of all daily notes
   */
  async listDailyNotes(customFolder?: string): Promise<string[]> {
    const folder = customFolder || this.dailyNotesFolder;
    const dailyNotesDir = path.join(this.vaultPath, folder);
    
    try {
      const files = await fs.readdir(dailyNotesDir);
      return files
        .filter(file => file.endsWith('.md') && this.isDailyNoteFile(file))
        .sort()
        .reverse(); // Most recent first
    } catch {
      return [];
    }
  }

  /**
   * Format date according to the specified format
   */
  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    
    // Support basic date formats
    switch (this.dateFormat) {
      case 'YYYY-MM-DD':
        return `${year}-${month}-${day}`;
      case 'YYYY/MM/DD':
        return `${year}/${month}/${day}`;
      case 'MM-DD-YYYY':
        return `${month}-${day}-${year}`;
      case 'DD-MM-YYYY':
        return `${day}-${month}-${year}`;
      default:
        return `${year}-${month}-${day}`;
    }
  }

  /**
   * Create default daily note content
   */
  private createDefaultDailyNoteContent(date: Date): string {
    const dateStr = this.formatDate(date);
    const dayName = date.toLocaleDateString('ja-JP', { weekday: 'long' });
    const today = new Date();
    const isToday = date.toDateString() === today.toDateString();
    
    let content = `# ${dateStr} (${dayName})\n\n`;
    
    if (isToday) {
      content += `## 📅 今日の予定\n\n`;
      content += `- [ ] \n\n`;
      
      content += `## 🎯 今日の目標\n\n`;
      content += `1. \n`;
      content += `2. \n`;
      content += `3. \n\n`;
      
      content += `## 📝 メモ・ログ\n\n`;
      content += `### ${new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}\n`;
      content += `\n\n`;
      
      content += `## ✅ 完了したタスク\n\n`;
      content += `- [x] \n\n`;
      
      content += `## 🧠 今日の学び・気づき\n\n`;
      content += `\n\n`;
      
      content += `## 📊 今日の振り返り\n\n`;
      content += `**良かったこと:**\n`;
      content += `- \n\n`;
      content += `**改善点:**\n`;
      content += `- \n\n`;
      content += `**明日への引き継ぎ:**\n`;
      content += `- \n\n`;
    } else {
      // Future or past date
      content += `## 📋 予定・タスク\n\n`;
      content += `- [ ] \n\n`;
      
      content += `## 📝 メモ\n\n`;
      content += `\n\n`;
      
      content += `## 🔗 関連リンク\n\n`;
      content += `- \n\n`;
    }
    
    return content;
  }

  /**
   * Process template with date and custom variables
   */
  private processTemplate(template: string, date: Date, variables: { [key: string]: string }): string {
    let processed = template;
    
    // Date variables
    const dateStr = this.formatDate(date);
    const dayName = date.toLocaleDateString('ja-JP', { weekday: 'long' });
    const monthName = date.toLocaleDateString('ja-JP', { month: 'long' });
    const year = date.getFullYear().toString();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    
    // Replace date placeholders
    processed = processed
      .replace(/\{\{date\}\}/g, dateStr)
      .replace(/\{\{today\}\}/g, dateStr)
      .replace(/\{\{day\}\}/g, day)
      .replace(/\{\{month\}\}/g, month)
      .replace(/\{\{year\}\}/g, year)
      .replace(/\{\{dayName\}\}/g, dayName)
      .replace(/\{\{monthName\}\}/g, monthName)
      .replace(/\{\{timestamp\}\}/g, new Date().toISOString());
    
    // Replace custom variables
    Object.keys(variables).forEach(key => {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      processed = processed.replace(regex, variables[key] || '');
    });
    
    return processed;
  }

  /**
   * Check if a filename follows daily note naming convention
   */
  private isDailyNoteFile(filename: string): boolean {
    const nameWithoutExt = filename.replace('.md', '');
    
    // Basic date format validation
    const datePatterns = [
      /^\d{4}-\d{2}-\d{2}$/,  // YYYY-MM-DD
      /^\d{4}\/\d{2}\/\d{2}$/, // YYYY/MM/DD
      /^\d{2}-\d{2}-\d{4}$/,  // MM-DD-YYYY
      /^\d{2}-\d{2}-\d{4}$/,  // DD-MM-YYYY
    ];
    
    return datePatterns.some(pattern => pattern.test(nameWithoutExt));
  }

  /**
   * Set template path for daily notes
   */
  setTemplatePath(templatePath: string) {
    this.templatePath = templatePath;
  }

  /**
   * Set daily notes folder
   */
  setDailyNotesFolder(folder: string) {
    this.dailyNotesFolder = folder;
  }

  /**
   * Set date format
   */
  setDateFormat(format: string) {
    this.dateFormat = format;
  }
}