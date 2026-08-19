# TODO & Roadmap

## 📌 Risoluzione Dicotomia e Unificazione Regole RAM (`ram.json` vs `ram_ddr5.json`)
- [ ] **Unificazione/Gerarchia Regole RAM:**
  - Risolvere la dicotomia tra la regola generica parametrica `ram.json` (che gestisce DDR3, DDR4, DDR5, SO-DIMM e Desktop) e la regola specifica `ram_ddr5.json` (dedicata a DDR5 Desktop).
  - Valutare un'architettura modulare a ereditarietà o a profili (`ram.base.json` + preset `profiles/ddr5_desktop.json`, `profiles/ddr4_laptop.json`), eliminando duplicazioni nei criteri di decodifica e filtri deterministici.

## 📌 Risoluzione Ambiguità nei Parser MCP ed Evidenza Hardware (DIMM vs SODIMM)

### 🎯 Problema Rilevato
I titoli e le descrizioni forniti dai venditori privati sulle piattaforme di second-hand (come Vinted o Subito) contengono frequentemente ambiguità o errori:
- Inserzioni con titoli generici come *"RAM PC"*, *"RAM 16GB DDR5"* o *"Kingston RAM"* che nascondono moduli in formato compatto **SO-DIMM per laptop** (estratti da notebook o mini-PC) invece che moduli **DIMM / U-DIMM per PC Desktop a 288 pin**.
- I semplici filtri basati su blacklist testuale (`sodimm`, `laptop`) falliscono quando il venditore omette questi termini.

### 🛠️ Linee Guida di Risoluzione Architetturale
1. **Validazione basata su Part Number (P/N):**
   - Implementare o richiedere regole di decodifica deterministica per i codici produttore:
     - **SK Hynix:** prefisso `HMCG78...` (UDIMM Desktop) vs `HMCG66...` (SODIMM Laptop).
     - **Samsung:** prefisso `M378...` / `...-UA0` (UDIMM Desktop) vs `M425...` (SODIMM Laptop).
     - **Kingston:** `KF5...BB...` (Beast Desktop) vs `KF5...IB...` (Impact SODIMM).
     - **Micron / Crucial:** serie `...UC...` (UDIMM) vs `...SC...` (SODIMM).
2. **Politica "Zero Assunzioni" (Proof of Verification):**
   - Vietare deduzioni basate sul solo brand o titolo.
   - Scartare automaticamente qualsiasi annuncio con foto sfocate, confezioni prive di codice identificativo leggibile o informazioni ambigue.
3. **Estrazione Completa dei Dettagli via MCP Server:**
   - Assicurarsi che i tool MCP (`vinted-scraper`, `subito-scraper`) espongano nei payload i link ad alta risoluzione delle foto, il testo completo della descrizione e i campi tecnici disponibili per consentire la verifica visiva/OCR.

---

### 📝 Esempio di Prompt con Regole Rigide di Disambiguazione

```markdown
Cerca su Vinted annunci per "MEMORIA DDR5 DIMM" con prezzo massimo 10€/GB.

CRITERI DI VERIFICA RIGIDI (ZERO ASSUNZIONI):
1. NO SODIMM: Sono accettati esclusivamente moduli lunghi DIMM/UDIMM Desktop (288 pin). Escludi categoricamente SODIMM per laptop (262 pin, compatti).
2. VERIFICA PROVA: Non fidarti dei titoli dei venditori (molti vendono SODIMM Kingston/Samsung scrivendo genericamente 'RAM PC'). Devi basarti esclusivamente sul Part Number leggibile in foto (es. Samsung M378, SK Hynix HMCG78, Kingston senza 'S' finale) o sulla forma visiva lunga del PCB.
3. REGOLA DI SCARTO: Se un annuncio ha foto generiche, scatole chiuse senza sigla, o testo ambiguo, SCARTALO immediatamente.
4. TABELLA: Mostrami i migliori risultati indicando obbligatoriamente:
   - Prezzo e €/GB
   - Taglio (GB) e N° Stick
   - Velocità (MHz)
   - Part Number ESATTO letto dall'etichetta
```

---

## 🚀 Fase 2: Pacchetto Binario su Registry & Distribuzione Standalone

### 🎯 Obiettivo
Passare dalla modalità di sviluppo/debug locale (percorsi assoluti nel monorepo) alla distribuzione ufficiale come pacchetti binari eseguibili ovunque con un comando standard (es. `npx -y mcp-server-subito-scraper`).

### 📋 Attività da Completare

- [ ] **1. Strategia di Bundling Standalone per i Package:**
  - Integrare `tsup` o `esbuild` nelle build dei package (`subito-scraper`, `vinted-scraper`) per incorporare `shared-mcp-utils` direttamente nel bundle finale `dist/index.js`, eliminando la dipendenza locale relativa `file:../shared-mcp-utils`.
  - *(In alternativa)* Valutare la pubblicazione di `shared-mcp-utils` come pacchetto scoped (`@olindo/shared-mcp-utils`).

- [ ] **2. Test di Esecuzione Binaria Locale (`npm link` / Pack):**
  - Eseguire `npm link` nei package per testare l'invocazione globale via riga di comando sul sistema (`mcp-server-subito-scraper`, `mcp-server-vinted-scraper`).
  - Verificare il pacchetto con `npm pack` e simulare l'installazione in un ambiente pulito.

- [ ] **3. Configurazione Pubblicazione Registry (NPM / GitHub Packages):**
  - Configurare `.npmignore` / `"files"` nei `package.json` per includere solo gli artefatti necessari (`dist`, `README.md`, `LICENSE`).
  - Verificare metadati, keyword, licenza e repository URLs nei manifest.
  - Setup autenticazione e script per `npm publish --access public`.

- [ ] **4. CI/CD & Automazione Release (Opzionale):**
  - Creare GitHub Action per build, test e pubblicazione automatica su tag/release o tramite `changesets`.

- [ ] **5. Aggiornamento Documentazione e Template Client MCP:**
  - Aggiornare i README con le istruzioni di configurazione standard `npx` per tutti i client MCP supportati (Claude Desktop, Antigravity, Cursor, Cline/Roo Code).

---

## 🚀 Fase 3: Generalizzazione Oltre l'Hardware (Es. Software e Videogiochi)

### 🎯 Obiettivo
Adattare l'architettura attuale (focalizzata su `hardware_rules` e `hardware_expert_search`) per renderla agnostica rispetto al dominio, permettendo di validare anche categorie non hardware come software, videogiochi fisici o licenze digitali.

### 📋 Piano di Astrazione
1. **Rinominare e Astrarre i Tool MCP:**
   - Sostituire il concetto di `hardware_expert_search` con un più generico `vinted_expert_reviewer` o `item_validation_search`.
   - Modificare la struttura delle directory di regole da `.agents/hardware_rules/` a `.agents/validation_rules/`.
2. **Aggiornamento del Semantic Router (Skill):**
   - Evolvere la Skill `hardware-router` in un router generico (es. `vinted-expert-router`).
   - Istruire l'LLM a distinguere il macro-dominio (Hardware vs Software vs Abbigliamento) e richiedere all'MCP server le regole appropriate.
3. **Introduzione di `software.json`:**
   - Creare un nuovo modulo di regole con la "Politica Zero Assunzioni" specifica per il software. Esempi di regole:
     - Scartare chiavi digitali (Product Key) inviate via chat per rischio truffa.
     - Verificare se un gioco per PC (recente) richiede l'attivazione obbligatoria su piattaforme come Steam/Epic, pretendendo prove che la scatola sia sigillata.
     - Ispezionare visivamente la presenza del disco/cartuccia o del sigillo olografico originale nelle custodie console.
