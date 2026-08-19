#!/usr/bin/env node

import 'dotenv/config';
import log, { LogLevel } from '@apify/log';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerTools } from './tools.js';

// Ensure Apify logger doesn't emit ANSI escape characters or pollute stdio
log.setLevel(LogLevel.OFF);

const SERVER_NAME = 'mcp-server-wallapop-scraper';
const SERVER_VERSION = '1.0.0';

/**
 * Parse CLI flags for token, help, version
 */
function parseArgs(): void {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--help' || arg === '-h') {
      console.error(`
Wallapop MCP Server (via Apify Actor fayoussef/wallapop-scraper)

Usage:
  npx mcp-server-wallapop-scraper [options]

Options:
  -t, --token <token>         Apify API token (or set APIFY_TOKEN / APIFY_API_TOKEN env var)
  --apify-token <token>       Alternative flag for Apify API token
  -v, --version               Display version (${SERVER_VERSION})
  -h, --help                  Display this help message

Environment Variables:
  APIFY_TOKEN                 Apify API token
  APIFY_API_TOKEN             Alternative environment variable for Apify API token

Supported Markets:
  Spain (es), Italy (it), France (fr), Portugal (pt), United Kingdom (en / uk)

Example MCP Client Configuration:
  {
    "mcpServers": {
      "wallapop": {
        "command": "npx",
        "args": ["-y", "mcp-server-wallapop-scraper"],
        "env": {
          "APIFY_TOKEN": "your_apify_api_token_here"
        }
      }
    }
  }
`);
      process.exit(0);
    }

    if (arg === '--version' || arg === '-v') {
      console.error(`${SERVER_NAME} v${SERVER_VERSION}`);
      process.exit(0);
    }

    if ((arg === '--token' || arg === '-t' || arg === '--apify-token') && i + 1 < args.length) {
      process.env.APIFY_TOKEN = args[i + 1];
      i++;
    }
  }
}

async function main(): Promise<void> {
  parseArgs();

  // Initialize MCP Server instance
  const server = new McpServer(
    {
      name: SERVER_NAME,
      version: SERVER_VERSION
    },
    {
      capabilities: {
        tools: {}
      }
    }
  );

  // Register MCP tools
  registerTools(server);

  // Connect to stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error(`[${SERVER_NAME}] Server running on stdio transport (Apify Actor: fayoussef/wallapop-scraper)`);
}

main().catch((error) => {
  console.error(`[${SERVER_NAME}] Fatal error in server:`, error);
  process.exit(1);
});
