#!/usr/bin/env node

// Builds pstack-sp: upstream's Claude Code tree plus the overlay in fork/overlay.
//
//   node fork/build.mjs --upstream <dir>           write the tree into the repository root
//   node fork/build.mjs --upstream <dir> --check   exit 1 if the repository differs from the build
//
// <dir> is an unmodified copy of harness/pstack/claude-code at the commit in fork/upstream.json.
// fork/sync.sh fetches it. Every change is one named step below, and each step fails when upstream
// no longer has the text it attaches to, so a sync never applies the overlay to the wrong place.

import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, posix, relative } from "node:path";
import { fileURLToPath } from "node:url";

const FORK = dirname(fileURLToPath(import.meta.url));
const ROOT = join(FORK, "..");
const args = process.argv.slice(2);
const upstreamDir = args[args.indexOf("--upstream") + 1];
const check = args.includes("--check");
if (!args.includes("--upstream") || !upstreamDir || !existsSync(join(upstreamDir, "skills"))) {
  console.error("usage: node fork/build.mjs --upstream <harness/pstack/claude-code checkout> [--check]");
  process.exit(2);
}

const config = JSON.parse(readFileSync(join(FORK, "fork.json"), "utf8"));
const pin = JSON.parse(readFileSync(join(FORK, "upstream.json"), "utf8"));
// `{{name}}` in an overlay file stands for fork/overlay/<name>.md, so shared text has one source.
const overlay = (name) =>
  readFileSync(join(FORK, "overlay", name), "utf8")
    .trimEnd()
    .replace(/\{\{([a-z-]+)\}\}/g, (_, part) => overlay(`${part}.md`));
const OVERLAY = {
  poteto: overlay("poteto-mode-section.md"),
  adapter: overlay("adapter-section.md"),
  routing: overlay("routing-paragraph.md"),
  worker: overlay("worker-bullet.md"),
  banner: overlay("readme-banner.md"),
};

// The build owns exactly what upstream ships. A new top-level entry upstream is a decision for a person.
const OWNED = new Set(["skills", "agents", "docs", "README.md", "LICENSE", "plugin.json", ".claude-plugin"]);
const MANIFESTS = ["plugin.json", ".claude-plugin/plugin.json"];
const ADAPTER = "docs/harness/claude-code.md";
const ADAPTER_LINE = /^In Claude Code, read \[the Claude Code adapter\]\(\.\.\/\.\.\/docs\/harness\/claude-code\.md\) once per session before you follow this skill\..*$/m;
const INSTALL = [
  ["/plugin marketplace add cursor/plugins", `/plugin marketplace add ${config.repo}`],
  ["/plugin install pstack@cursor-plugins", `/plugin install pstack@${config.marketplace}`],
  ["claude plugin update pstack@cursor-plugins", `claude plugin update pstack@${config.marketplace}`],
  ["select `cursor-plugins`", `select \`${config.marketplace}\``],
];

const problems = [];
const changes = new Map();
const note = (path, what) => changes.set(path, [...(changes.get(path) ?? []), what]);
const fail = (message) => problems.push(message);

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    if (name === ".git" || name === ".DS_Store" || name === "node_modules") return [];
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}
const load = (path) => ({ bytes: readFileSync(path), executable: (statSync(path).mode & 0o111) !== 0 });

const files = new Map(walk(upstreamDir).map((path) => [relative(upstreamDir, path).split("\\").join("/"), load(path)]));
const text = (path) => files.get(path).bytes.toString("utf8");
const set = (path, value) => (files.get(path).bytes = Buffer.from(value));

// Replaces the one place `anchor` matches, and fails loudly when upstream moved it.
function edit(path, anchor, replacement, what) {
  if (!files.has(path)) return fail(`${path} is gone upstream, so "${what}" has nowhere to go`);
  const before = text(path);
  const count = before.split(anchor).length - 1;
  if (count !== 1) return fail(`${path}: expected one "${anchor}" for "${what}", found ${count}`);
  set(path, before.replace(anchor, replacement));
  note(path, what);
}

// Guards for the two properties the fork promises: no hook, and the operator decides when a skill runs.
for (const top of new Set([...files.keys()].map((path) => path.split("/")[0]))) {
  if (!OWNED.has(top)) fail(`upstream now ships ${top}, which this build does not know. Decide whether the fork takes it, then add it to OWNED`);
}
if ([...files.keys()].some((path) => path.startsWith("hooks/")) || /"hooks"\s*:/.test(text(MANIFESTS[1]))) {
  fail("upstream now ships a hook. pstack-sp promises none, so decide before you sync");
}
const skills = [...files.keys()].flatMap((path) => path.match(/^skills\/([^/]+)\/SKILL\.md$/)?.[1] ?? []).sort();
const visible = skills.filter((skill) => !/^disable-model-invocation:\s*true\s*$/m.test(text(`skills/${skill}/SKILL.md`)));
if (visible.join() !== [...config.visibleSkills].sort().join()) {
  fail(`skills the model can invoke on its own are [${visible}], expected [${config.visibleSkills}]. The overlay says "all but the setup skill", so update the overlay or fork.json`);
}
for (const [path, phrase] of Object.entries(config.evidence)) {
  if (!files.has(path) || !text(path).includes(phrase)) fail(`${path} no longer says "${phrase}", which the overlay relies on`);
}

// 1. A skill that names another bundled skill says how to run it. Upstream gives a path already when
//    the line links to the skill's file, so those lines do not count.
function namedBy(skill) {
  const others = skills.filter((name) => name !== skill).join("|");
  const mention = new RegExp(`\\*\\*(${others})\\*\\*|\`/?(${others})\``, "g");
  const named = new Set();
  for (const path of files.keys()) {
    if (!path.startsWith(`skills/${skill}/`) || !path.endsWith(".md")) continue;
    for (const line of text(path).split("\n")) {
      for (const match of line.matchAll(mention)) {
        const name = match[1] ?? match[2];
        if (!line.includes(`(../${name}/`)) named.add(name);
      }
    }
  }
  return [...named].sort();
}
const routers = [];
for (const skill of skills) {
  const path = `skills/${skill}/SKILL.md`;
  const named = namedBy(skill);
  if (skill === "poteto-mode" || named.length === 0 || config.mapsOnly[skill]) continue;
  const body = text(path);
  const anchor = body.match(ADAPTER_LINE)?.[0] ?? body.match(/^# .*$/m)?.[0];
  if (!anchor) {
    fail(`${path} names ${named.join(", ")} but has no heading to put the routing paragraph under`);
    continue;
  }
  edit(path, anchor, `${anchor}\n\n${OVERLAY.routing}`, `routing paragraph (names ${named.join(", ")})`);
  routers.push(skill);
}

// 2. poteto-mode is the front door, and Claude Code re-attaches it after a compaction, so it carries the rule in full.
edit("skills/poteto-mode/SKILL.md", "## Non-negotiables\n", `${OVERLAY.poteto}\n\n## Non-negotiables\n`, 'section "Running a skill"');

// 3. worker.md is how the operator's rules reach an agent that never saw poteto-mode.
const firstBullet = text("skills/poteto-mode/worker.md").match(/^- If you start an agent, .*$/m)?.[0] ?? "- If you start an agent, ";
edit("skills/poteto-mode/worker.md", firstBullet, `${firstBullet}\n${OVERLAY.worker}`, "two bullets on skills a kickoff names");

// 4. The adapter holds the same rule for every other entry point.
edit(ADAPTER, "## Tools\n", `${OVERLAY.adapter}\n\n## Tools\n`, 'section "Running a pstack skill"');

// 5. The fork installs from its own marketplace, and says whose work this is.
edit("README.md", "# pstack\n", `# pstack\n\n${OVERLAY.banner}\n`, "fork notice");
let installs = 0;
for (const path of files.keys()) {
  if (!path.endsWith(".md")) continue;
  let body = text(path);
  let count = 0;
  for (const [from, to] of INSTALL) {
    count += body.split(from).length - 1;
    body = body.split(from).join(to);
  }
  if (count === 0) continue;
  set(path, body);
  note(path, `install commands (${count})`);
  installs += count;
  if (/cursor-plugins/.test(body)) fail(`${path} still names the cursor-plugins marketplace after the install commands were rewritten`);
}
if (installs === 0) fail("no install command found to rewrite. Upstream reworded them");

// 6. Claude Code keeps users on a version until the string changes, so the fork's revision is part of it.
const upstreamVersion = JSON.parse(text(MANIFESTS[1])).version;
const version = `${upstreamVersion}-sp.${config.revision}`;
for (const path of MANIFESTS) {
  const url = `https://github.com/${config.repo}`;
  const body = text(path)
    .replace(/("version":\s*")[^"]*(")/, `$1${version}$2`)
    .replace(/("homepage":\s*")[^"]*(")/, `$1${url}$2`)
    .replace(/("repository":\s*")[^"]*(")/, `$1${url}$2`);
  const parsed = JSON.parse(body);
  if (parsed.version !== version || parsed.homepage !== url || parsed.repository !== url) fail(`${path} lacks a version, homepage, or repository field to rewrite`);
  set(path, body);
  note(path, `version ${version}, homepage, repository`);
}

// Every relative link in a file the overlay touched must resolve, and so must the anchor the routing paragraph uses.
const LINK = /\]\(([^)\s]+)\)/g;
function anchors(path) {
  return new Set(
    text(path)
      .split("\n")
      .flatMap((line) => line.match(/^#{1,6}\s+(.*?)\s*$/)?.[1] ?? [])
      .map((heading) => heading.replace(/[`*]/g, "").toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, "").replace(/\s/g, "-")),
  );
}
for (const path of changes.keys()) {
  if (!path.endsWith(".md")) continue;
  for (const [, href] of text(path).matchAll(LINK)) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(href)) continue;
    const [target, anchor] = href.split("#");
    const resolved = target ? posix.normalize(posix.join(posix.dirname(path), target)).replace(/\/$/, "") : path;
    if (resolved === "FORK.md") continue;
    const isDir = [...files.keys()].some((key) => key.startsWith(`${resolved}/`));
    if (!files.has(resolved) && !isDir) fail(`${path} links to ${href}, which is not in the tree`);
    else if (anchor && files.has(resolved) && resolved.endsWith(".md") && !anchors(resolved).has(anchor)) fail(`${path} links to ${href}, but ${resolved} has no such heading`);
  }
}

for (const problem of problems) console.log(`FAIL ${problem}`);
if (problems.length > 0) process.exit(1);

const total = files.size;
const rows = [...changes].sort(([a], [b]) => a.localeCompare(b)).map(([path, what]) => `| \`${path}\` | ${what.join("; ")} |`);
files.set("fork/CHANGES.md", {
  executable: false,
  bytes: Buffer.from(
    [
      "# Differences from upstream",
      "",
      "Generated by `fork/build.mjs`. Do not edit. `fork/sync.sh --check` fails when this file or the tree is out of date.",
      "",
      `- Upstream: ${pin.repo} at \`${pin.commit}\` (${pin.committed}), path \`${pin.path}\`, pstack ${upstreamVersion}.`,
      `- This build: pstack ${version}.`,
      `- ${total} files in upstream's tree. ${total - changes.size} are byte-identical here. ${changes.size} differ.`,
      `- ${skills.length} skills. ${skills.length - visible.length} still load only from a slash command. The model can invoke on its own: ${visible.join(", ")}, as upstream.`,
      "- No hook, in upstream or here.",
      ...Object.entries(config.mapsOnly).map(([skill, why]) => `- \`${skill}\` names skills but gets no routing paragraph. ${why}`),
      "",
      "| File | What the overlay does |",
      "| --- | --- |",
      ...rows,
      "",
    ].join("\n"),
  ),
});

if (check) {
  const onDisk = new Map();
  for (const top of [...OWNED, "fork/CHANGES.md"]) {
    const path = join(ROOT, top);
    if (!existsSync(path)) continue;
    for (const file of statSync(path).isDirectory() ? walk(path) : [path]) onDisk.set(relative(ROOT, file).split("\\").join("/"), load(file));
  }
  onDisk.delete(".claude-plugin/marketplace.json");
  const drifted = [...new Set([...files.keys(), ...onDisk.keys()])].sort().filter((path) => {
    const [want, have] = [files.get(path), onDisk.get(path)];
    return !want || !have || !want.bytes.equals(have.bytes) || want.executable !== have.executable;
  });
  for (const path of drifted.slice(0, 20)) console.log(path);
  if (drifted.length > 0) {
    console.log(`${drifted.length} files differ from upstream ${pin.commit.slice(0, 7)} plus the overlay. Run fork/sync.sh and commit the result.`);
    process.exit(1);
  }
  console.log(`up to date: upstream ${pin.commit.slice(0, 7)} plus the overlay, ${changes.size} of ${total} files differ from upstream.`);
} else {
  for (const top of OWNED) {
    if (top === ".claude-plugin") rmSync(join(ROOT, MANIFESTS[1]), { force: true });
    else rmSync(join(ROOT, top), { recursive: true, force: true });
  }
  for (const [path, { bytes, executable }] of files) {
    mkdirSync(dirname(join(ROOT, path)), { recursive: true });
    writeFileSync(join(ROOT, path), bytes);
    chmodSync(join(ROOT, path), executable ? 0o755 : 0o644);
  }
  console.log(`pstack ${version}: ${total} upstream files, ${changes.size} changed, routing paragraph in ${routers.length} skills (${routers.join(", ")}).`);
}
