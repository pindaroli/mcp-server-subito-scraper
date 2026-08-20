# 👁️ Motore AI Vision Inspector

Il motore **AI Vision Inspector** (in `packages/shared-mcp-utils/src/ai-inspector.ts`) gestisce la validazione autonoma ad altissima precisione dei componenti hardware tramite una pipeline a 3 fasi potenziata da **Qwen2.5-VL-32B**.

---

## ⚡ Pipeline di Ispezione a 3 Fasi

```mermaid
flowchart TD
    A[Annunci Raw da Apify] --> B[Normalizzazione Metadati & Foto]
    B --> C[Fase 1: Pre-Filtro Deterministico Istantaneo]
    C -->|Scartati: Regex / Keywords / Prezzo Unitario| D[Verdetto REJECTED Istantaneo]
    C -->|Candidati Plausibili| E[Fase 2: Deep-Fetch Descrizioni Mancanti]
    E --> F[Fase 3: Vision AI & OCR Multimodale in Parallelo]
    F --> G[Verdetto Finale ACCEPTED / REJECTED con Prove]
    D --> H[Report Markdown + JSON Integrato]
    G --> H
```

---

## 🔍 Descrizione Dettagliata delle Fasi

### Fase 1: Pre-Filtro Deterministico Istantaneo (Zero Latenza AI)
Prima di consumare token AI o chiamate multimodali, ogni annuncio viene processato attraverso i `deterministic_filters` definiti nel modulo JSON della regola:
1. **Exclude Keywords**: Scarta inserzioni contenenti termini non pertinenti (es. per i case: *"custodia", "borsa", "case logic", "sleeve", "ventola 120mm", "filtro"*).
2. **Require Keywords**: Per i moduli specifici (es. `case_open_itx`), richiede la presenza di termini identificativi obbligatori (*"open", "frame", "bench", "banchetto", "xproto", "hydra"*).
3. **Filtro Prezzo/GB**: Per le RAM, calcola il rapporto €/GB ed esclude immediatamente offerte con prezzo unitario superiore alla soglia.

### Fase 2: Deep-Fetch Descrizioni Mancanti
Per i candidati plausibili che presentano descrizioni incomplete o assenti dal catalogo base (come spesso accade su Vinted dove il titolo catalogo è generico), il sistema effettua il download asincrono della scheda completa dell'annuncio con un pool a concorrenza controllata.

### Fase 3: Targeted Multimodal Vision AI & OCR (Qwen2.5-VL-32B)
I candidati vengono raggruppati in batch e inviati al modello Multimodale/Vision (**Qwen2.5-VL-32B**):
- Il modello ispeziona direttamente le immagini caricate (etichette, connettori, pin, proporzioni del telaio).
- Esegue l'OCR del Part Number (P/N) del produttore.
- Verifica il conteggio degli slot di espansione PCIe posteriori per confermare il form factor ATX (7+), mATX (4-5) o Mini-ITX (1-3).
- Genera un verdetto strutturato `ACCEPTED` o `REJECTED` con motivazione ed evidenza fotografica.

---

## ⚙️ Variabili di Configurazione AI & Setup Qwen2.5-VL-32B

Il modello raccomandato e preconfigurato è **`qwen2.5-vl:32b`** (occupa $\approx 22\text{--}24\text{ GB}$ VRAM in quantizzazione 4/5-bit, perfetto per sistemi con 35 GB di memoria):

```bash
# Esecuzione in locale con Ollama
ollama run qwen2.5-vl:32b
```

Configurazione `.env`:

```env
AI_VISION_ENABLED=true
AI_BASE_URL=http://localhost:11434/v1
AI_MODEL=qwen2.5-vl:32b
AI_API_KEY=ollama
MAX_AI_INSPECTIONS=20
```
