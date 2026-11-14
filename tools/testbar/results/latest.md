# Photo check accuracy (synthetic test bar)

2026-11-14 21:55 UTC · model `claude-haiku-5-5` · 30 photos (24 clean, 6 bad) · seed 7

Synthetic images drawn by `generate.mjs` with a known answer key. They test the pipeline and catch regressions; real photos of the shop's bar are the real test.

## Clean photos: 144 bin readings

| | Share |
|---|---|
| Level exactly right (all readings) | 60% (86/144) |
| Within one step (¼ pan) | 92% |
| **Pre-filled for staff** (visible, confidence not low) | 100% of bins |
| **Pre-filled and exactly right** | 60% (86/144) |
| Pre-filled and within one step | 92% |
| Left blank as "needs a look" | 0% |
| Clean photos wrongly called unusable | 0 of 24 |

**By confidence:** high 75% right (n=32) · medium 55% right (n=112) · low – right (n=0)

**By bin:** Strawberries 67% · Mango 79% · Kiwi 67% · Mochi 71% · Rainbow sprinkles 38% · Popping boba 38%

**Confusion** (rows = true level, columns = model's answer):

| true \ model | empty | ¼ | ½ | ¾ | full |
|---|---|---|---|---|---|
| empty | 32 | 1 | 0 | 0 | 0 |
| ¼ | 0 | 4 | 13 | 8 | 1 |
| ½ | 0 | 0 | 7 | 15 | 1 |
| ¾ | 0 | 0 | 2 | 30 | 6 |
| full | 0 | 0 | 2 | 9 | 13 |

## Bad photos: 4 of 6 caught

| Photo | Problem | Caught? | What the check said |
|---|---|---|---|
| 25-glare.jpg | glare | ❌ | missed (usable, problems=[]) |
| 26-glare.jpg | glare | ✅ | unusable: glare |
| 27-blur.jpg | blur | ✅ | unusable: blur |
| 28-dark.jpg | dark | ❌ | missed (usable, problems=[]) |
| 29-cutoff.jpg | cutoff | ✅ | unusable: bins_cut_off |
| 30-hand.jpg | hand | ✅ | person flagged, photo not stored |

Latency: 4393 ms average, 5800 ms slowest (3 at a time).
