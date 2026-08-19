# Oli II Hands Searcher MCP Server

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)
[![Model Context Protocol](https://img.shields.io/badge/MCP-Protocol%201.0-orange.svg)](https://modelcontextprotocol.io/)

Monorepo TypeScript basato su **NPM Workspaces** per lo sviluppo, test e deployment di molteplici server **MCP (Model Context Protocol)**.

---

## 📁 Struttura del Repository

```
oli-mcp-serves/
├── package.json                 # Configurazione root e script globali (NPM Workspaces)
├── tsconfig.base.json           # Configurazione TypeScript condivisa
├── mcp_config.json              # Configurazione client MCP con tutti i server registrati
├── .gitignore
├── README.md                    # Questo file
│
└── packages/                    # Directory contenente i singoli server MCP
    └── subito-scraper/          # Server MCP per scraping Subito.it (via Apify)
        ├── package.json
        ├── tsconfig.json
        ├── README.md
        ├── src/
        └── test/
```

---

## 📦 Server MCP Disponibili

| Server | Directory | Descrizione |
| :--- | :--- | :--- |
| **`mcp-server-subito-scraper`** | [`packages/subito-scraper`](./packages/subito-scraper) | Ricerca e scraping di annunci su Subito.it tramite Apify Actor. |

---

## 🚀 Guida Rapida

### 1. Installazione Dipendenze
Installa le dipendenze per tutti i workspace con un unico comando:
```bash
npm install
```

### 2. Compilazione
Compila tutti i server MCP nel monorepo:
```bash
npm run build
```

Per compilare solo un server specifico:
```bash
npm run build:subito
# oppure:
npm run build -w mcp-server-subito-scraper
```

### 3. Test
Esegui i test su tutti i server:
```bash
npm test
```

Esegui i test per un server specifico:
```bash
npm run test:subito
# Test di integrazione MCP con connessione Stdio:
npm run test:mcp -w mcp-server-subito-scraper
```

---

## ➕ Come Aggiungere un Nuovo Server MCP

Aggiungere un nuovo server MCP al monorepo è semplicissimo:

1. **Crea la cartella del nuovo server**:
   ```bash
   mkdir -p packages/mio-nuovo-server/src packages/mio-nuovo-server/test
   ```

2. **Crea il `package.json`** in `packages/mio-nuovo-server/package.json`:
   ```json
   {
     "name": "mcp-server-mio-nuovo-server",
     "version": "1.0.0",
     "type": "module",
     "main": "dist/index.js",
     "types": "dist/index.d.ts",
     "bin": {
       "mcp-server-mio-nuovo-server": "./dist/index.js"
     },
     "scripts": {
       "build": "tsc && chmod +x dist/index.js",
       "watch": "tsc --watch",
       "test": "tsx test/index.test.ts",
       "dev": "tsx src/index.ts",
       "start": "node dist/index.js"
     },
     "dependencies": {
       "@modelcontextprotocol/sdk": "^1.12.0",
       "dotenv": "^16.4.7",
       "zod": "^3.24.2"
     }
   }
   ```

3. **Crea il `tsconfig.json`** in `packages/mio-nuovo-server/tsconfig.json`:
   ```json
   {
     "extends": "../../tsconfig.base.json",
     "compilerOptions": {
       "outDir": "./dist",
       "rootDir": "./src"
     },
     "include": ["src/**/*"],
     "exclude": ["node_modules", "dist"]
   }
   ```

4. **Installa e Compila**:
   ```bash
   npm install
   npm run build
   ```

5. **Aggiungi la configurazione in `mcp_config.json`**.

---

## 🛠️ Configurazione Client MCP (Claude Desktop / Antigravity / Cursor)

Usa la configurazione aggregata `mcp_config.json` per registrare i server nei tuoi client:

```json
{
  "mcpServers": {
    "subito-scraper": {
      "command": "node",
      "args": ["/percorso/assoluto/oli-mcp-serves/packages/subito-scraper/dist/index.js"],
      "env": {
        "APIFY_TOKEN": "il_tuo_token_apify"
      }
    }
  }
}
```

---

## 📄 Licenza

MIT © Olindo
