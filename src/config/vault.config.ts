import { VaultConfig } from '../types/obsidian.types';

export class VaultConfigManager {
  static getDefault(): VaultConfig {
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

  static merge(base: VaultConfig, override: Partial<VaultConfig>): VaultConfig {
    return {
      ...base,
      ...override,
      dailyNotes: {
        ...base.dailyNotes,
        ...(override.dailyNotes || {}),
      },
      templates: {
        ...base.templates,
        ...(override.templates || {}),
      },
    };
  }

  static validate(config: VaultConfig): string[] {
    const errors: string[] = [];

    if (config.dailyNotes.enabled && !config.dailyNotes.folder) {
      errors.push('Daily notes folder is required when daily notes are enabled');
    }

    if (config.templates.folder === '') {
      errors.push('Templates folder cannot be empty');
    }

    if (!config.fileExtensions || config.fileExtensions.length === 0) {
      errors.push('At least one file extension must be specified');
    }

    return errors;
  }
}