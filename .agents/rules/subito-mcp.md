# Subito.it MCP Server Development & Usage Rule

Questa regola si applica alle sessioni di sviluppo e testing del server MCP `mcp-server-subito-scraper` all'interno del monorepo (`packages/subito-scraper`).

## Comandi Utili per lo Sviluppo

- **Build globale monorepo**: `npm run build`
- **Build specifico Subito Scraper**: `npm run build:subito` (o `npm run build -w mcp-server-subito-scraper`)
- **Test Unitari (URL Builder)**: `npm run test:subito` (o `npm test -w mcp-server-subito-scraper`)
- **Test Client MCP (Integrazione Stdio)**: `npm run test:mcp -w mcp-server-subito-scraper`
- **Avvio in modalità Dev**: `npm run dev:subito` (o `npm run dev -w mcp-server-subito-scraper`)

## Configurazione Token

Il server richiede un token Apify per eseguire l'Actor `azzouzana/subito-scraper-pro-by-search-url`:
1. Copiare `.env.example` in `.env` (alla radice o in `packages/subito-scraper/.env`)
2. Impostare `APIFY_TOKEN=il_tuo_token`
3. Il token viene caricato automaticamente tramite `dotenv`.
