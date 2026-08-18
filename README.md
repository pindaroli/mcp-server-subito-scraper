# Subito.it MCP Server (via Apify)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)
[![Model Context Protocol](https://img.shields.io/badge/MCP-Protocol%201.0-orange.svg)](https://modelcontextprotocol.io/)

Server **MCP (Model Context Protocol)** basato su **TypeScript** per cercare e raschiare annunci da **[Subito.it](https://www.subito.it)** sfruttando l'Actor Apify [`azzouzana/subito-scraper-pro-by-search-url`](https://apify.com/azzouzana/subito-scraper-pro-by-search-url).

Eseguibile istantaneamente con `npx` su qualsiasi client compatibile con MCP (Claude Desktop, Cursor, Gemini Antigravity, Windsurf, VS Code, ecc.).

---

## 🌟 Funzionalità Principali

- 🚀 **Esecuzione con `npx` senza installazione globale**: pronto all'uso con `npx -y mcp-server-subito-scraper`.
- 🇮🇹 **Supporto completo a tutte le categorie Subito.it**: Motori (auto, moto), Immobili (vendita/affitto), Elettronica/Informatica, Telefonia, Arredamento, Lavoro e Marketplace generale.
- 🔍 **Ricerca intelligente (`subito_search`)**: Genera automaticamente gli URL con filtri per query, categoria, regione, prezzo minimo/massimo e spedizione TuttoSubito (`shp=true`).
- 🔗 **Scraping diretto da URL (`subito_scrape_by_url`)**: Incolla qualsiasi URL con filtri complessi applicati direttamente dal sito.
- 📦 **Recupero Dataset (`subito_get_dataset_items`)**: Visualizza ed estrai risultati da dataset Apify creati in precedenza.
- 🔑 **Configurazione Token Flessibile**: Tramite variabile d'ambiente (`APIFY_TOKEN`), parametro da riga di comando (`--token`), o direttamente nel prompt/tool.

---

## 🔑 Ottenere il Token Apify

1. Crea un account gratuito su [Apify.com](https://apify.com).
2. Vai su **Settings > Integrations > API Tokens** oppure su [console.apify.com/settings/integrations](https://console.apify.com/settings/integrations).
3. Copia il tuo **Personal API Token** (es. `apify_api_...`).

---

## 🛠️ Configurazione nei Client MCP

### 1. Claude Desktop

Aggiungi la configurazione al file `claude_desktop_config.json`:

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "subito-scraper": {
      "command": "npx",
      "args": ["-y", "mcp-server-subito-scraper"],
      "env": {
        "APIFY_TOKEN": "IL_TUO_TOKEN_APIFY_QUI"
      }
    }
  }
}
```

*In alternativa, passando il token come argomento CLI:*

```json
{
  "mcpServers": {
    "subito-scraper": {
      "command": "npx",
      "args": ["-y", "mcp-server-subito-scraper", "--token", "IL_TUO_TOKEN_APIFY_QUI"]
    }
  }
}
```

---

### 2. Cursor / Windsurf

Nelle impostazioni MCP del client:

```json
{
  "subito-scraper": {
    "command": "npx",
    "args": ["-y", "mcp-server-subito-scraper"],
    "env": {
      "APIFY_TOKEN": "IL_TUO_TOKEN_APIFY_QUI"
    }
  }
}
```

---

### 3. Gemini Antigravity / Agentic IDE

Aggiungi il blocco di configurazione MCP nella sezione `mcpServers`:

```json
{
  "mcpServers": {
    "subito-scraper": {
      "command": "npx",
      "args": ["-y", "mcp-server-subito-scraper"],
      "env": {
        "APIFY_TOKEN": "IL_TUO_TOKEN_APIFY_QUI"
      }
    }
  }
}
```

---

## 🧰 Strumenti Disponibili (Tools)

### 1. `subito_search`
Costruisce automaticamente l'URL di Subito ed esegue lo scraper.

| Parametro | Tipo | Descrizione | Default |
|---|---|---|---|
| `query` | `string` (obbligatorio) | Testo da cercare (es. `"MacBook Pro M3"`, `"Vespa 125"`) | - |
| `category` | `string` (opzionale) | Categoria (es. `"usato"`, `"auto"`, `"moto"`, `"case"`, `"informatica"`, `"telefonia"`, `"arredamento"`) | `"usato"` |
| `region` | `string` (opzionale) | Regione italiana (es. `"italia"`, `"lombardia"`, `"lazio"`, `"piemonte"`, `"veneto"`) | `"italia"` |
| `minPrice` | `number` (opzionale) | Prezzo minimo in Euro | - |
| `maxPrice` | `number` (opzionale) | Prezzo massimo in Euro | - |
| `shippingOnly`| `boolean` (opzionale)| Filtra solo annunci con spedizione TuttoSubito | `false` |
| `sortBy` | `string` (opzionale) | Ordinamento: `"datedesc"`, `"priceasc"`, `"pricedesc"` | `"datedesc"` |
| `maxItems` | `number` (opzionale) | Numero massimo di annunci da estrarre | `30` |
| `timeoutSecs`| `number` (opzionale)| Timeout massimo di esecuzione in secondi | `300` |
| `token` | `string` (opzionale) | Token Apify (sovrascrive quello d'ambiente) | - |

---

### 2. `subito_scrape_by_url`
Esegue lo scraping a partire da un URL di ricerca diretto già pronto.

| Parametro | Tipo | Descrizione | Default |
|---|---|---|---|
| `searchUrl` | `string` (obbligatorio) | URL di ricerca completo di Subito.it | - |
| `maxItems` | `number` (opzionale) | Numero massimo di annunci da estrarre | `30` |
| `timeoutSecs`| `number` (opzionale)| Timeout in secondi | `300` |
| `token` | `string` (opzionale) | Token Apify personalizzato | - |

---

### 3. `subito_get_dataset_items`
Recupera i dati estratti da un dataset Apify precedentemente salvato.

| Parametro | Tipo | Descrizione | Default |
|---|---|---|---|
| `datasetId` | `string` (obbligatorio) | ID del dataset Apify | - |
| `limit` | `number` (opzionale) | Numero di elementi da leggere | `50` |
| `offset` | `number` (opzionale) | Offset per paginazione | `0` |
| `token` | `string` (opzionale) | Token Apify | - |

---

### 4. `apify_check_status`
Verifica che il token Apify sia valido e mostra le informazioni sull'account.

---

## 💻 Sviluppo Locale e Compilazione

Se desideri clonare e modificare il server localmente:

```bash
# 1. Clona il repository
git clone https://github.com/pindaroli/mcp-server-subito-scraper.git
cd mcp-server-subito-scraper

# 2. Installa le dipendenze
npm install

# 3. Compila il codice TypeScript
npm run build

# 4. Esegui in modalità test
APIFY_TOKEN=tuo_token_qui npm start
```

Oppure in modalità sviluppo con ricaricamento veloce:

```bash
APIFY_TOKEN=tuo_token_qui npm run dev
```

---

## 🚀 Pubblicazione su NPM e GitHub

Per pubblicare il pacchetto e renderlo disponibile a tutti via `npx mcp-server-subito-scraper`:

```bash
# Esegui il login a npm
npm login

# Pubblica il pacchetto
npm publish --access public
```

---

## 📄 Licenza

Questo progetto è distribuito sotto licenza **MIT**. Consulta il file [LICENSE](./LICENSE) per i dettagli.

*Disclaimer: Questo server MCP non è affiliato, sponsorizzato o supportato ufficialmente da Subito.it S.r.l. I marchi registrati appartengono ai rispettivi proprietari.*
