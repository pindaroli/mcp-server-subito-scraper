import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  runWallapopScraper,
  getDatasetItems,
  checkApifyStatus,
  formatApifyError,
  WALLAPOP_ACTOR_ID
} from './apify.js';
import { buildWallapopSearchUrl } from './url-builder.js';
import { inspectListingsWithAi, getAiConfig, detectRuleModuleId } from 'shared-mcp-utils';

/**
 * Formats scraped Wallapop items into clean markdown for fallback display
 */
function formatWallapopItemsMarkdown(items: Record<string, unknown>[]): string {
  if (items.length === 0) {
    return 'Nessun articolo trovato su Wallapop per i criteri specificati.';
  }

  if (items.length === 1 && items[0].no_results) {
    const msg = (items[0].message as string) || 'Nessun risultato trovato';
    const reason = (items[0].reason as string) || '';
    return `⚠️ **Nessun Risultato da Wallapop**: ${msg} ${reason}`.trim();
  }

  return items
    .map((item, index) => {
      const title =
        (item.title as string) ||
        (item.name as string) ||
        (item.subject as string) ||
        `Articolo #${index + 1}`;

      const rawPrice = item.price ?? item.price_numeric ?? item.price_value;
      const currency = (item.currency as string) || '€';
      const priceStr = rawPrice !== undefined && rawPrice !== null ? `${rawPrice} ${currency}`.trim() : 'N/D';
      const financedPrice = item.financed_price ? ` (Finanziato: ${item.financed_price} ${currency})` : '';

      const brand = (item.brand as string) || '';
      const model = (item.model as string) || '';
      const year = item.year ? String(item.year) : '';
      const km = item.km ? `${item.km} km` : '';
      const condition = (item.condition as string) || (item.status as string) || '';

      const locationParts = [item.city, item.postal_code, item.country_code].filter(Boolean);
      const location = locationParts.join(', ');

      const sellerLegalName = (item.seller_legal_name as string) || '';
      const sellerPhone = (item.seller_phone as string) || '';
      const sellerEmail = (item.seller_email as string) || '';
      const isTopSeller = item.seller_is_top_profile ? ' ⭐ Top Profile' : '';
      const sellerId = item.seller_id ? `ID: ${item.seller_id}` : '';

      const views = item.views !== undefined ? `👁️ ${item.views}` : '';
      const favs = item.favorites !== undefined ? `❤️ ${item.favorites}` : '';
      const convs = item.conversations !== undefined ? `💬 ${item.conversations}` : '';
      const engagement = [views, favs, convs].filter(Boolean).join(' | ');

      const url =
        (item.listing_url as string) ||
        (item.share_url as string) ||
        (item.url as string) ||
        '';

      const details: string[] = [];
      details.push(`💶 **Prezzo:** ${priceStr}${financedPrice}`);
      if (brand || model) details.push(`🏷️ **Modello:** ${[brand, model].filter(Boolean).join(' ')}`);
      if (year) details.push(`📅 **Anno:** ${year}`);
      if (km) details.push(`🚗 **Km:** ${km}`);
      if (condition) details.push(`✨ **Condizione:** ${condition}`);
      if (location) details.push(`📍 **Luogo:** ${location}`);
      if (item.shipping_available !== undefined) {
        details.push(item.shipping_available ? '📦 Spedizione disponibile' : '🚫 Ritiro a mano');
      }
      if (sellerLegalName || sellerPhone || sellerId) {
        const sInfo = [sellerLegalName || sellerId, sellerPhone, sellerEmail].filter(Boolean).join(' - ');
        details.push(`👤 **Venditore:** ${sInfo}${isTopSeller}`);
      }
      if (engagement) details.push(engagement);
      if (url) details.push(`🔗 [Visualizza su Wallapop](${url})`);

      const description = (item.description as string) || '';
      let formatted = `### ${index + 1}. ${title}\n` + details.join(' | ') + '\n';
      if (description) {
        const shortDesc = description.length > 250 ? description.substring(0, 250) + '...' : description;
        formatted += `\n> ${shortDesc.replace(/\n+/g, ' ')}\n`;
      }
      return formatted;
    })
    .join('\n---\n\n');
}

/**
 * Registers all Wallapop scraping tools on the MCP server instance
 */
export function registerTools(server: McpServer): void {
  // 1. Tool: Search Wallapop by query and structured filters with AI Vision Inspection
  server.tool(
    'wallapop_search',
    'Searches Wallapop secondhand marketplace across European domains (Spain, Italy, France, Portugal, UK) and automatically applies AI-powered rules filtering, price/GB calculations, and accepted/rejected breakdowns.',
    {
      query: z
        .string()
        .describe('Search keyword (e.g. "RAM DDR5", "MacBook Air M2", "BMW 320d", "giacca vintage")'),
      domain: z
        .enum(['it', 'es', 'fr', 'pt', 'en', 'uk'])
        .optional()
        .default('it')
        .describe('Target Wallapop regional market: "it" (Italy), "es" (Spain), "fr" (France), "pt" (Portugal), "en" / "uk" (United Kingdom)'),
      category: z
        .string()
        .optional()
        .describe('Category filter: "informatica", "telefonia", "audio", "videogiochi", "auto", "moto", "casa", "sport", "immobili", "servizi", "altro" or specific category ID number'),
      minPrice: z
        .number()
        .positive()
        .optional()
        .describe('Minimum price filter in EUR'),
      maxPrice: z
        .number()
        .positive()
        .optional()
        .describe('Maximum price filter in EUR'),
      maxPricePerGB: z
        .number()
        .positive()
        .optional()
        .default(10)
        .describe('Maximum price in EUR per GB for RAM hardware evaluation (default: 10 EUR/GB)'),
      orderBy: z
        .enum(['newest', 'price_low_to_high', 'price_high_to_low', 'most_relevance'])
        .optional()
        .default('newest')
        .describe('Sorting order: "newest", "price_low_to_high", "price_high_to_low", "most_relevance"'),
      condition: z
        .enum(['new', 'as_good_as_new', 'good', 'fair', 'has_given_it_all'])
        .optional()
        .describe('Item condition: "new" (Nuovo), "as_good_as_new" (Come nuovo), "good" (Buone condizioni), "fair" (Accettabile)'),
      shippingOnly: z
        .boolean()
        .optional()
        .default(false)
        .describe('If true, filters only listings with shipping available (spedizione)'),
      maxItems: z
        .number()
        .int()
        .positive()
        .optional()
        .default(30)
        .describe('Maximum number of items to retrieve (default: 30, max recommended: 100)'),
      country: z
        .string()
        .optional()
        .describe('Optional country override (e.g. "Italy", "Spain", "France", "Portugal", "United Kingdom")'),
      timeoutSecs: z
        .number()
        .int()
        .positive()
        .optional()
        .default(300)
        .describe('Timeout in seconds for Apify Actor execution (default: 300)'),
      ruleModuleId: z
        .string()
        .optional()
        .describe('Optional rule module ID to apply (e.g. "ram_ddr5", "ram", "matx_motherboard", "psu_sfx")'),
      token: z
        .string()
        .optional()
        .describe('Optional Apify API Token (overrides APIFY_TOKEN environment variable)')
    },
    async ({
      query,
      domain,
      category,
      minPrice,
      maxPrice,
      maxPricePerGB,
      orderBy,
      condition,
      shippingOnly,
      maxItems,
      country,
      timeoutSecs,
      ruleModuleId,
      token
    }) => {
      try {
        const searchUrl = buildWallapopSearchUrl({
          keywords: query,
          domain,
          categoryId: category,
          minPrice,
          maxPrice,
          orderBy,
          condition,
          shippingOnly
        });

        console.error(`\n[Wallapop Scraper] 🔎 Avvio ricerca Wallapop: query="${query}", domain="${domain}", url="${searchUrl}", maxItems=${maxItems}`);

        const result = await runWallapopScraper({
          startUrls: [searchUrl],
          maxItems,
          country,
          timeoutSecs,
          token
        });

        console.error(`[Wallapop Scraper] 📦 Recuperati ${result.items.length} articoli da Wallapop (Dataset Apify: ${result.datasetUrl})`);

        const aiConfig = getAiConfig();
        const shouldRunAi = aiConfig.isEnabled && (aiConfig.apiKey || process.env.AI_API_KEY);

        let finalReport = '';
        let aiResult: any = null;

        if (shouldRunAi && result.items.length > 0 && !result.items[0]?.no_results) {
          try {
            aiResult = await inspectListingsWithAi(result.items, {
              targetQuery: query,
              maxPricePerGB,
              ruleModuleId: ruleModuleId || detectRuleModuleId(query),
              maxItemsToInspect: maxItems,
              apifyStats: result.stats,
              datasetUrl: result.datasetUrl
            });
            finalReport = aiResult.markdownReport;
          } catch (aiErr: any) {
            console.error('[Wallapop Scraper] AI Inspection error fallback:', aiErr);
            finalReport = `⚠️ **Nota:** Analisi AI non riuscita (${aiErr.message}), mostro risultati standard.\n\n` + formatWallapopItemsMarkdown(result.items);
          }
        } else {
          finalReport = formatWallapopItemsMarkdown(result.items);
        }

        return {
          content: [
            {
              type: 'text',
              text: `### Risultati Ricerca Wallapop per "${query}"\n- **Mercato:** \`${domain}.wallapop.com\`\n- **URL Ricerca:** ${searchUrl}\n- **Articoli estratti:** ${result.items.length} (Totale nel dataset: ${result.itemsCount})\n- **Dataset Apify:** [Console Apify Dataset](${result.datasetUrl})\n\n---\n\n${finalReport}`
            },
            {
              type: 'text',
              text: `JSON Risultati:\n\`\`\`json\n${JSON.stringify(aiResult ? aiResult : result.items, null, 2)}\n\`\`\``
            }
          ]
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: formatApifyError(error)
            }
          ]
        };
      }
    }
  );

  // 2. Tool: Scrape directly by Wallapop URL with AI Vision Inspection
  server.tool(
    'wallapop_scrape_by_url',
    'Scrapes listings or search pages directly from one or more Wallapop URLs and applies AI-powered rules filtering.',
    {
      urls: z
        .array(z.string())
        .describe('Array of Wallapop URLs to scrape (search URLs or direct item URLs like "https://it.wallapop.com/item/...")'),
      maxItems: z
        .number()
        .int()
        .positive()
        .optional()
        .default(30)
        .describe('Maximum number of items to retrieve (default: 30)'),
      maxPricePerGB: z
        .number()
        .positive()
        .optional()
        .default(10)
        .describe('Maximum price in EUR per GB for RAM hardware evaluation (default: 10 EUR/GB)'),
      ruleModuleId: z
        .string()
        .optional()
        .describe('Optional rule module ID to apply (e.g. "ram_ddr5", "ram", "matx_motherboard", "psu_sfx")'),
      country: z
        .string()
        .optional()
        .describe('Optional country override (e.g. "Italy", "Spain", "France", "Portugal", "United Kingdom")'),
      timeoutSecs: z
        .number()
        .int()
        .positive()
        .optional()
        .default(300)
        .describe('Timeout in seconds for Apify Actor execution'),
      token: z
        .string()
        .optional()
        .describe('Optional Apify API Token (overrides APIFY_TOKEN environment variable)')
    },
    async ({ urls, maxItems, maxPricePerGB, ruleModuleId, country, timeoutSecs, token }) => {
      try {
        console.error(`\n[Wallapop Scraper] 🔎 Scraping diretto di ${urls.length} URLs Wallapop (maxItems=${maxItems})`);

        const result = await runWallapopScraper({
          startUrls: urls,
          maxItems,
          country,
          timeoutSecs,
          token
        });

        const aiConfig = getAiConfig();
        const shouldRunAi = aiConfig.isEnabled && (aiConfig.apiKey || process.env.AI_API_KEY);

        let finalReport = '';
        let aiResult: any = null;

        if (shouldRunAi && result.items.length > 0 && !result.items[0]?.no_results) {
          try {
            aiResult = await inspectListingsWithAi(result.items, {
              targetQuery: urls.join(', '),
              maxPricePerGB,
              ruleModuleId: ruleModuleId || 'ram_ddr5',
              maxItemsToInspect: maxItems,
              apifyStats: result.stats,
              datasetUrl: result.datasetUrl
            });
            finalReport = aiResult.markdownReport;
          } catch (aiErr: any) {
            console.error('[Wallapop Scraper] AI Inspection error fallback:', aiErr);
            finalReport = `⚠️ **Nota:** Analisi AI non riuscita (${aiErr.message}), mostro risultati standard.\n\n` + formatWallapopItemsMarkdown(result.items);
          }
        } else {
          finalReport = formatWallapopItemsMarkdown(result.items);
        }

        return {
          content: [
            {
              type: 'text',
              text: `### Risultati Scraping Diretto Wallapop\n- **URLs processati:** ${urls.length}\n- **Articoli estratti:** ${result.items.length}\n- **Dataset Apify:** [Console Apify Dataset](${result.datasetUrl})\n\n---\n\n${finalReport}`
            },
            {
              type: 'text',
              text: `JSON Risultati:\n\`\`\`json\n${JSON.stringify(aiResult ? aiResult : result.items, null, 2)}\n\`\`\``
            }
          ]
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: formatApifyError(error)
            }
          ]
        };
      }
    }
  );

  // 3. Tool: Fetch items from existing dataset ID
  server.tool(
    'wallapop_get_dataset_items',
    'Fetches scraped Wallapop items from a previously generated Apify dataset ID.',
    {
      datasetId: z
        .string()
        .describe('Apify Dataset ID containing scraped Wallapop listings'),
      limit: z
        .number()
        .int()
        .positive()
        .optional()
        .default(50)
        .describe('Number of items to retrieve (default: 50)'),
      token: z
        .string()
        .optional()
        .describe('Optional Apify API Token (overrides APIFY_TOKEN environment variable)')
    },
    async ({ datasetId, limit, token }) => {
      try {
        const { items, total } = await getDatasetItems(datasetId, limit, token);
        const formatted = formatWallapopItemsMarkdown(items);

        return {
          content: [
            {
              type: 'text',
              text: `### Dataset Apify: \`${datasetId}\`\n- **Articoli recuperati:** ${items.length} di ${total}\n- **Link Dataset:** [Console Apify](https://console.apify.com/storage/datasets/${datasetId})\n\n---\n\n${formatted}`
            },
            {
              type: 'text',
              text: `JSON Risultati:\n\`\`\`json\n${JSON.stringify(items, null, 2)}\n\`\`\``
            }
          ]
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: formatApifyError(error)
            }
          ]
        };
      }
    }
  );

  // 4. Tool: Check Apify connection status
  server.tool(
    'apify_check_status',
    'Checks the status of the Apify account and validates the API token for Wallapop scraper.',
    {
      token: z
        .string()
        .optional()
        .describe('Optional Apify API Token to test (overrides APIFY_TOKEN environment variable)')
    },
    async ({ token }) => {
      try {
        const status = await checkApifyStatus(token);
        return {
          content: [
            {
              type: 'text',
              text: `✅ **Connessione ad Apify valida!**\n- **Utente:** ${status.username}\n- **Piano:** ${status.plan?.toUpperCase() || 'STANDARD'}\n- **Actor Wallapop:** \`${WALLAPOP_ACTOR_ID}\``
            }
          ]
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: formatApifyError(error)
            }
          ]
        };
      }
    }
  );
}
