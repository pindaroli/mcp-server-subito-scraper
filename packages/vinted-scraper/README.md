# Vinted Scraper MCP Server 👗👕👟

Un server MCP (Model Context Protocol) TypeScript per la ricerca e lo scraping di annunci di moda e articoli di seconda mano su **Vinted** (Italia ed Europa), basato sull'Actor Apify [`automation-lab/vinted-scraper`](https://apify.com/automation-lab/vinted-scraper).

Permette agli assistenti AI (Claude, Antigravity, Gemini, Cursor) di interrogare in tempo reale il catalogo Vinted, applicare filtri di prezzo, ordinamento, domini regionali ed estrarre dettagli completi come marca, taglia, condizione, venditore, preferiti e foto ad alta risoluzione.

---

## 🚀 Caratteristiche Principali

- 🌍 **Supporto Multi-Country:** Ricerche su `vinted.it` (default), `vinted.fr`, `vinted.de`, `vinted.es`, `vinted.co.uk`, `vinted.com`, `vinted.nl`, `vinted.be`.
- 🔍 **Filtri di Ricerca:** Filtro per parola chiave, intervallo di prezzo (min/max), ordinamento per rilevanza, prezzo crescente/decrescente o data.
- 👗 **Dati Estratti Completi:** Titolo, brand, taglia, condizione/stato, colore, prezzo, prezzo originale, venditore con feedback, statistiche di preferiti e foto ad alta risoluzione.
- ⚡ **Modello Pay-Per-Event:** Nessun abbonamento mensile obbligatorio all'Actor; utilizza direttamente i crediti del tuo account Apify ($5 gratuiti mensili nel piano Free o plafond del piano Starter).

---

## 🛠️ Tool MCP Esposti

### 1. `vinted_search`
Esegue una ricerca di articoli su Vinted in base ai criteri specificati.

**Parametri:**
- `searchQuery` (string, **obbligatorio**): Parola chiave di ricerca (es. `"giacca pelle vintage"`, `"nike dunk low"`, `"borsa gucci"`).
- `domain` (string, opzionale, default: `"vinted.it"`): Dominio Vinted di destinazione.
- `minPrice` (number, opzionale): Prezzo minimo in EUR.
- `maxPrice` (number, opzionale): Prezzo massimo in EUR.
- `sortBy` (enum, opzionale, default: `"relevance"`): `"relevance"`, `"price_low_to_high"`, `"price_high_to_low"`, `"newest_first"`.
- `maxItems` (number, opzionale, default: `30`): Numero massimo di annunci da estrarre.
- `timeoutSecs` (number, opzionale, default: `300`): Timeout di esecuzione dell'Actor.
- `token` (string, opzionale): Token Apify personalizzato per sovrascrivere `APIFY_TOKEN`.

### 2. `vinted_get_dataset_items`
Recupera gli elementi da un dataset Apify precedentemente generato.

**Parametri:**
- `datasetId` (string, **obbligatorio**): ID del Dataset Apify.
- `limit` (number, opzionale, default: `50`): Limite di elementi da recuperare.
- `token` (string, opzionale): Token Apify.

### 3. `apify_check_status`
Verifica la validità della chiave API e lo stato del profilo Apify.

---

## ⚙️ Configurazione ed Installazione

### Variabili d'Ambiente
Crea o modifica il file `.env` nella root:
```env
APIFY_TOKEN=apify_api_tuo_token_qui
```

### Configurazione MCP Client

#### In Antigravity / Cursor / Claude Desktop (`mcp_config.json`):
```json
{
  "mcpServers": {
    "vinted-scraper": {
      "command": "node",
      "args": ["/percorso/assoluto/oli-mcp-servers/packages/vinted-scraper/dist/index.js"],
      "env": {
        "APIFY_TOKEN": "apify_api_tuo_token_qui"
      }
    }
  }
}
```

---

## 🧪 Build e Test

```bash
# Compilazione
npm run build

# Smoke Test
npm run test

# Test integrazione MCP Client via stdio
npm run test:mcp
```
