# 💻 Guida allo Sviluppo & Testing

Questa guida illustra come sviluppare, testare ed estendere il monorepo **Oli II Hands Searcher**.

---

## 🛠️ Comandi di Build & Script NPM

Tutti gli script sono configurati a livello root nel `package.json`:

```bash
# Compilazione di tutti i package (shared-mcp-utils, subito, vinted, wallapop)
npm run build

# Compilazione di un singolo package
npm run build -w shared-mcp-utils
npm run build -w mcp-server-vinted-scraper
npm run build -w mcp-server-subito-scraper
npm run build -w mcp-server-wallapop-scraper

# Esecuzione della suite di test
npm test

# Esecuzione test per singolo server
npm run test:subito
npm run test:vinted
npm run test:wallapop
```

---

## ➕ Come Aggiungere una Nuova Regola Hardware

1. **Crea il file JSON della regola** in `packages/shared-mcp-utils/src/rules/<id_regola>.json`:
   ```json
   {
     "name": "Nome Componente",
     "description": "Descrizione sintetica",
     "rules": "Direttive visive e criteri di accettazione/scarto...",
     "deterministic_filters": {
       "require_keywords": ["keyword_obbligatoria"],
       "exclude_keywords": ["falso_positivo_1", "falso_positivo_2"]
     }
   }
   ```

2. **Aggiorna `hardware_rules.json`** alla root del progetto per sincronizzazione centrale.

3. **(Opzionale) Aggiungi la mappatura automatica** in `detectRuleModuleId` all'interno di `packages/shared-mcp-utils/src/index.ts`.

4. **Compila il workspace**:
   ```bash
   npm run build -w shared-mcp-utils
   ```
   Lo script `build` copierà automaticamente il nuovo JSON da `src/rules/` in `dist/rules/`.

5. **Verifica**:
   Chiama il tool `get_available_hardware_rules` per confermare che il nuovo modulo compaia nella lista.

---

## 🔌 Integrazione Client MCP (Claude Desktop / Antigravity / Cursor)

Configura il file client MCP (es. `claude_desktop_config.json` o configurazione Antigravity) puntando ai build compilati:

```json
{
  "mcpServers": {
    "vinted-scraper": {
      "command": "node",
      "args": [
        "/Users/olindo/prj/oli-II-Hands-searcher-mcp-server/packages/vinted-scraper/dist/index.js"
      ],
      "env": {
        "APIFY_TOKEN": "il_tuo_token_apify",
        "HARDWARE_RULES_DIR": "/Users/olindo/prj/oli-II-Hands-searcher-mcp-server/packages/shared-mcp-utils/dist/rules"
      }
    },
    "subito-scraper": {
      "command": "node",
      "args": [
        "/Users/olindo/prj/oli-II-Hands-searcher-mcp-server/packages/subito-scraper/dist/index.js"
      ],
      "env": {
        "APIFY_TOKEN": "il_tuo_token_apify",
        "HARDWARE_RULES_DIR": "/Users/olindo/prj/oli-II-Hands-searcher-mcp-server/packages/shared-mcp-utils/dist/rules"
      }
    }
  }
}
```
