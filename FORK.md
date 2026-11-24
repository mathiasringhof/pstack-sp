# pstack-sp

pstack-sp is [pstack](https://github.com/cursor/plugins/tree/main/pstack) for Claude Code with one change. When a step names a skill, the agent reads that skill's file before it acts. The method comes from [superpowers](https://github.com/obra/superpowers). The hook does not.

pstack is Lauren Tan's work. This fork is unofficial.

## What the fork promises

1. **It is upstream's tree.** The plugin is the tree that `/plugin install pstack@cursor-plugins` installs, at the commit in [`fork/upstream.json`](./fork/upstream.json). About one file in twenty differs. [`fork/CHANGES.md`](./fork/CHANGES.md) lists each one, with the current counts.
2. **No hook.** Nothing runs at session start, and nothing routes a task into pstack for you.
3. **You decide when pstack runs.** Every skill except `setup-pstack` still loads only when you type it, as upstream. The fork changes no frontmatter.
4. **Every difference is checked.** The fork is a build: upstream plus the text in [`fork/overlay`](./fork/overlay). `fork/sync.sh --check` fails when the repository is anything else. CI runs it on every push.

## The problem

pstack marks its skills `disable-model-invocation: true`. That is what keeps you in control. In Claude Code it also means the agent sees no description for those skills, and the `Skill` tool refuses them.

So when `/pstack:poteto-mode` reaches a step such as "across a function boundary → **architect**", running the skill is a plain `Read` of `skills/architect/SKILL.md`. Nothing prompts that read. Upstream covers it with one row of a table in the [adapter](./docs/harness/claude-code.md), behind a link the agent is asked to follow once per session. An agent that skips the read does the step from the skill's name. The unslop skill is a list of numbered rules. Its name carries none of them.

## What superpowers does, and what this fork takes

Superpowers gets skills called with more than its hook. The hook only puts the rules in context. The rules do the work.

| Superpowers technique | Taken? | Where it lives here |
| --- | --- | --- |
| A session-start hook injects the bootstrap skill | No | Your own `/pstack:poteto-mode` is the bootstrap moment. Claude Code keeps that skill's text in context and re-attaches it after a compaction, so the rules sit there. |
| A rule that leaves no choice | Yes | "When a step sends you to a pstack skill, that is a real skill invocation. Read that skill's `SKILL.md` in full, then follow it, before you act." It is keyed to the step, so the agent reads a skill when its step comes and not all 59 up front. |
| The reason for the rule | Yes | Skills only load from a slash command, the list hides them, the `Skill` tool refuses them, so the read is the only way in. |
| A table of excuses and what is true | Yes | Nine rows, in `poteto-mode` and in the adapter. |
| Commitment: announce the skill, one todo per item | Adapted | One todo item per skill the playbook sends the agent to. The reply names each skill it ran, and any step it did without its skill. Both extend rules `poteto-mode` already has for playbook steps and for principles. |
| "Use when" descriptions that never summarize the skill | No | The agent never sees a pstack description, so there is nothing to tune. The same hazard exists in the principles index, and one row of the table covers it. |
| "If there is a 1% chance a skill applies, invoke it" | No | pstack's triggers and playbooks already say when each skill applies. The fork enforces those. It does not widen them. |
| Loud markup and capitals | No | The text is written to pstack's own bar for skill prose: short sentences, keep only what changes a decision. |

Two things in the overlay are Lauren's own words, generalized. `teach` already says "Those are real skill invocations". `poteto-agent` already says that substituting another agent "skips that read and drifts". She had patched this failure in two places. The fork applies the same patch everywhere a skill is named.

## Where the text goes

The fork edits upstream only at the places where upstream already differs between Cursor and Claude Code, plus the front door.

- **`skills/poteto-mode/SKILL.md`** gets the section "Running a skill", above "Non-negotiables". It holds the rule, the reason, the table, and the todo and reply rules. It sits near the top because Claude Code keeps the first 5,000 tokens of a skill after a compaction.
- **`docs/harness/claude-code.md`** gets the same rule and table as "Running a pstack skill", for sessions that start from another skill.
- **Every other skill that sends you to a skill** gets one paragraph under its heading, 18 of them today. It states the rule in four sentences and points at the adapter section. One of them, `blast-radius`, sends you to skills upstream without saying how to run them in Claude Code. `poteto-help` gets none, because it names skills to describe them and must not start work.
- **`skills/poteto-mode/worker.md`** gets one bullet, so a subagent that never saw `poteto-mode` still reads a skill its kickoff names.
- **Install commands** in the README, guide page 1, and `poteto-help` name this marketplace. The manifest version is upstream's with `-sp.N` appended, because Claude Code keeps you on a version until the string changes.

The source of each piece is a file in [`fork/overlay`](./fork/overlay). Edit it there, raise `revision` in [`fork/fork.json`](./fork/fork.json), and run `fork/sync.sh`.

## What is measured, and what is not

Nothing is measured yet. The overlay is a hypothesis.

The table's rows have two sources. Four are adapted from superpowers' own red-flags table, which its authors tuned against real sessions: knowing the word, the small task, having read it earlier, and doing it at the end. Five come from how pstack loads skills in Claude Code: the playbook file, the principles index, the refusing `Skill` tool, the context window, and the subagent. None has been observed failing on pstack by this fork. Superpowers' rule for this is strict: write the table from excuses you watched an agent make.

[`evals/`](./evals) is the measurement. It follows upstream's [eval playbook](./skills/poteto-mode/playbooks/eval.md): an organic prompt, and chain-following graded from the files the agent opened, never from what it says.

```bash
fork/eval.sh            # three runs of each case against upstream, then against this fork
fork/eval.sh --runs 5
```

Each run is a real Claude Code session on your account. The three cases are read-only, so they need no tool grants.

| Case | Entry | Reads it checks |
| --- | --- | --- |
| `explain-retry` | `/pstack:poteto-mode` | the adapter, the investigation playbook, `unslop` |
| `why-five-attempts` | `/pstack:poteto-mode` | the investigation playbook, `why`, `unslop` |
| `teach-retry` | `/pstack:teach` | `how`, `why`, `unslop` |

If upstream already scores near 1.0 on your model, the overlay is not earning its place and you should say so. If the fork scores higher, open the reports and read what the agent said when it skipped. Those sentences belong in the table in place of the guessed rows.

The suite does not yet cover a code change, a subagent, or a compaction. Those need write tools and longer runs.

## Keeping up with upstream

```bash
fork/sync.sh main       # move the pin to upstream's newest commit and rebuild
git diff                # upstream's changes, with the overlay re-applied
```

Each overlay step attaches to one piece of upstream text. If upstream moves or rewords that text, the step fails by name and the pin stays where it was. The build also stops when upstream ships a hook, makes a skill invocable by the model, adds a top-level folder, or rewrites a sentence the overlay cites. Each of those is a decision for you.

## Install

```text
/plugin marketplace add mathiasringhof/pstack-sp
/plugin install pstack@pstack-sp
```

The plugin keeps the name `pstack`, so every command upstream documents works as written: `/pstack:poteto-mode`, `/pstack:setup-pstack`. Uninstall `pstack@cursor-plugins` first, because both use that name.

## Credits and license

pstack is © 2026 Lauren Tan, MIT. See [LICENSE](./LICENSE). The table of excuses and the commitment rules are adapted from superpowers by Jesse Vincent, MIT. No superpowers text is copied. The fork's additions are MIT.
