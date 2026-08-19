import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

export interface ComponentRule {
  name?: string;
  description?: string;
  rules: string;
}

export interface HardwareRulesConfig {
  global_instructions?: string[] | string;
  components: Record<string, string | ComponentRule>;
}

/**
 * Normalizes raw JSON object into HardwareRulesConfig
 */
function normalizeConfig(raw: Record<string, unknown>): HardwareRulesConfig {
  if (raw && typeof raw === 'object' && ('components' in raw || 'global_instructions' in raw)) {
    return {
      global_instructions: (raw.global_instructions as string[] | string) || [],
      components: (raw.components as Record<string, string | ComponentRule>) || {}
    };
  }

  // Backward-compatibility: if the JSON is flat key-value
  return {
    global_instructions: [],
    components: (raw as Record<string, string>) || {}
  };
}

/**
 * Loads default rules from default_hardware_rules.json
 */
function loadDefaultRules(): HardwareRulesConfig {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const candidatePaths = [
    path.join(currentDir, 'default_hardware_rules.json'),
    path.join(currentDir, '../src/default_hardware_rules.json'),
    path.join(process.cwd(), 'hardware_rules.json')
  ];

  for (const p of candidatePaths) {
    if (fs.existsSync(p)) {
      try {
        const content = fs.readFileSync(p, 'utf8');
        return normalizeConfig(JSON.parse(content));
      } catch (err) {
        console.error(`[MCP Shared] Errore lettura regole da ${p}:`, err);
      }
    }
  }

  return { components: {} };
}

export function loadHardwareRules(): HardwareRulesConfig {
  const customPath = process.env.HARDWARE_RULES_FILE;
  
  if (customPath) {
    try {
      if (fs.existsSync(customPath)) {
        const fileContent = fs.readFileSync(customPath, 'utf8');
        console.error(`[MCP Shared] Regole hardware caricate con successo da: ${customPath}`);
        return normalizeConfig(JSON.parse(fileContent));
      } else {
        console.error(`[MCP Shared] ATTENZIONE: Il file specificato in HARDWARE_RULES_FILE (${customPath}) non esiste. Uso regole di default.`);
      }
    } catch (error) {
      console.error(`[MCP Shared] ERRORE durante il parsing del file ${customPath}:`, error);
      console.error(`[MCP Shared] Fallback sulle regole di default.`);
    }
  }
  
  return loadDefaultRules();
}

export function registerHardwarePrompt(server: McpServer) {
  const config = loadHardwareRules();
  const componentKeys = Object.keys(config.components);

  server.registerPrompt(
    "hardware_expert_search",
    {
      title: "Hardware Expert Search",
      description: "Ricerca hardware applicando rigide regole di validazione 'Zero Assunzioni'.",
      argsSchema: {
        component: z.string().describe(`Categoria componente (Supportati: ${componentKeys.join(', ')})`)
      }
    },
    async (args) => {
      const component = args.component;
      
      let specificRules = "Nessuna regola specifica trovata nel database. Usa cautela estrema e controlla attentamente sigle ed etichette.";
      if (component && typeof component === 'string' && config.components[component]) {
        const compVal = config.components[component];
        if (typeof compVal === 'string') {
          specificRules = compVal;
        } else if (compVal && typeof compVal === 'object' && compVal.rules) {
          specificRules = `[${compVal.name || component} - ${compVal.description || ''}]\n${compVal.rules}`;
        }
      }

      let globalInstructionsText = '';
      if (config.global_instructions) {
        if (Array.isArray(config.global_instructions)) {
          globalInstructionsText = config.global_instructions.join('\n');
        } else {
          globalInstructionsText = config.global_instructions;
        }
      } else {
        globalInstructionsText = `1. ANALISI DEL CORPO DEL TESTO: Estrai tutte le informazioni tecniche dal corpo dell'annuncio.\n2. VERIFICA FOTOGRAFICA & SERIALI: Ispeziona le etichette nelle foto per Part Number e seriali.\n3. POLITICA 'ZERO ASSUNZIONI': Se le foto sono sfocate o mancano prove certe, scarta l'annuncio.\n4. Genera una tabella Markdown con dettagli tecnici verificati.`;
      }
      
      return {
        messages: [{
          role: "user",
          content: {
            type: "text",
            text: `SEI UN ESPERTO REVISORE HARDWARE.
Applicherai la Politica "Zero Assunzioni": scarta le inserzioni basandoti sulle seguenti direttive.

==================================================
📋 ISTRUZIONI GLOBALI DI REVISIONE:
==================================================
${globalInstructionsText}

==================================================
🎯 REGOLE SPECIFICHE PER [${component || 'sconosciuto'}]:
==================================================
${specificRules}
`
          }
        }]
      };
    }
  );
}
