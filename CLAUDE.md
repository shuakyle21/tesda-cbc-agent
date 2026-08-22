# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A backend-first AI application that takes a TESDA Training Regulation (TR) PDF plus an
Enhanced CBC `.docx` and generates per-Learning-Outcome CBLM sections, via an explicit
multi-agent LangGraph pipeline. The TR, the CBC, and the Session Plan are all
trainer-supplied/trainer-owned — CBLM is the only document the system generates.
Capstone project for Flyrank's Backend AI Engineering track — the graded artifact is the
agent workflow, not the UI.

**Current state: early build.** `docs/todos/BUILD_CHECKLIST.md` §0–1 (FastAPI skeleton,
config, `/health`, lint/test commands, data model) is done; §2–§8 are not. There is **no
database migration run against a fresh env, no parser, no LangGraph node, no RQ worker,
and no Gradio UI yet** (`gradio_ui/` does not exist — §7 is unstarted). Check
`docs/todos/BUILD_CHECKLIST.md` before assuming any given piece exists.

**Frontend REVERSED 2026-08-21:** the UI is now **Gradio**, not Next.js — a backend-first
capstone doesn't need Next.js's scaffolding, and the old `frontend/` had no HTTP client
wired in anyway (static fixtures only). `frontend/` stays in the repo, **frozen** — no
further work goes into it, do not delete it. See `docs/plans/PLAN.md` §1 Frontend row
and `docs/todos/BUILD_CHECKLIST.md` §7 for the new plan.

## Commands

Backend (`backend/`, uv-managed, Python 3.12 in `.venv`):

```bash
cd backend && uv sync
```

```bash
cd backend && uv run pytest -q
```

```bash
cd backend && uv run pytest tests/test_health.py::test_health -q
```

```bash
cd backend && uv run ruff check . && uv run ruff format --check .
```

```bash
cd backend && uv run uvicorn app.main:app --reload
```

Frontend: **Gradio, not built yet** (`docs/todos/BUILD_CHECKLIST.md` §7). Will live in a
new `gradio_ui/` directory as its own process calling FastAPI over HTTP — do not mount it
into the FastAPI app (`mount_gradio_app` has known queue/websocket breakage).

`frontend/` (Next 16 + React 19 + Tailwind v4) is **frozen** — it still builds/lints, but
no further work goes into it:

```bash
cd frontend && npm run lint
```

```bash
cd frontend && npm run build
```

## Architecture

### Backend (`backend/app/`)

`main.py` builds the FastAPI app from `core/config.py` settings (pydantic-settings,
reads `backend/.env`; see `.env.example`) and includes routers from `api/`. Only
`api/health.py` is wired in. Routers are registered explicitly in `main.py` — there is
no autodiscovery.

The intended runtime shape (none of it built yet, see `docs/specs/SYSTEM_DESIGN.md`): FastAPI
enqueues an RQ job on Redis; a worker runs the LangGraph pipeline, which pauses at a
human review interrupt (checkpointed to `jobs.checkpoint`), resumes via
`POST /jobs/{id}/resume`, then renders `.docx` through `docxtpl`. Postgres and file
storage are Supabase.

### Frontend

**Gradio is the active plan; nothing is built yet.** The intended shape (see
`docs/plans/PLAN.md` §1 Frontend row): a `gradio_ui/` app, its own process, talking to
FastAPI over HTTP (`API_BASE_URL`) — `gr.File` × 2 for the TR/CBC uploads, `gr.Timer`
polling job status (not the deprecated `every=` param), a `gr.Group(visible=...)` step
that appears on `awaiting_review` for UC/LO selection and TR↔CBC alignment review, and a
`gr.DownloadButton` for the final `.docx`.

### `frontend/` (frozen Next.js prototype, `frontend/src/`)

Kept in the repo for reference, not deleted, but receives no further work. Four flows
under `app/projects/[id]/`: `sources` → `select` → `run` (with `run/review`) →
`results`, all rendered from `lib/mock.ts` fixtures — no HTTP client was ever wired in.
`app/globals.css`'s design tokens (ported from `ui_kits/cbc/tokens.css`) and the
accessibility comments from `docs/specs/DESIGN.md` §11 remain the design system's
historical record if the UI is ever revisited.

### Deployment

`render.yaml` deploys the FastAPI service only. The queue and worker services are
commented out **on purpose** — uncommenting them before `docs/todos/BUILD_CHECKLIST.md`
§5 deploys a crash-loop (`rq` is not a dependency, nothing enqueues). Postgres/storage
are deliberately absent: Render's free Postgres expires 30 days after creation, so
`docs/plans/PLAN.md` §1 uses Supabase.

## Where things are

`docs/` is organized by document type. **These are living references — when a
decision, scope boundary, or diagram materially changes, update the doc in place (and
this section, if the doc's role or location changes) rather than letting it drift out
of sync with the code.**

- `docs/plans/PLAN.md` — locked scope decisions and the agent workflow design. Read
  this first. `docs/plans/PLANNING_DIAGRAM.md` — the accompanying diagram.
- `docs/todos/BUILD_CHECKLIST.md` — the actual build order. Source of truth for "what's
  done."
- `docs/specs/CBC_DOMAIN_RULES.md` — TESDA domain rules, house rules, and the
  traceability chain.
- `docs/specs/SYSTEM_DESIGN.md`, `docs/specs/ARCHITECTURE.md`,
  `docs/specs/TECHNICAL_DIAGRAMS.md`, `docs/specs/DATA_MODEL_DIAGRAMS.md`,
  `docs/specs/USECASE_DIAGRAM.md`, `docs/specs/PRD.md` — architecture and data model
  detail.
- `docs/specs/DESIGN.md`, `docs/specs/USER_FLOWS.md` — UI/UX design spec.
- `docs/prompts/` — prompt source docs (`BUILD_PROMPT.md`, `DESIGN_PROMPT.md`,
  `PROMPTS.md`) used to drive generation of the specs/design above, not runtime
  prompts.
- `docs/assets/` — reference diagrams/images (data model, agent architecture, user
  flows) linked from the specs above.
- `prototype/` — static self-contained HTML prototype (`standalone.html`, no build
  step) that the Next.js app was built from. `ui_kits/cbc/` holds its component,
  foundation, and screen fragments plus `tokens.css`.
- `reference/` — the 2026 Style Specification Matrix PDF that
  `docs/specs/CBC_DOMAIN_RULES.md` cites. `fixtures/` — sample data.
- `.claude/` is gitignored, so anything under it (including the
  `cbc-pipeline-planner` subagent definition) is local-only and absent from a fresh
  clone.

## Locked scope decisions (see docs/plans/PLAN.md §1 for full table + rationale)

- Single-user MVP, no auth. **Two required uploads: TR PDF (typed-text, no OCR needed) +
  Enhanced CBC `.docx`.**
- MVP volume: one competency (~4–5 LOs), not a full qualification.
- The CBC Module is **not generated — it is a required input** (REVERSED AGAIN
  2026-08-18, final). Neither is the Session Plan (REVERSED 2026-08-22) — the TR, the
  CBC, and the Session Plan are all trainer-owned; CBLM is the system's only generated
  output. Pipeline order: `TR + Enhanced CBC (both uploaded) → parse → align → ⏸ trainer
  reviews the alignment and picks UC + LO(s) → CBLM`. The interrupt and the UC/LO
  selection happen at the same pause, right after `align_sources`. This deletes both the
  CBC-generation node's compounding-error chain and the `draft_session_plan` node. The
  TR is parsed in full and is the grounding authority; the CBC drives per-LO generation.
  Everything generated must still trace to an Assessment Criterion. See
  `docs/specs/CBC_DOMAIN_RULES.md`. CBLM topics come from the CBC's own Topics/Contents
  field (`parse_cbc`, no LLM), numbered `1.1.1`-style per `CBC_DOMAIN_RULES.md` §9, which
  also sets one Information Sheet per topic as the default — resolved 2026-08-22.
- Grounding: **TR-grounded traceability, not exemplar RAG** (locked 2026-08-18). Style
  is supplied deterministically by the 2026 Style Specification Matrix + Caravan house
  rules (`docs/specs/CBC_DOMAIN_RULES.md` §1, §8), which displaced retrieval's original
  job. The
  Validator asserts the chain: generated CBLM content → CBC assessment criterion → TR
  performance criterion / critical aspect.
- TR parsing: `pdfplumber.extract_tables()` → whitespace repair → LLM structuring →
  Pydantic. Flat text extraction loses table column boundaries and silently
  misattributes performance criteria to the wrong element — don't regress to it.
- Vector store / embeddings: **cut from MVP.** Retrieval sits behind `RetrieverProtocol`
  with a few-shot default; a Pinecone adapter is kept as insurance in case the capstone
  rubric names RAG. LLM: free-tier cloud API (Groq/OpenRouter).
- Orchestration: LangGraph, explicit state + conditional branching — this *is* the
  graded artifact, so don't collapse it into a simpler chain.
- Execution: RQ + Redis background jobs, not synchronous request/response.
- Backend: FastAPI/Python. Frontend: minimal Gradio, own process over HTTP (upload form,
  job-status view, download link only) — do not build a full trainer dashboard/product,
  and do not mount Gradio into the FastAPI app (`mount_gradio_app` breaks its
  queue/websocket layer). REVERSED 2026-08-21 from Next.js; `frontend/` stays, frozen.
- Output: generate → `.docx` via `docxtpl` against real TESDA template files. No
  in-app rich editor.
- Output validation is deterministic (structural checks), not another LLM call.

## Working conventions

- Treat `docs/plans/PLAN.md`'s locked decisions as constraints, not suggestions — if a
  task seems to require deviating from one (e.g. adding auth, using a different
  parser, making CBC Module an LLM agent), flag it rather than silently implementing
  the deviation.
- No fixed deadline, but the plan explicitly treats scope creep as the top risk —
  don't gold-plate beyond what `docs/todos/BUILD_CHECKLIST.md` calls for at the current
  milestone.
- LLM call pacing against the free-tier rate limit is a graph-topology decision
  (`docs/todos/BUILD_CHECKLIST.md` §5), not a tuning knob to add later.
- When a doc under `docs/` changes in a way that shifts scope, architecture, or status
  (a locked decision flips, a milestone completes, a new spec doc is added), update
  that doc and, if needed, the `Where things are` list above in the same change —
  don't let this file drift into describing a docs layout that no longer exists.
