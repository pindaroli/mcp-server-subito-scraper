import { ApifyClient, ApifyApiError } from 'apify-client';

export const WALLAPOP_ACTOR_ID = 'fayoussef/wallapop-scraper';

export interface ScrapeWallapopOptions {
  startUrls: string[];
  maxItems?: number;
  country?: string;
  latitude?: number;
  longitude?: number;
  token?: string;
  timeoutSecs?: number;
  memoryMbytes?: number;
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
 * Runs the fayoussef/wallapop-scraper actor and retrieves the dataset items
 */
export async function runWallapopScraper(options: ScrapeWallapopOptions): Promise<ApifyRunResult> {
  const client = getApifyClient(options.token);

  const requestedLimit = options.maxItems ?? 30;

  // Format start_urls array for the actor schema
  const start_urls = options.startUrls.map(u => ({ url: u }));

  const actorInput: Record<string, unknown> = {
    start_urls,
    max_items: requestedLimit
  };

  if (options.country) {
    actorInput.country = options.country;
  }
  if (options.latitude !== undefined && options.longitude !== undefined) {
    actorInput.latitude = options.latitude;
    actorInput.longitude = options.longitude;
  }

  const runOptions: { timeout?: number; memory?: number; waitSecs?: number; log: null } = { log: null };
  if (options.timeoutSecs) {
    runOptions.timeout = options.timeoutSecs;
    runOptions.waitSecs = options.timeoutSecs;
  }
  if (options.memoryMbytes) {
    runOptions.memory = options.memoryMbytes;
  }

  // Run the Actor and wait for it to finish
  const run = await client.actor(WALLAPOP_ACTOR_ID).call(actorInput, runOptions);

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
    itemsCount: total,
    items: slicedItems,
    datasetUrl: `https://console.apify.com/storage/datasets/${run.defaultDatasetId}`,
    actorUrl: `https://apify.com/${WALLAPOP_ACTOR_ID}`,
    stats
  };
}

/**
 * Fetches items directly from an existing Apify dataset ID
 */
export async function getDatasetItems(
  datasetId: string,
  limit: number = 50,
  token?: string
): Promise<{ items: Record<string, unknown>[]; total: number }> {
  const client = getApifyClient(token);
  const result = await client.dataset(datasetId).listItems({ limit });
  return {
    items: result.items as Record<string, unknown>[],
    total: result.total
  };
}

/**
 * Checks Apify connection and token validity
 */
export async function checkApifyStatus(token?: string): Promise<{
  valid: boolean;
  username?: string;
  userId?: string;
  plan?: string;
}> {
  try {
    const client = getApifyClient(token);
    const user = await client.user('me').get();
    if (!user) {
      return { valid: false };
    }
    return {
      valid: true,
      username: user.username,
      userId: user.id,
      plan: user.plan?.id || 'standard'
    };
  } catch (error) {
    if (error instanceof ApifyApiError) {
      throw new Error(`Apify API authentication failed (${error.statusCode}): ${error.message}`);
    }
    throw error;
  }
}

/**
 * Formats user-friendly error message from Apify errors
 */
export function formatApifyError(error: unknown): string {
  if (error instanceof ApifyApiError) {
    switch (error.statusCode) {
      case 401:
        return "❌ **Errore di Autenticazione ad Apify (401)**: Il token API non è valido o è scaduto. Verifica la variabile d'ambiente `APIFY_TOKEN`.";
      case 403:
        return '❌ **Permesso Negato (403)**: Il tuo account Apify non ha i permessi necessari per eseguire questo Actor o ha esaurito la quota mensile.';
      case 404:
        return `❌ **Risorsa Non Trovata (404)**: L'Actor \`${WALLAPOP_ACTOR_ID}\` o il dataset specificato non esistono più.`;
      case 429:
        return '❌ **Rate Limit Raggiunto (429)**: Troppe richieste simultanee su Apify. Riprova tra qualche istante.';
      default:
        return `❌ **Errore API Apify (${error.statusCode})**: ${error.message}`;
    }
  }

  if (error instanceof Error) {
    return `❌ **Errore**: ${error.message}`;
  }

  return `❌ **Errore sconosciuto**: ${String(error)}`;
}
