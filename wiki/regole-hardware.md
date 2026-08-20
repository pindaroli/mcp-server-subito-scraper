# 🛡️ Sistema di Regole Hardware & Validazione "Zero Assunzioni"

Il sistema di regole hardware adotta la politica **"Zero Assunzioni"**: un annuncio di hardware usato viene considerato valido solo se supportato da prove certe ricavate da testo, part number o fotografie nitide.

---

## 🧭 Matrice Ortogonale per i Case PC

Le regole per i Case PC sono strutturate secondo due dimensioni **indipendenti e non mutuamente esclusive**:

```
                       ┌─────────────────────────────────────────────────────────┐
                       │           DIMENSIONE 1: TIPOLOGIA STRUTTURALE           │
                       ├────────────────────────────┬────────────────────────────┤
                       │  CASE CHIUSO (Closed)      │  OPEN BENCH / OPEN FRAME   │
┌─────────┬────────────┼────────────────────────────┼────────────────────────────┤
│         │ ATX        │ `case_atx` (Chiuso)        │ `case_open_atx`            │
│         │            │ (es. Corsair 4000D, NZXT)  │ (es. Open Benchtable BC1,  │
│         │            │                            │  Thermaltake Core P3/P5)   │
│DIMENSIONE├────────────┼────────────────────────────┼────────────────────────────┤
│    2:   │ Micro-ATX  │ `case_matx` (Chiuso)       │ `case_open_matx`           │
│ MOTHER- │ (mATX)     │ (es. ASUS AP201, CM Q300L) │ (es. DimasTech Mini, QDIY) │
│  BOARD  ├────────────┼────────────────────────────┼────────────────────────────┤
│         │ Mini-ITX   │ `case_itx` (Chiuso)        │ `case_open_itx`            │
│         │ (ITX/SFF)  │ (es. Fractal Terra, NR200) │ (es. XTIA Xproto, BC1 Mini,│
│         │            │                            │  Hydra Mini, Streacom DA6) │
└─────────┴────────────┴────────────────────────────┴────────────────────────────┘
```

### Moduli Case PC Disponibili
1. **`case_open_itx`**: Open frame per Mini-ITX ($170\times 170\text{ mm}$, volume ridotto, SFX PSU).
2. **`case_open_matx`**: Open frame per Micro-ATX ($244\times 244\text{ mm}$, $4\text{--}5$ slot PCIe).
3. **`case_open_atx`**: Open frame per ATX ed E-ATX ($305\times 244\text{ mm}$, $\ge 7$ slot PCIe).
4. **`case_open`**: Qualsiasi telaio o banchetto aperto indipendentemente dalla motherboard.
5. **`case_closed`**: Chassis standard con paratie chiuse (vetro temperato, mesh, alluminio).
6. **`case_atx`**: Case ATX (aperto o chiuso).
7. **`case_matx`**: Case Micro-ATX (aperto o chiuso).
8. **`case_itx`**: Case Mini-ITX / SFF (aperto o chiuso).
9. **`case_pc`**: Regola master universale con interpolazione libera `{{user_target_specs}}`.

---

## ⚡ Moduli Componenti Elettronici

### 1. `ram_ddr5` — Memoria RAM DDR5 Desktop
- **Criterio UDIMM vs SO-DIMM**:
  - *Accetta*: Moduli lunghi standard DIMM / UDIMM a 288 pin per schede madri Desktop.
  - *Scarta*: Moduli compatti SO-DIMM a 262 pin per computer portatili (es. Kingston Fury Impact, Crucial SODIMM).
  - *Scarta*: Moduli server RDIMM (Registered ECC) e schede video con memoria GDDR5.
- **Decodifica Part Number (P/N)**:
  - *SK Hynix*: `HMCG78...` (Desktop OK) vs `HMCG66...` (Laptop NO)
  - *Samsung*: `M378...` (Desktop OK) vs `M425...` (Laptop NO)
  - *Kingston*: `KF5...BB...` / `KF5...BE...` (Desktop OK) vs `KF5...IB...` (Laptop NO)
  - *Crucial*: `...UC...` (Desktop OK) vs `...SC...` (Laptop NO)
  - *Corsair*: `CMK...` / `CMP...` (Desktop OK) vs `CMSX...` (Laptop NO)

### 2. `matx_motherboard` — Scheda Madre Micro-ATX
- *Accetta*: Schede madri fino a $244\times 244\text{ mm}$ (4 slot PCIe, 4 slot RAM).
- *Scarta*: Mini-ITX ($170\times 170\text{ mm}$, 1 PCIe) e ATX standard ($305\text{ mm}$ altezza).

### 3. `psu_sfx` — Alimentatore SFX / SFX-L
- *Accetta*: Formato SFX ($125\times 100\times 63.5\text{ mm}$) e SFX-L ($125\times 125\times 63.5\text{ mm}$).
- *Scarta*: Alimentatori ATX standard ($150\times 140\times 86\text{ mm}$) o formati Flex-ATX/TFX.
