#!/usr/bin/env node

import 'dotenv/config';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerTools } from './tools.js';
import { registerHardwarePrompt } from 'shared-mcp-utils';

const SERVER_NAME = 'mcp-server-vinted-scraper';
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
Vinted MCP Server (via Apify Actor automation-lab/vinted-scraper)

Usage:
  npx mcp-server-vinted-scraper [options]

Options:
  -t, --token <token>         Apify API token (or set APIFY_TOKEN / APIFY_API_TOKEN env var)
  --apify-token <token>       Alternative flag for Apify API token
  -v, --version               Display version (${SERVER_VERSION})
  -h, --help                  Display this help message

Environment Variables:
  APIFY_TOKEN                 Apify API token
  APIFY_API_TOKEN             Alternative environment variable for Apify API token

Supported Domains:
  vinted.it (Italy), vinted.fr (France), vinted.de (Germany), vinted.es (Spain),
  vinted.co.uk (UK), vinted.com (US), vinted.nl (Netherlands), vinted.be (Belgium)

Example MCP Client Configuration:
  {
    "mcpServers": {
      "vinted": {
        "command": "npx",
        "args": ["-y", "mcp-server-vinted-scraper"],
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

  // Register hardware verification prompt
  registerHardwarePrompt(server.server);

  // Connect to stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error(`[${SERVER_NAME}] Server running on stdio transport (Apify Actor: automation-lab/vinted-scraper)`);
}

main().catch((error) => {
  console.error(`[${SERVER_NAME}] Fatal error in server:`, error);
  process.exit(1);
});
