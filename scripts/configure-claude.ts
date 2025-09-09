#!/usr/bin/env tsx
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';

interface ClaudeConfig {
  mcpServers?: Record<string, any>;
}

class ClaudeConfigurator {
  private configPaths = {
    mac: path.join(os.homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'),
    windows: path.join(process.env.APPDATA || '', 'Claude', 'claude_desktop_config.json'),
    linux: path.join(os.homedir(), '.config', 'Claude', 'claude_desktop_config.json'),
  };

  async run(): Promise<void> {
    console.log('🔧 ObsidianMCP Claude Desktop Configuration\n');

    try {
      const configPath = this.getConfigPath();
      const config = await this.loadOrCreateConfig(configPath);
      
      // Check if already configured
      if (config.mcpServers?.['obsidian-mcp']) {
        const answer = await this.askQuestion('ObsidianMCP is already configured. Update it? (y/n): ');
        if (answer.toLowerCase() !== 'y') {
          console.log('Configuration cancelled.');
          return;
        }
      }

      // Detect installation method
      const execPath = await this.detectExecutablePath();
      
      // Add ObsidianMCP to config
      if (!config.mcpServers) {
        config.mcpServers = {};
      }

      config.mcpServers['obsidian-mcp'] = {
        command: 'node',
        args: [execPath],
      };

      // Save config
      await this.saveConfig(configPath, config);
      
      console.log('\n✅ Configuration successful!');
      console.log('\nNext steps:');
      console.log('1. Restart Claude Desktop');
      console.log('2. In Claude, type: "list my Obsidian vaults"');
      console.log('\nFor usage instructions, see: https://github.com/yourusername/obsidian-mcp');
      
    } catch (error) {
      console.error('❌ Configuration failed:', error);
      this.showManualInstructions();
    }
  }

  private getConfigPath(): string {
    const platform = os.platform();
    
    if (platform === 'darwin') {
      return this.configPaths.mac;
    } else if (platform === 'win32') {
      return this.configPaths.windows;
    } else {
      return this.configPaths.linux;
    }
  }

  private async loadOrCreateConfig(configPath: string): Promise<ClaudeConfig> {
    try {
      const content = await fs.readFile(configPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      console.log('Creating new Claude Desktop configuration...');
      
      // Ensure directory exists
      const dir = path.dirname(configPath);
      await fs.mkdir(dir, { recursive: true });
      
      return {};
    }
  }

  private async detectExecutablePath(): Promise<string> {
    // Check if running from npm global install
    try {
      const npmPrefix = execSync('npm config get prefix', { encoding: 'utf-8' }).trim();
      const globalPath = path.join(npmPrefix, 'lib', 'node_modules', 'obsidian-mcp', 'dist', 'index-enhanced.js');
      
      if (await this.fileExists(globalPath)) {
        console.log('✓ Detected global npm installation');
        return globalPath;
      }
    } catch {}

    // Check if running from local installation
    const localPath = path.join(process.cwd(), 'dist', 'index-enhanced.js');
    if (await this.fileExists(localPath)) {
      console.log('✓ Detected local installation');
      return localPath;
    }

    // Check if running from npx
    const npxPath = path.join(os.tmpdir(), 'obsidian-mcp', 'dist', 'index-enhanced.js');
    if (await this.fileExists(npxPath)) {
      console.log('✓ Detected npx execution');
      // For npx, we should recommend global install
      console.log('\n⚠️  Running from npx detected.');
      console.log('For permanent installation, run: npm install -g obsidian-mcp');
      
      const answer = await this.askQuestion('Use global installation path anyway? (y/n): ');
      if (answer.toLowerCase() === 'y') {
        const npmPrefix = execSync('npm config get prefix', { encoding: 'utf-8' }).trim();
        return path.join(npmPrefix, 'lib', 'node_modules', 'obsidian-mcp', 'dist', 'index-enhanced.js');
      }
    }

    // Ask user for custom path
    console.log('\n⚠️  Could not detect ObsidianMCP installation path.');
    const customPath = await this.askQuestion('Enter the full path to index-enhanced.js: ');
    return customPath.trim();
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private async saveConfig(configPath: string, config: ClaudeConfig): Promise<void> {
    const content = JSON.stringify(config, null, 2);
    await fs.writeFile(configPath, content, 'utf-8');
    console.log(`\n✓ Configuration saved to: ${configPath}`);
  }

  private askQuestion(prompt: string): Promise<string> {
    return new Promise((resolve) => {
      const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      
      readline.question(prompt, (answer: string) => {
        readline.close();
        resolve(answer);
      });
    });
  }

  private showManualInstructions(): void {
    console.log('\n📝 Manual Configuration Instructions:');
    console.log('\n1. Find your Claude Desktop config file:');
    console.log('   Mac: ~/Library/Application Support/Claude/claude_desktop_config.json');
    console.log('   Windows: %APPDATA%\\Claude\\claude_desktop_config.json');
    console.log('   Linux: ~/.config/Claude/claude_desktop_config.json');
    
    console.log('\n2. Add the following to the config file:');
    console.log(JSON.stringify({
      mcpServers: {
        'obsidian-mcp': {
          command: 'node',
          args: ['<path-to-obsidian-mcp>/dist/index-enhanced.js'],
        }
      }
    }, null, 2));
    
    console.log('\n3. Restart Claude Desktop');
  }
}

// Run if executed directly
if (require.main === module) {
  const configurator = new ClaudeConfigurator();
  configurator.run().catch(console.error);
}

export { ClaudeConfigurator };