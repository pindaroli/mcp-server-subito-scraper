import 'dotenv/config';
import { resolveApifyToken, VINTED_ACTOR_ID } from '../src/apify.js';

console.log('Testing Vinted Scraper configuration...');
console.log('Target Actor ID:', VINTED_ACTOR_ID);

if (VINTED_ACTOR_ID !== 'automation-lab/vinted-scraper') {
  console.error('❌ Unexpected Actor ID!');
  process.exit(1);
}

const token = resolveApifyToken();
console.log('Resolved Token prefix:', token.substring(0, 12) + '...');
console.log('✅ Smoke test passed successfully!');
