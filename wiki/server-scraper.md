# 🕷️ Server Scraper (Vinted, Subito.it, Wallapop)

Il monorepo contiene tre server MCP dedicati allo scraping ad alte prestazioni tramite Apify Actors.

---

## 1. Vinted Scraper (`mcp-server-vinted-scraper`)

* **Actor Apify**: `automation-lab/vinted-scraper`
* **Domini Supportati**: `vinted.it`, `vinted.fr`, `vinted.de`, `vinted.es`, `vinted.nl`, `vinted.be`, `vinted.co.uk`, `vinted.com`

### Tools Disponibili:
1. **`vinted_search`**:
   - `searchQuery`: Parola chiave di ricerca (es. `"case pc nzxt"`, `"RAM DDR5"`).
   - `domain`: Dominio target (default: `"vinted.it"`).
   - `minPrice` / `maxPrice`: Filtri prezzo in EUR.
   - `maxPricePerGB`: Limite prezzo/GB per moduli RAM (default: 10 €/GB).
   - `sortBy`: `"relevance"`, `"price_low_to_high"`, `"price_high_to_low"`, `"newest_first"`.
   - `maxItems`: Numero massimo di annunci da estrarre (default: 30).
   - `ruleModuleId`: ID modulo regole opzionale (se omesso, opera con il Semantic Router automatico).
2. **`vinted_get_dataset_items`**:
   - Recupera gli annunci da un Dataset Apify già generato tramite `datasetId`.

---

## 2. Subito.it Scraper (`mcp-server-subito-scraper`)

* **Actor Apify**: `automation-lab/subito-scraper`
* **Caratteristiche**: Supporto filtri geografici regionali, categorie merceologiche e filtro TuttoSubito (spedizione).

### Tools Disponibili:
1. **`subito_search`**:
   - `query`: Testo da cercare.
   - `category`: Categoria merceologica (es. `"informatica"`).
   - `region`: Regione (es. `"lombardia"`, `"lazio"`, ecc.).
   - `shippingOnly`: Se `true`, estrae solo inserzioni con spedizione TuttoSubito.
   - `minPrice` / `maxPrice`, `sortBy`, `maxItems`, `ruleModuleId`.
2. **`subito_scrape_by_url`**:
   - Esegue lo scraping fornendo direttamente l'URL di ricerca generato su Subito.it.
3. **`subito_get_dataset_items`**:
   - Recupera gli item da un dataset esistente.

---

## 3. Wallapop Scraper (`mcp-server-wallapop-scraper`)

* **Actor Apify**: `automation-lab/wallapop-scraper`
* **Piattaforme**: Wallapop Spagna e Italia.

### Tools Disponibili:
1. **`wallapop_search`**:
   - `query`: Keyword di ricerca.
   - `domain`: Dominio `"wallapop.com"` o `"it.wallapop.com"`.
   - `latitude` / `longitude`: Coordinate geografiche opzionali.
   - `minPrice` / `maxPrice`, `maxItems`, `ruleModuleId`.
2. **`wallapop_scrape_by_url`**:
   - Scraping diretto da array di URL Wallapop.
3. **`wallapop_get_dataset_items`**:
   - Recupero item da dataset ID Apify.
