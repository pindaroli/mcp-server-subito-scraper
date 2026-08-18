import { buildSubitoSearchUrl } from '../src/url-builder.js';
import assert from 'node:assert';

console.log('Testing Subito URL builder...');

// Test 1: Simple query
const url1 = buildSubitoSearchUrl({ query: 'iphone 15' });
console.log('Test 1 URL:', url1);
assert.strictEqual(url1, 'https://www.subito.it/annunci-italia/vendita/usato/?q=iphone+15');

// Test 2: Category and region
const url2 = buildSubitoSearchUrl({
  query: 'bmw 320',
  category: 'auto',
  region: 'lombardia',
  minPrice: 5000,
  maxPrice: 20000,
  sortBy: 'priceasc'
});
console.log('Test 2 URL:', url2);
assert.strictEqual(
  url2,
  'https://www.subito.it/annunci-lombardia/vendita/auto/?q=bmw+320&ps=5000&pe=20000&order=priceasc'
);

// Test 3: Shipping filter
const url3 = buildSubitoSearchUrl({
  query: 'playstation 5',
  category: 'videogiochi',
  shippingOnly: true
});
console.log('Test 3 URL:', url3);
assert.strictEqual(
  url3,
  'https://www.subito.it/annunci-italia/vendita/videogiochi/?q=playstation+5&shp=true'
);

// Test 4: Real estate rental
const url4 = buildSubitoSearchUrl({
  query: 'trilocale',
  category: 'immobili-affitto',
  region: 'lazio'
});
console.log('Test 4 URL:', url4);
assert.strictEqual(
  url4,
  'https://www.subito.it/annunci-lazio/affitto/appartamenti/?q=trilocale'
);

console.log('✅ All URL builder tests passed successfully!');
