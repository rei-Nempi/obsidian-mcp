import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Task status as defined by Obsidian Tasks plugin
 */
export type TaskStatus = 'incomplete' | 'complete' | 'cancelled' | 'in-progress' | 'waiting' | 'scheduled';

/**
 * Task priority levels
 */
export type TaskPriority = 'highest' | 'high' | 'medium' | 'low' | 'lowest';

/**
 * Task metadata interface compatible with Obsidian Tasks plugin
 */
export interface TaskMetadata {
  id?: string;
  description: string;
  status: TaskStatus;
  priority?: TaskPriority;
  createdDate?: string;
  scheduledDate?: string;
  startDate?: string;
  dueDate?: string;
  doneDate?: string;
  cancelled?: boolean;
  recurring?: string;
  tags?: string[];
  project?: string;
  area?: string;
  heading?: string;
  blockLink?: string;
  filePath?: string;
}

/**
 * Task filters for querying
 */
export interface TaskFilters {
  status?: TaskStatus[];
  priority?: TaskPriority[];
  hasScheduledDate?: boolean;
  hasDueDate?: boolean;
  project?: string;
  tag?: string[];
  heading?: string;
  path?: string;
  dueAfter?: string;
  dueBefore?: string;
  createdAfter?: string;
  createdBefore?: string;
}

/**
 * Plugin for Obsidian Tasks integration
 * Works with the Tasks plugin format for task management
 */
export class TasksPlugin {
  private vaultPath: string;

  constructor(vaultPath: string) {
    this.vaultPath = vaultPath;
  }

  /**
   * Create a new task in a specified file
   */
  async createTask(taskData: Partial<TaskMetadata>, filePath?: string): Promise<TaskMetadata> {
    const targetPath = filePath || path.join(this.vaultPath, 'Tasks.md');
    
    // Ensure the task has required properties
    const task: TaskMetadata = {
      description: taskData.description || 'Untitled Task',
      status: taskData.status || 'incomplete',
      priority: taskData.priority,
      createdDate: taskData.createdDate || new Date().toISOString().split('T')[0],
      scheduledDate: taskData.scheduledDate,
      startDate: taskData.startDate,
      dueDate: taskData.dueDate,
      tags: taskData.tags || [],
      project: taskData.project,
      area: taskData.area,
      filePath: targetPath,
    };

    // Build the task line in Tasks plugin format
    const taskLine = this.buildTaskLine(task);
    
    try {
      // Check if file exists, create if not
      try {
        await fs.access(targetPath);
      } catch {
        await fs.writeFile(targetPath, '# Tasks\n\n');
      }

      // Read current content
      const content = await fs.readFile(targetPath, 'utf-8');
      
      // Add the new task
      const updatedContent = content + '\n' + taskLine + '\n';
      
      await fs.writeFile(targetPath, updatedContent);
      
      return task;
    } catch (error) {
      throw new Error(`Failed to create task: ${error}`);
    }
  }

  /**
   * Parse all tasks from the vault
   */
  async listTasks(filters?: TaskFilters): Promise<TaskMetadata[]> {
    const tasks: TaskMetadata[] = [];
    
    try {
      await this.scanDirectoryForTasks(this.vaultPath, tasks);
      
      // Apply filters if provided
      if (filters) {
        return this.filterTasks(tasks, filters);
      }
      
      return tasks;
    } catch (error) {
      throw new Error(`Failed to list tasks: ${error}`);
    }
  }

  /**
   * Update a task's status
   */
  async updateTaskStatus(filePath: string, taskLine: number, newStatus: TaskStatus): Promise<boolean> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n');
      
      if (taskLine >= lines.length) {
        throw new Error('Task line not found');
      }
      
      const line = lines[taskLine];
      if (!this.isTaskLine(line)) {
        throw new Error('Line is not a task');
      }
      
      // Update the task status
      const updatedLine = this.updateTaskLineStatus(line, newStatus);
      lines[taskLine] = updatedLine;
      
      await fs.writeFile(filePath, lines.join('\n'));
      return true;
    } catch (error) {
      throw new Error(`Failed to update task status: ${error}`);
    }
  }

  /**
   * Get task statistics
   */
  async getTaskStats(): Promise<{
    total: number;
    incomplete: number;
    complete: number;
    cancelled: number;
    overdue: number;
    dueToday: number;
    dueTomorrow: number;
  }> {
    const tasks = await this.listTasks();
    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    return {
      total: tasks.length,
      incomplete: tasks.filter(t => t.status === 'incomplete').length,
      complete: tasks.filter(t => t.status === 'complete').length,
      cancelled: tasks.filter(t => t.status === 'cancelled').length,
      overdue: tasks.filter(t => t.dueDate && t.dueDate < today && t.status !== 'complete').length,
      dueToday: tasks.filter(t => t.dueDate === today && t.status !== 'complete').length,
      dueTomorrow: tasks.filter(t => t.dueDate === tomorrow && t.status !== 'complete').length,
    };
  }

  /**
   * Get overdue tasks
   */
  async getOverdueTasks(): Promise<TaskMetadata[]> {
    const today = new Date().toISOString().split('T')[0];
    const filters: TaskFilters = {
      status: ['incomplete', 'in-progress'],
      dueBefore: today,
    };
    
    return this.listTasks(filters);
  }

  /**
   * Get tasks grouped by project
   */
  async getTasksByProject(): Promise<{ [project: string]: TaskMetadata[] }> {
    const tasks = await this.listTasks();
    const grouped: { [project: string]: TaskMetadata[] } = {};
    
    tasks.forEach(task => {
      const project = task.project || 'No Project';
      if (!grouped[project]) {
        grouped[project] = [];
      }
      grouped[project].push(task);
    });
    
    return grouped;
  }

  /**
   * Build a task line in Tasks plugin format
   */
  private buildTaskLine(task: TaskMetadata): string {
    let line = '- [ ] ' + task.description;
    
    // Add emoji for status (Tasks plugin style)
    if (task.status === 'complete') line = line.replace('[ ]', '[x]');
    else if (task.status === 'cancelled') line = line.replace('[ ]', '[-]');
    else if (task.status === 'in-progress') line = line.replace('[ ]', '[/]');
    
    // Add priority
    if (task.priority) {
      const prioritySymbols = {
        highest: ' 🔺',
        high: ' ⏫',
        medium: ' 🔼',
        low: ' 🔽',
        lowest: ' ⏬'
      };
      line += prioritySymbols[task.priority];
    }
    
    // Add dates
    if (task.scheduledDate) line += ` ⏳ ${task.scheduledDate}`;
    if (task.startDate) line += ` 🛫 ${task.startDate}`;
    if (task.dueDate) line += ` 📅 ${task.dueDate}`;
    if (task.doneDate && task.status === 'complete') line += ` ✅ ${task.doneDate}`;
    
    // Add tags
    if (task.tags && task.tags.length > 0) {
      line += ' ' + task.tags.map(tag => `#${tag}`).join(' ');
    }
    
    return line;
  }

  /**
   * Parse a task line into TaskMetadata
   */
  private parseTaskLine(line: string, filePath: string, lineNumber: number): TaskMetadata | null {
    if (!this.isTaskLine(line)) return null;
    
    // Extract status from checkbox
    let status: TaskStatus = 'incomplete';
    if (line.includes('[x]') || line.includes('[X]')) status = 'complete';
    else if (line.includes('[-]')) status = 'cancelled';
    else if (line.includes('[/]')) status = 'in-progress';
    
    // Extract description (everything before emojis and dates)
    const descMatch = line.match(/^-\s*\[.\]\s*([^📅🛫⏳✅🔺⏫🔼🔽⏬#]*)/);
    const description = descMatch ? descMatch[1].trim() : '';
    
    // Extract dates
    const scheduledMatch = line.match(/⏳\s*(\d{4}-\d{2}-\d{2})/);
    const startMatch = line.match(/🛫\s*(\d{4}-\d{2}-\d{2})/);
    const dueMatch = line.match(/📅\s*(\d{4}-\d{2}-\d{2})/);
    const doneMatch = line.match(/✅\s*(\d{4}-\d{2}-\d{2})/);
    
    // Extract priority
    let priority: TaskPriority | undefined;
    if (line.includes('🔺')) priority = 'highest';
    else if (line.includes('⏫')) priority = 'high';
    else if (line.includes('🔼')) priority = 'medium';
    else if (line.includes('🔽')) priority = 'low';
    else if (line.includes('⏬')) priority = 'lowest';
    
    // Extract tags
    const tagMatches = line.match(/#[\w-]+/g);
    const tags = tagMatches ? tagMatches.map(tag => tag.slice(1)) : [];
    
    return {
      description,
      status,
      priority,
      scheduledDate: scheduledMatch ? scheduledMatch[1] : undefined,
      startDate: startMatch ? startMatch[1] : undefined,
      dueDate: dueMatch ? dueMatch[1] : undefined,
      doneDate: doneMatch ? doneMatch[1] : undefined,
      tags,
      filePath,
      blockLink: `${filePath}#L${lineNumber}`,
    };
  }

  /**
   * Check if a line contains a task
   */
  private isTaskLine(line: string): boolean {
    return /^-\s*\[[x\s\-\/X]\]\s*/.test(line);
  }

  /**
   * Update task line status
   */
  private updateTaskLineStatus(line: string, newStatus: TaskStatus): string {
    const statusSymbols = {
      'incomplete': '[ ]',
      'complete': '[x]',
      'cancelled': '[-]',
      'in-progress': '[/]',
      'waiting': '[ ]',
      'scheduled': '[ ]'
    };
    
    return line.replace(/\[[x\s\-\/X]\]/, statusSymbols[newStatus]);
  }

  /**
   * Recursively scan directory for tasks
   */
  private async scanDirectoryForTasks(dirPath: string, tasks: TaskMetadata[]): Promise<void> {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          await this.scanDirectoryForTasks(fullPath, tasks);
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          await this.parseTasksFromFile(fullPath, tasks);
        }
      }
    } catch (error) {
      // Skip directories that can't be read
    }
  }

  /**
   * Parse tasks from a markdown file
   */
  private async parseTasksFromFile(filePath: string, tasks: TaskMetadata[]): Promise<void> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n');
      
      lines.forEach((line, index) => {
        const task = this.parseTaskLine(line, filePath, index);
        if (task) {
          tasks.push(task);
        }
      });
    } catch (error) {
      // Skip files that can't be read
    }
  }

  /**
   * Filter tasks based on criteria
   */
  private filterTasks(tasks: TaskMetadata[], filters: TaskFilters): TaskMetadata[] {
    return tasks.filter(task => {
      // Status filter
      if (filters.status && !filters.status.includes(task.status)) {
        return false;
      }
      
      // Priority filter
      if (filters.priority && task.priority && !filters.priority.includes(task.priority)) {
        return false;
      }
      
      // Date filters
      if (filters.hasScheduledDate !== undefined) {
        if (filters.hasScheduledDate && !task.scheduledDate) return false;
        if (!filters.hasScheduledDate && task.scheduledDate) return false;
      }
      
      if (filters.hasDueDate !== undefined) {
        if (filters.hasDueDate && !task.dueDate) return false;
        if (!filters.hasDueDate && task.dueDate) return false;
      }
      
      // Date range filters
      if (filters.dueAfter && (!task.dueDate || task.dueDate <= filters.dueAfter)) {
        return false;
      }
      
      if (filters.dueBefore && (!task.dueDate || task.dueDate >= filters.dueBefore)) {
        return false;
      }
      
      // Project filter
      if (filters.project && task.project !== filters.project) {
        return false;
      }
      
      // Tag filter
      if (filters.tag && filters.tag.length > 0) {
        const hasMatchingTag = filters.tag.some(filterTag => 
          task.tags?.includes(filterTag)
        );
        if (!hasMatchingTag) return false;
      }
      
      // Path filter
      if (filters.path && task.filePath && !task.filePath.includes(filters.path)) {
        return false;
      }
      
      return true;
    });
  }
}