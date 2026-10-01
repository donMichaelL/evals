// Summarise a promptfoo run: points per case, then the total.
//   npx promptfoo@latest eval -j 1 -o results.json && node score.mjs results.json
import { readFileSync } from "node:fs";

const path = process.argv[2] || "results.json";
const data = JSON.parse(readFileSync(path, "utf8"));

// promptfoo output: { results: { results: [ { gradingResult: { componentResults } } ] } }
const rows = data.results?.results ?? data.results ?? [];

const oneLine = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

let earned = 0;
let max = 0;
const lines = [];

for (const row of rows) {
  const name = row.testCase?.description || oneLine(row.vars?.text) || `case ${row.testIdx}`;
  const comps = row.gradingResult?.componentResults ?? [];

  let got = 0;
  let outOf = 0;
  for (const c of comps) {
    const w = c.assertion?.weight ?? 1;
    outOf += w;
    if (c.pass) got += w;
  }
  earned += got;
  max += outOf;

  // row.error carries the assertion's failure reason too, so prefer the reply
  // itself and fall back to the error only when nothing came back.
  const reply = oneLine(row.response?.output?.text) || (row.error ? `ERROR: ${oneLine(row.error)}` : "");
  lines.push({ ok: got === outOf && outOf > 0, points: `${got}/${outOf}`, name, reply });
}

const width = Math.max(0, ...lines.map((l) => l.points.length));
for (const l of lines) {
  console.log(`  ${l.ok ? "✓" : "✗"}  ${l.points.padStart(width)}  ${l.name}`);
  console.log(`     ${" ".repeat(width)}  ↳ ${clip(l.reply || "(empty reply)", 90)}`);
}

const pct = max ? Math.round((earned / max) * 100) : 0;
console.log(`\n  POINTS: ${earned} / ${max} (${pct}%)`);
