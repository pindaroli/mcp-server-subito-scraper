# 📚 Wiki — Oli II Hands Searcher MCP Server

Benvenuto nel Wiki ufficiale del progetto **Oli II Hands Searcher MCP Server**, un monorepo TypeScript per la ricerca, lo scraping e la validazione intelligente (tramite AI Vision e regole deterministiche) di hardware e componenti usati sulle principali piattaforme di secondhand europee (**Vinted**, **Subito.it**, **Wallapop**).

---

## 🗺️ Mappa del Wiki

| Documento | Descrizione |
| :--- | :--- |
| 🏗️ [**Architettura del Monorepo**](./architettura-monorepo.md) | Struttura dei pacchetti, NPM Workspaces, protocollo MCP e integrazione Apify. |
| 🛡️ [**Sistema Regole Hardware**](./regole-hardware.md) | Filosofia "Zero Assunzioni", matrice ortogonale Case (Chiusi/Aperti × ATX/mATX/ITX), RAM DDR5, Motherboard e PSU. |
| 🧭 [**Semantic Routing & Prompting**](./semantic-routing-e-prompting.md) | Auto-rilevamento delle query, prompt `hardware_expert_search` e interpolazione dinamica. |
| 🕷️ [**Server Scraper (Vinted, Subito, Wallapop)**](./server-scraper.md) | Dettaglio dei singoli scraper, parametri di ricerca, paginazione e domini regionali. |
| 👁️ [**Motore AI Vision Inspector**](./ai-vision-inspector.md) | Pipeline a 3 fasi: pre-filtro deterministico, scraping descrizioni e ispezione visiva/OCR parallela. |
| 💻 [**Guida Sviluppo & Testing**](./guida-sviluppo-e-testing.md) | Compilazione, aggiunta di nuovi scraper/regole, esecuzione smoke test e configurazione client MCP. |

---

## ⚡ Quick Start

### 1. Requisiti di Sistema
- **Node.js**: $\ge 18.0.0$
- **NPM**: $\ge 9.0.0$
- **Token Apify**: Per eseguire gli scraper via Apify Actors (`APIFY_TOKEN` in `.env`)
- *(Opzionale)* **Server LLM Multimodale**: Per l'ispezione visiva con AI Vision (es. Ollama con `qwen2.5vl` o endpoint OpenAI compatibile).

### 2. Installazione e Compilazione
```bash
# Installa le dipendenze in tutto il monorepo
npm install

# Compila tutti i package e sincronizza le regole
npm run build
```

### 3. Configurazione MCP Client (Claude Desktop / Antigravity / Cursor)
I server compilati sono registrabili tramite [`mcp_config.json`](../mcp_config.json).
