import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  runSubitoScraper,
  getDatasetItems,
  checkApifyStatus,
  SUBITO_ACTOR_ID
} from './apify.js';
import { buildSubitoSearchUrl } from './url-builder.js';

/**
 * Formats scraped items into clean markdown for display to LLM / user
 */
function formatItemsMarkdown(items: Record<string, unknown>[]): string {
  if (items.length === 0) {
    return 'Nessun annuncio trovato per i criteri specificati.';
  }

  return items
    .map((item, index) => {
      const title = (item.title as string) || (item.name as string) || `Annuncio #${index + 1}`;
      const price = item.price ? `💶 **Prezzo:** ${item.price}` : '💶 **Prezzo:** N/D';
      const location = (item.location as string) || (item.geo as string) || (item.town as string) || '';
      const url = (item.url as string) || (item.link as string) || '';
      const date = (item.date as string) || (item.publishedAt as string) || '';
      const advertiser = (item.advertiser_name as string) || (item.seller as string) || '';
      const phone = (item.phone as string) || (item.telephone as string) || '';
      const email = (item.email as string) || '';
      const description = (item.description as string) || (item.body as string) || '';

      const details: string[] = [];
      if (price) details.push(price);
      if (location) details.push(`📍 **Luogo:** ${location}`);
      if (date) details.push(`🕒 **Data:** ${date}`);
      if (advertiser) details.push(`👤 **Venditore:** ${advertiser}`);
      if (phone) details.push(`📞 **Telefono:** ${phone}`);
      if (email) details.push(`✉️ **Email:** ${email}`);
      if (url) details.push(`🔗 [Visualizza su Subito.it](${url})`);

      let formatted = `### ${index + 1}. ${title}\n` + details.join(' | ') + '\n';
      if (description) {
        const shortDesc = description.length > 200 ? description.substring(0, 200) + '...' : description;
        formatted += `\n> ${shortDesc.replace(/\n+/g, ' ')}\n`;
      }
      return formatted;
    })
    .join('\n---\n\n');
}

/**
 * Registers all Subito.it scraping tools on the MCP server instance
 */
export function registerTools(server: McpServer): void {
  // 1. Tool: Scrape by direct search URL
  server.tool(
    'subito_scrape_by_url',
    'Scrapes classified ads directly from a Subito.it search URL using Apify Actor (azzouzana/subito-scraper-pro-by-search-url)',
    {
      searchUrl: z
        .string()
        .describe('Full Subito.it search URL to scrape (e.g. "https://www.subito.it/annunci-italia/vendita/usato/?q=iphone+15")'),
      maxItems: z
        .number()
        .int()
        .positive()
        .optional()
        .default(30)
        .describe('Maximum number of ads/listings to retrieve (default: 30)'),
      timeoutSecs: z
        .number()
        .int()
        .positive()
        .optional()
        .default(300)
        .describe('Timeout in seconds for Apify Actor execution (default: 300)'),
      token: z
        .string()
        .optional()
        .describe('Optional Apify API Token (overrides APIFY_TOKEN environment variable)')
    },
    async ({ searchUrl, maxItems, timeoutSecs, token }) => {
      try {
        const result = await runSubitoScraper({
          searchUrl,
          maxItems,
          timeoutSecs,
          token
        });

        const markdownSummary = formatItemsMarkdown(result.items);

        return {
          content: [
            {
              type: 'text',
              text: `### Scraping completato con successo da Subito.it\n- **URL Ricerca:** ${searchUrl}\n- **Annunci estratti:** ${result.items.length} (Totale nel dataset: ${result.itemsCount})\n- **Dataset Apify:** [Console Apify Dataset](${result.datasetUrl})\n\n---\n\n${markdownSummary}`
            },
            {
              type: 'text',
              text: `JSON Risultati:\n\`\`\`json\n${JSON.stringify(result.items, null, 2)}\n\`\`\``
            }
          ]
        };
      } catch (error) {
        const errMessage = error instanceof Error ? error.message : String(error);
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Errore durante l'esecuzione dello scraping su Subito.it: ${errMessage}`
            }
          ]
        };
      }
    }
  );

  // 2. Tool: Search Subito by query and filters (automated URL builder + scraper)
  server.tool(
    'subito_search',
    'Searches Subito.it for ads by keywords, category, region, price range, and shipping, then scrapes the results via Apify',
    {
      query: z
        .string()
        .describe('Search query keyword (e.g. "MacBook Pro M3", "BMW 320d", "Appartamento centro")'),
      category: z
        .string()
        .optional()
        .default('usato')
        .describe(
          'Category on Subito.it: "usato", "auto", "moto", "accessori-auto", "accessori-moto", "case", "appartamenti", "immobili-affitto", "informatica", "telefonia", "audio-video", "fotografia", "videogiochi", "elettrodomestici", "arredamento", "abbigliamento", "orologi", "sport", "biciclette", "musica", "libri", "collezionismo", "lavoro"'
        ),
      region: z
        .string()
        .optional()
        .default('italia')
        .describe(
          'Italian region: "italia" (all Italy), "lombardia", "lazio", "campania", "veneto", "piemonte", "emilia-romagna", "toscana", "sicilia", "puglia", etc.'
        ),
      minPrice: z
        .number()
        .positive()
        .optional()
        .describe('Minimum price in EUR (optional)'),
      maxPrice: z
        .number()
        .positive()
        .optional()
        .describe('Maximum price in EUR (optional)'),
      shippingOnly: z
        .boolean()
        .optional()
        .default(false)
        .describe('If true, filters only listings with TuttoSubito shipping available'),
      sortBy: z
        .enum(['datedesc', 'priceasc', 'pricedesc', 'relevance'])
        .optional()
        .default('datedesc')
        .describe('Sorting order: "datedesc" (most recent), "priceasc" (cheapest), "pricedesc" (most expensive), "relevance"'),
      maxItems: z
        .number()
        .int()
        .positive()
        .optional()
        .default(30)
        .describe('Maximum number of listings to retrieve (default: 30)'),
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
    async ({
      query,
      category,
      region,
      minPrice,
      maxPrice,
      shippingOnly,
      sortBy,
      maxItems,
      timeoutSecs,
      token
    }) => {
      try {
        const searchUrl = buildSubitoSearchUrl({
          query,
          category,
          region,
          minPrice,
          maxPrice,
          shippingOnly,
          sortBy
        });

        const result = await runSubitoScraper({
          searchUrl,
          maxItems,
          timeoutSecs,
          token
        });

        const markdownSummary = formatItemsMarkdown(result.items);

        return {
          content: [
            {
              type: 'text',
              text: `### Risultati Ricerca Subito.it per "${query}"\n- **URL Generato:** ${searchUrl}\n- **Categoria:** ${category} | **Regione:** ${region}\n- **Annunci trovati:** ${result.items.length} (Totale nel dataset: ${result.itemsCount})\n- **Dataset Apify:** [Console Apify Dataset](${result.datasetUrl})\n\n---\n\n${markdownSummary}`
            },
            {
              type: 'text',
              text: `JSON Risultati:\n\`\`\`json\n${JSON.stringify(result.items, null, 2)}\n\`\`\``
            }
          ]
        };
      } catch (error) {
        const errMessage = error instanceof Error ? error.message : String(error);
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Errore durante la ricerca su Subito.it: ${errMessage}`
            }
          ]
        };
      }
    }
  );

  // 3. Tool: Fetch items from a previous dataset ID
  server.tool(
    'subito_get_dataset_items',
    'Fetches scraped items from a previously generated Apify dataset ID',
    {
      datasetId: z.string().describe('The Apify Dataset ID to fetch items from'),
      limit: z.number().int().positive().optional().default(50).describe('Limit number of items to fetch'),
      offset: z.number().int().nonnegative().optional().default(0).describe('Offset for pagination'),
      token: z.string().optional().describe('Optional Apify API Token')
    },
    async ({ datasetId, limit, offset, token }) => {
      try {
        const data = await getDatasetItems(datasetId, limit, offset, token);
        const markdownSummary = formatItemsMarkdown(data.items);

        return {
          content: [
            {
              type: 'text',
              text: `### Dataset Apify: ${datasetId}\n- **Elementi recuperati:** ${data.count} (Totale: ${data.total})\n- **Offset:** ${offset}\n\n---\n\n${markdownSummary}`
            },
            {
              type: 'text',
              text: `JSON:\n\`\`\`json\n${JSON.stringify(data.items, null, 2)}\n\`\`\``
            }
          ]
        };
      } catch (error) {
        const errMessage = error instanceof Error ? error.message : String(error);
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Errore durante il recupero del dataset ${datasetId}: ${errMessage}`
            }
          ]
        };
      }
    }
  );

  // 4. Tool: Check Apify status and token validity
  server.tool(
    'apify_check_status',
    'Checks the status of the Apify account and validates the API token',
    {
      token: z.string().optional().describe('Optional Apify API Token to test')
    },
    async ({ token }) => {
      try {
        const userInfo = await checkApifyStatus(token);
        return {
          content: [
            {
              type: 'text',
              text: `✅ **Connessione ad Apify riuscita!**\n\n- **Utente:** ${userInfo.username} (${userInfo.email})\n- **Piano:** ${userInfo.plan || 'Free / Pay-per-event'}\n- **Actor ID configurato:** \`${SUBITO_ACTOR_ID}\``
            }
          ]
        };
      } catch (error) {
        const errMessage = error instanceof Error ? error.message : String(error);
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `❌ Connessione ad Apify fallita: ${errMessage}`
            }
          ]
        };
      }
    }
  );
}
