import { ApifyClient, ApifyApiError } from 'apify-client';

export const VINTED_ACTOR_ID = 'automation-lab/vinted-scraper';

export interface ScrapeVintedOptions {
  searchQuery: string;
  domain?: string;
  maxItems?: number;
  sortBy?: 'price_low_to_high' | 'price_high_to_low' | 'newest_first' | 'relevance';
  minPrice?: number;
  maxPrice?: number;
  token?: string;
  timeoutSecs?: number;
}

export interface ApifyRunStats {
  durationMillis?: number;
  computeUnits?: number;
  costUsd?: number;
  startedAt?: Date | string;
  finishedAt?: Date | string;
}

export interface ApifyRunResult {
  runId: string;
  status: string;
  defaultDatasetId: string;
  itemsCount: number;
  items: Record<string, unknown>[];
  datasetUrl: string;
  actorUrl: string;
  stats?: ApifyRunStats;
}

/**
 * Resolves the Apify token from various sources in order of priority:
 * 1. Explicitly passed in call
 * 2. Process env APIFY_TOKEN
 * 3. Process env APIFY_API_TOKEN
 */
export function resolveApifyToken(explicitToken?: string): string {
  const token = explicitToken || process.env.APIFY_TOKEN || process.env.APIFY_API_TOKEN;
  if (!token || token.trim().length === 0) {
    throw new Error(
      'Apify API token is missing. Please provide it via the APIFY_TOKEN / APIFY_API_TOKEN environment variable, via the --token CLI option, or as a tool argument.'
    );
  }
  return token.trim();
}

/**
 * Creates an instance of ApifyClient with the specified or resolved token
 */
export function getApifyClient(token?: string): ApifyClient {
  const resolvedToken = resolveApifyToken(token);
  return new ApifyClient({ token: resolvedToken });
}

/**
 * Runs the automation-lab/vinted-scraper actor and retrieves the dataset items
 */
export async function runVintedScraper(options: ScrapeVintedOptions): Promise<ApifyRunResult> {
  const client = getApifyClient(options.token);

  const requestedLimit = options.maxItems ?? 30;

  const actorInput: Record<string, unknown> = {
    searchQuery: options.searchQuery,
    domain: options.domain || 'vinted.it',
    maxItems: requestedLimit
  };

  if (options.sortBy) {
    actorInput.sortBy = options.sortBy;
  }
  if (options.minPrice !== undefined && options.minPrice !== null) {
    actorInput.minPrice = options.minPrice;
  }
  if (options.maxPrice !== undefined && options.maxPrice !== null) {
    actorInput.maxPrice = options.maxPrice;
  }

  const runOptions: { timeout?: number; waitSecs?: number; log: null } = { log: null };
  if (options.timeoutSecs) {
    runOptions.timeout = options.timeoutSecs;
    runOptions.waitSecs = options.timeoutSecs;
  }

  // Run the Actor and wait for it to finish
  const run = await client.actor(VINTED_ACTOR_ID).call(actorInput, runOptions);

  if (!run || !run.defaultDatasetId) {
    throw new Error(`Apify Actor run failed or did not return a valid dataset ID. Run status: ${run?.status}`);
  }

  // Fetch the dataset items
  const { items, total } = await client.dataset(run.defaultDatasetId).listItems({
    limit: requestedLimit
  });

  const slicedItems = (items as Record<string, unknown>[]).slice(0, requestedLimit);

  const stats: ApifyRunStats = {
    durationMillis: (run.stats as any)?.durationMillis || (run.finishedAt && run.startedAt ? new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime() : undefined),
    computeUnits: (run.stats as any)?.computeUnits ?? (run.usage as any)?.ACTOR_COMPUTE_UNITS,
    costUsd: (run.usage as any)?.TOTAL_COST_USD || (run.stats as any)?.costUsd,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt
  };

  return {
    runId: run.id,
    status: run.status,
    defaultDatasetId: run.defaultDatasetId,
    itemsCount: total ?? items.length,
    items: slicedItems,
    datasetUrl: `https://console.apify.com/storage/datasets/${run.defaultDatasetId}`,
    actorUrl: `https://apify.com/${VINTED_ACTOR_ID}`,
    stats
  };
}

/**
 * Fetches items from an existing dataset ID
 */
export async function getDatasetItems(
  datasetId: string,
  limit = 50,
  token?: string
): Promise<{ items: Record<string, unknown>[]; total: number }> {
  const client = getApifyClient(token);
  const { items, total } = await client.dataset(datasetId).listItems({
    limit
  });

  return {
    items: items as Record<string, unknown>[],
    total: total ?? items.length
  };
}

/**
 * Checks Apify API token validity and returns user information
 */
export async function checkApifyStatus(token?: string): Promise<{
  isValid: boolean;
  username?: string;
  email?: string;
  plan?: string;
  error?: string;
}> {
  try {
    const client = getApifyClient(token);
    const user = await client.user().get();

    return {
      isValid: true,
      username: user?.username,
      email: user?.email,
      plan: user?.plan?.id || 'standard'
    };
  } catch (error) {
    return {
      isValid: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Formats errors from Apify API into actionable troubleshooting messages
 */
export function formatApifyError(error: unknown): string {
  if (error instanceof ApifyApiError) {
    if (error.statusCode === 401) {
      return (
        `🔴 **DIAGNOSTICA: Token Apify non valido o non autorizzato (HTTP 401)**\n` +
        `- **Dettaglio:** ${error.message}\n` +
        `💡 **Come risolvere:**\n` +
        `  1. Verifica che il token API in \`.env\` (APIFY_TOKEN) sia corretto.\n` +
        `  2. Genera un nuovo token su: https://console.apify.com/account/integrations\n` +
        `  3. Assicurati che il token abbia i permessi di lettura ed esecuzione per gli Actor.`
      );
    }
    if (error.statusCode === 402) {
      return (
        `🔴 **DIAGNOSTICA: Credito Apify esaurito o piano insufficiente (HTTP 402)**\n` +
        `- **Dettaglio:** ${error.message}\n` +
        `💡 **Come risolvere:**\n` +
        `  1. Verifica il saldo o i limiti del tuo account su: https://console.apify.com/billing\n` +
        `  2. Effettua l'upgrade o ricarica i crediti per ripristinare le esecuzioni.`
      );
    }
    if (error.statusCode === 404) {
      return (
        `🔴 **DIAGNOSTICA: Risorsa non trovata su Apify (HTTP 404)**\n` +
        `- **Dettaglio:** ${error.message}\n` +
        `💡 **Come risolvere:**\n` +
        `  1. Verifica che l'Actor \`${VINTED_ACTOR_ID}\` o l'ID del Dataset siano corretti.`
      );
    }
    return `🔴 **Errore API Apify (HTTP ${error.statusCode}):** ${error.message}`;
  }

  if (error instanceof Error) {
    if (error.message.includes('Apify API token is missing')) {
      return (
        `🔴 **DIAGNOSTICA: Token Apify non configurato**\n` +
        `- **Dettaglio:** Nessun token API è stato trovato nelle variabili d'ambiente o nei parametri.\n` +
        `💡 **Come risolvere:**\n` +
        `  1. Crea un file \`.env\` nel progetto con il contenuto: \`APIFY_TOKEN=il_tuo_token_apify\`\n` +
        `  2. Oppure passa il token direttamente come parametro nel tool.`
      );
    }
    return `🔴 **Errore di esecuzione:** ${error.message}`;
  }

  return `🔴 **Errore imprevisto:** ${String(error)}`;
}
