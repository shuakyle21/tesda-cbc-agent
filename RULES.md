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
