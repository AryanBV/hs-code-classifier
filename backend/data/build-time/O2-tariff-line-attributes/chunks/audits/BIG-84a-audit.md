# BIG-84a Audit — 2026-05-27

## Verdict: KEEP existing 177 records + EXTEND with remaining 185

## Evidence

### 1. Helper-script check
`chunks/scripts/` contains only `emit-BIG-52.js` (the disallowed BIG-52 templater).
No `emit-BIG-84*.js`, no `gen-*.js`, no Ch.84-specific helper present.
Verdict: PASS — BIG-84a was not produced by a templater script.

### 2. Sample of 15 records at spread indices (0,12,25,38,51,64,77,90,103,116,129,142,155,168,176)

| idx | code        | function_                                                      | distinguishing notes                                   |
|----:|-------------|----------------------------------------------------------------|--------------------------------------------------------|
|   0 | 8401.10.00  | ["nuclear-reactor","fission-power-generation"]                 | Nuclear reactor (complete equipment).                  |
|  12 | 8402.90.90  | ["steam-boiler"]                                               | Other parts of steam/vapour boilers.                   |
|  25 | 8406.90.00  | ["steam-turbine"]                                              | Parts of steam/vapour turbines.                        |
|  38 | 8407.90.10  | ["internal-combustion-engine","spark-ignition"]                | Other petrol SI engines, India sub-line.               |
|  51 | 8409.91.12  | ["internal-combustion-engine","spark-ignition","piston"]       | Pistons for SI engines (India sub-line).               |
|  64 | 8409.99.20  | ["internal-combustion-engine","compression-ignition","diesel-engine","fuel-nozzle"] | Fuel nozzles for diesel engines. |
|  77 | 8411.11.00  | ["jet-propulsion","turbojet"]                                  | Turbojet, thrust <=25 kN (subheading-derived).         |
|  90 | 8412.10.00  | ["jet-propulsion","reaction-engine"]                           | Reaction engines other than turbo-jets.                |
| 103 | 8412.90.20  | ["steam-engine","vapour-power"]                                | Parts of steam engines not incorporating boilers.      |
| 116 | 8413.50.10  | ["pump","metering","dosing"]                                   | Metering/dosing reciprocating PD pump.                 |
| 129 | 8413.70.96  | ["pump","slurry-pump","abrasive-handling"]                     | Slurry pump for mining.                                |
| 142 | 8413.92.00  | ["liquid-elevator"]                                            | Parts of liquid elevators.                             |
| 155 | 8414.51.30  | ["air-circulation","ventilation"]                              | Pedestal fan, electric, <125W.                         |
| 168 | 8414.80.30  | ["compression","air-charging","turbocharger"]                  | Turbocharger (exhaust-driven).                         |
| 176 | 8414.90.90  | ["air-pump","compression","ventilation"]                       | Other parts of 8414 (residual).                        |

All 15 samples have function_ arrays SPECIFIC to the machine described. None are generic
"machinery"-only tags. extraction_notes cite distinguishing features (thrust range,
subheading inheritance, India-specific status, electrical rating).

### 3. Templating-fingerprint scan
- Unique function_ array signatures: 114 / 177 records = 64% diversity.
- Top duplicates are explained by parent-subheading clusters (multiple India sub-lines
  under one SI-engine displacement bracket etc.), with discrimination preserved in
  processing_state (capacity/displacement/voltage strings).
- extraction_notes are not boilerplate; each cites the specific feature.
- No generic "machinery" placeholder strings dominate.

Verdict: NO templating fingerprints found. The 177 existing records are genuine
per-code reasoning consistent with the validation-set vocabulary (8413.11.99
fuel-dispenser, 8445.20.14 roving-frame, 8472.90.91 word-processor).

## Action
- KEEP existing 177 records (codes 8401.10.00 -> 8414.90.90).
- EXTEND with 185 new records (codes 8415.10.10 -> 8429.52.00) covering the
  remaining input. Total target: 362 records, matching `input/BIG-84a.json.code_count`.
- Maintain identical 43-field schema, validation-set vocabulary, per-code reasoning.
