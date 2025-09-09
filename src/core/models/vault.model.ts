import { Vault, VaultConfig, VaultStats } from '../../types/obsidian.types';

export class VaultModel implements Vault {
  path: string;
  name: string;
  config: VaultConfig;
  stats: VaultStats;

  constructor(data: Partial<Vault>) {
    this.path = data.path || '';
    this.name = data.name || 'Unnamed Vault';
    this.config = data.config || this.getDefaultConfig();
    this.stats = data.stats || this.getEmptyStats();
  }

  private getDefaultConfig(): VaultConfig {
    return {
      dailyNotes: {
        enabled: false,
        folder: 'Daily Notes',
        format: 'YYYY-MM-DD',
        template: '',
      },
      templates: {
        folder: 'Templates',
        defaultTags: [],
      },
      defaultFolder: '',
      fileExtensions: ['.md'],
      excludeFolders: ['.obsidian', '.trash'],
    };
  }

  private getEmptyStats(): VaultStats {
    return {
      totalNotes: 0,
      totalTags: 0,
      totalLinks: 0,
      totalFolders: 0,
      lastModified: new Date(),
    };
  }

  updateStats(stats: Partial<VaultStats>): void {
    this.stats = {
      ...this.stats,
      ...stats,
      lastModified: new Date(),
    };
  }

  isValidPath(): boolean {
    return this.path !== '' && this.path.startsWith('/');
  }

  getFullPath(relativePath: string): string {
    if (relativePath.startsWith('/')) {
      return relativePath;
    }
    return `${this.path}/${relativePath}`.replace(/\/+/g, '/');
  }
}