# mcp-server-wallapop-scraper

Model Context Protocol (MCP) server for scraping Wallapop secondhand marketplace listings across **Spain, Italy, France, Portugal, and the United Kingdom** using the Apify Actor [`fayoussef/wallapop-scraper`](https://apify.com/fayoussef/wallapop-scraper).

---

## Features

- 🔎 **Multi-Market Search (`wallapop_search`)**: Search Wallapop across European regional domains (`it`, `es`, `fr`, `pt`, `en`/`uk`) with granular filters for price, category, condition, and shipping.
- 🔗 **Direct URL Scraping (`wallapop_scrape_by_url`)**: Scrape listings directly from any Wallapop search URL or item page URL.
- 📦 **Dataset Retrieval (`wallapop_get_dataset_items`)**: Fetch listings from existing Apify dataset IDs without re-running scrapers.
- 🔑 **Account Status (`apify_check_status`)**: Test and validate Apify credentials and API tokens.
- 🏢 **Rich Data Extraction**: Extracts price, financed price, full descriptions, high-resolution images, location (lat/lon, city, postal code), seller info (including business details, registration numbers, phone numbers, and emails), and engagement stats (views, favorites).

---

## Tools

### 1. `wallapop_search`
Searches Wallapop secondhand marketplace across European domains.
- `query` (string, required): Search keyword (e.g. "RAM DDR5", "MacBook Air M2", "BMW 320d").
- `domain` (string, optional, default: `"it"`): Market domain (`"it"`, `"es"`, `"fr"`, `"pt"`, `"en"`).
- `category` (string, optional): Category filter (`"informatica"`, `"auto"`, `"telefonia"`, `"audio"`, etc.).
- `minPrice` (number, optional): Minimum price in EUR.
- `maxPrice` (number, optional): Maximum price in EUR.
- `orderBy` (string, optional, default: `"newest"`): Sort order (`"newest"`, `"price_low_to_high"`, `"price_high_to_low"`, `"most_relevance"`).
- `condition` (string, optional): Condition (`"new"`, `"as_good_as_new"`, `"good"`, `"fair"`).
- `shippingOnly` (boolean, optional, default: `false`): Filter only listings with shipping available.
- `maxItems` (number, optional, default: `30`): Maximum items to retrieve.

### 2. `wallapop_scrape_by_url`
Scrapes listings directly from Wallapop URLs.
- `urls` (array of strings, required): Array of Wallapop URLs.
- `maxItems` (number, optional, default: `30`): Maximum items to retrieve.

### 3. `wallapop_get_dataset_items`
Fetches items from a previously generated Apify dataset ID.
- `datasetId` (string, required): Apify dataset ID.
- `limit` (number, optional, default: `50`): Maximum items to retrieve.

### 4. `apify_check_status`
Checks Apify connection and validates API token.

---

## MCP Configuration

Add to your MCP settings file (`claude_desktop_config.json`, `antigravity.json`, etc.):

```json
{
  "mcpServers": {
    "wallapop-scraper": {
      "command": "node",
      "args": ["/absolute/path/to/packages/wallapop-scraper/dist/index.js"],
      "env": {
        "APIFY_TOKEN": "your_apify_api_token_here"
      }
    }
  }
}
```

---

## License

MIT
