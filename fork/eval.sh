#!/usr/bin/env bash
# Measures chain-following: does the agent read the skill files that the steps send it to?
# Runs the same cases against upstream pstack and against this fork, then prints one table.
# Every run is a real Claude Code session on your account, so it spends usage.
#
#   fork/eval.sh                          read-only cases, three runs each, upstream and this fork
#   fork/eval.sh --pilot                  one run of each read-only case on upstream alone
#   fork/eval.sh --tier write             the code-change case (needs Write, Edit, Bash in a sandbox)
#   fork/eval.sh --also c4d4bf1          add a third variant from a git ref of this repository
#   fork/eval.sh --effort medium          effort for every session (sets CLAUDE_CODE_EFFORT_LEVEL)
#   fork/eval.sh --runs 5 --model opus    any other option goes to `claude plugin eval`
#
# Each variant is copied to a folder with a plain name, and the cases sit in it as `samples/`,
# so nothing a run can read says what is measured. The checks read the transcript for `Read`
# calls. They never ask the agent what it read.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/.." && pwd)"
cache="${PSTACK_SP_CACHE:-${XDG_CACHE_HOME:-$HOME/.cache}/pstack-sp}"
shipped=(skills agents docs README.md LICENSE plugin.json .claude-plugin)

tier=read
pilot=false
also=()
pass=()
value() { # <option> [<value>]: stop unless the option has a value that is not another option
  if [ $# -lt 2 ] || [ "${2#--}" != "$2" ]; then echo "$1 needs a value" >&2; exit 2; fi
}
while [ $# -gt 0 ]; do
  case "$1" in
    --tier) value "$@"; tier="$2"; shift 2 ;;
    --also) value "$@"; also+=("$2"); shift 2 ;;
    --pilot) pilot=true; shift ;;
    --effort) value "$@"; export CLAUDE_CODE_EFFORT_LEVEL="$2"; shift 2 ;;
    *) pass+=("$1"); shift ;;
  esac
done
case "$tier" in read|write|all) ;; *) echo "--tier takes read, write, or all" >&2; exit 2 ;; esac

"$here/sync.sh" --check
tree="$cache/upstream/$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).path)' "$here/upstream.json")"
work="$cache/runs/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$work/out"
printf '%s\n' "${CLAUDE_CODE_EFFORT_LEVEL:-}" > "$work/out/effort.txt"

names=()
labels=()
add_variant() { # <label>, with the plugin already copied to $work/pstack-<letter>
  local letter
  letter="$(printf "\\$(printf '%03o' $((97 + ${#names[@]})))")"
  names+=("pstack-$letter")
  labels+=("$1")
  mkdir -p "$work/pstack-$letter"
}

add_variant "upstream"
cp -a "$tree/." "$work/${names[0]}/"
if [ "$pilot" = false ]; then
  add_variant "this fork"
  for path in "${shipped[@]}"; do cp -a "$root/$path" "$work/${names[1]}/"; done
  for ref in ${also[@]+"${also[@]}"}; do
    add_variant "$ref"
    git -C "$root" archive "$ref" "${shipped[@]}" | tar -x -C "$work/${names[${#names[@]}-1]}"
  done
fi
for name in "${names[@]}"; do node "$here/suite/assemble.mjs" "$work/$name/samples" >/dev/null; done

options=(--eval-dir samples --ablation none --trust-plugin --no-publish --threshold 0 --scaffold --keep-temp)
[ "$tier" != all ] && options+=(--tag "$tier")
[ "$tier" != read ] && options+=(--allow-tools Write Edit Bash)
[ "$pilot" = true ] && options+=(--runs 1)

for index in "${!names[@]}"; do
  echo
  echo "== ${labels[$index]} (${names[$index]}) =="
  printf '%s\t%s\n' "${names[$index]}" "${labels[$index]}" >> "$work/out/variants.tsv"
  (cd "$work/${names[$index]}" && claude plugin eval . "${options[@]}" --output-dir "$work/out/${names[$index]}" ${pass[@]+"${pass[@]}"}) || true
done

echo
node "$here/report.mjs" "$work/out"
