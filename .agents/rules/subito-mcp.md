# Subito.it MCP Server Development & Usage Rule

Questa regola si applica alle sessioni di sviluppo e testing del server MCP `mcp-server-subito-scraper`.

## Comandi Utili per lo Sviluppo

- **Build del progetto**: `npm run build`
- **Test Unitari (URL Builder)**: `npm test`
- **Test Client MCP (Integrazione Stdio)**: `npm run test:mcp`
- **Avvio in modalità Dev**: `npm run dev`

## Configurazione Token

Il server richiede un token Apify per eseguire l'Actor `azzouzana/subito-scraper-pro-by-search-url`:
1. Copiare `.env.example` in `.env`
2. Impostare `APIFY_TOKEN=il_tuo_token`
3. Il token viene caricato automaticamente tramite `dotenv`.
