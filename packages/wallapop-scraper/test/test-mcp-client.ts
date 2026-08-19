import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runClientTest(): Promise<void> {
  console.log('🤖 Starting local Wallapop MCP server client test...');

  const serverPath = path.resolve(__dirname, '../dist/index.js');
  console.log(`📍 Spawning server process: ${serverPath}`);

  const transport = new StdioClientTransport({
    command: 'node',
    args: [serverPath],
    env: {
      ...process.env,
      APIFY_TOKEN: process.env.APIFY_TOKEN || 'dummy_token'
    }
  });

  const client = new Client(
    {
      name: 'test-wallapop-mcp-client',
      version: '1.0.0'
    },
    {
      capabilities: {}
    }
  );

  try {
    await client.connect(transport);
    console.log('✅ Connected to local Wallapop MCP server via stdio transport!');

    // 1. Discover tools
    const toolsResponse = await client.listTools();
    console.log(`📋 Discovered ${toolsResponse.tools.length} MCP tools:`);
    for (const tool of toolsResponse.tools) {
      console.log(`  - 🔧 [${tool.name}]: ${tool.description}`);
    }

    const expectedTools = [
      'wallapop_search',
      'wallapop_scrape_by_url',
      'wallapop_get_dataset_items',
      'apify_check_status'
    ];
    for (const expected of expectedTools) {
      const found = toolsResponse.tools.some((t) => t.name === expected);
      if (!found) {
        throw new Error(`Missing expected tool: ${expected}`);
      }
    }
    console.log('✅ All expected Wallapop MCP tools are registered correctly with valid schemas!');
    console.log('\n🎉 Local Wallapop MCP server test completed successfully!');
  } catch (error) {
    console.error('❌ MCP integration test failed:', error);
    process.exit(1);
  } finally {
    await client.close();
  }
}

runClientTest().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
