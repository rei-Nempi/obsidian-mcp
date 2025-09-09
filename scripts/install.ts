#!/usr/bin/env tsx
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';

class Installer {
  private projectPath: string;

  constructor() {
    this.projectPath = process.cwd();
  }

  async run(): Promise<void> {
    console.log('\n🔧 ObsidianMCP Quick Installer\n');

    try {
      await this.checkPrerequisites();
      await this.installDependencies();
      await this.buildProject();
      await this.configureClaude();
      
      console.log('\n✅ Installation completed successfully!');
      console.log('\nNext steps:');
      console.log('1. Run "npm run setup" to configure your Obsidian vault');
      console.log('2. Restart Claude Desktop');
      console.log('3. Start using ObsidianMCP!\n');
    } catch (error) {
      console.error('\n❌ Installation failed:', error);
      process.exit(1);
    }
  }

  private async checkPrerequisites(): Promise<void> {
    console.log('📋 Checking prerequisites...');

    // Check Node.js version
    const nodeVersion = process.version;
    const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
    
    if (majorVersion < 18) {
      throw new Error(`Node.js v18 or higher is required. Current version: ${nodeVersion}`);
    }
    console.log(`✓ Node.js ${nodeVersion}`);

    // Check if npm is available
    try {
      execSync('npm --version', { stdio: 'pipe' });
      console.log('✓ npm is available');
    } catch {
      throw new Error('npm is not available. Please install Node.js with npm.');
    }

    // Check if Claude Desktop config directory exists
    const claudeConfigDir = path.join(
      os.homedir(),
      'Library',
      'Application Support',
      'Claude'
    );
    
    try {
      await fs.access(claudeConfigDir);
      console.log('✓ Claude Desktop detected');
    } catch {
      console.warn('⚠️  Claude Desktop configuration directory not found');
      console.log('  Please ensure Claude Desktop is installed');
    }
  }

  private async installDependencies(): Promise<void> {
    console.log('\n📦 Installing dependencies...');
    
    try {
      execSync('npm install', { 
        stdio: 'inherit',
        cwd: this.projectPath 
      });
      console.log('✓ Dependencies installed');
    } catch (error) {
      throw new Error('Failed to install dependencies');
    }
  }

  private async buildProject(): Promise<void> {
    console.log('\n🔨 Building project...');
    
    try {
      execSync('npm run build', { 
        stdio: 'inherit',
        cwd: this.projectPath 
      });
      console.log('✓ Project built successfully');
    } catch (error) {
      throw new Error('Failed to build project');
    }
  }

  private async configureClaude(): Promise<void> {
    console.log('\n⚙️  Configuring Claude Desktop...');

    const claudeConfigPath = path.join(
      os.homedir(),
      'Library',
      'Application Support',
      'Claude',
      'claude_desktop_config.json'
    );

    try {
      let config: any = {};
      
      // Try to read existing config
      try {
        const existing = await fs.readFile(claudeConfigPath, 'utf-8');
        config = JSON.parse(existing);
      } catch {
        console.log('Creating new Claude Desktop configuration...');
      }

      // Add ObsidianMCP server
      if (!config.mcpServers) {
        config.mcpServers = {};
      }

      config.mcpServers['obsidian-mcp'] = {
        command: 'node',
        args: [path.join(this.projectPath, 'dist', 'index-simple.js')],
      };

      // Write updated config
      await fs.mkdir(path.dirname(claudeConfigPath), { recursive: true });
      await fs.writeFile(
        claudeConfigPath,
        JSON.stringify(config, null, 2),
        'utf-8'
      );

      console.log('✓ Claude Desktop configured');
    } catch (error) {
      console.warn('⚠️  Could not configure Claude Desktop automatically');
      console.log('\nPlease manually add the following to your claude_desktop_config.json:');
      console.log(JSON.stringify({
        mcpServers: {
          'obsidian-mcp': {
            command: 'node',
            args: [path.join(this.projectPath, 'dist', 'index.js')],
          }
        }
      }, null, 2));
    }
  }
}

async function main() {
  const installer = new Installer();
  await installer.run();
}

main().catch(console.error);