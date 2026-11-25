#!/usr/bin/env node

// Writes the suite into <dest> in the layout `claude plugin eval` reads: one folder per case with
// its case.yaml and a setup.sh that creates the sample project in the run's empty workspace.
// The project has one source, fork/suite/project, so every case sees the same code.
//
//   node fork/suite/assemble.mjs <dest>

import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const SUITE = dirname(fileURLToPath(import.meta.url));
const dest = process.argv[2];
if (!dest) {
  console.error("usage: node fork/suite/assemble.mjs <dest>");
  process.exit(2);
}

const walk = (dir) => readdirSync(dir).flatMap((name) => (statSync(join(dir, name)).isDirectory() ? walk(join(dir, name)) : [join(dir, name)]));
const project = join(SUITE, "project");
const files = walk(project).sort().map((path) => [relative(project, path).split("\\").join("/"), readFileSync(path, "utf8")]);

const setup = [
  "#!/usr/bin/env bash",
  "set -euo pipefail",
  ...files.flatMap(([path, body], index) => [`mkdir -p "$(dirname "${path}")"`, `cat > "${path}" <<'FILE_${index}'`, body.replace(/\n$/, ""), `FILE_${index}`]),
  "if command -v git >/dev/null 2>&1; then",
  // No template: git's sample hooks are readable in .git/hooks and use words a run must not see.
  "  git init -q --template= . && git add -A",
  '  git -c user.name="Dana Okafor" -c user.email="dana@orders.example" commit -q -m "retry failed provider calls with backoff"',
  '  git config user.name "Dana Okafor" && git config user.email "dana@orders.example"',
  // The sandbox home gets a git identity named after the tool that made it. Replace it, but only
  // when this workspace sits directly in $HOME, as the sandbox lays it out (home/cwd).
  '  if [ -f "$HOME/.gitconfig" ] && [ "$(cd .. && pwd -P)" = "$(cd "$HOME" && pwd -P)" ]; then',
  '    git config --global user.name "Dana Okafor" && git config --global user.email "dana@orders.example"',
  "  fi",
  "fi",
  "",
].join("\n");
for (const [path, body] of files) if (/^FILE_\d+$/m.test(body)) throw new Error(`${path} contains a heredoc marker`);

const cases = readdirSync(join(SUITE, "cases")).filter((name) => name.endsWith(".yaml")).sort();
for (const file of cases) {
  const dir = join(dest, basename(file, ".yaml"));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "case.yaml"), readFileSync(join(SUITE, "cases", file)));
  writeFileSync(join(dir, "setup.sh"), setup, { mode: 0o755 });
}
console.log(`${cases.length} cases in ${dest}`);
