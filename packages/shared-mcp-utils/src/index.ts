import fs from 'fs';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

// Default fallback rules
const DEFAULT_HARDWARE_RULES: Record<string, string> = {
  "ram_ddr5": "NO SODIMM: Solo moduli lunghi DIMM/UDIMM Desktop (288 pin).\nPART NUMBER: SK Hynix HMCG78 (OK), HMCG66 (NO). Samsung M378 (OK), M425 (NO).",
  "matx_motherboard": "FORM FACTOR: Cerca mATX o Micro-ATX (fino a 244 x 244 mm, max 4 slot PCIe).\nSCARTA: Mini-ITX (troppo piccole, 2 slot RAM) e ATX standard.",
  "psu_sfx": "FORM FACTOR: Cerca sigla SFX (125x100x63.5mm). Attenzione alla variante SFX-L.\nSCARTA: Alimentatori ATX standard."
};

export function loadHardwareRules(): Record<string, string> {
  const customPath = process.env.HARDWARE_RULES_FILE;
  
  if (customPath) {
    try {
      if (fs.existsSync(customPath)) {
        const fileContent = fs.readFileSync(customPath, 'utf8');
        console.error(`[MCP Shared] Regole hardware caricate con successo da: ${customPath}`);
        return JSON.parse(fileContent);
      } else {
        console.error(`[MCP Shared] ATTENZIONE: Il file ${customPath} non esiste. Uso regole di default.`);
      }
    } catch (error) {
      console.error(`[MCP Shared] ERRORE durante il parsing del file ${customPath}:`, error);
      console.error(`[MCP Shared] Fallback sulle regole di default.`);
    }
  }
  
  return DEFAULT_HARDWARE_RULES;
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
