#!/usr/bin/env node
import { MCPServer } from './server/mcp-server';
import { ConfigManager } from './config/config.manager';
import { Logger } from './utils/logger';

async function main() {
  const logger = new Logger('main');
  
  try {
    logger.info('Starting ObsidianMCP Server...');
    
    // Initialize configuration
    const configManager = new ConfigManager();
    await configManager.initialize();
    
    // Start MCP server
    const server = new MCPServer(configManager);
    await server.start();
    
    logger.info('ObsidianMCP Server started successfully');
    
    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      logger.info('Shutting down ObsidianMCP Server...');
      await server.stop();
      process.exit(0);
    });
    
  } catch (error) {
    logger.error('Failed to start ObsidianMCP Server', error);
    process.exit(1);
  }
}

main();