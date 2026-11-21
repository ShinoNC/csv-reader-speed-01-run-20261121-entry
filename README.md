# csv-fast — a faster drop-in for csv-reader 1.0.0

[![make.fun rank](https://make.fun/api/competitions/csv-reader-speed-01-run-20261121/rank.svg?repo=ShinoNC/csv-reader-speed-01-run-20261121-entry)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
[![make.fun reward](https://make.fun/api/competitions/csv-reader-speed-01-run-20261121/reward.svg?repo=ShinoNC/csv-reader-speed-01-run-20261121-entry)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
[![make.fun entry](https://make.fun/api/badge.svg?repo=ShinoNC/csv-reader-speed-01-run-20261121-entry)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)

Entry for [csv-reader-speed-01-run-20261121](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
($100, top 10 × $10): `solve.js` answers exactly as csv-reader 1.0.0 does for
every input `{text, header}` — `{columns, rows, errors}` — but faster.

## How it is faster

The reference reads one character at a time and builds every field a
character at a time. This reader does the same reading, but jumps:

- A record whose line holds no quote is one slice split on commas.
- An unquoted field is one slice to the next comma, LF or CR.
- A quoted field is one slice unless it holds a doubled quote or a line
  break, in which case its parts are joined (doubles folded, CR/LF read
  as LF).

Nothing is cached from one `run()` call to the next; every answer is built
fresh from its own input. No dependencies, no WASM, no native code.

## Files

- `solve.js` — the reader: `run(input)` returns csv-reader 1.0.0's answer.
- `main.ts` — the driver: reads `/input/cases.json`, answers each case with
  `run`, writes `/output/answers.json`. Turns V8's incremental marking off
  before importing `solve.js`, as the house baseline does.
- `LICENSE` — MIT.

## Local check

```
MAKEFUN_INPUT_DIR=<kit>/practice/input MAKEFUN_OUTPUT_DIR=/tmp/out node main.ts
```

then score `/tmp/out/answers.json` against the kit's
`practice/reference/expected.json` with the kit scorer.

## Measured (local, Node 24, practice set, 6 cases, 10.5 MB)

- Baseline csv-reader 1.0.0 (house driver): 1315–1650 ms wall, median 1545 ms,
  trimmed mean 1490 ms (9 alternating runs).
- csv-fast v1: 612–757 ms wall, median 699 ms, trimmed mean 687 ms.
- **Speedup ~2.17x trimmed mean (~2.21x median).** Parse-only ~3–5x.
- Correctness: practice 6/6 (grade-local passed 1, byte-identical regrade),
  fuzz 60/60 fresh cases across 10 seeds, edge cases 160/160. Full numbers:
  `BENCH.md`.
