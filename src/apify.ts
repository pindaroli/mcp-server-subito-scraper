import { ApifyClient } from 'apify-client';

export const SUBITO_ACTOR_ID = 'azzouzana/subito-scraper-pro-by-search-url';

export interface ScrapeSubitoOptions {
  searchUrl: string;
  maxItems?: number;
  token?: string;
  timeoutSecs?: number;
  memoryMbytes?: number;
}

export interface ApifyRunResult {
  runId: string;
  status: string;
  defaultDatasetId: string;
  itemsCount: number;
  items: Record<string, unknown>[];
  datasetUrl: string;
  actorUrl: string;
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
 * Runs the subito-scraper-pro actor and retrieves the dataset items
 */
export async function runSubitoScraper(options: ScrapeSubitoOptions): Promise<ApifyRunResult> {
  const client = getApifyClient(options.token);

  const actorInput: Record<string, unknown> = {
    searchUrl: options.searchUrl,
    maxItems: options.maxItems ?? 50
  };

  const runOptions: { timeout?: number; memory?: number; waitSecs?: number } = {};
  if (options.timeoutSecs) {
    runOptions.timeout = options.timeoutSecs;
    runOptions.waitSecs = options.timeoutSecs;
  }
  if (options.memoryMbytes) {
    runOptions.memory = options.memoryMbytes;
  }

  // Run the Actor and wait for it to finish
  const run = await client.actor(SUBITO_ACTOR_ID).call(actorInput, runOptions);

  if (!run || !run.defaultDatasetId) {
    throw new Error(`Apify Actor run failed or did not return a valid dataset ID. Run status: ${run?.status}`);
  }

  // Fetch the dataset items
  const { items, total } = await client.dataset(run.defaultDatasetId).listItems({
    limit: options.maxItems ?? 100
  });

  return {
    runId: run.id,
    status: run.status,
    defaultDatasetId: run.defaultDatasetId,
    itemsCount: total ?? items.length,
    items: items as Record<string, unknown>[],
    datasetUrl: `https://console.apify.com/storage/datasets/${run.defaultDatasetId}`,
    actorUrl: `https://apify.com/${SUBITO_ACTOR_ID}`
  };
}

/**
 * Fetches items from an existing dataset ID
 */
export async function getDatasetItems(
  datasetId: string,
  limit = 50,
  offset = 0,
  token?: string
): Promise<{ total: number; count: number; items: Record<string, unknown>[] }> {
  const client = getApifyClient(token);
  const { items, total } = await client.dataset(datasetId).listItems({
    limit,
    offset
  });

  return {
    total: total ?? items.length,
    count: items.length,
    items: items as Record<string, unknown>[]
  };
}

/**
 * Verifies Apify token and returns user details
 */
export async function checkApifyStatus(token?: string): Promise<Record<string, unknown>> {
  const client = getApifyClient(token);
  const user = await client.user().get();
  return {
    id: user?.id,
    username: user?.username,
    email: user?.email,
    plan: user?.plan?.id,
    isPaying: user?.isPaying,
    proxyCredits: user?.proxy
  };
}
