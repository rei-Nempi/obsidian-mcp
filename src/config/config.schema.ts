import { AppConfig } from '../types/obsidian.types';

export class ConfigSchema {
  validate(config: AppConfig): string[] {
    const errors: string[] = [];

    if (!config.version) {
      errors.push('Config version is required');
    }

    if (!config.vaults || !config.vaults.primary) {
      errors.push('Primary vault configuration is required');
    } else {
      const vault = config.vaults.primary;
      
      if (!vault.path) {
        errors.push('Vault path is required');
      }
      
      if (!vault.name) {
        errors.push('Vault name is required');
      }
    }

    if (config.preferences) {
      const prefs = config.preferences;
      
      if (prefs.logLevel && !['error', 'warn', 'info', 'debug', 'trace'].includes(prefs.logLevel)) {
        errors.push('Invalid log level');
      }
      
      if (prefs.cacheTTL && prefs.cacheTTL < 0) {
        errors.push('Cache TTL must be positive');
      }
      
      if (prefs.maxFileSize && prefs.maxFileSize < 0) {
        errors.push('Max file size must be positive');
      }
    }

    return errors;
  }

  getDefaultConfig(): AppConfig {
    return {
      version: '1.0',
      vaults: {
        primary: {
          path: '',
          name: 'My Vault',
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
  }
}