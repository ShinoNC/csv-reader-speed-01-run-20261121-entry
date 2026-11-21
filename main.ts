// Driver for csv-fast: the harness runs `node /bot/main.ts` (node22). It reads
// every case from /input/cases.json (a JSON array of {id, input}), answers each
// one alone with run() from solve.js, and writes /output/answers.json: a JSON
// array of the answers, one per case and in the cases' order. Outside a
// container MAKEFUN_INPUT_DIR and MAKEFUN_OUTPUT_DIR stand in for /input and
// /output.

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setFlagsFromString } from "node:v8";

// V8's incremental marking off, set before solve.js is imported so all of its
// work runs under it (the rules: the house baseline runs with
// --no-incremental-marking, and an entry may tune V8's flags too).
setFlagsFromString("--no-incremental-marking");

const solve = await import(new URL("./solve.js", import.meta.url).href);
const run = solve.run as (input: unknown) => unknown;

const inputDir = process.env.MAKEFUN_INPUT_DIR ?? "/input";
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";

const cases = JSON.parse(readFileSync(join(inputDir, "cases.json"), "utf8")) as Array<{
  id: string;
  input: unknown;
}>;
const answers: unknown[] = new Array(cases.length);
for (let i = 0; i < cases.length; i++) answers[i] = run(cases[i]!.input);
writeFileSync(join(outputDir, "answers.json"), JSON.stringify(answers));
