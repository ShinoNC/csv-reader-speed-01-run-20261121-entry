# csv-fast v1 — measured numbers (local, Node 24.22.1, practice set)

Practice set: 6 cases, 10,456,159 chars of CSV (~10.5 MB), 63,692 rows,
~750k fields. Local machine is a shared 1.5-CPU VM, so numbers are noisy;
always compare medians of alternating runs, never single runs.

## Head-to-head, whole entry (alternating runs, 9 each)

`node main.ts` with `MAKEFUN_INPUT_DIR=<kit>/practice/input`,
`MAKEFUN_OUTPUT_DIR=/tmp/out-*`, wall ms per run:

| run | baseline csv-reader 1.0.0 | csv-fast v1 |
|-----|---------------------------|-------------|
| 1   | 1585 | 708 |
| 2   | 1385 | 668 |
| 3   | 1368 | 711 |
| 4   | 1550 | 699 |
| 5   | 1404 | 634 |
| 6   | 1315 | 650 |
| 7   | 1545 | 757 |
| 8   | 1566 | 612 |
| 9   | 1650 | 720 |

- Baseline: median 1545 ms, trimmed mean (drop 2 fastest + 2 slowest) 1490 ms.
- csv-fast v1: median 699 ms, trimmed mean 687 ms.
- **Speedup: ~2.17x trimmed mean, ~2.21x median.**

The harness measures CPU time net of the null-entry control, trimmed mean of
9 timed runs after 1 warm-up, in a fresh 1-CPU container per run (Node
26.13.1 there, 24.22.1 here). The local wall-time ratio is the proxy; the
gap (~800 ms) dwarfs run noise (~±100 ms), so the 95% bar vs the baseline
should clear by a wide margin.

## Phase split (in-process, steady state)

- `readFileSync` cases.json: ~45–85 ms.
- `JSON.parse` cases.json: ~38–47 ms.
- `run()` all 6 cases: baseline 491–904 ms (median ~582); csv-fast 88–239 ms
  (median ~110–184 across benches). Parse-only speedup ~3–5x (noisy).
- `JSON.stringify` answers: baseline 184–714 ms (median ~333, spikes look
  like major GC from rope strings); csv-fast 98–148 ms (median ~104).
  Sliced strings stringify faster than the reference's rope-built fields.
- `writeFileSync` answers.json: ~37–55 ms.

## Output identity

`JSON.stringify` of v1's answers is **byte-identical** to the baseline's
(`identical-bytes=true` in the phase bench). The two executions of the
grade-local regrade reproduced byte for byte.

## Correctness

- Practice set via kit `grade-local --driver process`: **6/6, passed 1**,
  L1 regrade reproduced byte for byte.
- Differential fuzz vs the oracle (draw.ts, fresh seeds): **60/60 cases**
  identical across 10 seeds (5 + 5), plus the 6 practice cases.
- Hand-written edge cases vs the oracle (empty text, BOM only, lone CRs,
  `"""`, quote junk `x"y`, CRLF/lone CR in quotes, unterminated quotes at
  EOF, header/no-header): **160/160 identical**.

## Variant tested and rejected

- `fieldEnd` via three `indexOf` calls instead of the charCodeAt loop:
  correct (6/6) but slower — median run() 174 ms vs 109 ms. Each indexOf
  scans to the next line break even for a 7-char field. Kept the loop.
