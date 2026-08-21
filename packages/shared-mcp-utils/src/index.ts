import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { getAiConfig } from './ai-inspector.js';
export * from './ai-inspector.js';

export interface DeterministicFilters {
  exclude_capacities_gb?: number[];
  exclude_keywords?: string[];
  exclude_part_number_prefixes?: string[];
  require_keywords?: string[];
}

export interface ReportColumn {
  header: string;
  value: string;
}

export interface ReportConfig {
  sort_by?: 'price_asc' | 'price_desc' | 'unit_price_asc' | 'unit_price_desc';
  columns?: ReportColumn[];
}

export interface ComponentRule {
  name?: string;
  description?: string;
  priority?: number;
  fast_path_triggers?: string[];
  report_config?: ReportConfig;
  rules: string;
  deterministic_filters?: DeterministicFilters;
}

export interface GlobalInstructions {
  max_visual_inspections?: number;
  global_instructions?: string[] | string;
}

function getRulesDir(subPath: string): string {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  return path.join(currentDir, subPath);
}

export function getOverrideDir(): string | null {
  if (process.env.HARDWARE_RULES_DIR) {
    return process.env.HARDWARE_RULES_DIR;
  }
  const agentsDir = path.join(process.cwd(), '.agents', 'hardware_rules');
  if (fs.existsSync(agentsDir)) {
    return agentsDir;
  }
  return null;
}

function readJsonFile(filePath: string): any {
  if (fs.existsSync(filePath)) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(content);
    } catch (err) {
      console.error(`[MCP Shared] Errore parsing JSON da ${filePath}:`, err);
    }
  }
  return null;
}

export function getGlobalInstructions(): GlobalInstructions {
  let instructions: GlobalInstructions | null = null;
  const overrideDir = getOverrideDir();
  
  if (overrideDir) {
    instructions = readJsonFile(path.join(overrideDir, 'global_instructions.json'));
  }
  if (!instructions) {
    instructions = readJsonFile(getRulesDir('rules/global_instructions.json')) || readJsonFile(getRulesDir('../src/rules/global_instructions.json'));
  }
  
  return instructions || { global_instructions: [] };
}

export function getComponentRule(moduleId: string): ComponentRule | null {
  const filename = `${moduleId}.json`;
  const overrideDir = getOverrideDir();
  
  if (overrideDir) {
    const rule = readJsonFile(path.join(overrideDir, filename));
    if (rule) return rule;
  }
  
  let rule = readJsonFile(getRulesDir(`rules/${filename}`));
  if (!rule) rule = readJsonFile(getRulesDir(`../src/rules/${filename}`));
  
  return rule;
}

let cachedRulesMap: Record<string, ComponentRule> | null = null;

export function getAllComponentRules(): Record<string, ComponentRule> {
  if (cachedRulesMap) return cachedRulesMap;

  const rulesMap: Record<string, ComponentRule> = {};
  const scanDir = (dirPath: string) => {
    if (fs.existsSync(dirPath)) {
      const files = fs.readdirSync(dirPath);
      for (const file of files) {
        if (file.endsWith('.json') && file !== 'global_instructions.json') {
          const moduleId = file.replace('.json', '');
          const rule = readJsonFile(path.join(dirPath, file)) as ComponentRule;
          if (rule) {
            rulesMap[moduleId] = rule;
          }
        }
      }
    }
  };

  scanDir(getRulesDir('rules'));
  scanDir(getRulesDir('../src/rules'));
  
  const overrideDir = getOverrideDir();
  if (overrideDir) {
    scanDir(overrideDir);
  }

  cachedRulesMap = rulesMap;
  return rulesMap;
}

export function listAvailableModules(): Record<string, string> {
  const allRules = getAllComponentRules();
  const modules: Record<string, string> = {};
  for (const [id, rule] of Object.entries(allRules)) {
    if (rule && rule.name) {
      modules[id] = `${rule.name} - ${rule.description || ''}`;
    }
  }
  return modules;
}

/**
 * Declarative Fast-Path detector:
 * Dynamically resolves ruleModuleId by matching query against fast_path_triggers declared in rule JSON files
 */
export function detectRuleModuleId(query: string): string | null {
  const q = (query || '').toLowerCase().trim();
  if (!q) return null;

  const allRules = getAllComponentRules();

  // Sort rules by priority descending (e.g. specialized case_open_itx before generic case_pc)
  const sortedEntries = Object.entries(allRules).sort(([, a], [, b]) => {
    const pA = a.priority ?? 10;
    const pB = b.priority ?? 10;
    return pB - pA;
  });

  for (const [moduleId, rule] of sortedEntries) {
    if (!rule.fast_path_triggers || !Array.isArray(rule.fast_path_triggers)) continue;

    // Sort triggers by length desc (match more specific phrases first)
    const sortedTriggers = [...rule.fast_path_triggers].sort((a, b) => b.length - a.length);
    for (const trigger of sortedTriggers) {
      const t = trigger.toLowerCase().trim();
      if (!t) continue;

      if (t.length <= 3) {
        const regex = new RegExp(`\\b${t.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i');
        if (regex.test(q)) return moduleId;
      } else {
        if (q.includes(t)) return moduleId;
      }
    }
  }

  return null;
}

export interface RoutingDecision {
  tier: 'TIER_0_EXPLICIT' | 'TIER_1_FAST_PATH' | 'TIER_2_LLM_ROUTER';
  ruleModuleId?: string;
  reason: string;
}

/**
 * Discriminates whether a query is Fast-Path eligible (Tier 1) or requires LLM disambiguation (Tier 2)
 */
export function decideRoutingTier(query: string, explicitModuleId?: string): RoutingDecision {
  if (explicitModuleId) {
    return {
      tier: 'TIER_0_EXPLICIT',
      ruleModuleId: explicitModuleId,
      reason: `Modulo esplicito specificato: ${explicitModuleId}`
    };
  }

  const q = (query || '').toLowerCase().trim();
  const words = q.split(/\s+/).filter(Boolean);

  // 1. Rilevamento Negazioni / Esclusioni (Trigger Tier 2)
  const hasNegation = /\b(non|no|senza|without|tranne|eccetto|anziche|anziché|ma non)\b/i.test(q);
  if (hasNegation) {
    return {
      tier: 'TIER_2_LLM_ROUTER',
      reason: 'Rilevata negazione o esclusione semantica nella query'
    };
  }

  // 2. Conflitto Multi-Componente (es. "alimentatore per case itx")
  const hasCase = /\b(case|chassis|torre|open|bench|banchetto|telaio)\b/i.test(q);
  const hasPsu = /\b(alimentatore|psu|sfx)\b/i.test(q);
  const hasMobo = /\b(scheda madre|motherboard|mobo)\b/i.test(q);
  const hasRam = /\b(ram|ddr5|ddr4|dimm|sodimm)\b/i.test(q);
  const hasStorage = /\b(nvme|ssd|m\.2|m2|disco|hard disk|crystaldisk|smart|tbw)\b/i.test(q);

  const categoryMatches = [hasCase, hasPsu, hasMobo, hasRam, hasStorage].filter(Boolean).length;
  if (categoryMatches > 1) {
    return {
      tier: 'TIER_2_LLM_ROUTER',
      reason: 'Query multi-componente con potenziale ambiguità tra oggetto cercato e contesto'
    };
  }

  // 3. Query discorsiva lunga o conversazionale
  const isConversational = words.length >= 6 || /\b(vorrei|cerco|adatto|compatibile|usare|consigli|migliore|economico)\b/i.test(q);
  if (isConversational) {
    return {
      tier: 'TIER_2_LLM_ROUTER',
      reason: 'Query in linguaggio naturale discorsivo o articolato'
    };
  }

  // 4. Fast-Path univoco dichiarativo
  const fastPathModule = detectRuleModuleId(query);
  if (fastPathModule) {
    return {
      tier: 'TIER_1_FAST_PATH',
      ruleModuleId: fastPathModule,
      reason: `Riconoscimento nominale univoco Fast-Path da trigger JSON: ${fastPathModule}`
    };
  }

  // Nessun pattern certo -> Trigger Tier 2 (LLM Router)
  return {
    tier: 'TIER_2_LLM_ROUTER',
    reason: 'Nessun pattern nominale evidente a catalogo, delega all\'LLM per interpretazione semantica'
  };
}

/**
 * Invokes LLM (Qwen2.5-VL-32B or configured engine) to route ambiguous/conversational queries
 */
export async function routeQueryWithLlm(
  query: string,
  availableModules: Record<string, string>,
  config?: { baseUrl?: string; apiKey?: string; model?: string }
): Promise<{ ruleModuleId: string; confidence: number; reason: string }> {
  const aiConfig = getAiConfig();
  const baseUrl = (config?.baseUrl || aiConfig.baseUrl).replace(/\/+$/, '');
  const apiKey = config?.apiKey || aiConfig.apiKey;
  const model = config?.model || aiConfig.model || 'qwen2.5-vl:32b';

  const systemPrompt = `Sei il router semantico hardware del sistema di ricerca.
Il tuo unico compito è analizzare l'intenzione di acquisto dell'utente e selezionare l'ID del modulo di regole hardware più appropriato dalla lista fornita.

MODULI DISPONIBILI:
${Object.entries(availableModules).map(([id, desc]) => `- "${id}": ${desc}`).join('\n')}

ISTRUZIONI:
1. Distingui l'oggetto principale da acquistare dal semplice contesto o compatibilità (es. in "alimentatore per case itx", l'utente compra un alimentatore "psu_sfx", non il case).
2. Rispetta rigorosamente le negazioni (es. in "case compatto ma non itx", escludi "case_itx" e preferisci "case_matx").
3. Rispondi ESCLUSIVAMENTE con un oggetto JSON nel seguente formato:
{
  "selectedModuleId": "string (deve essere una delle chiavi dei moduli disponibili)",
  "confidence": number (tra 0 e 1),
  "reason": "breve motivazione in italiano"
}`;

  try {
    const endpoint = `${baseUrl}/chat/completions`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (apiKey && apiKey !== 'ollama') {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Query Utente: "${query}"` }
        ],
        temperature: 0.0,
        response_format: { type: 'json_object' }
      })
    });

    if (!response.ok) {
      throw new Error(`LLM Router error HTTP ${response.status}`);
    }

    const data: any = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('Risposta vuota da LLM Router');

    const parsed = JSON.parse(content);
    if (parsed.selectedModuleId && availableModules[parsed.selectedModuleId]) {
      return {
        ruleModuleId: parsed.selectedModuleId,
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.9,
        reason: parsed.reason || 'Selezionato via LLM Router'
      };
    }
  } catch (err: any) {
    console.error(`[Semantic Router] Fallback da LLM a Fast-Path (${err.message})`);
  }

  // Graceful fallback se LLM fallisce
  return {
    ruleModuleId: detectRuleModuleId(query) || 'ram',
    confidence: 0.5,
    reason: 'Fallback su euristica rapida (LLM non disponibile)'
  };
}

/**
 * Hybrid 2-Tier Master Resolver
 */
export async function resolveRuleModuleId(
  query: string,
  explicitModuleId?: string,
  config?: any
): Promise<string> {
  const decision = decideRoutingTier(query, explicitModuleId);
  if (decision.tier === 'TIER_0_EXPLICIT' && decision.ruleModuleId) {
    return decision.ruleModuleId;
  }
  if (decision.tier === 'TIER_1_FAST_PATH' && decision.ruleModuleId) {
    console.error(`[Semantic Router] ⚡ Tier 1 (Fast-Path 0ms): ${decision.ruleModuleId} (${decision.reason})`);
    return decision.ruleModuleId;
  }

  console.error(`[Semantic Router] 🤖 Tier 2 (LLM Router): attivazione per "${query}" (${decision.reason})`);
  const available = listAvailableModules();
  const llmResult = await routeQueryWithLlm(query, available, config);
  console.error(`[Semantic Router] 🎯 Modulo selezionato da LLM: ${llmResult.ruleModuleId} (Confidenza: ${llmResult.confidence}) - ${llmResult.reason}`);
  return llmResult.ruleModuleId;
}

export function registerHardwarePrompt(server: McpServer) {
  server.tool(
    "get_available_hardware_rules",
    "Restituisce la lista dei moduli di regole hardware disponibili per il Semantic Router",
    {},
    async () => {
      const modules = listAvailableModules();
      return {
        content: [{ type: "text", text: JSON.stringify(modules, null, 2) }]
      };
    }
  );

  server.prompt(
    "hardware_expert_search",
    "Ricerca hardware applicando rigide regole di validazione 'Zero Assunzioni'.",
    {
      rule_module_id: z.string().describe("L'ID del modulo delle regole da applicare (es. 'ram'). Ottienilo tramite get_available_hardware_rules."),
      user_target_specs: z.string().optional().describe("Le specifiche esatte fornite dall'utente (es. 'DDR5 SO-DIMM Kingston'). Verranno iniettate nelle regole per verifiche mirate.")
    },
    async (args) => {
      const moduleId = args.rule_module_id;
      const targetSpecs = args.user_target_specs || "Non specificato";
      const globalInst = getGlobalInstructions();
      const compRule = getComponentRule(moduleId);
      
      let specificRules = "Nessuna regola specifica trovata nel database. Assumere comportamento bloccante e usare massima cautela.";
      if (compRule) {
        specificRules = `[${compRule.name || moduleId} - ${compRule.description || ''}]\n${compRule.rules}`;
        specificRules = specificRules.replace(/\{\{user_target_specs\}\}/g, targetSpecs);
      }

      let globalInstructionsText = '';
      if (globalInst.global_instructions) {
        if (Array.isArray(globalInst.global_instructions)) {
          globalInstructionsText = globalInst.global_instructions.join('\n');
        } else {
          globalInstructionsText = globalInst.global_instructions;
        }
      }
      
      return {
        messages: [{
          role: "user",
          content: {
            type: "text",
            text: `SEI UN ESPERTO REVISORE HARDWARE.
Applicherai la Politica "Zero Assunzioni": scarta le inserzioni basandoti sulle seguenti direttive.

==================================================
🛠️ ISTRUZIONI OPERATIVE PER L'AGENTE:
==================================================
1. Estrai gli URL delle immagini (\`imageUrl\`) dai risultati della ricerca Vinted/Subito.
2. Usa il tuo strumento per eseguire comandi shell (es. \`run_command\`) per scaricare le immagini in locale usando \`curl\`.
   Esempio: \`mkdir -p /tmp/hardware_review && curl -sL "URL" -o /tmp/hardware_review/img1.webp\`
3. Usa il tuo strumento per visualizzare i file scaricati (es. \`view_file\`).
4. Analizza le immagini applicando rigorosamente le Regole Globali e Specifiche qui sotto.
5. Formula la tua risposta finale all'utente mostrando una tabella con i risultati ACCETTATI e SCARTATI, motivando la scelta in base all'ispezione visiva.

==================================================
📋 ISTRUZIONI GLOBALI DI REVISIONE:
==================================================
${globalInstructionsText}

==================================================
🎯 REGOLE SPECIFICHE PER [${moduleId}]:
==================================================
${specificRules}
`
          }
        }]
      };
    }
  );
}
