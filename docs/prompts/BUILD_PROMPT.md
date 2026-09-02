# Build Prompt — tesda-cbc-agent

**SUPERSEDED — kept as a historical record, not actively maintained.** This bootstrapped
the project's first version, and that job is now done by `CLAUDE.md` (the actual
"fresh session" entry point for this repo). This file has since drifted across several
eras it was never updated for: it treats Pinecone/local-embeddings RAG as the primary
grounding mechanism (superseded by TR-grounded traceability, `PLAN.md` §1), models a
selectable "CBC Module vs Session Plans vs CBLM" run-scoping feature (CBLM is now the
only output, and neither CBC nor Session Plan is generated at all — `PLAN.md` §1), and
points at `~/cblm-developer-ui` — a different, violet-monochrome design system than the
CAMS-inherited palette actually in `DESIGN.md` today. Treat everything below as
historical context for how this project's thinking evolved, not as current instructions.
**For current scope, read `PLAN.md` and `CLAUDE.md` instead.**

---

Self-contained. Paste into a fresh session with an empty repo. Assumes no prior context.

---

## What you are building

A **Session Plan and CBLM Developer** for Philippine TESDA trainers.

A trainer uploads **two source documents** — the official **Training Regulation (TR)** and the
**Competency-Based Curriculum (CBC)** for the same qualification — picks a competency and a
document type, and gets TESDA-standard documents back as `.docx`. Generation runs through an
explicit **multi-agent LangGraph pipeline**.

### The two inputs, and why both are required

| Source | Supplies |
|---|---|
| **TR** | The competency standard — elements, performance criteria, evidence guide, required knowledge and skills |
| **CBC** | The curriculum — learning outcomes, contents, conditions, methodologies, assessment methods, nominal duration |

**Neither alone is sufficient.** A Session Plan needs contents, methodologies, and assessment
methods — those live in the CBC, not the TR. The TR supplies what competence *means*; the CBC
supplies how it is *taught and assessed*. A pipeline given only the TR would have to invent the
CBC's contents, and invented curriculum is exactly the failure that gets rejected at assessment.

**CBC is an input, never an output.** There is no CBC generator in this system.

This is a capstone project. **The graded artifact is the agent workflow — not the product, not the
UI.** Every decision below optimises for a working, demo-able, reliable pipeline first.

The user is a trainer working toward **Trainers Methodology (TM) Level I/II**, for whom developing
Session Plans and Competency-Based Learning Materials is an assessed competency. They finish edits
in Word. This tool accelerates a workflow they are already accountable for; it does not invent one.

---

## Locked decisions — do not relitigate these

| Area | Decision | Why |
|---|---|---|
| Backend | **Python, FastAPI** — sole API surface | |
| Orchestration | **LangGraph** | This *is* the graded artifact |
| Validation | **Pydantic** everywhere | |
| TR parsing | **`pdfplumber.extract_tables()`** → whitespace repair → LLM structuring | A TR is tables all the way down; see "The parsing rule" below |
| Job execution | **RQ + Redis**, background worker | Multi-minute multi-LLM jobs need async + progress, not a spinner |
| DB + vectors | **Supabase** (Postgres + Storage) + **Pinecone** free tier for vectors | Keep app state relational, move retrieval to a dedicated vector service |
| Embeddings | **SentenceTransformers, running locally** | Free, no API key, no rate limit — see "Budget constraint" |
| LLM | **Groq** free tier (OpenAI-compatible endpoint) | Free, no card required |
| Export | **docxtpl** against real TESDA `.docx` templates | Trainer finishes in Word; no in-app editor |
| Frontend | **Gradio**, separate process calling FastAPI over HTTP | REVERSED 2026-08-21 — backend-first capstone, cut UI scaffolding. Superseded the Next.js + React + Tailwind v4 plan; see `PLAN.md` §1 Frontend row |
| Auth | **None.** Single-user MVP | |
| Deployment | Local only for now | |

### Budget constraint — this shapes the architecture

**The developer has no credit card and cannot use OpenAI or Anthropic APIs.** Everything must run
on free tiers or locally. Two consequences you must respect:

1. **Embeddings run locally** via `sentence-transformers`. No embedding API, no key, no quota.
   Keep the embedding model and Pinecone index dimension aligned — changing models later
   means re-embedding the corpus.
2. **LLM calls are a scarce resource with a per-run budget.** Design for this explicitly; do not
   treat calls as free. See "Run scoping".

Put the LLM client behind a thin interface so the provider is one config line. Do not scatter
`groq` imports through the graph.

---

## The pipeline

```
Upload TR PDF          Upload CBC PDF
     │                      │
     ▼                      ▼
┌─────────────┐      ┌─────────────┐
│  TR Parser  │      │ CBC Parser  │   both: pdfplumber.extract_tables()
│             │      │             │   → whitespace repair → LLM structuring
└──────┬──────┘      └──────┬──────┘   → Pydantic-validated
       │  CompetencyData    │  CurriculumData
       └──────────┬─────────┘
                  ▼
          ┌───────────────┐
          │    Merger     │  join TR elements ↔ CBC learning outcomes
          │  NO LLM CALL  │  deterministic, by order + title match
          └───────┬───────┘
                  │  SourceContext (per LO: criteria + contents
                  ▼                  + methodologies + assessment)
          ┌───────────────┐
          │   Retriever   │  Pinecone, FILTERED BY SECTION TYPE
          └───────┬───────┘
             ┌────┴─────────────┐
             ▼                  ▼
    ┌──────────────┐    ┌──────────────┐
    │ Session Plan │    │ CBLM Drafter │
    │ Drafter      │    │ 4 sections   │
    │ 1 per LO     │    │ per LO       │
    └──────┬───────┘    └──────┬───────┘
           └─────────┬─────────┘
                     ▼
             ┌─────────────┐
             │  Validator  │  deterministic Python,
             └──────┬──────┘  NOT an LLM call
           fail ┌───┴───┐ pass
                ▼       ▼
      retry back to   ┌────────┐
      the drafter     │ Export │  docxtpl → .docx
      (max 2)         └────────┘
```

### The Merger node

New, deterministic, **zero LLM calls**. It joins the two parsed sources into one `SourceContext`
per learning outcome, so a drafter receives everything about one LO in a single object.

Match TR elements to CBC learning outcomes **by order first, then verify by title similarity**.
TESDA documents list them in the same sequence, but do not assume it silently:

- If the counts differ, **fail the job with a clear message** naming both counts. A TR with 5
  elements and a CBC with 4 LOs means the trainer uploaded a mismatched pair — probably a
  different qualification or a different competency — and every downstream document would be
  wrong.
- If counts match but titles diverge badly, **warn but proceed**, recording the mismatch in
  `job_events`. TESDA wording differs slightly between the two documents by design.

This check is cheap and catches the most likely user error in the whole product.

### The retry edge is the point

The conditional edge **Validator → back to the specific failing Drafter**, bounded at 2 retries,
is what makes this an agent workflow rather than a linear script. Build it deliberately, make it
demo-able, and call it out in the writeup. Everything else is plumbing around it.

On exhausting retries: mark that document `failed_after_retries` and **continue** — do not fail the
whole job.

### The parsing rule — do not substitute anything here

A TESDA TR is table-structured. `ELEMENT | PERFORMANCE CRITERIA` and the Evidence Guide live in
**cell boundaries**. Flat text extraction (pypdf, MarkItDown, markdown converters, Firecrawl)
returns the same words in reading order with the column boundary gone — and then criteria attach
to the wrong element, **silently**. The output looks plausible and is wrong.

`pdfplumber.extract_tables()` is verified working against *TR — Organic Agriculture Production NC II*
(91 pages, text layer present). Use it. Do not "improve" this to a general document loader.

The extracted text carries OCR-era spacing damage — `"Pre pared"`, `"preven tive"`. Run a
whitespace-repair pass **before** LLM structuring, or the damage is copied verbatim into generated
documents.

### Run scoping — the key product decision

The trainer chooses **what** to generate, and each choice has a visible cost:

| Selection | Documents | LLM calls |
|---|---|---|
| **CBC Module** | 1 | **0** — deterministic reformat of parsed TR data |
| **Session Plans** | 5 (one per LO) | ~5 |
| **CBLM** | 20 (4 per LO) | ~20 |

This is not a UI nicety. It is how a run stays inside a free tier. **The CBC Module path must make
zero LLM calls** — it is a reformat of data the Parser already extracted (course structure, nominal
hours, assessment methods). Implement it as a pure function.

Reject over-budget selections **before enqueueing a job**, never as a job that dies instantly.

### Rate-limit pacing

One CBLM run is ~20 calls plus up to 2 retries each. Fired concurrently on a free tier, they all
429 at once. Handle this in two layers, and keep them separate:

- **Layer 1 — transport.** `tenacity` exponential backoff on 429/timeout/5xx. **Invisible when it
  works** — never surface it to the user.
- **Layer 2 — pacing.** `asyncio.Semaphore(2–3)` plus a token bucket refilling at the provider's
  documented rate, applied *before* the call. This prevents the burst rather than reacting to it.
  If a 429 arrives anyway, shrink the bucket rate — the documented limit was wrong.

Do not conflate these with the Layer 3 validation retry. Only Layer 3 is graded logic.

---

## Data model

```sql
projects(id uuid pk, title text, qualification_code text, created_at timestamptz)

tr_uploads(id uuid pk, project_id uuid fk, storage_path text,
           parsed_json jsonb,          -- Parser cache: parse once
           created_at timestamptz)

jobs(id uuid pk, project_id uuid fk,
     status text,                      -- parsing|retrieving|drafting|validating
                                       -- |exporting|done|failed
     doc_type text,                    -- cbc_module|session_plan|cblm
     error text, created_at, updated_at)

job_events(id uuid pk, job_id uuid fk,
           node_name text,             -- parser|retriever|cbc_formatter
                                       -- |session_plan_drafter|cblm_drafter
                                       -- |validator|export
           lo_id text,                 -- null for job-level nodes
           status text,                -- started|succeeded|failed|retried
           detail jsonb,               -- {"retry_count": 1, "reason": "..."}
           created_at timestamptz)

generated_documents(id uuid pk, project_id uuid fk, job_id uuid fk,
                    doc_type text,     -- cbc_module|session_plan|cblm_section
                    lo_id text, section_type text,
                    storage_path text,
                    status text,       -- ok|failed_after_retries
                    created_at timestamptz)

corpus_chunks(id uuid pk,
              section_type text,       -- THE RAG FILTER KEY
              content text,
              pinecone_id text unique,  -- vector payload stored in Pinecone
              source_doc text, created_at timestamptz)
```

**Write a `job_events` row on every node entry and exit, in the same transaction as the state
change.** An event log that can disagree with `jobs.status` is worse than none — you debug the
logger instead of the pipeline. These rows are both the user's progress feed and your only
debugging surface.

### RAG rule

`corpus_chunks` holds **exemplar CBLMs and Session Plans only. Never TRs.** The uploaded TR goes
into the drafter prompt whole, as `CompetencyData`; chunking it risks retrieving 3 of 5 elements
when the drafter needs all of them. The vector representation for each chunk lives in Pinecone,
keyed by `pinecone_id`.

**The TR supplies facts. Retrieval supplies style.** Filter retrieval by `section_type` — a Task
Sheet query retrieves Task Sheet exemplars, never generic similarity.

---

## API

```
POST /projects                    {title, qualification_code?} → {id}
POST /projects/{id}/tr            multipart → {tr_upload_id}
                                  | 400 {error: "no text layer detected"}
POST /projects/{id}/generate      {tr_upload_id, competency_index, doc_type} → {job_id}
                                  | 400 {error: "over budget", needed, remaining}
GET  /jobs/{job_id}               → {status, events: [...], error?}
GET  /projects/{id}/documents     → [{doc_type, lo_id?, section_type?, status, download_url}]
GET  /documents/{doc_id}/download → signed Supabase Storage URL
```

`POST /tr` runs a **cheap synchronous text-layer check** (first page + one sampled page) inside the
request and rejects immediately. Fail fast on garbage input rather than burning a job slot.

---

## UI

Four screens, linear: **Upload → Configure → Run → Results**.

A complete design system already exists — colours, type, components, states, accessibility — with
working HTML previews. **Read it before writing any component:**

- `~/cblm-developer-ui/DESIGN.md`
- `~/cblm-developer-ui/tokens.css`
- `~/cblm-developer-ui/components/*.html`, `foundations/*.html`, `screens.html`

Non-negotiables from it:

- **One chromatic colour.** Signal Violet `#594ff4` means *action* and nothing else does.
- **A three-colour status ramp**, quarantined to the cost meter, status badges, and the error panel.
- **No stepper.** The retry edge moves a run backwards; a fixed-stage stepper would show a lie.
- **Collapse `job_events` to the latest row per `(node_name, lo_id)`** — the pair, not the node.
  Collapsing on node alone makes LO-2's retry erase LO-1's success.
- **No per-document retry control.** There is no per-document retry API, so the button would be a
  lie. One whole-run re-run, on the outcome panel.
- **`done` ≠ success.** Derive the outcome panel from the documents list, not `jobs.status`. There
  must be **no green state reachable without checking whether any document failed.**
- **`jobs.error` is shown verbatim** — never regex, truncate, or prettify a traceback.
- Poll `GET /jobs/{job_id}` every 2s while non-terminal; stop on `done`/`failed`.

---

## Prompts

`PROMPTS.md` in this repo contains the **complete Parser prompt** — use it as written. Its rules
exist because of specific observed failures; do not soften them.

The **Session Plan and CBLM Drafter prompts are intentionally unwritten.** A TESDA Session Plan is
a *form* whose fields an assessor checks against. Do not invent one from general knowledge — a
plausible-but-wrong structure produces documents that look right, pass the Validator, and get
rejected at assessment. **Ask the developer for real TM I/II materials before writing them.**

One rule that holds regardless: **generate Self-Check and Answer Key together in one call**, or
pass the Self-Check verbatim into the Answer Key call. Generated independently, the answers do not
match the questions.

**The Validator is deterministic Python, not an LLM call.** Required sections present, no unfilled
placeholders, LO count matches the TR, Self-Check question count equals Answer Key answer count. An
LLM validator can hallucinate a pass, and then the retry edge is checking nothing.

---

## Build order

Each milestone is independently demo-able. **Do not start the next until the current one runs.**

| | Milestone | Done when |
|---|---|---|
| **M0** | Structured-output smoke test | Run the Parser prompt 10× against a real TR on the chosen Groq model. Count schema-valid parses. **Then check what the schema cannot: do LO-2's criteria actually belong to LO-2?** ≥9/10 → proceed. <9/10 → keep the free model and lean on the retry edge, which is better for the rubric anyway. Write down the result |
| **M1** | Parser | `curl` the endpoint, get validated `CompetencyData` JSON. Demo that each element carries its own criteria and none are cross-attached |
| **M2** | Retriever | Seed the corpus, show retrieval for 2–3 section types side by side. Prove the `section_type` filter changes the results |
| **M3** | Drafters + CBC formatter | Full graph run produces state with documents. No validation yet |
| **M4** | **Validator + retry edge** | **The centerpiece demo.** Deliberately break a draft, show the graph catching it and retrying, show the `retried` row in `job_events` |
| **M5** | Export | `.docx` matching real TESDA templates, downloadable. **Minimum submittable artifact** |
| **M6** | UI + RQ/Redis wiring | Upload → job → progress → download, through the browser |

**M5 is the floor.** M6 is the first thing to cut — it demonstrates nothing on a backend-AI rubric.

---

## Scope guards — do not build these

- No auth, no multi-tenancy, no user accounts
- No in-app document editor or rich text preview
- No versioning of generated document sets
- No dashboard, analytics, or admin panel
- No Kubernetes, autoscaling, load balancers, or Prometheus — one user, local dev
- No OCR — reject scanned PDFs with a clear message
- No streaming responses
- No mobile layout — this is a desktop workflow ending in Word
- **No generic document loader** that "also handles" TRs. The table-extraction path is specific and
  verified; a general loader silently loses the column boundary

If a requirement here seems to call for one of these, it does not. Ask.

---

## Verification

- **M0 result written down** — which model, how reliable, and the criteria-attachment check
- **Parser correctness** verified by reading generated output against the source TR, not just by
  schema validity. Schema-valid and correct are different questions
- **Retry edge demonstrated** end to end with the `job_events` trace visible
- **Zero LLM calls on the CBC Module path** — assert it in a test
- **Budget rejection** happens before a job row is created
- **Every one of the UI non-negotiables** traceable to a specific component and state
- `.docx` output opens cleanly in Word and matches the template

---

## Working style

- Ask before inventing anything TESDA-specific. Wrong-but-plausible regulatory formatting is worse
  than an unanswered question, because it fails late and discredits the tool.
- Report honestly. If M0 comes back 6/10, say so and use the retry edge as the fix — do not quietly
  retry until you get a good number.
- Prefer deterministic over LLM wherever both work. Every node that can avoid a call should.
- Commit per milestone.
