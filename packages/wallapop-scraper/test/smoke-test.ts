import { checkApifyStatus } from '../src/apify.js';

async function runSmokeTest() {
  console.log('Running smoke test for Wallapop scraper...');
  try {
    const status = await checkApifyStatus();
    console.log('Apify status:', status);
    console.log('Smoke test passed successfully!');
  } catch (error) {
    console.error('Smoke test failed:', error);
    process.exit(1);
  }
}

runSmokeTest();
