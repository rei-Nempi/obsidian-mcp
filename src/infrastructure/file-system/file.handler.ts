import * as fs from 'fs/promises';
import * as path from 'path';
import { Logger } from '../../utils/logger';

export class FileHandler {
  private logger: Logger;

  constructor() {
    this.logger = new Logger('FileHandler');
  }

  async read(filePath: string): Promise<string> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return content;
    } catch (error) {
      this.logger.error(`Failed to read file: ${filePath}`, error);
      throw new Error(`Cannot read file: ${filePath}`);
    }
  }

  async write(filePath: string, content: string): Promise<void> {
    try {
      const directory = path.dirname(filePath);
      await this.ensureDirectory(directory);
      
      await fs.writeFile(filePath, content, 'utf-8');
      this.logger.debug(`File written: ${filePath}`);
    } catch (error) {
      this.logger.error(`Failed to write file: ${filePath}`, error);
      throw new Error(`Cannot write file: ${filePath}`);
    }
  }

  async delete(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
      this.logger.debug(`File deleted: ${filePath}`);
    } catch (error) {
      this.logger.error(`Failed to delete file: ${filePath}`, error);
      throw new Error(`Cannot delete file: ${filePath}`);
    }
  }

  async exists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async copy(source: string, destination: string): Promise<void> {
    try {
      const destDirectory = path.dirname(destination);
      await this.ensureDirectory(destDirectory);
      
      await fs.copyFile(source, destination);
      this.logger.debug(`File copied: ${source} -> ${destination}`);
    } catch (error) {
      this.logger.error(`Failed to copy file: ${source} -> ${destination}`, error);
      throw new Error(`Cannot copy file: ${source}`);
    }
  }

  async move(source: string, destination: string): Promise<void> {
    try {
      const destDirectory = path.dirname(destination);
      await this.ensureDirectory(destDirectory);
      
      await fs.rename(source, destination);
      this.logger.debug(`File moved: ${source} -> ${destination}`);
    } catch (error) {
      this.logger.error(`Failed to move file: ${source} -> ${destination}`, error);
      throw new Error(`Cannot move file: ${source}`);
    }
  }

  async getStats(filePath: string): Promise<any> {
    try {
      return await fs.stat(filePath);
    } catch (error) {
      this.logger.error(`Failed to get file stats: ${filePath}`, error);
      throw new Error(`Cannot get stats for file: ${filePath}`);
    }
  }

  private async ensureDirectory(directory: string): Promise<void> {
    try {
      await fs.mkdir(directory, { recursive: true });
    } catch (error) {
      this.logger.error(`Failed to create directory: ${directory}`, error);
      throw new Error(`Cannot create directory: ${directory}`);
    }
  }
}