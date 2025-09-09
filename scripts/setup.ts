#!/usr/bin/env tsx
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as readline from 'readline';
import { execSync } from 'child_process';

const CONFIG_DIR = path.join(os.homedir(), '.obsidian-mcp');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.yaml');

interface SetupConfig {
  vaultPath: string;
  vaultName: string;
  enableDailyNotes: boolean;
  enableTemplater: boolean;
  enableBookSearch: boolean;
}

class SetupWizard {
  private rl: readline.Interface;

  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }

  async run(): Promise<void> {
    console.log('\n🚀 ObsidianMCP Setup Wizard\n');
    console.log('This wizard will help you configure ObsidianMCP for your vault.\n');

    try {
      const config = await this.collectConfiguration();
      await this.createConfiguration(config);
      await this.installDependencies();
      await this.updateClaudeConfig();
      
      console.log('\n✅ Setup completed successfully!');
      console.log('\nYou can now use ObsidianMCP with Claude Desktop.');
      console.log('Restart Claude Desktop to apply the changes.\n');
    } catch (error) {
      console.error('\n❌ Setup failed:', error);
      process.exit(1);
    } finally {
      this.rl.close();
    }
  }

  private async collectConfiguration(): Promise<SetupConfig> {
    const vaultPath = await this.askQuestion(
      'Enter your Obsidian vault path (e.g., ~/Documents/MyVault): '
    );
    
    const expandedPath = this.expandPath(vaultPath);
    
    if (!await this.validateVault(expandedPath)) {
      throw new Error('Invalid vault path. Please ensure the directory exists.');
    }

    const vaultName = await this.askQuestion(
      'Enter a name for this vault (default: My Vault): '
    ) || 'My Vault';

    const enableDailyNotes = await this.askYesNo(
      'Enable daily notes feature? (y/n): '
    );

    const enableTemplater = await this.askYesNo(
      'Enable Templater plugin integration? (y/n): '
    );

    const enableBookSearch = await this.askYesNo(
      'Enable Book Search plugin integration? (y/n): '
    );

    return {
      vaultPath: expandedPath,
      vaultName,
      enableDailyNotes,
      enableTemplater,
      enableBookSearch,
    };
  }

  private async createConfiguration(config: SetupConfig): Promise<void> {
    console.log('\n📝 Creating configuration...');

    await fs.mkdir(CONFIG_DIR, { recursive: true });

    const yamlConfig = `version: "1.0"
vaults:
  primary:
    path: "${config.vaultPath}"
    name: "${config.vaultName}"
    dailyNotes:
      enabled: ${config.enableDailyNotes}
      folder: "Daily Notes"
      format: "YYYY-MM-DD"
      template: "Templates/Daily Note"
    templates:
      folder: "Templates"
      defaultTags: ["created-by-ai"]

plugins:
  templater:
    enabled: ${config.enableTemplater}
    templatesFolder: "Templates"
    syntaxTrigger: "tp"
  bookSearch:
    enabled: ${config.enableBookSearch}
    defaultTemplate: "Templates/Book Note"
    providers: ["google", "openlib"]

preferences:
  autoIndex: true
  cacheEnabled: true
  cacheTTL: 3600
  logLevel: "info"
  maxFileSize: 10485760
`;

    await fs.writeFile(CONFIG_FILE, yamlConfig, 'utf-8');
    console.log('✓ Configuration file created');
  }

  private async installDependencies(): Promise<void> {
    console.log('\n📦 Installing dependencies...');
    
    try {
      execSync('npm install', { stdio: 'inherit' });
      console.log('✓ Dependencies installed');
    } catch (error) {
      console.warn('⚠️  Could not install dependencies automatically.');
      console.log('Please run "npm install" manually.');
    }
  }

  private async updateClaudeConfig(): Promise<void> {
    console.log('\n🔧 Updating Claude Desktop configuration...');

    const claudeConfigPath = path.join(
      os.homedir(),
      'Library',
      'Application Support',
      'Claude',
      'claude_desktop_config.json'
    );

    try {
      let claudeConfig: any = {};
      
      try {
        const existing = await fs.readFile(claudeConfigPath, 'utf-8');
        claudeConfig = JSON.parse(existing);
      } catch {
        console.log('Creating new Claude Desktop config...');
      }

      if (!claudeConfig.mcpServers) {
        claudeConfig.mcpServers = {};
      }

      const projectPath = process.cwd();
      
      claudeConfig.mcpServers['obsidian-mcp'] = {
        command: 'node',
        args: [path.join(projectPath, 'dist', 'index-simple.js')],
      };

      await fs.mkdir(path.dirname(claudeConfigPath), { recursive: true });
      await fs.writeFile(
        claudeConfigPath,
        JSON.stringify(claudeConfig, null, 2),
        'utf-8'
      );

      console.log('✓ Claude Desktop configuration updated');
    } catch (error) {
      console.warn('⚠️  Could not update Claude Desktop config automatically.');
      console.log('\nPlease add the following to your claude_desktop_config.json:');
      console.log(`
{
  "mcpServers": {
    "obsidian-mcp": {
      "command": "node",
      "args": ["${path.join(process.cwd(), 'dist', 'index.js')}"]
    }
  }
}
`);
    }
  }

  private askQuestion(prompt: string): Promise<string> {
    return new Promise((resolve) => {
      this.rl.question(prompt, resolve);
    });
  }

  private async askYesNo(prompt: string): Promise<boolean> {
    const answer = await this.askQuestion(prompt);
    return answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes';
  }

  private expandPath(inputPath: string): string {
    if (inputPath.startsWith('~/')) {
      return path.join(os.homedir(), inputPath.slice(2));
    }
    return path.resolve(inputPath);
  }

  private async validateVault(vaultPath: string): Promise<boolean> {
    try {
      const stats = await fs.stat(vaultPath);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }
}

async function main() {
  const wizard = new SetupWizard();
  await wizard.run();
}

main().catch(console.error);