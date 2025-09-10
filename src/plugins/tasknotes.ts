import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';

export interface TaskTimeEntry {
  startTime: string;
  endTime?: string;
  duration?: number; // in minutes
  description?: string;
}

export interface TaskMetadata {
  title: string;
  status: 'todo' | 'in-progress' | 'waiting' | 'done' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  due?: string; // ISO date string
  created: string; // ISO date string
  updated: string; // ISO date string
  project?: string;
  tags?: string[];
  estimate?: number; // in minutes
  timeEntries?: TaskTimeEntry[];
  dependencies?: string[]; // task IDs or titles
  assignee?: string;
  description?: string;
}

export interface Task {
  id: string;
  filePath: string;
  metadata: TaskMetadata;
  content: string;
}

export class TaskNotesPlugin {
  private vaultPath: string;
  private tasksFolder: string;

  constructor(vaultPath: string, tasksFolder: string = 'Tasks') {
    this.vaultPath = vaultPath;
    this.tasksFolder = tasksFolder;
  }

  /**
   * Create a new task note
   */
  async createTask(metadata: Partial<TaskMetadata>, content: string = ''): Promise<Task> {
    const now = new Date().toISOString();
    const taskId = this.generateTaskId(metadata.title || 'Untitled Task');
    
    const fullMetadata: TaskMetadata = {
      title: metadata.title || 'Untitled Task',
      status: metadata.status || 'todo',
      priority: metadata.priority || 'medium',
      created: now,
      updated: now,
      project: metadata.project,
      tags: metadata.tags || [],
      due: metadata.due,
      estimate: metadata.estimate,
      timeEntries: metadata.timeEntries || [],
      dependencies: metadata.dependencies || [],
      assignee: metadata.assignee,
      description: metadata.description
    };

    const fileName = this.sanitizeFileName(fullMetadata.title) + '.md';
    const filePath = path.join(this.vaultPath, this.tasksFolder, fileName);
    
    // Ensure tasks folder exists
    await fs.mkdir(path.dirname(filePath), { recursive: true });

    const frontmatter = this.generateFrontmatter(fullMetadata);
    const fileContent = `${frontmatter}\n\n${content}`;

    await fs.writeFile(filePath, fileContent, 'utf-8');

    return {
      id: taskId,
      filePath: path.relative(this.vaultPath, filePath),
      metadata: fullMetadata,
      content
    };
  }

  /**
   * Read a task from file
   */
  async readTask(filePath: string): Promise<Task | null> {
    try {
      const fullPath = path.resolve(this.vaultPath, filePath);
      const fileContent = await fs.readFile(fullPath, 'utf-8');
      
      const { metadata, content } = this.parseFrontmatter(fileContent);
      
      if (!metadata.title) {
        return null; // Not a valid task file
      }

      return {
        id: this.generateTaskId(metadata.title),
        filePath,
        metadata: metadata as TaskMetadata,
        content
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * List all tasks with optional filtering
   */
  async listTasks(options: {
    status?: string;
    project?: string;
    priority?: string;
    dueBefore?: string;
    dueAfter?: string;
    assignee?: string;
  } = {}): Promise<Task[]> {
    const tasksDir = path.join(this.vaultPath, this.tasksFolder);
    
    try {
      const files = await this.getMarkdownFiles(tasksDir);
      const tasks: Task[] = [];

      for (const file of files) {
        const task = await this.readTask(path.relative(this.vaultPath, file));
        if (task && this.matchesFilters(task, options)) {
          tasks.push(task);
        }
      }

      // Sort by created date (newest first)
      return tasks.sort((a, b) => 
        new Date(b.metadata.created).getTime() - new Date(a.metadata.created).getTime()
      );
    } catch (error) {
      return [];
    }
  }

  /**
   * Update task status
   */
  async updateTaskStatus(filePath: string, newStatus: TaskMetadata['status']): Promise<boolean> {
    const task = await this.readTask(filePath);
    if (!task) return false;

    task.metadata.status = newStatus;
    task.metadata.updated = new Date().toISOString();
    
    return await this.saveTask(task);
  }

  /**
   * Update task metadata
   */
  async updateTaskMetadata(filePath: string, updates: Partial<TaskMetadata>): Promise<boolean> {
    const task = await this.readTask(filePath);
    if (!task) return false;

    // Merge updates
    Object.assign(task.metadata, updates);
    task.metadata.updated = new Date().toISOString();
    
    return await this.saveTask(task);
  }

  /**
   * Start time tracking for a task
   */
  async startTaskTimer(filePath: string, description?: string): Promise<boolean> {
    const task = await this.readTask(filePath);
    if (!task) return false;

    const now = new Date().toISOString();
    
    // Check if there's already an active timer
    const activeEntry = task.metadata.timeEntries?.find(entry => !entry.endTime);
    if (activeEntry) {
      return false; // Timer already running
    }

    if (!task.metadata.timeEntries) {
      task.metadata.timeEntries = [];
    }

    task.metadata.timeEntries.push({
      startTime: now,
      description
    });

    task.metadata.updated = now;
    
    return await this.saveTask(task);
  }

  /**
   * Stop time tracking for a task
   */
  async stopTaskTimer(filePath: string): Promise<{ success: boolean; duration?: number }> {
    const task = await this.readTask(filePath);
    if (!task) return { success: false };

    const activeEntry = task.metadata.timeEntries?.find(entry => !entry.endTime);
    if (!activeEntry) {
      return { success: false }; // No active timer
    }

    const endTime = new Date().toISOString();
    const duration = Math.round((new Date(endTime).getTime() - new Date(activeEntry.startTime).getTime()) / (1000 * 60));
    
    activeEntry.endTime = endTime;
    activeEntry.duration = duration;

    task.metadata.updated = endTime;
    
    const success = await this.saveTask(task);
    return { success, duration };
  }

  /**
   * Get task statistics
   */
  async getTaskStats(): Promise<{
    total: number;
    byStatus: Record<string, number>;
    byPriority: Record<string, number>;
    totalTimeSpent: number; // in minutes
    averageTimePerTask: number;
    overdueTasks: number;
  }> {
    const tasks = await this.listTasks();
    
    const stats = {
      total: tasks.length,
      byStatus: {} as Record<string, number>,
      byPriority: {} as Record<string, number>,
      totalTimeSpent: 0,
      averageTimePerTask: 0,
      overdueTasks: 0
    };

    const now = new Date();
    
    for (const task of tasks) {
      // Count by status
      stats.byStatus[task.metadata.status] = (stats.byStatus[task.metadata.status] || 0) + 1;
      
      // Count by priority
      stats.byPriority[task.metadata.priority] = (stats.byPriority[task.metadata.priority] || 0) + 1;
      
      // Calculate time spent
      const timeSpent = task.metadata.timeEntries?.reduce((total, entry) => 
        total + (entry.duration || 0), 0) || 0;
      stats.totalTimeSpent += timeSpent;
      
      // Count overdue tasks
      if (task.metadata.due && new Date(task.metadata.due) < now && task.metadata.status !== 'done') {
        stats.overdueTasks++;
      }
    }

    stats.averageTimePerTask = stats.total > 0 ? stats.totalTimeSpent / stats.total : 0;
    
    return stats;
  }

  /**
   * Get overdue tasks
   */
  async getOverdueTasks(): Promise<Task[]> {
    const now = new Date().toISOString();
    return await this.listTasks({
      dueBefore: now
    });
  }

  /**
   * Get tasks by project
   */
  async getTasksByProject(): Promise<Record<string, Task[]>> {
    const tasks = await this.listTasks();
    const tasksByProject: Record<string, Task[]> = {};
    
    for (const task of tasks) {
      const project = task.metadata.project || 'No Project';
      if (!tasksByProject[project]) {
        tasksByProject[project] = [];
      }
      tasksByProject[project].push(task);
    }
    
    return tasksByProject;
  }

  // Private helper methods

  private generateTaskId(title: string): string {
    return crypto.createHash('md5').update(title + Date.now()).digest('hex').substring(0, 8);
  }

  private sanitizeFileName(title: string): string {
    return title
      .replace(/[<>:"/\\|?*]/g, '') // Remove invalid characters
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .toLowerCase();
  }

  private generateFrontmatter(metadata: TaskMetadata): string {
    const yamlLines = ['---'];
    
    yamlLines.push(`title: "${metadata.title}"`);
    yamlLines.push(`status: ${metadata.status}`);
    yamlLines.push(`priority: ${metadata.priority}`);
    yamlLines.push(`created: ${metadata.created}`);
    yamlLines.push(`updated: ${metadata.updated}`);
    
    if (metadata.due) yamlLines.push(`due: ${metadata.due}`);
    if (metadata.project) yamlLines.push(`project: "${metadata.project}"`);
    if (metadata.assignee) yamlLines.push(`assignee: "${metadata.assignee}"`);
    if (metadata.estimate) yamlLines.push(`estimate: ${metadata.estimate}`);
    if (metadata.description) yamlLines.push(`description: "${metadata.description}"`);
    
    if (metadata.tags && metadata.tags.length > 0) {
      yamlLines.push('tags:');
      metadata.tags.forEach(tag => yamlLines.push(`  - ${tag}`));
    }
    
    if (metadata.dependencies && metadata.dependencies.length > 0) {
      yamlLines.push('dependencies:');
      metadata.dependencies.forEach(dep => yamlLines.push(`  - "${dep}"`));
    }
    
    if (metadata.timeEntries && metadata.timeEntries.length > 0) {
      yamlLines.push('timeEntries:');
      metadata.timeEntries.forEach(entry => {
        yamlLines.push(`  - startTime: ${entry.startTime}`);
        if (entry.endTime) yamlLines.push(`    endTime: ${entry.endTime}`);
        if (entry.duration) yamlLines.push(`    duration: ${entry.duration}`);
        if (entry.description) yamlLines.push(`    description: "${entry.description}"`);
      });
    }
    
    yamlLines.push('---');
    return yamlLines.join('\n');
  }

  private parseFrontmatter(content: string): { metadata: Partial<TaskMetadata>; content: string } {
    const frontmatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
    const match = content.match(frontmatterRegex);
    
    if (!match) {
      return { metadata: {}, content };
    }
    
    const [, frontmatterStr, bodyContent] = match;
    const metadata: Partial<TaskMetadata> = {};
    
    // Simple YAML parsing (basic implementation)
    const lines = frontmatterStr.split('\n');
    let currentArray: string | null = null;
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      
      if (trimmed.endsWith(':') && !trimmed.includes(' ')) {
        currentArray = trimmed.slice(0, -1);
        (metadata as any)[currentArray] = [];
        continue;
      }
      
      if (trimmed.startsWith('- ') && currentArray) {
        const value = trimmed.slice(2).replace(/"/g, '');
        (metadata as any)[currentArray].push(value);
        continue;
      }
      
      currentArray = null;
      
      const colonIndex = trimmed.indexOf(':');
      if (colonIndex > 0) {
        const key = trimmed.slice(0, colonIndex).trim();
        const value = trimmed.slice(colonIndex + 1).trim().replace(/"/g, '');
        
        if (value === 'true' || value === 'false') {
          (metadata as any)[key] = value === 'true';
        } else if (!isNaN(Number(value))) {
          (metadata as any)[key] = Number(value);
        } else {
          (metadata as any)[key] = value;
        }
      }
    }
    
    return { metadata, content: bodyContent.trim() };
  }

  private async saveTask(task: Task): Promise<boolean> {
    try {
      const fullPath = path.resolve(this.vaultPath, task.filePath);
      const frontmatter = this.generateFrontmatter(task.metadata);
      const fileContent = `${frontmatter}\n\n${task.content}`;
      
      await fs.writeFile(fullPath, fileContent, 'utf-8');
      return true;
    } catch (error) {
      return false;
    }
  }

  private async getMarkdownFiles(dir: string): Promise<string[]> {
    try {
      const files: string[] = [];
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          const subFiles = await this.getMarkdownFiles(fullPath);
          files.push(...subFiles);
        } else if (entry.name.endsWith('.md')) {
          files.push(fullPath);
        }
      }
      
      return files;
    } catch (error) {
      return [];
    }
  }

  private matchesFilters(task: Task, filters: any): boolean {
    if (filters.status && task.metadata.status !== filters.status) return false;
    if (filters.project && task.metadata.project !== filters.project) return false;
    if (filters.priority && task.metadata.priority !== filters.priority) return false;
    if (filters.assignee && task.metadata.assignee !== filters.assignee) return false;
    
    if (filters.dueBefore && (!task.metadata.due || task.metadata.due >= filters.dueBefore)) return false;
    if (filters.dueAfter && (!task.metadata.due || task.metadata.due <= filters.dueAfter)) return false;
    
    return true;
  }
}