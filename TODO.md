# TODO & Roadmap

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
   - Link Vinted
```
