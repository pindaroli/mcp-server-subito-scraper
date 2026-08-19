import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

/**
 * Loads default rules from default_hardware_rules.json
 */
function loadDefaultRules(): Record<string, string> {
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
        return JSON.parse(content);
      } catch (err) {
        console.error(`[MCP Shared] Errore lettura regole da ${p}:`, err);
      }
    }
  }

  return {};
}

export function loadHardwareRules(): Record<string, string> {
  const customPath = process.env.HARDWARE_RULES_FILE;
  
  if (customPath) {
    try {
      if (fs.existsSync(customPath)) {
        const fileContent = fs.readFileSync(customPath, 'utf8');
        console.error(`[MCP Shared] Regole hardware caricate con successo da: ${customPath}`);
        return JSON.parse(fileContent);
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
  const rulesDB = loadHardwareRules();

  server.registerPrompt(
    "hardware_expert_search",
    {
      title: "Hardware Expert Search",
      description: "Ricerca hardware applicando rigide regole di validazione 'Zero Assunzioni'.",
      argsSchema: {
        component: z.string().describe(`Categoria componente (Supportati: ${Object.keys(rulesDB).join(', ')})`)
      }
    },
    async (args) => {
      const component = args.component;
      
      let specificRules = "Nessuna regola specifica trovata nel database. Usa cautela estrema e controlla attentamente sigle ed etichette.";
      if (component && typeof component === 'string' && rulesDB[component]) {
        specificRules = rulesDB[component];
      }
      
      return {
        messages: [{
          role: "user",
          content: {
            type: "text",
            text: `SEI UN ESPERTO REVISORE HARDWARE.
Applicerai la Politica "Zero Assunzioni": scarta le inserzioni basandoti sulle seguenti direttive.

REGOLE SPECIFICHE PER [${component || 'sconosciuto'}]:
${specificRules}

ISTRUZIONI GLOBALI:
1. Verifica le sigle ESATTE leggibili nelle fotografie (Part Number, modello).
2. Se la scatola è generica, sigillata senza codice identificativo o le foto sono sfuocate, SCARTA l'annuncio.
3. Non dedurre dal titolo: i titoli contengono spesso errori.
4. Genera una tabella Markdown finale con: Prezzo, Condizione, Part Number verificato, Link.
`
          }
        }]
      };
    }
  );
}
