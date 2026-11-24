---
name: architect
description: "Sketch types, signatures, and module structure before code, then stay in the loop while implementation fills in. Use for /architect, 'architect this', 'design this', or non-trivial work where jumping to code would lock in the wrong shape."
disable-model-invocation: true
---

# Architect

In Claude Code, read [the Claude Code adapter](../../docs/harness/claude-code.md) once per session before you follow this skill. It maps the Cursor names in pstack skills to Claude Code.

When a step in this skill sends you to another pstack skill, that is a real skill invocation. Read `../<name>/SKILL.md` in full, then follow it, before you act on the step. Your skill list hides pstack skills and the `Skill` tool refuses them, so nothing else loads one for you, and working from the name drifts. [Running a pstack skill](../../docs/harness/claude-code.md#running-a-pstack-skill) lists the thoughts that lead to a skipped read.

Before writing code, trace every system the change touches, then sketch two different shapes for it (types, signatures, module boundaries) and pick the one where each piece of state has one owner, each task has one way to do it, and callers need to know least. Redesign instead of patching if workarounds repeat.

For a large or contested design, run the **arena** skill instead of sketching alone.
