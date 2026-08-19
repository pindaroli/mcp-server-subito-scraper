import 'dotenv/config';
import { resolveApifyToken, VINTED_ACTOR_ID } from '../src/apify.js';

console.log('Testing Vinted Scraper configuration...');
console.log('Target Actor ID:', VINTED_ACTOR_ID);

if (VINTED_ACTOR_ID !== 'automation-lab/vinted-scraper') {
  console.error('❌ Unexpected Actor ID!');
  process.exit(1);
}

try {
  const token = resolveApifyToken();
  console.log('Resolved Token prefix:', token.substring(0, 12) + '...');
} catch {
  console.log('ℹ️ No environment token provided (testing with explicit parameter)');
  const testToken = resolveApifyToken('apify_api_testtoken12345');
  if (testToken !== 'apify_api_testtoken12345') {
    throw new Error('Failed to resolve explicit token');
  }
}
console.log('✅ Smoke test passed successfully!');
