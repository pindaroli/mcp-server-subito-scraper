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
 * Applies declarative deterministic filters from component rule JSON
 */
function applyDeterministicFilters(
  item: NormalizedListing,
  filters?: DeterministicFilters
): { rejected: boolean; reason: string | null; formFactor?: AiInspectionVerdict['formFactor'] } {
  if (!filters) return { rejected: false, reason: null };

  const fullText = `${item.title} ${item.description} ${item.brand} ${item.url}`.toLowerCase();

  // 1. Exclude keywords
  if (filters.exclude_keywords && Array.isArray(filters.exclude_keywords)) {
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

  // 2. Exclude capacities
  if (filters.exclude_capacities_gb && Array.isArray(filters.exclude_capacities_gb)) {
    for (const cap of filters.exclude_capacities_gb) {
      const capPattern = new RegExp(`\\b${cap}\\s*(?:gb|go|g)\\b`, 'i');
      if (capPattern.test(item.title) || capPattern.test(item.description)) {
        return {
          rejected: true,
          reason: `Filtro deterministico JSON: capacità non standard (${cap}GB) tipica di moduli per notebook/laptop`,
          formFactor: 'SODIMM_LAPTOP'
        };
      }
    }
  }

  // 3. Exclude part number prefixes
  if (filters.exclude_part_number_prefixes && Array.isArray(filters.exclude_part_number_prefixes)) {
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

  return { rejected: false, reason: null };
}

/**
 * Fetches the full item description from the listing page if missing from catalog scrape
 */
async function fetchItemDescription(url: string, timeoutMs: number = 4000): Promise<string | null> {
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
 * Inspects listings using AI reasoning, rules, and vision capabilities
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
  const maxInspect = options.maxItemsToInspect || config.maxInspections;
  const maxPricePerGB = options.maxPricePerGB || 10;

  const normalized = items.map((it, idx) => normalizeListing(it, idx));
  const candidates = normalized.slice(0, maxInspect);

  // Check if model supports Vision
  const isVisionModel = /vl|vision|llava|minicpm|gpt-4o|gemini/i.test(model);

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
  logAudit(`[AI Inspector] 🚀 Inizio ispezione su ${candidates.length} annunci`);
  logAudit(`[AI Inspector] 🎯 Target: ${options.targetQuery || 'RAM DDR5 Desktop UDIMM'} | Limite: ${maxPricePerGB} €/GB`);
  logAudit(`[AI Inspector] ⚙️ Engine: ${baseUrl} (${model}) | Modalità: ${isVisionModel ? 'Vision Multimodale (Base64)' : 'Solo Testo'}`);
  if (options.apifyStats?.computeUnits !== undefined) {
    logAudit(`[AI Inspector] ⚡ Scraper Apify: ${(options.apifyStats.durationMillis ? (options.apifyStats.durationMillis / 1000).toFixed(1) + 's' : 'N/D')} | Compute Units: ${options.apifyStats.computeUnits.toFixed(4)} CU`);
  }
  logAudit(`[AI Inspector] ========================================`);

  // Step 1: Apply deterministic pre-filters from JSON rules
  const preFilteredVerdicts: Map<string, AiInspectionVerdict> = new Map();
  const candidatesForAi: NormalizedListing[] = [];

  for (const cand of candidates) {
    const filterResult = applyDeterministicFilters(cand, compRule?.deterministic_filters);
    if (filterResult.rejected) {
      logAudit(`[AI Inspector] ⚡ Pre-Filtro JSON: Scartato ID ${cand.id} "${cand.title}" -> ${filterResult.reason}`);
      preFilteredVerdicts.set(cand.id, {
        listingId: cand.id,
        title: cand.title,
        url: cand.url,
        price: cand.price,
        currency: cand.currency,
        brand: cand.brand,
        status: 'REJECTED',
        formFactor: filterResult.formFactor || 'UNKNOWN',
        detectedGeneration: 'DDR5',
        detectedCapacityGB: null,
        detectedPartNumber: null,
        pricePerGB: null,
        rejectionReason: filterResult.reason,
        evidence: 'Scartato tramite filtri deterministici dichiarativi JSON prima della chiamata AI',
        photoUrl: cand.photoUrl,
        photoUrls: cand.photoUrls,
        inspectionMethod: 'DETERMINISTIC_RULE'
      });
    } else {
      candidatesForAi.push(cand);
    }
  }

  logAudit(`[AI Inspector] 📊 Pre-filtro completato: ${preFilteredVerdicts.size} scartati istantaneamente, ${candidatesForAi.length} da verificare con AI`);

  // Step 1b: Deep Scrape descriptions for candidates missing text
  const missingDescCandidates = candidatesForAi.filter(c => !c.description || c.description.length < 15);
  if (missingDescCandidates.length > 0) {
    logAudit(`[AI Inspector] 📄 Deep Scrape: Recupero descrizione completa per ${missingDescCandidates.length} annunci...`);
    await Promise.all(missingDescCandidates.map(async cand => {
      const fetchedDesc = await fetchItemDescription(cand.url);
      if (fetchedDesc) {
        cand.description = fetchedDesc;
        logAudit(`[AI Inspector]   ↳ ID ${cand.id}: "${fetchedDesc.substring(0, 60).replace(/\n/g, ' ')}..."`);
      }
    }));
  }

  // Step 2: Perform AI inspection on remaining candidates
  const aiVerdictsMap: Map<string, any> = new Map();
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  let totalAiDurationSec = 0;

  if (candidatesForAi.length > 0) {
    const systemPrompt = `Sei un verificatore hardware esperto con capacità di analisi visiva/OCR avanzata.
Il tuo compito è analizzare ciascun annuncio e determinare se si tratta di memoria RAM per Desktop (DIMM / UDIMM a 288 pin) o laptop (SO-DIMM a 262 pin) e verificare il prezzo unitario.

REGOLE GLOBALI:
${globalRulesText}

REGOLE SPECIFICHE COMPONENTE:
${specificRulesText}

OBIETTIVO UTENTE:
- Target: ${options.targetQuery || 'RAM DDR5 Desktop UDIMM a 288 pin'}
- Prezzo massimo ammesso al GB: ${maxPricePerGB} EUR/GB

REGOLE RIGIDE DI VERIFICA & ANTI-ALLUCINAZIONE:
1. FORM FACTOR & PIN:
   - Se dalle immagini l'etichetta o il modulo indicano SO-DIMM (laptop a 262 pin), o memoria server ECC Registered, imposta status: 'REJECTED' e formFactor: 'SODIMM_LAPTOP' o 'ECC_SERVER'.
2. DETERMINAZIONE DELLA CAPACITÀ (GB) & PREZZO/GB:
   - DEVI estrarre la capacità in GB con CERTEZZA ASSOLUTA da:
     a) Titolo o Descrizione dell'annuncio (es. "8GB", "16GB", "32GB", "2x16GB", "8 giga").
     b) Part Number leggibile con assoluta chiarezza sull'etichetta nella foto (es. KF5...BB-8 per 8GB, -16 per 16GB, -32 o K2-32 per 32GB).
   - REGOLA ANTI-ALLUCINAZIONE ASSOLUTA: SE la capacità in GB NON è esplicitamente dichiarata nel testo E l'etichetta nella foto non è leggibile con certezza al 100%, DEVI impostare "detectedCapacityGB": null e "status": "REJECTED" (motivo: "Capacità non verificabile con certezza da testo o OCR").
   - È SEVERAMENTE VIETATO INDOVINARE, ipotizzare o assumere tagli standard (es. NON presumere 16GB solo perché è DDR5 se non c'è prova certa).
   - DISTINZIONE KIT vs SINGOLO STICK: Se l'annuncio vende 1 solo modulo da 8GB, la capacità totale è 8GB (NON 16GB!). Se vende un kit 2x8GB, la capacità totale è 16GB.
3. CONVALIDA FINALE:
   - Imposta status: 'ACCEPTED' SOLO SE formFactor è 'UDIMM_DESKTOP', detectedGeneration è conforme, detectedCapacityGB è certo al 100% E (Prezzo / Capacità) <= ${maxPricePerGB} EUR/GB.

DEVI RESTITUIRE ESCLUSIVAMENTE UN JSON VALIDO nel formato:
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
      "rejectionReason": "string con motivazione chiara o null se ACCEPTED",
      "evidence": "string sintetica con prove certe (testo o OCR etichetta)"
    }
  ]
}`;

    // Process candidates in chunks (max 3 per batch for vision)
    const chunkSize = isVisionModel ? 3 : 15;
    for (let i = 0; i < candidatesForAi.length; i += chunkSize) {
      const chunk = candidatesForAi.slice(i, i + chunkSize);
      logAudit(`[AI Inspector] 🔍 Elaborazione chunk AI ${Math.floor(i / chunkSize) + 1}/${Math.ceil(candidatesForAi.length / chunkSize)} (${chunk.length} annunci)...`);

      // Build multimodal content if vision model
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
        for (const item of chunk) {
          // Download up to 2 photos per item
          const photosToDownload = item.photoUrls.slice(0, 2);
          for (let pIdx = 0; pIdx < photosToDownload.length; pIdx++) {
            const pUrl = photosToDownload[pIdx];
            const base64 = await fetchImageAsBase64(pUrl);
            if (base64) {
              userContentBlocks.push({
                type: 'text',
                text: `[Foto ID ${item.id} - Immagine #${pIdx + 1}]:`
              });
              userContentBlocks.push({
                type: 'image_url',
                image_url: { url: base64 }
              });
            }
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

        logAudit(`[AI Inspector]   ↳ Chunk completato in ${callRes.durationSec.toFixed(1)}s (${callRes.tokensPerSec} tok/s) | Tokens: ${callRes.promptTokens} in / ${callRes.completionTokens} out`);

        const cleaned = callRes.content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const parsed = JSON.parse(cleaned);
        const results = Array.isArray(parsed) ? parsed : (parsed.results || parsed.verdicts || []);
        for (const res of results) {
          if (res && res.listingId) {
            aiVerdictsMap.set(String(res.listingId), res);
          }
        }
      } catch (err: any) {
        logAudit(`[AI Inspector] ⚠️ Errore chiamata AI chunk: ${err.message}`);
      }
    }
  }

  // Combine verdicts
  const finalVerdicts: AiInspectionVerdict[] = candidates.map(cand => {
    // 1. Check pre-filter verdict
    if (preFilteredVerdicts.has(cand.id)) {
      return preFilteredVerdicts.get(cand.id)!;
    }

    // 2. Check AI verdict
    const aiVerdict = aiVerdictsMap.get(String(cand.id)) || {};
    const capacityGB = typeof aiVerdict.detectedCapacityGB === 'number' ? aiVerdict.detectedCapacityGB : null;
    const pricePerGB = capacityGB && cand.price > 0 ? (cand.price / capacityGB) : (typeof aiVerdict.pricePerGB === 'number' ? aiVerdict.pricePerGB : null);

    const status: 'ACCEPTED' | 'REJECTED' = (aiVerdict.status === 'ACCEPTED' && capacityGB !== null && (!pricePerGB || pricePerGB <= maxPricePerGB)) 
      ? 'ACCEPTED' 
      : 'REJECTED';

    let rejectionReason = aiVerdict.rejectionReason;
    if (!rejectionReason && status === 'REJECTED') {
      if (capacityGB === null) {
        rejectionReason = 'Capacità in GB non verificabile con certezza dal testo o dall\'etichetta';
      } else if (pricePerGB && pricePerGB > maxPricePerGB) {
        rejectionReason = `Prezzo unitario ${pricePerGB.toFixed(2)} €/GB superiore alla soglia di ${maxPricePerGB} €/GB`;
      } else if (aiVerdict.formFactor === 'SODIMM_LAPTOP') {
        rejectionReason = 'Modulo compatto SO-DIMM per notebook/laptop identificato da foto/OCR';
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
  report += `- **Annunci analizzati:** ${candidates.length} | **Accettati:** ${accepted.length} | **Scartati:** ${rejected.length} | **Tempo totale:** ${elapsedSecs}s\n`;

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
    totalAnalyzed: candidates.length,
    accepted,
    rejected,
    markdownReport: report,
    metrics,
    apifyStats: options.apifyStats
  };
}

