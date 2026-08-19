import sharp from 'sharp';
import { getComponentRule, getGlobalInstructions, DeterministicFilters } from './index.js';

export interface ListingItem {
  id?: string | number;
  title?: string;
  name?: string;
  subject?: string;
  price?: string | number;
  price_numeric?: number;
  total_item_price?: string;
  currency?: string;
  brand?: string;
  brand_title?: string;
  size?: string;
  status?: string;
  condition?: string;
  url?: string;
  link?: string;
  item_url?: string;
  description?: string;
  body?: string;
  photos?: any[];
  images?: any[];
  photo?: any;
  imageUrl?: string;
  image_url?: string;
  picture?: string;
  [key: string]: any;
}

export interface AiInspectionVerdict {
  listingId: string;
  title: string;
  url: string;
  price: number;
  currency: string;
  brand: string;
  status: 'ACCEPTED' | 'REJECTED';
  formFactor: 'UDIMM_DESKTOP' | 'SODIMM_LAPTOP' | 'ECC_SERVER' | 'ACCESSORY_OTHER' | 'UNKNOWN';
  detectedGeneration: string;
  detectedCapacityGB: number | null;
  detectedPartNumber: string | null;
  pricePerGB: number | null;
  rejectionReason: string | null;
  evidence: string;
  photoUrl?: string;
  photoUrls?: string[];
  inspectionMethod?: 'DETERMINISTIC_RULE' | 'VISION_AI' | 'TEXT_AI';
}

export interface AiMetrics {
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  totalAiDurationSec: number;
  tokensPerSec: number;
}

export interface ApifyRunStats {
  durationMillis?: number;
  computeUnits?: number;
  costUsd?: number;
  startedAt?: Date | string;
  finishedAt?: Date | string;
}

export interface AiInspectionResult {
  aiModelUsed: string;
  providerUrl: string;
  totalAnalyzed: number;
  accepted: AiInspectionVerdict[];
  rejected: AiInspectionVerdict[];
  markdownReport: string;
  metrics?: AiMetrics;
  apifyStats?: ApifyRunStats;
}

interface NormalizedListing {
  id: string;
  title: string;
  brand: string;
  price: number;
  currency: string;
  url: string;
  description: string;
  photoUrls: string[];
  photoUrl: string;
}

/**
 * Resolves AI provider configuration from environment
 */
export function getAiConfig() {
  const baseUrl = (process.env.AI_BASE_URL || 'http://localhost:11434/v1').trim().replace(/\/+$/, '');
  const apiKey = (process.env.AI_API_KEY || process.env.AI_TOKEN || 'ollama').trim();
  const model = (process.env.AI_MODEL || 'qwen2.5vl').trim();
  const isEnabled = process.env.AI_VISION_ENABLED !== 'false';
  const maxInspections = parseInt(process.env.MAX_AI_INSPECTIONS || '20', 10);

  return {
    baseUrl,
    apiKey,
    model,
    isEnabled,
    maxInspections
  };
}

/**
 * Normalizes URL, title, photos, and price extraction from listing item
 */
function normalizeListing(item: ListingItem, index: number): NormalizedListing {
  const rawUrl = item.url || item.link || item.item_url || '';
  const match = rawUrl.match(/\/items\/(\d+)(?:-([^?]+))?/);
  const id = String(item.id || (match ? match[1] : index + 1));
  const slug = match && match[2] ? decodeURIComponent(match[2]).replace(/-/g, ' ') : '';

  const rawTitle = (item.title || item.name || item.subject || '').trim();
  const brand = (item.brand || item.brand_title || '').trim();
  const title = slug.length > 5 ? slug : (rawTitle || brand || `Articolo #${index + 1}`);

  const rawPrice = item.price_numeric ?? parseFloat(String(item.price || item.total_item_price || '0').replace(',', '.'));
  const price = isNaN(rawPrice) ? 0 : rawPrice;
  const currency = item.currency || 'EUR';

  const desc = (item.description || item.body || '').trim();

  // Extract all photos available
  const rawPhotos = item.photos || item.images || [];
  const photoUrls: string[] = [];
  if (Array.isArray(rawPhotos)) {
    for (const p of rawPhotos) {
      const u = typeof p === 'string' ? p : (p?.url || p?.full_size_url || p?.medium_size_url || p?.image_url || '');
      if (u && !photoUrls.includes(u)) {
        photoUrls.push(u);
      }
    }
  }
  if (photoUrls.length === 0) {
    const single = item.imageUrl || item.image_url || item.photo || item.picture;
    if (typeof single === 'string' && single) {
      photoUrls.push(single);
    }
  }

  return {
    id,
    title,
    brand,
    price,
    currency,
    url: rawUrl,
    description: desc,
    photoUrls,
    photoUrl: photoUrls[0] || ''
  };
}

/**
 * Downloads an image from URL and converts it to a standard JPEG Base64 data URI
 * (Ensures full compatibility with Ollama / OpenAI Vision models which do not support WebP)
 */
async function fetchImageAsBase64(url: string, timeoutMs: number = 6000): Promise<string | null> {
  if (!url || typeof url !== 'string' || !url.startsWith('http')) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko)',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
      }
    });
    if (!resp.ok) return null;
    const arrayBuffer = await resp.arrayBuffer();
    const inputBuffer = Buffer.from(arrayBuffer);
    if (inputBuffer.length < 100) return null;

    try {
      // Normalize any image (WebP, AVIF, PNG, TIFF) to standard JPEG
      const jpegBuffer = await sharp(inputBuffer).jpeg({ quality: 80 }).toBuffer();
      return `data:image/jpeg;base64,${jpegBuffer.toString('base64')}`;
    } catch {
      // Fallback to raw buffer if sharp fails
      const contentType = resp.headers.get('content-type') || 'image/jpeg';
      return `data:${contentType};base64,${inputBuffer.toString('base64')}`;
    }
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Enhanced Fast Deterministic Filters (Fase 2)
 * Eliminates 70-85% of bad listings instantly in 0.001s
 */
function applyDeterministicFilters(
  item: NormalizedListing,
  filters?: DeterministicFilters,
  context?: { targetQuery?: string; maxPricePerGB?: number; ruleModuleId?: string }
): { rejected: boolean; reason: string | null; formFactor?: AiInspectionVerdict['formFactor'] } {
  const fullText = `${item.title} ${item.description} ${item.brand} ${item.url}`.toLowerCase();

  // 1. Invalid or missing price
  if (item.price <= 0) {
    return {
      rejected: true,
      reason: 'Filtro rapido: prezzo non valido o pari a 0 €',
      formFactor: 'UNKNOWN'
    };
  }

  // 2. Hardware generation check (if DDR5 target)
  const isDdr5Target = context?.ruleModuleId === 'ram_ddr5' || (context?.targetQuery && /ddr5/i.test(context.targetQuery));
  if (isDdr5Target) {
    const hasDdr5 = /\bddr5\b/i.test(fullText);
    const hasOlderDdr = /\b(ddr4|ddr3|ddr2|pc3200|pc2700|pc-3200)\b/i.test(fullText);
    if (hasOlderDdr && !hasDdr5) {
      return {
        rejected: true,
        reason: 'Filtro rapido: rilevata generazione precedente (DDR4/DDR3/DDR2)',
        formFactor: 'UNKNOWN'
      };
    }
  }

  // 3. Obvious accessories / non-RAM hardware
  const accessoryMatch = fullText.match(/\b(adattatore|adapter|cover|dissipatore|heatsink|cavo|connettore|case|alimentatore|scheda madre|motherboard|pc completo|computer fisso completo)\b/i);
  if (accessoryMatch) {
    return {
      rejected: true,
      reason: `Filtro rapido: accessorio o componente non RAM rilevato ("${accessoryMatch[0]}")`,
      formFactor: 'ACCESSORY_OTHER'
    };
  }

  // 4. Rule-defined keyword filters (e.g. SO-DIMM, laptop, etc.)
  if (filters?.exclude_keywords && Array.isArray(filters.exclude_keywords)) {
    for (const kw of filters.exclude_keywords) {
      const lowerKw = kw.toLowerCase().trim();
      if (!lowerKw) continue;
      const regex = new RegExp(`\\b${lowerKw.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i');
      if (regex.test(fullText) || fullText.includes(lowerKw)) {
        let formFactor: AiInspectionVerdict['formFactor'] = 'UNKNOWN';
        if (/sodimm|so-dimm|so dimm|laptop|notebook|portatile/i.test(kw)) formFactor = 'SODIMM_LAPTOP';
        else if (/rdimm|ecc reg/i.test(kw)) formFactor = 'ECC_SERVER';
        else if (/gddr5|scheda madre|motherboard|adattatore/i.test(kw)) formFactor = 'ACCESSORY_OTHER';

        return {
          rejected: true,
          reason: `Filtro deterministico JSON: rilevata parola chiave non ammessa "${kw}"`,
          formFactor
        };
      }
    }
  }

  // 5. Exclude non-standard capacities
  if (filters?.exclude_capacities_gb && Array.isArray(filters.exclude_capacities_gb)) {
    for (const cap of filters.exclude_capacities_gb) {
      const capPattern = new RegExp(`\\b${cap}\\s*(?:gb|go|g)\\b`, 'i');
      if (capPattern.test(item.title) || capPattern.test(item.description)) {
        return {
          rejected: true,
          reason: `Filtro deterministico JSON: capacità non standard (${cap}GB) tipica di notebook/laptop`,
          formFactor: 'SODIMM_LAPTOP'
        };
      }
    }
  }

  // 6. Exclude part number prefixes (e.g. M425 for Samsung SODIMM, HMCG66 for Hynix SODIMM)
  if (filters?.exclude_part_number_prefixes && Array.isArray(filters.exclude_part_number_prefixes)) {
    for (const pfx of filters.exclude_part_number_prefixes) {
      const regex = new RegExp(pfx, 'i');
      if (regex.test(fullText)) {
        return {
          rejected: true,
          reason: `Filtro deterministico JSON: rilevato Part Number laptop/non conforme (prefisso "${pfx}")`,
          formFactor: 'SODIMM_LAPTOP'
        };
      }
    }
  }

  // 7. Preliminary Price/GB check if capacity is explicitly stated in text
  const maxPricePerGB = context?.maxPricePerGB || 10;
  let preliminaryCapacityGB: number | null = null;

  const multiMatch = fullText.match(/\b(\d+)\s*(?:x|\*)\s*(\d+)\s*(?:gb|go|g)\b/i);
  const singleMatch = fullText.match(/\b(\d+)\s*(?:gb|go)\b/i);

  if (multiMatch) {
    const c = parseInt(multiMatch[1], 10);
    const s = parseInt(multiMatch[2], 10);
    if ([2, 4, 8].includes(c) && [4, 8, 16, 24, 32, 48, 64].includes(s)) {
      preliminaryCapacityGB = c * s;
    }
  } else if (singleMatch) {
    const s = parseInt(singleMatch[1], 10);
    if ([8, 16, 24, 32, 48, 64, 96, 128].includes(s)) {
      preliminaryCapacityGB = s;
    }
  }

  if (preliminaryCapacityGB && preliminaryCapacityGB > 0 && item.price > 0) {
    const estPricePerGB = item.price / preliminaryCapacityGB;
    if (estPricePerGB > maxPricePerGB * 1.05) {
      return {
        rejected: true,
        reason: `Filtro rapido: prezzo unitario dichiarato (${estPricePerGB.toFixed(2)} €/GB per ${preliminaryCapacityGB}GB) supera la soglia di ${maxPricePerGB} €/GB`,
        formFactor: 'UNKNOWN'
      };
    }
  }

  return { rejected: false, reason: null };
}

/**
 * Fetches the full item description from the listing page if missing from catalog scrape
 */
async function fetchItemDescription(url: string, timeoutMs: number = 3000): Promise<string | null> {
  if (!url || !url.startsWith('http')) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7'
      }
    });
    if (!resp.ok) return null;
    const html = await resp.text();

    // 1. Try extracting from JSON-LD schema
    const jsonLdMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/i);
    if (jsonLdMatch && jsonLdMatch[1]) {
      try {
        const schema = JSON.parse(jsonLdMatch[1]);
        if (schema.description) return String(schema.description).trim();
      } catch {}
    }

    // 2. Try extracting from <meta property="og:description" content="...">
    const ogDescMatch = html.match(/<meta\s+property=["']og:description["']\s+content=["'](.*?)["']/i) ||
                        html.match(/<meta\s+content=["'](.*?)["']\s+property=["']og:description["']/i);
    if (ogDescMatch && ogDescMatch[1]) {
      return ogDescMatch[1].trim();
    }

    // 3. Try extracting from <meta name="description" content="...">
    const metaDescMatch = html.match(/<meta\s+name=["']description["']\s+content=["'](.*?)["']/i) ||
                          html.match(/<meta\s+content=["'](.*?)["']\s+name=["']description["']/i);
    if (metaDescMatch && metaDescMatch[1]) {
      return metaDescMatch[1].trim();
    }

    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Concurrent map utility to execute tasks with a fixed concurrency limit
 */
async function asyncPool<T, R>(concurrency: number, items: T[], fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let currentIndex = 0;

  const workers = new Array(Math.min(concurrency, items.length)).fill(null).map(async () => {
    while (currentIndex < items.length) {
      const idx = currentIndex++;
      results[idx] = await fn(items[idx], idx);
    }
  });

  await Promise.all(workers);
  return results;
}

/**
 * Executes chat completions request against OpenAI-compatible endpoint
 */
interface AiCallResult {
  content: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  durationSec: number;
  tokensPerSec: number;
}

async function callOpenAiCompatible(
  baseUrl: string,
  apiKey: string,
  model: string,
  messages: any[]
): Promise<AiCallResult> {
  const endpoint = baseUrl.endsWith('/v1') ? `${baseUrl}/chat/completions` : (baseUrl.includes('/chat/completions') ? baseUrl : `${baseUrl}/chat/completions`);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };

  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const callStartTime = Date.now();
  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.1,
      response_format: { type: 'json_object' }
    })
  });

  const durationSec = Math.max(0.01, (Date.now() - callStartTime) / 1000);

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`AI API error (HTTP ${response.status} from ${endpoint}): ${errBody}`);
  }

  const data: any = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('AI API returned empty response content');
  }

  const promptTokens = data.usage?.prompt_tokens ?? data.prompt_eval_count ?? 0;
  const completionTokens = data.usage?.completion_tokens ?? data.eval_count ?? 0;
  const totalTokens = data.usage?.total_tokens ?? (promptTokens + completionTokens);
  const tokensPerSec = completionTokens > 0 ? parseFloat((completionTokens / durationSec).toFixed(1)) : 0;

  return {
    content,
    promptTokens,
    completionTokens,
    totalTokens,
    durationSec,
    tokensPerSec
  };
}

/**
 * Inspects listings using fast deterministic pre-filtering (Phase 2)
 * followed by targeted parallel Vision AI (Phase 3)
 */
export async function inspectListingsWithAi(
  items: ListingItem[],
  options: {
    ruleModuleId?: string;
    targetQuery?: string;
    maxPricePerGB?: number;
    maxItemsToInspect?: number;
    token?: string;
    baseUrl?: string;
    model?: string;
    apifyStats?: ApifyRunStats;
    datasetUrl?: string;
  } = {}
): Promise<AiInspectionResult> {
  const startTime = Date.now();
  const config = getAiConfig();
  const apiKey = options.token || config.apiKey;
  const baseUrl = options.baseUrl || config.baseUrl;
  const model = options.model || config.model;
  const maxPricePerGB = options.maxPricePerGB || 10;
  const maxInspect = options.maxItemsToInspect || config.maxInspections || 20;

  const normalized = items.map((it, idx) => normalizeListing(it, idx));

  // Determine rule module and load declarative rules
  const ruleModuleId = options.ruleModuleId || 'ram_ddr5';
  const compRule = getComponentRule(ruleModuleId) || getComponentRule('ram');
  const globalInst = getGlobalInstructions();

  const specificRulesText = compRule ? `[${compRule.name}]\n${compRule.rules}` : 'Applica massima cautela e verifica rigida.';
  const globalRulesText = Array.isArray(globalInst.global_instructions) 
    ? globalInst.global_instructions.join('\n') 
    : String(globalInst.global_instructions || '');

  const auditLogs: string[] = [];
  const logAudit = (msg: string) => {
    auditLogs.push(msg);
    console.error(msg);
  };

  logAudit(`\n[AI Inspector] ========================================`);
  logAudit(`[AI Inspector] 🚀 Inizio ispezione su ${normalized.length} annunci scaricati`);
  logAudit(`[AI Inspector] 🎯 Target: ${options.targetQuery || 'RAM DDR5 Desktop UDIMM'} | Limite: ${maxPricePerGB} €/GB`);
  logAudit(`[AI Inspector] ⚙️ Engine: ${baseUrl} (${model})`);
  if (options.apifyStats?.computeUnits !== undefined) {
    logAudit(`[AI Inspector] ⚡ Scraper Apify: ${(options.apifyStats.durationMillis ? (options.apifyStats.durationMillis / 1000).toFixed(1) + 's' : 'N/D')} | Compute Units: ${options.apifyStats.computeUnits.toFixed(4)} CU`);
  }
  logAudit(`[AI Inspector] ========================================`);

  // Phase 2: Instant Fast Deterministic Pre-Filtering
  const preFilteredVerdicts: Map<string, AiInspectionVerdict> = new Map();
  const initialCandidates: NormalizedListing[] = [];

  for (const item of normalized) {
    const filterResult = applyDeterministicFilters(item, compRule?.deterministic_filters, {
      targetQuery: options.targetQuery,
      maxPricePerGB,
      ruleModuleId
    });

    if (filterResult.rejected) {
      preFilteredVerdicts.set(item.id, {
        listingId: item.id,
        title: item.title,
        url: item.url,
        price: item.price,
        currency: item.currency,
        brand: item.brand,
        status: 'REJECTED',
        formFactor: filterResult.formFactor || 'UNKNOWN',
        detectedGeneration: 'DDR5',
        detectedCapacityGB: null,
        detectedPartNumber: null,
        pricePerGB: null,
        rejectionReason: filterResult.reason,
        evidence: 'Scartato istantaneamente tramite pre-filtro deterministico (Fase 2)',
        photoUrl: item.photoUrl,
        photoUrls: item.photoUrls,
        inspectionMethod: 'DETERMINISTIC_RULE'
      });
    } else {
      initialCandidates.push(item);
    }
  }

  logAudit(`[AI Inspector] ⚡ Fase 2 completata: ${preFilteredVerdicts.size} scartati istantaneamente, ${initialCandidates.length} candidati plausibili.`);

  // Cap candidates to maxInspect to avoid timeouts while checking the best deals
  const candidatesForAi = initialCandidates.slice(0, maxInspect);
  if (initialCandidates.length > maxInspect) {
    for (const extra of initialCandidates.slice(maxInspect)) {
      preFilteredVerdicts.set(extra.id, {
        listingId: extra.id,
        title: extra.title,
        url: extra.url,
        price: extra.price,
        currency: extra.currency,
        brand: extra.brand,
        status: 'REJECTED',
        formFactor: 'UNKNOWN',
        detectedGeneration: 'DDR5',
        detectedCapacityGB: null,
        detectedPartNumber: null,
        pricePerGB: null,
        rejectionReason: `Superato limite massimo ispezioni approfondite (ispezionati i primi ${maxInspect} candidati)`,
        evidence: 'Fuori dal lotto prioritario',
        photoUrl: extra.photoUrl,
        photoUrls: extra.photoUrls,
        inspectionMethod: 'DETERMINISTIC_RULE'
      });
    }
  }

  // Deep Scrape descriptions for candidates missing text (concurrency pool of 5)
  const missingDescCandidates = candidatesForAi.filter(c => !c.description || c.description.length < 15);
  if (missingDescCandidates.length > 0) {
    logAudit(`[AI Inspector] 📄 Recupero descrizioni mancanti in parallelo per ${missingDescCandidates.length} annunci...`);
    await asyncPool(5, missingDescCandidates, async cand => {
      const fetchedDesc = await fetchItemDescription(cand.url);
      if (fetchedDesc) {
        cand.description = fetchedDesc;
      }
    });
  }

  // Phase 3: Targeted Parallel Multimodal Vision AI
  const isVisionModel = /vl|vision|llava|minicpm|gpt-4o|gemini/i.test(model);
  const aiVerdictsMap: Map<string, any> = new Map();
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  let totalAiDurationSec = 0;

  if (candidatesForAi.length > 0) {
    const systemPrompt = `Sei un verificatore hardware esperto con capacità di analisi visiva/OCR avanzata.
Determina per ciascun annuncio se si tratta di memoria RAM Desktop (UDIMM / DIMM a 288 pin) o laptop (SO-DIMM a 262 pin) e verifica capacità (GB) e prezzo unitario.

REGOLE GLOBALI:
${globalRulesText}

REGOLE COMPONENTE:
${specificRulesText}

OBIETTIVO UTENTE:
- Target: ${options.targetQuery || 'RAM DDR5 Desktop UDIMM a 288 pin'}
- Prezzo massimo al GB: ${maxPricePerGB} EUR/GB

CRITERI RIGIDI:
1. FORM FACTOR & PIN:
   - Se dalle foto o dall'etichetta risulta SO-DIMM (modulo corto da laptop ~70mm, 262 pin, es. codici Samsung M425..., Hynix HMCG66...), imposta status: 'REJECTED' e formFactor: 'SODIMM_LAPTOP'.
   - Imposta formFactor: 'UDIMM_DESKTOP' SOLO se è un modulo lungo standard per PC Desktop (288 pin, es. codici Samsung M378..., Hynix HMCG78...).
2. CAPACITÀ:
   - Estrai la capacità in GB con certezza da testo o OCR etichetta.
3. CONVALIDA:
   - Imposta status: 'ACCEPTED' SOLO SE formFactor è 'UDIMM_DESKTOP' E (Prezzo / Capacità) <= ${maxPricePerGB} EUR/GB.

RISPONDI ESCLUSIVAMENTE IN JSON:
{
  "results": [
    {
      "listingId": "string",
      "status": "ACCEPTED" | "REJECTED",
      "formFactor": "UDIMM_DESKTOP" | "SODIMM_LAPTOP" | "ECC_SERVER" | "ACCESSORY_OTHER" | "UNKNOWN",
      "detectedGeneration": "DDR5" | "DDR4" | "DDR3" | "OTHER",
      "detectedCapacityGB": number o null,
      "detectedPartNumber": "string o null",
      "pricePerGB": number o null,
      "rejectionReason": "string o null se ACCEPTED",
      "evidence": "prova certa da foto/OCR/testo"
    }
  ]
}`;

    // Split candidates into small chunks of 3 items
    const chunkSize = isVisionModel ? 3 : 10;
    const chunks: NormalizedListing[][] = [];
    for (let i = 0; i < candidatesForAi.length; i += chunkSize) {
      chunks.push(candidatesForAi.slice(i, i + chunkSize));
    }

    logAudit(`[AI Inspector] 👁️ Avvio Fase 3: ${chunks.length} chunk di Vision AI in parallelo (concorrenza: 2)...`);

    // Process chunks with concurrency = 2
    await asyncPool(2, chunks, async (chunk, chunkIdx) => {
      logAudit(`[AI Inspector] 🔍 Chunk ${chunkIdx + 1}/${chunks.length} (${chunk.length} annunci)...`);

      // 1. Fetch images in parallel for all items in chunk
      const userContentBlocks: any[] = [];
      let textSummary = `Analizza i seguenti annunci hardware:\n\n`;

      for (const item of chunk) {
        textSummary += `--- ANNUNCIO ID: ${item.id} ---\n`;
        textSummary += `Titolo: ${item.title}\n`;
        textSummary += `Brand: ${item.brand || 'N/D'}\n`;
        textSummary += `Prezzo: ${item.price} ${item.currency}\n`;
        textSummary += `Descrizione: ${item.description || 'Nessuna descrizione fornita'}\n`;
        textSummary += `URL: ${item.url}\n\n`;
      }

      userContentBlocks.push({ type: 'text', text: textSummary });

      if (isVisionModel) {
        const imageFetchPromises: Promise<{ itemId: string; pIdx: number; base64: string | null }>[] = [];
        for (const item of chunk) {
          const photosToDownload = item.photoUrls.slice(0, 2);
          photosToDownload.forEach((pUrl, pIdx) => {
            imageFetchPromises.push(
              fetchImageAsBase64(pUrl).then(base64 => ({ itemId: item.id, pIdx, base64 }))
            );
          });
        }

        const fetchedImages = await Promise.all(imageFetchPromises);
        for (const img of fetchedImages) {
          if (img.base64) {
            userContentBlocks.push({
              type: 'text',
              text: `[Foto ID ${img.itemId} - Immagine #${img.pIdx + 1}]:`
            });
            userContentBlocks.push({
              type: 'image_url',
              image_url: { url: img.base64 }
            });
          }
        }
      }

      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: isVisionModel ? userContentBlocks : textSummary }
      ];

      try {
        const callRes = await callOpenAiCompatible(baseUrl, apiKey, model, messages);
        totalPromptTokens += callRes.promptTokens;
        totalCompletionTokens += callRes.completionTokens;
        totalAiDurationSec += callRes.durationSec;

        logAudit(`[AI Inspector]   ↳ Chunk ${chunkIdx + 1} completato in ${callRes.durationSec.toFixed(1)}s (${callRes.tokensPerSec} tok/s)`);

        const cleaned = callRes.content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const parsed = JSON.parse(cleaned);
        const results = Array.isArray(parsed) ? parsed : (parsed.results || parsed.verdicts || []);
        for (const res of results) {
          if (res && res.listingId) {
            aiVerdictsMap.set(String(res.listingId), res);
          }
        }
      } catch (err: any) {
        logAudit(`[AI Inspector] ⚠️ Errore chiamata AI chunk ${chunkIdx + 1}: ${err.message}`);
      }
    });
  }

  // Combine verdicts across all scraped items
  const finalVerdicts: AiInspectionVerdict[] = normalized.map(cand => {
    // 1. Check pre-filter verdict
    if (preFilteredVerdicts.has(cand.id)) {
      return preFilteredVerdicts.get(cand.id)!;
    }

    // 2. Check AI verdict
    const aiVerdict = aiVerdictsMap.get(String(cand.id)) || {};
    const capacityGB = typeof aiVerdict.detectedCapacityGB === 'number' ? aiVerdict.detectedCapacityGB : null;
    const pricePerGB = capacityGB && cand.price > 0 ? (cand.price / capacityGB) : (typeof aiVerdict.pricePerGB === 'number' ? aiVerdict.pricePerGB : null);

    const isStrictDesktop = aiVerdict.formFactor === 'UDIMM_DESKTOP' && 
      !/sodimm|so-dimm|so dimm|laptop|notebook|portatile/i.test(aiVerdict.evidence || '') &&
      !/sodimm|so-dimm|so dimm|laptop|notebook|portatile/i.test(aiVerdict.detectedPartNumber || '');

    const status: 'ACCEPTED' | 'REJECTED' = (aiVerdict.status === 'ACCEPTED' && isStrictDesktop && capacityGB !== null && (!pricePerGB || pricePerGB <= maxPricePerGB)) 
      ? 'ACCEPTED' 
      : 'REJECTED';

    let rejectionReason = aiVerdict.rejectionReason;
    if (!rejectionReason && status === 'REJECTED') {
      if (!isStrictDesktop || aiVerdict.formFactor === 'SODIMM_LAPTOP') {
        rejectionReason = 'Modulo compatto SO-DIMM per notebook/laptop identificato da foto/OCR';
      } else if (capacityGB === null) {
        rejectionReason = 'Capacità in GB non verificabile con certezza dal testo o dall\'etichetta';
      } else if (pricePerGB && pricePerGB > maxPricePerGB) {
        rejectionReason = `Prezzo unitario ${pricePerGB.toFixed(2)} €/GB superiore alla soglia di ${maxPricePerGB} €/GB`;
      } else {
        rejectionReason = 'Non conforme ai requisiti o specifiche desktop non verificate';
      }
    }

    return {
      listingId: cand.id,
      title: cand.title,
      url: cand.url,
      price: cand.price,
      currency: cand.currency,
      brand: cand.brand,
      status,
      formFactor: aiVerdict.formFactor || 'UNKNOWN',
      detectedGeneration: aiVerdict.detectedGeneration || 'DDR5',
      detectedCapacityGB: capacityGB,
      detectedPartNumber: aiVerdict.detectedPartNumber || null,
      pricePerGB: pricePerGB ? parseFloat(pricePerGB.toFixed(2)) : null,
      rejectionReason: status === 'ACCEPTED' ? null : rejectionReason,
      evidence: aiVerdict.evidence || (isVisionModel ? 'Verificato tramite Vision OCR' : 'Verificato tramite AI testuale'),
      photoUrl: cand.photoUrl,
      photoUrls: cand.photoUrls,
      inspectionMethod: isVisionModel ? 'VISION_AI' : 'TEXT_AI'
    };
  });

  const accepted = finalVerdicts.filter(v => v.status === 'ACCEPTED');
  accepted.sort((a, b) => (a.pricePerGB || 999) - (b.pricePerGB || 999));

  const rejected = finalVerdicts.filter(v => v.status === 'REJECTED');

  const elapsedSecs = ((Date.now() - startTime) / 1000).toFixed(1);
  const overallTokensPerSec = totalCompletionTokens > 0 && totalAiDurationSec > 0 
    ? parseFloat((totalCompletionTokens / totalAiDurationSec).toFixed(1)) 
    : 0;

  const metrics: AiMetrics = {
    totalPromptTokens,
    totalCompletionTokens,
    totalTokens: totalPromptTokens + totalCompletionTokens,
    totalAiDurationSec: parseFloat(totalAiDurationSec.toFixed(1)),
    tokensPerSec: overallTokensPerSec
  };

  // Build markdown report with prominent audit log and full statistics
  let report = `## 🤖 Report Analisi & Filtraggio Hardware\n`;
  report += `- **Engine AI:** \`${baseUrl}\` | **Modello:** \`${model}\` (${isVisionModel ? 'Vision Multimodale Base64 + Normalizzazione JPEG' : 'Solo Testo'})\n`;
  report += `- **Annunci analizzati:** ${normalized.length} | **Accettati:** ${accepted.length} | **Scartati:** ${rejected.length} | **Tempo totale:** ${elapsedSecs}s\n`;

  if (options.apifyStats) {
    const apifyDuration = options.apifyStats.durationMillis ? `${(options.apifyStats.durationMillis / 1000).toFixed(1)}s` : 'N/D';
    const cuStr = options.apifyStats.computeUnits !== undefined ? `${options.apifyStats.computeUnits.toFixed(4)} CU` : 'N/D';
    report += `- **⚡ Statistiche Scraper Apify:** Tempo Actor: **${apifyDuration}** | Compute Units: **${cuStr}**${options.datasetUrl ? ` | [Dataset Console](${options.datasetUrl})` : ''}\n`;
  }

  report += `- **⚡ Metriche Inferenza AI (${model}):** **${totalPromptTokens.toLocaleString()} prompt tok** + **${totalCompletionTokens.toLocaleString()} completion tok** = **${metrics.totalTokens.toLocaleString()} tok totali** | Velocità: **${overallTokensPerSec} tok/s** | Tempo AI: **${metrics.totalAiDurationSec}s**\n\n`;

  report += `### 🟢 Annunci Convalidati (Prezzo unitario <= ${maxPricePerGB} €/GB)\n\n`;
  if (accepted.length === 0) {
    report += `_Nessun annuncio ha superato tutti i criteri di validazione per i filtri specificati._\n\n`;
  } else {
    report += `| # | Modello / Titolo | Brand | Capacità | Prezzo | Costo Unitario | Part Number / Note | Link |\n`;
    report += `| :-: | :--- | :--- | :-: | :-: | :-: | :--- | :--- |\n`;
    accepted.forEach((item, i) => {
      const pnStr = item.detectedPartNumber ? `\`${item.detectedPartNumber}\`` : (item.evidence || 'Verificato');
      const capStr = item.detectedCapacityGB ? `${item.detectedCapacityGB} GB` : 'N/D';
      const unitStr = item.pricePerGB ? `**${item.pricePerGB.toFixed(2)} €/GB**` : 'N/D';
      report += `| **${i + 1}** | [${item.title}](${item.url}) | ${item.brand} | ${capStr} | **${item.price.toFixed(2)} ${item.currency}** | ${unitStr} | ${pnStr} | [Vedi su Vinted](${item.url}) |\n`;
    });
    report += `\n`;
  }

  report += `### 🔴 Annunci Scartati (Motivo di Esclusione)\n\n`;
  if (rejected.length === 0) {
    report += `_Nessun annuncio scartato._\n\n`;
  } else {
    report += `| # | Titolo Annuncio | Prezzo | Form Factor / Rilevazione | Motivo Scarto | Metodo | Link |\n`;
    report += `| :-: | :--- | :--- | :-: | :-: | :-: | :-: |\n`;
    rejected.forEach((item, i) => {
      const reasonStr = item.rejectionReason || 'Non conforme';
      const methodStr = item.inspectionMethod === 'DETERMINISTIC_RULE' ? '⚡ Pre-Filtro JSON' : (item.inspectionMethod === 'VISION_AI' ? '👁️ Vision OCR' : '📝 AI Testo');
      report += `| **${i + 1}** | [${item.title}](${item.url}) | ${item.price.toFixed(2)} ${item.currency} | \`${item.formFactor}\` (${item.detectedGeneration}) | ${reasonStr} | ${methodStr} | [Link](${item.url}) |\n`;
    });
    report += `\n`;
  }

  report += `### 📋 Log di Ispezione & Audit Trail\n`;
  report += `\`\`\`text\n`;
  report += auditLogs.join('\n') + `\n`;
  report += `[AI Inspector] 🏁 Completato in ${elapsedSecs}s (AI: ${metrics.totalAiDurationSec}s @ ${overallTokensPerSec} tok/s) - Accettati: ${accepted.length}, Scartati: ${rejected.length}\n`;
  report += `\`\`\`\n`;

  return {
    aiModelUsed: model,
    providerUrl: baseUrl,
    totalAnalyzed: normalized.length,
    accepted,
    rejected,
    markdownReport: report,
    metrics,
    apifyStats: options.apifyStats
  };
}

