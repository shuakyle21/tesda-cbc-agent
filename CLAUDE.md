# tesda-cbc-agent

## What this is

A backend-first AI application that takes a TESDA Training Regulation (TR) PDF and
generates a CBC Module, per-Learning-Outcome Session Plans, and CBLM sections, via an
explicit multi-agent LangGraph pipeline. Capstone project for Flyrank's Backend AI
Engineering track — the graded artifact is the agent workflow, not the UI.

**Current state: pre-implementation.** There is no backend or frontend application code
in this repo yet — only planning docs, a static HTML prototype, and a UI kit. Check
`BUILD_CHECKLIST.md` before assuming any given piece (FastAPI app, migrations, RQ
worker, LangGraph nodes) exists.

## Where things are

- `PLAN.md` — locked scope decisions and the agent workflow design. Read this first.
- `BUILD_CHECKLIST.md` — the actual build order (Foundation → data model → M0 smoke
  test → ...). Source of truth for "what's done."
- `SYSTEM_DESIGN.md`, `TECHNICAL_DIAGRAMS.md`, `DATA_MODEL_DIAGRAMS.md`,
  `PLANNING_DIAGRAM.md`, `USECASE_DIAGRAM.md` — architecture and data model detail.
- `DESIGN.md`, `DESIGN_PROMPT.md`, `USER_FLOWS.md` — UI/UX design spec.
- `BUILD_PROMPT.md`, `PROMPTS.md` — prompts used to drive earlier build/design sessions.
- `prototype/` — static, offline, self-contained HTML prototype pulled out of Claude
  Design (`standalone.html`, no build step). Four screens: Projects, Sources &
  Generate, Run Progress, Results.
- `ui_kits/cbc/` — component/foundation/screen HTML fragments backing the prototype's
  design system (colors, type, spacing tokens + individual components).
- `fixtures/` — sample data (`projects.csv`).
- `.claude/agents/cbc-pipeline-planner.md` — a project-specific subagent for planning
  the LangGraph pipeline.

## Locked scope decisions (see PLAN.md §1 for full table + rationale)

- Single-user MVP, no auth. TR upload only (typed-text PDFs, no OCR needed).
- MVP volume: one competency (~4–5 LOs), not a full qualification.
- CBC Module is a **deterministic formatter**, not an LLM agent — no fresh authorship.
- The CBC is an **intermediate artifact**, not an input: `TR → Enhanced CBC → Session
  Plan → CBLM`. The TR is the main source and states *minimum* requirements; the CBC
  may legitimately exceed it (extra topics, new technologies) so long as everything
  traces to an Assessment Criterion. See `CBC_DOMAIN_RULES.md`.
- RAG grounding: retrieval is filtered by section type, sourced from a self-collected
  exemplar corpus (Session Plans / CBLMs) — **TRs are deliberately excluded from the
  retrieval corpus** so retrieval can't leak one qualification's facts into another's
  draft. The uploaded TR supplies facts via the prompt; the corpus supplies style only.
- TR parsing: `pdfplumber.extract_tables()` → whitespace repair → LLM structuring →
  Pydantic. Flat text extraction loses table column boundaries and silently
  misattributes performance criteria to the wrong element — don't regress to it.
- Vector store / embeddings: **cut from MVP.** Retrieval sits behind `RetrieverProtocol`
  with a few-shot default; a Pinecone adapter is kept as insurance in case the capstone
  rubric names RAG. LLM: free-tier cloud API (Groq/OpenRouter).
- Orchestration: LangGraph, explicit state + conditional branching — this *is* the
  graded artifact, so don't collapse it into a simpler chain.
- Execution: RQ + Redis background jobs, not synchronous request/response.
- Backend: FastAPI/Python. Frontend: minimal Next.js (upload form, job-status view,
  download link only) — do not build a full trainer dashboard/product.
- Output: generate → `.docx` via `docxtpl` against real TESDA template files. No
  in-app rich editor.
- Output validation is deterministic (structural checks), not another LLM call.

## Working conventions

- When planning or touching the LangGraph pipeline design, prefer the
  `cbc-pipeline-planner` subagent.
- Treat `PLAN.md`'s locked decisions as constraints, not suggestions — if a task seems
  to require deviating from one (e.g. adding auth, using a different parser, making CBC
  Module an LLM agent), flag it rather than silently implementing the deviation.
- No fixed deadline, but the plan explicitly treats scope creep as the top risk —
  don't gold-plate beyond what `BUILD_CHECKLIST.md` calls for at the current milestone.
