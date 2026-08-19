import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverPath = path.resolve(__dirname, '../dist/index.js');

async function runMcpIntegrationTest(): Promise<void> {
  console.log('🤖 Starting local MCP server client test...');
  console.log(`📍 Spawning server process: ${serverPath}`);

  const transport = new StdioClientTransport({
    command: 'node',
    args: [serverPath],
    env: {
      ...process.env
    }
  });

  const client = new Client(
    {
      name: 'subito-mcp-test-runner',
      version: '1.0.0'
    },
    {
      capabilities: {}
    }
  );

  try {
    await client.connect(transport);
    console.log('✅ Connected to local MCP server via stdio transport!');

    // 1. Test listing tools
    const toolsResponse = await client.listTools();
    console.log(`📋 Discovered ${toolsResponse.tools.length} MCP tools:`);
    for (const tool of toolsResponse.tools) {
      console.log(`  - 🔧 [${tool.name}]: ${tool.description}`);
    }

    const expectedTools = [
      'subito_scrape_by_url',
      'subito_search',
      'subito_get_dataset_items',
      'apify_check_status'
    ];

    for (const toolName of expectedTools) {
      const found = toolsResponse.tools.some((t) => t.name === toolName);
      if (!found) {
        throw new Error(`❌ Missing expected tool: ${toolName}`);
      }
    }
    console.log('✅ All expected MCP tools are registered correctly with valid schemas!');

    // 1.1 Test listing prompts
    const promptsResponse = await client.listPrompts();
    console.log(`📋 Discovered ${promptsResponse.prompts.length} MCP prompts:`);
    for (const p of promptsResponse.prompts) {
      console.log(`  - 📝 [${p.name}]: ${p.description}`);
    }
    const hasPrompt = promptsResponse.prompts.some(p => p.name === 'hardware_expert_search');
    if (!hasPrompt) {
      throw new Error('❌ Missing hardware_expert_search prompt');
    }
    console.log('✅ Prompt registered correctly!');

    // 2. Test status check tool call
    console.log('\n🧪 Testing tool invocation "apify_check_status"...');
    const statusResult = await client.callTool({
      name: 'apify_check_status',
      arguments: {}
    });

    console.log('Tool response content:', JSON.stringify(statusResult.content, null, 2));

    console.log('\n🎉 Local MCP server test completed successfully!');
  } finally {
    await client.close();
  }
}

runMcpIntegrationTest().catch((err) => {
  console.error('❌ MCP integration test failed:', err);
  process.exit(1);
});
