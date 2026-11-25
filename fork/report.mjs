#!/usr/bin/env node

// Turns the results of fork/eval.sh into one table per question:
//   which reads the steps call for happened, how much restraint each variant kept,
//   what each variant cost, and every pstack file each variant opened.
// It also writes misses.md: what the agent said in each run that skipped a read.
//
//   node fork/report.mjs <out dir of one fork/eval.sh run>

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const out = process.argv[2];
if (!out || !existsSync(join(out, "variants.tsv"))) {
  console.error("usage: node fork/report.mjs <out dir of one fork/eval.sh run>");
  process.exit(2);
}

const variants = readFileSync(join(out, "variants.tsv"), "utf8")
  .trim()
  .split("\n")
  .map((line) => line.split("\t"))
  .map(([dir, label]) => ({ dir, label, file: join(out, dir, "aggregate-result.json") }))
  .filter((variant) => existsSync(variant.file))
  .map((variant) => ({ ...variant, result: JSON.parse(readFileSync(variant.file, "utf8")) }));
if (variants.length === 0) {
  console.error(`no results under ${out}. Every variant failed before it wrote one.`);
  process.exit(1);
}

// A trace is one JSON message per line. Tool calls sit at different depths for the main agent
// and for subagents, so find them wherever they are.
function* blocks(value) {
  if (Array.isArray(value)) for (const item of value) yield* blocks(item);
  else if (value && typeof value === "object") {
    if (value.type === "tool_use" || value.type === "text") yield value;
    for (const child of Object.values(value)) yield* blocks(child);
  }
}
function readTrace(path) {
  if (!path || !existsSync(path)) return null;
  const trace = { files: new Set(), agents: 0, withWorker: 0, withSkillPath: 0, said: [] };
  for (const line of readFileSync(path, "utf8").split("\n")) {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      continue;
    }
    const fromAgent = message.type === "assistant" || message.message?.role === "assistant";
    for (const block of blocks(message)) {
      if (block.type === "text" && fromAgent && typeof block.text === "string") trace.said.push(block.text.trim());
      if (block.type !== "tool_use") continue;
      const input = JSON.stringify(block.input ?? {});
      if (block.name === "Read") {
        const file = input.match(/(?:skills\/[^"]+?\.md|docs\/harness\/[^"]+?\.md)/)?.[0];
        if (file) trace.files.add(file);
      }
      if (block.name === "Agent" || block.name === "Task") {
        trace.agents += 1;
        if (input.includes("worker.md")) trace.withWorker += 1;
        if (/skills\/[^"]+?\/SKILL\.md/.test(input.replace(/skills\/poteto-mode\/SKILL\.md/g, ""))) trace.withSkillPath += 1;
      }
    }
  }
  return trace;
}

const runsOf = (variant, name) => variant.result.cases.find((item) => item.name === name)?.arms?.with ?? [];
// A run that timed out or hit its turn cap is still graded on what it did. One that never reached the model is not.
const graded = (run) => (run.graders ?? []).length > 0 && !/not logged in|authentication|api error|usage limit|rate limit|cannot confine/i.test(run.error ?? "");
const cases = [...new Set(variants.flatMap((variant) => variant.result.cases.map((item) => item.name)))];
const lines = [];
const table = (head, rows) => {
  lines.push(`| ${head.join(" | ")} |`, `| ${head.map(() => "---").join(" | ")} |`, ...rows.map((row) => `| ${row.join(" | ")} |`), "");
};
const labels = variants.map((variant) => variant.label);

lines.push("# Do the runs read the skills the steps send them to?", "");
for (const variant of variants) {
  const { result } = variant;
  const plugin = result.suite?.plugins?.[0];
  lines.push(`- **${variant.label}**: pstack ${plugin?.version ?? "?"}, Claude Code ${result.claudeVersion}${result.partial ? `. Stopped early (${result.partialReason}), so its numbers are not comparable` : ""}.`);
}
lines.push("", "Each cell is runs that passed the check out of runs that finished.", "");

const section = (title, keep) => {
  const rows = [];
  for (const name of cases) {
    const checks = [...new Set(variants.flatMap((variant) => runsOf(variant, name).flatMap((run) => (run.graders ?? []).map((grader) => grader.name))))].filter(keep);
    for (const check of checks) {
      rows.push([
        name,
        check,
        ...variants.map((variant) => {
          const runs = runsOf(variant, name).filter(graded);
          const passed = runs.filter((run) => run.graders?.find((grader) => grader.name === check)?.passed).length;
          return runs.length ? `${passed}/${runs.length}` : "no run";
        }),
      ]);
    }
  }
  if (rows.length === 0) return;
  lines.push(`## ${title}`, "");
  table(["Case", "Check", ...labels], rows);
};
section("Reads the steps call for", (check) => check.startsWith("reads-"));
section("Restraint", (check) => !check.startsWith("reads-"));

lines.push("## Cost", "");
table(
  ["Case", ...labels.flatMap((label) => [`${label}: turns`, `${label}: USD`])],
  cases.map((name) => [
    name,
    ...variants.flatMap((variant) => {
      const runs = runsOf(variant, name).filter(graded);
      const mean = (key) => (runs.length ? (runs.reduce((sum, run) => sum + (run[key] ?? 0), 0) / runs.length).toFixed(key === "turns" ? 0 : 2) : "no run");
      return [mean("turns"), mean("costUsd")];
    }),
  ]),
);

const misses = [];
let traces = 0;
for (const name of cases) {
  const perVariant = variants.map((variant) => runsOf(variant, name).filter(graded).map((run) => ({ run, trace: readTrace(run.tracePath) })));
  const files = [...new Set(perVariant.flatMap((runs) => runs.flatMap(({ trace }) => (trace ? [...trace.files] : []))))].sort();
  traces += perVariant.flat().filter(({ trace }) => trace).length;
  if (files.length > 0) {
    lines.push(`## Every pstack file read: ${name}`, "");
    table(
      ["File", ...labels],
      files.map((file) => [`\`${file}\``, ...perVariant.map((runs) => `${runs.filter(({ trace }) => trace?.files.has(file)).length}/${runs.filter(({ trace }) => trace).length}`)]),
    );
    const agents = perVariant.map((runs) => runs.reduce((sum, { trace }) => ({ n: sum.n + (trace?.agents ?? 0), w: sum.w + (trace?.withWorker ?? 0), s: sum.s + (trace?.withSkillPath ?? 0) }), { n: 0, w: 0, s: 0 }));
    if (agents.some((count) => count.n > 0)) {
      table(["Subagent kickoffs", ...labels], [
        ["started", ...agents.map((count) => count.n)],
        ["name `worker.md`", ...agents.map((count) => count.w)],
        ["name a skill file", ...agents.map((count) => count.s)],
      ]);
    }
  }
  perVariant.forEach((runs, index) => {
    runs.forEach(({ run, trace }, number) => {
      const skipped = (run.graders ?? []).filter((grader) => grader.name.startsWith("reads-") && !grader.passed).map((grader) => grader.name);
      if (skipped.length === 0) return;
      misses.push(`## ${labels[index]}, ${name}, run ${number + 1}`, "", `Skipped: ${skipped.join(", ")}`, "", trace ? trace.said.filter(Boolean).join("\n\n").slice(0, 6000) : "(no transcript kept)", "");
    });
  });
}
if (traces === 0) lines.push("No transcript was found, so the list of every file read is missing. The checks above do not need it.", "");

const allZero = variants.every((variant) => variant.result.cases.every((item) => (item.arms?.with ?? []).every((run) => !(run.graders ?? []).some((grader) => grader.name.startsWith("reads-") && grader.passed))));
if (allZero) lines.push("**Every read check failed in every variant.** That usually means the runs never loaded the skill at all: look for a sign-in error above, or check that a prompt starting with `/pstack:` expands in `claude -p` on this Claude Code version.", "");

writeFileSync(join(out, "report.md"), `${lines.join("\n")}\n`);
writeFileSync(join(out, "misses.md"), misses.length ? `# What the agent said in runs that skipped a read\n\n${misses.join("\n")}\n` : "No run skipped a read.\n");
console.log(lines.join("\n"));
console.log(`Saved: ${join(out, "report.md")}`);
console.log(`What the agent said when it skipped: ${join(out, "misses.md")}`);
