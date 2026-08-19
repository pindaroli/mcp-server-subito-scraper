import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

export * from './ai-inspector.js';

export interface DeterministicFilters {
  exclude_capacities_gb?: number[];
  exclude_keywords?: string[];
  exclude_part_number_prefixes?: string[];
  require_keywords?: string[];
}

export interface ComponentRule {
  name?: string;
  description?: string;
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

export function listAvailableModules(): Record<string, string> {
  const modules: Record<string, string> = {};
  
  const scanDir = (dirPath: string) => {
    if (fs.existsSync(dirPath)) {
      const files = fs.readdirSync(dirPath);
      for (const file of files) {
        if (file.endsWith('.json') && file !== 'global_instructions.json') {
          const moduleId = file.replace('.json', '');
          const rule = readJsonFile(path.join(dirPath, file)) as ComponentRule;
          if (rule && rule.name) {
            modules[moduleId] = `${rule.name} - ${rule.description || ''}`;
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

  return modules;
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
