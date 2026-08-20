# 🧭 Semantic Routing & Prompting

Il sistema include meccanismi intelligenti per collegare le intenzioni dell'utente con le regole hardware corrette, sia in maniera completamente automatica sia tramite prompt guidati.

---

## 🤖 Semantic Router Automatico (`detectRuleModuleId`)

Quando viene eseguita una ricerca senza specificare `ruleModuleId`, la funzione `detectRuleModuleId(searchQuery)` in `shared-mcp-utils` analizza il testo della query ed assegna la regola ottimale:

```typescript
// Esempi di risoluzione automatica:
"case pc cooler master h500"        --> "case_atx"
"banchetto test open frame itx"     --> "case_open_itx"
"banchetto bc1 micro atx"           --> "case_open_matx"
"open frame thermaltake core p3"    --> "case_open_atx"
"case compatto fractal terra"       --> "case_itx"
"case micro-atx asus ap201"         --> "case_matx"
"alimentatore sfx corsair sf750"    --> "psu_sfx"
"scheda madre b650m"                --> "matx_motherboard"
"ram ddr5 32gb cl30"                --> "ram_ddr5"
```

---

## 🛠️ Tool MCP: `get_available_hardware_rules`

Tutti i server MCP esportano il tool `get_available_hardware_rules`. Questo restituisce la mappa dinamica di tutti i moduli caricati:

```json
{
  "case_open_itx": "Case PC Open Frame Mini-ITX (Open Bench ITX / SFF) - ...",
  "case_open_matx": "Case PC Open Frame Micro-ATX (Open Bench mATX) - ...",
  "case_open_atx": "Case PC Open Frame ATX (Open Bench ATX / E-ATX) - ...",
  "case_open": "Case PC Aperto / Open Frame / Banchetto di Test - ...",
  "case_closed": "Case PC Chiuso (Standard Chassis / Torre / Cubo) - ...",
  "case_atx": "Case PC ATX (Mid-Tower / Full-Tower / Open Frame ATX) - ...",
  "case_matx": "Case PC Micro-ATX (mATX / Mini-Tower / Open Frame mATX) - ...",
  "case_itx": "Case PC Mini-ITX (SFF / Open Frame ITX) - ...",
  "case_pc": "Case PC (Generico) - ...",
  "matx_motherboard": "Scheda Madre Micro-ATX (mATX) - ...",
  "psu_sfx": "Alimentatore SFX / SFX-L - ...",
  "ram_ddr5": "RAM DDR5 Desktop (DIMM / UDIMM) - ...",
  "ram": "Memoria RAM (Generico) - ..."
}
```

---

## 🧠 Prompt Esperto MCP: `hardware_expert_search`

I client MCP possono invocare il prompt `hardware_expert_search` per guidare un agente autonomo nella revisione manuale:

```json
{
  "name": "hardware_expert_search",
  "arguments": {
    "rule_module_id": "case_open_itx",
    "user_target_specs": "Banchetto Mini-ITX compatto in alluminio"
  }
}
```

Il prompt inietta automaticamente le regole globali, le istruzioni visive, i comandi operativi per il download delle immagini (`curl`) e la visualizzazione (`view_file`), garantendo una revisione conforme alle direttive "Zero Assunzioni".
