#!/usr/bin/env bash
# Rebuilds pstack-sp from upstream pstack plus the overlay.
#
#   fork/sync.sh            rebuild from the commit pinned in fork/upstream.json
#   fork/sync.sh --check    exit 1 unless the repository equals that commit plus the overlay
#   fork/sync.sh <ref>      move the pin to <ref> (a branch, tag, or commit of cursor/plugins), then rebuild
#
# A rebuild that fails leaves the pin where it was. The failure names the upstream text that moved.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
pin="$here/upstream.json"
field() { node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))[process.argv[2]])' "$pin" "$1"; }
cache="${PSTACK_SP_CACHE:-${XDG_CACHE_HOME:-$HOME/.cache}/pstack-sp}/upstream"
mode="${1:-}"
ref="$(field commit)"
if [ -n "$mode" ] && [ "$mode" != "--check" ]; then ref="$mode"; fi

mkdir -p "$cache"
git -C "$cache" rev-parse --git-dir >/dev/null 2>&1 || git -C "$cache" init -q
git -C "$cache" remote get-url origin >/dev/null 2>&1 || git -C "$cache" remote add origin "$(field repo)"
git -C "$cache" fetch -q --depth 1 origin "$ref"
git -C "$cache" -c advice.detachedHead=false checkout -q --force FETCH_HEAD
tree="$cache/$(field path)"

if [ "$mode" = "--check" ]; then
  exec node "$here/build.mjs" --upstream "$tree" --check
fi

cp "$pin" "$pin.previous"
node -e '
  const fs = require("fs");
  const [file, commit, committed] = process.argv.slice(1);
  const pin = JSON.parse(fs.readFileSync(file, "utf8"));
  fs.writeFileSync(file, JSON.stringify({ ...pin, commit, committed }, null, 2) + "\n");
' "$pin" "$(git -C "$cache" rev-parse HEAD)" "$(git -C "$cache" log -1 --format=%cI)"
if node "$here/build.mjs" --upstream "$tree"; then
  rm -f "$pin.previous"
  echo "pinned to $(field commit). Review fork/CHANGES.md and \`git diff\`, then commit."
else
  mv "$pin.previous" "$pin"
  echo "the overlay no longer fits upstream at $ref. The pin was not moved. Fix the step named above in fork/build.mjs or fork/overlay, then run this again." >&2
  exit 1
fi
