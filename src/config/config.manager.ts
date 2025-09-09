import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as yaml from 'js-yaml';
import { AppConfig, Vault } from '../types/obsidian.types';
import { VaultRepository } from '../core/repositories/vault.repository';
import { Logger } from '../utils/logger';
import { ConfigSchema } from './config.schema';

export class ConfigManager {
  private config: AppConfig | null = null;
  private configPath: string;
  private logger: Logger;
  private vaultRepository: VaultRepository;
  private activeVault: Vault | null = null;

  constructor() {
    this.configPath = path.join(os.homedir(), '.obsidian-mcp', 'config.yaml');
    this.logger = new Logger('ConfigManager');
    this.vaultRepository = new VaultRepository();
  }

  async initialize(): Promise<void> {
    try {
      const configExists = await this.configExists();
      
      if (!configExists) {
        this.logger.info('No config found, running interactive setup');
        await this.interactiveSetup();
      } else {
        await this.loadConfig();
      }
      
      await this.validateConfig();
      await this.loadActiveVault();
    } catch (error) {
      this.logger.error('Failed to initialize config', error);
      throw error;
    }
  }

  async loadConfig(): Promise<void> {
    try {
      const content = await fs.readFile(this.configPath, 'utf-8');
      this.config = yaml.load(content) as AppConfig;
      this.logger.info('Config loaded successfully');
    } catch (error) {
      this.logger.error('Failed to load config', error);
      throw new Error('Failed to load configuration file');
    }
  }

  async saveConfig(): Promise<void> {
    if (!this.config) {
      throw new Error('No configuration to save');
    }

    try {
      const directory = path.dirname(this.configPath);
      await fs.mkdir(directory, { recursive: true });
      
      const yamlContent = yaml.dump(this.config, { indent: 2 });
      await fs.writeFile(this.configPath, yamlContent, 'utf-8');
      
      this.logger.info('Config saved successfully');
    } catch (error) {
      this.logger.error('Failed to save config', error);
      throw new Error('Failed to save configuration file');
    }
  }

  async interactiveSetup(): Promise<void> {
    const readline = await import('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const question = (prompt: string): Promise<string> => {
      return new Promise((resolve) => {
        rl.question(prompt, resolve);
      });
    };

    console.log('\n=== ObsidianMCP Setup Wizard ===\n');

    const vaultPath = await question('Enter your Obsidian vault path: ');
    
    if (!await this.vaultRepository.validateVault(vaultPath)) {
      throw new Error('Invalid vault path');
    }

    const vault = await this.vaultRepository.loadVault(vaultPath);

    this.config = {
      version: '1.0',
      vaults: {
        primary: {
          path: vault.path,
          name: vault.name,
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
        },
      },
      plugins: {},
      preferences: {
        autoIndex: true,
        cacheEnabled: true,
        cacheTTL: 3600,
        logLevel: 'info',
        maxFileSize: 10485760,
      },
    };

    await this.saveConfig();
    
    console.log('\n✅ Setup completed successfully!\n');
    rl.close();
  }

  async validateConfig(): Promise<void> {
    if (!this.config) {
      throw new Error('No configuration loaded');
    }

    const schema = new ConfigSchema();
    const errors = schema.validate(this.config);
    
    if (errors.length > 0) {
      this.logger.error('Config validation failed', errors);
      throw new Error(`Configuration validation failed: ${errors.join(', ')}`);
    }
  }

  async getActiveVault(): Promise<Vault> {
    if (!this.activeVault) {
      await this.loadActiveVault();
    }
    
    if (!this.activeVault) {
      throw new Error('No active vault configured');
    }
    
    return this.activeVault;
  }

  getActiveVaultSync(): Vault | null {
    return this.activeVault;
  }

  private async loadActiveVault(): Promise<void> {
    if (!this.config) {
      throw new Error('No configuration loaded');
    }

    const primaryVaultConfig = this.config.vaults.primary;
    if (!primaryVaultConfig) {
      throw new Error('No primary vault configured');
    }

    this.activeVault = await this.vaultRepository.loadVault(primaryVaultConfig.path);
    this.activeVault.config = {
      ...this.activeVault.config,
      ...primaryVaultConfig,
    };
  }

  private async configExists(): Promise<boolean> {
    try {
      await fs.access(this.configPath);
      return true;
    } catch {
      return false;
    }
  }

  getConfig(): AppConfig | null {
    return this.config;
  }

  getLogLevel(): string {
    return this.config?.preferences?.logLevel || 'info';
  }

  isCacheEnabled(): boolean {
    return this.config?.preferences?.cacheEnabled !== false;
  }

  getCacheTTL(): number {
    return (this.config?.preferences?.cacheTTL || 3600) * 1000;
  }
}