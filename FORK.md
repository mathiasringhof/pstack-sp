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
| A rule that leaves no choice | Yes | In bold, first: "you MUST read that skill's `SKILL.md` in full before you act on the step. You do not have a choice." Then four named non-exceptions. It is keyed to the step, so the agent reads a skill when its step comes and not all 59 up front. |
| The reason for the rule | Yes | Skills only load from a slash command, the list hides them, the `Skill` tool refuses them, so the read is the only way in. |
| A table of excuses and what is true | Yes | Nine rows, in `poteto-mode` and in the adapter. |
| Commitment: announce the skill, one todo per item | Yes | The agent writes `Running <name>` and the path before it acts. One todo item per skill the playbook sends it to. The reply names each skill it ran, and any step it did without its skill. The last two extend rules `poteto-mode` already has for playbook steps and for principles. |
| "Use when" descriptions that never summarize the skill | No | The agent never sees a pstack description, so there is nothing to tune. The same hazard exists in the principles index, and one row of the table covers it. |
| "If there is a 1% chance a skill applies, invoke it" | Adapted | Superpowers needs it because its agent must judge which listed skill is relevant. Here you and the step have already chosen the skill. One judgment remains, whether a trigger fired, so the lever goes there: "If you are unsure whether a trigger fired, it fired." It adds no skill and sends the agent looking for none. |
| Loud markup and capitals | Partly | One bold rule with one `MUST`, in `poteto-mode`, the adapter, the routing paragraph, and `worker.md`. No tags, and no line of capitals. Revision 1 had none of this. It is commit `c4d4bf1`, so the two can be measured against each other. |

Two things in the overlay are Lauren's own words, generalized. `teach` already says "Those are real skill invocations". `poteto-agent` already says that substituting another agent "skips that read and drifts". She had patched this failure in two places. The fork applies the same patch everywhere a skill is named.

## Where the text goes

The fork edits upstream only at the places where upstream already differs between Cursor and Claude Code, plus the front door.

- **`skills/poteto-mode/SKILL.md`** gets the section "Running a skill", above "Non-negotiables". It holds the rule, the non-exceptions, the doubt rule, the reason, the table, and the todo, delegation and reply rules. It sits near the top because Claude Code keeps the first 5,000 tokens of a skill after a compaction.
- **`docs/harness/claude-code.md`** gets the same rule, non-exceptions and table as "Running a pstack skill", for sessions that start from another skill.
- **Every other skill that sends you to a skill** gets one paragraph under its heading, 18 of them today. It states the rule in three sentences and points at the adapter section. One of them, `blast-radius`, sends you to skills upstream without saying how to run them in Claude Code. `poteto-help` gets none, because it names skills to describe them and must not start work.
- **`skills/poteto-mode/worker.md`** gets two bullets. A `poteto-agent` reads `poteto-mode` in full, so it has the whole section. Every other agent a run starts sees only its kickoff and `worker.md`. The first bullet makes it read a skill its kickoff names. The second makes it list the skill files it read, so the parent can check. `poteto-mode` in turn tells the parent to put the skill's path in the kickoff.
- **Install commands** in the README, guide page 1, and `poteto-help` name this marketplace. The manifest version is upstream's with `-sp.N` appended, because Claude Code keeps you on a version until the string changes.

The source of each piece is a file in [`fork/overlay`](./fork/overlay). Edit it there, raise `revision` in [`fork/fork.json`](./fork/fork.json), and run `fork/sync.sh`.

## What is measured, and what is not

A pilot and a first comparison have run on one machine, on Opus 5.5 at medium effort. Their numbers are not recorded here yet. Until they are, read the overlay as a hypothesis.

The maintainer of this fork has watched upstream `poteto-mode` skip skills in real sessions. That is the reason the fork exists. It is an observation, not a number.

The table's rows have two sources. Four are adapted from superpowers' own red-flags table, which its authors tuned against real sessions: knowing the word, the small task, having read it earlier, and doing it at the end. Five come from how pstack loads skills in Claude Code: the playbook file, the principles index, the refusing `Skill` tool, the context window, and the subagent. Superpowers' rule for this is strict: write the table from excuses you watched an agent make. The harness collects them.

## The test harness

`fork/eval.sh` runs the same prompts against upstream and against this fork with `claude plugin eval`, then prints one table. It follows upstream's [eval playbook](./skills/poteto-mode/playbooks/eval.md): an organic prompt, nothing in reach of the run that says what is measured, and chain-following read from the files the agent opened, never from what it says.

```bash
fork/eval.sh --pilot                 # 4 sessions: one run of each read-only case, upstream alone
fork/eval.sh                         # 24 sessions: three runs of each, upstream and this fork
fork/eval.sh --also c4d4bf1         # 36 sessions: adds the quiet wording as a third variant
fork/eval.sh --tier write            # 6 sessions: the code-change case
```

Every session is a real Claude Code session on your account. Add `--model <name>` to pin the model you saw the skips on, and `--effort <level>` to pin its effort. Any other option goes to `claude plugin eval`.

**Run the pilot first.** It answers whether the harness reproduces what you saw. If upstream reads every skill in the pilot, the cases are too easy, and a comparison would show nothing. Make the cases harder before you spend the larger run.

Each run starts in a small sample project, [`fork/suite/project`](./fork/suite/project), a service with one planted bug. The cases are in [`fork/suite/cases`](./fork/suite/cases).

| Case | Tier | Prompt, in short | Reads the steps call for |
| --- | --- | --- | --- |
| `explain-retry` | read | how does retry work, is the backoff right | the adapter, the investigation playbook, `unslop` |
| `why-five-attempts` | read | why five attempts | the investigation playbook, `why`, `unslop` |
| `review-retry` | read | this file is hard to follow | the investigation or refactoring playbook (either counts: the prompt fits both), the `minimize-reader-load` leaf, `unslop` |
| `teach-retry` | read | `/pstack:teach` on retries | the adapter, `how`, `why`, `unslop` |
| `fix-refund` | write | a refund hangs, fix it | the bug-fix playbook, `tdd`, the `fix-root-causes` and `prove-it-works` leaves, `technical-writing`, `unslop` |

The report has four parts.

- **Reads the steps call for.** One row per case and skill, one column per variant, each cell runs that read it out of runs that finished. This is the result.
- **Restraint.** The strong wording could make the agent read skills no step sent it to. Each case caps the number of skill files read, and `explain-retry` requires that `architect` stays unread, because its playbook says so.
- **Cost.** Mean turns and dollars per run, so you see what the extra reads cost.
- **Every pstack file read**, and what each subagent kickoff named, taken from the transcripts.

It also writes `misses.md`: what the agent said in every run that skipped a read. Those sentences replace the guessed rows of the table.

What the harness does not show yet:

- **Long sessions.** A run is one prompt. Skips after a compaction, or late in a long task, are out of reach.
- **Subagents, with confidence.** The write case lets the agent delegate, and the report counts kickoffs that name `worker.md` and a skill file. In the pilot, subagent tool calls did reach the transcript. How reliably is not known.
- **The write case at all.** It needs Claude Code's shell sandbox: built in on macOS, `bubblewrap` and `socat` on Linux. It was built without one and has never run.
- **More than one setup.** Every session so far ran on one machine, on Opus 5.5 at medium effort.

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
