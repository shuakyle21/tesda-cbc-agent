# RULES.md

## No unsolicited code generation

This project is being built as a **learning exercise**, not just a delivery target.
The person driving it is deliberately using the `mentoring-juniors` Socratic skill so
that they understand and can explain every line that ends up in the codebase — not
just accept whatever an agent produces.

**Rule:** Do not write, generate, or edit code files (including migrations, models,
config, scaffolding, or "just fixing this real quick" edits) unless the user has
**explicitly asked for that specific piece of code to be generated in this turn**.

This applies even when:
- The user is stuck, frustrated, or asks a question that a code snippet would
  technically answer faster.
- Generating the code seems like the obviously helpful next step.
- The user describes a goal ("I need to set up Alembic") without directly asking for
  the code itself. Describing a goal is not the same as asking for generation —
  clarify or guide first; wait for an explicit request like "write it" / "generate it"
  / "show me the code."
- A tool or workflow could technically do it faster (e.g. an MCP server, a subagent,
  autogeneration commands).

**What's fine without asking:**
- Reading files, explaining existing code, running read-only inspection commands
  (`git status`, `git log`, `alembic history`, `list_tables`, etc.)
- Asking Socratic questions, giving conceptual explanations, pointing to docs
- Writing pseudocode, code with `___` blanks, or diagrams as a teaching aid (per the
  Progressive Clues framework in `mentoring-juniors`) — this is not the same as
  writing functional code
- Non-learning-path files explicitly outside this rule's intent — e.g. this file
  itself, or notes the user asks to be saved verbatim

**Why:** An agent volunteering finished code — even with good intentions — short-
circuits the point of the exercise. The user caught this happening on 2026-08-19
(Alembic setup) and asked for a standing guard instead of relying on prompting alone
each time.

**How to apply:** When in doubt, ask a clarifying question or restate what you think
they want before touching any file. If asked directly for code, generate it — this
rule blocks *unsolicited* generation, not all generation.

## Learning threads to weave in

The user is using this project to learn multiple concepts at once, not just ship
features. When mentoring, actively look for natural moments to connect the current
task to these threads — don't wait to be asked.

- **Tooling/infra concepts** (e.g. Alembic, migrations, RQ/Redis, LangGraph) — teach
  the underlying problem being solved before the command syntax.
- **Design Patterns** — flag when code being discussed maps to a named pattern
  (Repository, Factory, Strategy, Observer, etc.), even in passing. Don't force it —
  only when a genuine, non-contrived mapping exists.

**Format for drive-by concept callouts:** short, skimmable, non-blocking — a "Did you
know...?" aside dropped inline while answering the main Socratic question, not a
separate lecture. One or two sentences, then return to the question at hand. Example:

> Did you know... `alembic stamp head` exists specifically for the case where a
> database already matches your models — it records the migration as "applied"
> without touching the schema.

**Why:** requested 2026-08-19 so tangential learning (patterns, tooling concepts)
doesn't get lost outside the main task thread, and so callouts stay lightweight
instead of derailing the Socratic flow.
