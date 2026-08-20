import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  runVintedScraper,
  getDatasetItems,
  checkApifyStatus,
  formatApifyError,
  VINTED_ACTOR_ID
} from './apify.js';
import { inspectListingsWithAi, getAiConfig, resolveRuleModuleId } from 'shared-mcp-utils';

/**
 * Formats scraped Vinted items into clean markdown for display to LLM / user
 */
function formatVintedItemsMarkdown(items: Record<string, unknown>[]): string {
  if (items.length === 0) {
    return 'Nessun articolo trovato su Vinted per i criteri specificati.';
  }

  return items
    .map((item, index) => {
      const title =
        (item.title as string) ||
        (item.name as string) ||
        (item.subject as string) ||
        `Articolo #${index + 1}`;

      const rawPrice =
        (item.price as string) ||
        (item.price_numeric as number) ||
        (item.price_value as string) ||
        (item.total_item_price as string);
      const currency = (item.currency as string) || '€';
      const priceStr = rawPrice !== undefined && rawPrice !== null ? `${rawPrice} ${currency}`.trim() : 'N/D';
      const originalPrice = item.original_price_numeric || item.originalPrice;
      const originalPriceStr = originalPrice ? ` ~~(Originale: ${originalPrice} ${currency})~~` : '';

      const brand = (item.brand as string) || (item.brand_title as string) || '';
      const size = (item.size as string) || (item.size_title as string) || '';
      const status = (item.status as string) || (item.condition as string) || '';
      const color = (item.color as string) || (item.color1 as string) || '';

      const sellerObj = (item.seller as Record<string, unknown>) || (item.user as Record<string, unknown>) || {};
      const seller =
        (item.seller_name as string) ||
        (sellerObj.username as string) ||
        (sellerObj.login as string) ||
        (item.seller as string) ||
        '';

      const sellerRating =
        (item.seller_rating as number) ||
        (sellerObj.feedback_reputation as number) ||
        (sellerObj.positive_feedback_count as number);

      const location =
        (item.city as string) ||
        (item.country as string) ||
        (sellerObj.city as string) ||
        (sellerObj.country_title as string) ||
        '';

      const favourites =
        item.favourite_count ?? item.favourites ?? item.likes_count ?? item.view_count;

      const url =
        (item.url as string) ||
        (item.link as string) ||
        (item.item_url as string) ||
        '';

      const details: string[] = [];
      details.push(`💶 **Prezzo:** ${priceStr}${originalPriceStr}`);
      if (brand) details.push(`🏷️ **Brand:** ${brand}`);
      if (size) details.push(`📏 **Taglia:** ${size}`);
      if (status) details.push(`✨ **Condizione:** ${status}`);
      if (color) details.push(`🎨 **Colore:** ${color}`);
      if (seller) details.push(`👤 **Venditore:** ${seller}${sellerRating ? ` (⭐ ${sellerRating})` : ''}`);
      if (location) details.push(`📍 **Luogo:** ${location}`);
      if (favourites !== undefined && favourites !== null) details.push(`❤️ **Preferiti:** ${favourites}`);
      if (url) details.push(`🔗 [Visualizza su Vinted](${url})`);

      const description = (item.description as string) || (item.body as string) || '';
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
 * Registers all Vinted scraping tools on the MCP server instance
 */
export function registerTools(server: McpServer): void {
  // 1. Tool: Search Vinted by query and filters
  server.tool(
    'vinted_search',
    'Searches Vinted for secondhand items across European domains and automatically applies AI-powered rules filtering, price/GB calculations, and accepted/rejected breakdowns.',
    {
      searchQuery: z
        .string()
        .describe('Search query keyword (e.g. "RAM DDR5", "Corsair DDR5", "giacca pelle vintage")'),
      domain: z
        .string()
        .optional()
        .default('vinted.it')
        .describe(
          'Target Vinted regional domain: "vinted.it" (Italy), "vinted.fr" (France), "vinted.de" (Germany), "vinted.es" (Spain), "vinted.co.uk" (United Kingdom), "vinted.com" (USA), "vinted.nl" (Netherlands), "vinted.be" (Belgium)'
        ),
      minPrice: z
        .number()
        .positive()
        .optional()
        .describe('Minimum price filter in EUR or domain currency'),
      maxPrice: z
        .number()
        .positive()
        .optional()
        .describe('Maximum price filter in EUR or domain currency'),
      maxPricePerGB: z
        .number()
        .positive()
        .optional()
        .default(10)
        .describe('Maximum price in EUR per GB for RAM hardware evaluation (default: 10 EUR/GB)'),
      sortBy: z
        .enum(['price_low_to_high', 'price_high_to_low', 'newest_first', 'relevance'])
        .optional()
        .default('relevance')
        .describe('Sorting order: "relevance" (most relevant), "price_low_to_high" (cheapest first), "price_high_to_low" (most expensive first), "newest_first" (newest)'),
      maxItems: z
        .number()
        .int()
        .positive()
        .optional()
        .default(30)
        .describe('Maximum number of items to retrieve (default: 30, max recommended: 100)'),
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
      searchQuery,
      domain,
      minPrice,
      maxPrice,
      maxPricePerGB,
      sortBy,
      maxItems,
      timeoutSecs,
      ruleModuleId,
      token
    }) => {
      try {
        console.error(`\n[Vinted Scraper] 🔎 Avvio ricerca Vinted: query="${searchQuery}", domain="${domain}", minPrice=${minPrice ?? 'N/D'}, maxPrice=${maxPrice ?? 'N/D'}, maxItems=${maxItems}, sortBy="${sortBy}"`);
        const result = await runVintedScraper({
          searchQuery,
          domain,
          minPrice,
          maxPrice,
          sortBy,
          maxItems,
          timeoutSecs,
          token
        });
        console.error(`[Vinted Scraper] 📦 Recuperati ${result.items.length} articoli da Vinted (Dataset Apify: ${result.datasetUrl})`);

        const aiConfig = getAiConfig();
        const shouldRunAi = aiConfig.isEnabled && (aiConfig.apiKey || process.env.AI_API_KEY);

        let finalReport = '';
        let aiResult: any = null;

        if (shouldRunAi && result.items.length > 0) {
          try {
            const effectiveModuleId = await resolveRuleModuleId(searchQuery, ruleModuleId);
            aiResult = await inspectListingsWithAi(result.items, {
              targetQuery: searchQuery,
              maxPricePerGB,
              ruleModuleId: effectiveModuleId,
              maxItemsToInspect: maxItems,
              apifyStats: result.stats,
              datasetUrl: result.datasetUrl
            });
            finalReport = aiResult.markdownReport;
          } catch (aiErr: any) {
            console.error('[Vinted Scraper] AI Inspection error fallback:', aiErr);
            finalReport = `⚠️ **Nota:** Analisi AI non riuscita (${aiErr.message}), mostro risultati standard.\n\n` + formatVintedItemsMarkdown(result.items);
          }
        } else {
          finalReport = formatVintedItemsMarkdown(result.items);
        }

        return {
          content: [
            {
              type: 'text',
              text: `### Risultati Ricerca Vinted per "${searchQuery}"\n- **Dominio:** ${domain}\n- **Articoli estratti:** ${result.items.length} (Totale nel dataset: ${result.itemsCount})\n- **Dataset Apify:** [Console Apify Dataset](${result.datasetUrl})\n\n---\n\n${finalReport}`
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

  // 2. Tool: Fetch items from existing dataset ID
  server.tool(
    'vinted_get_dataset_items',
    'Fetches scraped Vinted items from a previously generated Apify dataset ID',
    {
      datasetId: z
        .string()
        .describe('Apify Dataset ID containing scraped Vinted listings'),
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
        const markdownSummary = formatVintedItemsMarkdown(items);

        return {
          content: [
            {
              type: 'text',
              text: `### Dataset Apify: \`${datasetId}\`\n- **Articoli recuperati:** ${items.length} di ${total}\n- **Link Dataset:** [Console Apify](https://console.apify.com/storage/datasets/${datasetId})\n\n---\n\n${markdownSummary}`
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

  // 3. Tool: Check Apify API connection and token status
  server.tool(
    'apify_check_status',
    'Checks the status of the Apify account and validates the API token',
    {
      token: z
        .string()
        .optional()
        .describe('Optional Apify API Token to test (overrides APIFY_TOKEN environment variable)')
    },
    async ({ token }) => {
      try {
        const status = await checkApifyStatus(token);

        if (status.isValid) {
          return {
            content: [
              {
                type: 'text',
                text: `✅ **Connessione ad Apify valida!**\n- **Utente:** ${status.username}\n- **Email:** ${status.email}\n- **Piano:** ${status.plan}\n- **Actor Vinted:** \`${VINTED_ACTOR_ID}\``
              }
            ]
          };
        } else {
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: `🔴 **Verifica Apify fallita:** ${status.error}`
              }
            ]
          };
        }
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
