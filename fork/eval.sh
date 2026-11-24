#!/usr/bin/env bash
# Measures chain-following: does the agent read the skill files that the steps name?
# Runs the same cases against upstream pstack and against this fork. Every run is a real
# Claude Code session on your account, so it spends usage.
#
#   fork/eval.sh                  three runs of each case, on each variant
#   fork/eval.sh --runs 5         any `claude plugin eval` option passes through
#
# Both variants are copied to sibling folders with plain names, so nothing a run can read
# says which one it is. The graders read the transcript for `Read` calls. They never ask
# the agent what it read.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/.." && pwd)"
cache="${PSTACK_SP_CACHE:-${XDG_CACHE_HOME:-$HOME/.cache}/pstack-sp}"
"$here/sync.sh" --check

tree="$cache/upstream/$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).path)' "$here/upstream.json")"
work="$cache/variants"
rm -rf "$work" && mkdir -p "$work/pstack-a" "$work/pstack-b"
cp -a "$tree/." "$work/pstack-a/"
for path in skills agents docs README.md LICENSE plugin.json .claude-plugin; do cp -a "$root/$path" "$work/pstack-b/"; done
for variant in pstack-a pstack-b; do
  cp -a "$root/evals" "$work/$variant/evals"
  rm -rf "$work/$variant/evals/results"
done

status=0
for variant in pstack-a pstack-b; do
  [ "$variant" = pstack-a ] && label="upstream pstack" || label="pstack-sp"
  echo
  echo "== $label ($variant) =="
  (cd "$work/$variant" && claude plugin eval . --ablation none --trust-plugin --no-publish --threshold 0 "$@") || status=$?
done
echo
echo "Reports are under $work/<variant>/evals/results/. pstack-a is upstream, pstack-b is this fork."
exit "$status"
