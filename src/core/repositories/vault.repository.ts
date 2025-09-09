import * as fs from 'fs/promises';
import * as path from 'path';
import { Vault, VaultStats } from '../../types/obsidian.types';
import { VaultModel } from '../models/vault.model';
import { Logger } from '../../utils/logger';

export class VaultRepository {
  private logger: Logger;

  constructor() {
    this.logger = new Logger('VaultRepository');
  }

  async loadVault(vaultPath: string): Promise<Vault> {
    try {
      const stats = await fs.stat(vaultPath);
      
      if (!stats.isDirectory()) {
        throw new Error(`Path is not a directory: ${vaultPath}`);
      }
      
      const configPath = path.join(vaultPath, '.obsidian', 'app.json');
      let vaultName = path.basename(vaultPath);
      
      try {
        const configContent = await fs.readFile(configPath, 'utf-8');
        const config = JSON.parse(configContent);
        vaultName = config.vaultName || vaultName;
      } catch (error) {
        this.logger.debug('Could not read Obsidian config, using default name');
      }
      
      const vault = new VaultModel({
        path: vaultPath,
        name: vaultName,
      });
      
      const vaultStats = await this.calculateStats(vaultPath);
      vault.updateStats(vaultStats);
      
      return vault;
    } catch (error) {
      this.logger.error(`Failed to load vault: ${vaultPath}`, error);
      throw error;
    }
  }

  async validateVault(vaultPath: string): Promise<boolean> {
    try {
      const stats = await fs.stat(vaultPath);
      if (!stats.isDirectory()) {
        return false;
      }
      
      const obsidianPath = path.join(vaultPath, '.obsidian');
      try {
        await fs.access(obsidianPath);
        return true;
      } catch {
        this.logger.warn(`No .obsidian folder found in: ${vaultPath}`);
        return true;
      }
    } catch (error) {
      this.logger.error(`Vault validation failed: ${vaultPath}`, error);
      return false;
    }
  }

  async findVaults(searchPath: string): Promise<string[]> {
    const vaults: string[] = [];
    
    try {
      const entries = await fs.readdir(searchPath, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const fullPath = path.join(searchPath, entry.name);
          
          if (await this.validateVault(fullPath)) {
            vaults.push(fullPath);
          } else {
            const subVaults = await this.findVaults(fullPath);
            vaults.push(...subVaults);
          }
        }
      }
    } catch (error) {
      this.logger.error(`Failed to search for vaults in: ${searchPath}`, error);
    }
    
    return vaults;
  }

  private async calculateStats(vaultPath: string): Promise<VaultStats> {
    const stats: VaultStats = {
      totalNotes: 0,
      totalTags: 0,
      totalLinks: 0,
      totalFolders: 0,
      lastModified: new Date(),
    };
    
    await this.walkDirectory(vaultPath, stats);
    
    return stats;
  }

  private async walkDirectory(directory: string, stats: VaultStats): Promise<void> {
    try {
      const entries = await fs.readdir(directory, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(directory, entry.name);
        
        if (entry.isDirectory()) {
          if (!this.isExcludedFolder(entry.name)) {
            stats.totalFolders++;
            await this.walkDirectory(fullPath, stats);
          }
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          stats.totalNotes++;
          
          const content = await fs.readFile(fullPath, 'utf-8');
          const tags = content.match(/#\S+/g) || [];
          stats.totalTags += new Set(tags).size;
          
          const wikiLinks = content.match(/\[\[([^\]]+)\]\]/g) || [];
          const mdLinks = content.match(/\[([^\]]+)\]\(([^)]+)\)/g) || [];
          stats.totalLinks += wikiLinks.length + mdLinks.length;
        }
      }
    } catch (error) {
      this.logger.error(`Failed to walk directory: ${directory}`, error);
    }
  }

  private isExcludedFolder(folderName: string): boolean {
    const excludeFolders = ['.obsidian', '.trash', 'node_modules', '.git'];
    return excludeFolders.includes(folderName) || folderName.startsWith('.');
  }
}