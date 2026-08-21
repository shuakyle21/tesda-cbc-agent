# tesda-cbc-agent — System Design

Companion to `PLAN.md` (scope, decisions, milestones). This document covers the
technical architecture: data model, API contracts, error handling, and what changes as
the system grows. Where `PLAN.md` made a product/scope call, this document treats it as
fixed input. Where a decision below is an implementation detail not covered by the
grilling session, it's marked **(assumption)** — flag if you'd choose differently.

---

## 1. Requirements

### Functional
**Revised 2026-08-18** — see `CBC_DOMAIN_RULES.md` and `PLAN.md` §1.

- Accept **two required uploads**: a TR PDF and an Enhanced CBC `.docx`, scoped to one
  competency (~4–5 LOs) for MVP.
- Parse the TR **in full** (grounding authority) and the CBC (per-LO structure), then join
  TR *Element* ↔ CBC *Learning Outcome*.
- Present the parsed structure so the trainer can **select a Unit of Competency and its
  Learning Outcomes** before generation begins.
- Generate two artifact types: **Session Plans** (1 per LO) and **CBLM section-sets**
  (4 sections per topic). The CBC Module is **not** generated — it is an input.
- **Pause after the Session Plan** for trainer review/edit, then generate the CBLM
  *aligned to the approved plan*.
- Ground generated content by traceability (topic → CBC criterion → TR criterion), not by
  exemplar retrieval.
- Validate generated content structurally; retry the specific failing draft (bounded)
  before giving up on that section.
- Export everything to `.docx` matching real TESDA templates.
- Surface job progress to the client; provide downloadable output on completion.
- Persist multiple document-sets ("projects") even though MVP is single-user.

### Non-functional
- **Cost:** $0 API spend for MVP — free-tier LLM + embeddings only.
- **Reliability:** the agent graph must not silently produce malformed output, and a
  single bad LO/section must not sink the entire run (partial success, not all-or-nothing).
- **Observability:** every node transition is inspectable, mid-run — this is also the
  capstone's evidence that the "agent workflow" is real orchestration, not a black box.
- **Latency:** not real-time. A full competency run (~25–30 LLM calls) completing in
  low single-digit minutes is acceptable; this is a background job, not a request.
- **Availability:** none required beyond local dev — single user, single machine.

### Constraints
- Solo build, no fixed deadline (see `PLAN.md` §"Deadline" for why that's treated as a risk).
- Stack fixed by `PLAN.md`: FastAPI + LangGraph + RQ/Redis + Supabase (Postgres +
  Storage) + Gradio (minimal UI, separate process) + free-tier Groq/OpenRouter. **Pinecone/embeddings cut
  from MVP** — retrieval sits behind `RetrieverProtocol` with a few-shot default.

---

## 2. High-level design

```
┌────────────┐   upload TR (.pdf) + CBC (.docx)   ┌──────────────┐
│   Gradio   │ ─────────────────────────────────▶ │   FastAPI    │
│ (minimal   │                                     │  (sole API   │
│  UI, own   │ ◀───────────────────────────────── │   surface)   │
│  process)  │   status / review / download        └──────┬───────┘
└────────────┘                                             │
       ▲                                                   │ enqueue
       │  awaiting_review                                  ▼
       │  ──────────────▶ trainer edits            ┌──────────────┐
       │       the Session Plan, resumes           │  Redis (RQ)  │
       │                                           └──────┬───────┘
       │                                                  │ dequeue
       │                                                  ▼
       │                                           ┌───────────────┐     ┌────────────────┐
       └────────────────────────────────────────── │   RQ worker   │────▶│ Groq/OpenRouter│
                                                   │ runs LangGraph│     │ (LLM, free tier)│
                                                   └───────┬───────┘     └────────────────┘
                                                           │
                                                           ▼
                                                   ┌──────────────┐
                                                   │  Supabase    │
                                                   │  Postgres +  │
                                                   │  Storage     │
                                                   └──────────────┘
```

**Two job kinds, one interrupt.** A `parse` job produces the structure the trainer selects
from; a `generate` job drafts the Session Plan, **ends at the interrupt**, and is resumed
by a fresh job that drafts the CBLM against the approved plan. No worker slot is ever held
waiting on a human.

**No vector store.** Retrieval sits behind `RetrieverProtocol`; the MVP implementation is a
few-shot lookup. A Pinecone adapter is retained but unused — see `PLAN.md` §1.

### Data flow
1. Client uploads **both** sources → `POST /projects/{id}/sources` (×2, `role=tr｜cbc`) →
   FastAPI streams each to Supabase Storage, creates a `source_uploads` row, and
   *synchronously* validates (TR: text layer present? CBC: really `.docx`?).
2. `POST /projects/{id}/parse` → `parse` job → parses both, joins TR *Element* ↔ CBC
   *Learning Outcome*, writes `parsed_structures` (with any `unmatched` pairs).
3. Client reads `GET /projects/{id}/structure` and the trainer picks a Unit of Competency
   and Learning Outcomes.
4. `POST /projects/{id}/generate` → `generate` job → drafts Session Plans, persists the
   checkpoint, sets `status = awaiting_review`, and **exits**.
5. Trainer reviews/edits, then `POST /jobs/{id}/resume` → new job resumes from the
   checkpoint → CBLM drafted against the **approved** plan → house rules → validate/retry
   → export.
6. Client polls `GET /jobs/{job_id}`; on `done`, fetches `GET /projects/{id}/documents`
   for signed download URLs.

FastAPI never calls the LLM directly — all AI work happens inside the RQ worker process
running the LangGraph graph, so the API stays responsive for status polling while a job
runs. **(assumption)** Single worker process for MVP; see §6 for scaling this.

---

## 3. Data model (Postgres, via Supabase)

```sql
projects (
  id            uuid primary key,
  title         text not null,          -- e.g. "BPP NC II — Prepare Bakery Products"
  qualification_code text,
  created_at    timestamptz default now()
)

source_uploads (                        -- was tr_uploads; two required sources now
  id            uuid primary key,
  project_id    uuid references projects(id),
  role          text not null,           -- 'tr' | 'cbc' | 'reference'
  mime_type     text not null,           -- TR = application/pdf, CBC = .docx
  storage_path  text not null,
  created_at    timestamptz default now()
)

parsed_structures (                      -- cache + the source of the UC/LO dropdown
  id            uuid primary key,
  project_id    uuid references projects(id),
  structure     jsonb not null,          -- Pydantic-validated: UCs -> LOs -> criteria,
                                           -- with TR Element <-> CBC LO join results
  unmatched     jsonb,                   -- join failures, surfaced to the human
  created_at    timestamptz default now()
)

session_plans (                          -- editable artifact, not just a rendered file
  id            uuid primary key,
  job_id        uuid references jobs(id),
  uc_id         text not null,
  lo_id         text not null,
  content       jsonb not null,          -- 7-column matrix rows (see CBC_DOMAIN_RULES §9)
  approved_at   timestamptz,             -- null until the trainer resumes the job
  created_at    timestamptz default now()
)

corpus_chunks (                          -- RAG INSURANCE ONLY, unused by default.
                                          -- Retrieval is behind RetrieverProtocol; the
                                          -- MVP uses FewShotRetriever (no vector DB).
                                          -- See PLAN.md "Vector store / RAG" row.
  id            uuid primary key,
  section_type  text not null,           -- 'session_plan' | 'info_sheet' | 'task_sheet'
                                          -- | 'self_check' | 'answer_key' | 'cbc_module'
  content       text not null,
  vector_id     text unique,             -- null unless a vector backend is enabled
  source_doc    text,                    -- provenance, for corpus auditing
  created_at    timestamptz default now()
)
-- unused by default; kept so enabling a vector backend is an adapter swap

jobs (
  id            uuid primary key,
  project_id    uuid references projects(id),
  kind          text not null,           -- 'parse' | 'generate'
  status        text not null,           -- parsing|aligning|drafting_plan
                                          -- |awaiting_review|drafting_cblm|validating
                                          -- |exporting|done|failed
  checkpoint    jsonb,                   -- LangGraph checkpointer state; required to
                                          -- resume after the Session Plan interrupt
  error         text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
)

job_events (                             -- per-node trace, drives both UI progress
  id            uuid primary key,        -- and the agent-workflow demo/debug story
  job_id        uuid references jobs(id),
  node_name     text not null,           -- 'parser' | 'retriever' | 'session_plan_drafter'
                                          -- | 'cblm_drafter' | 'align_sources' | 'validator'
  lo_id         text,                    -- null for job-level nodes (parser, formatter)
  status        text not null,           -- started|succeeded|failed|retried
  detail        jsonb,                   -- e.g. {"retry_count": 1, "reason": "..."}
  created_at    timestamptz default now()
)

generated_documents (
  id            uuid primary key,
  project_id    uuid references projects(id),
  job_id        uuid references jobs(id),
  doc_type      text not null,           -- 'session_plan' | 'info_sheet' | 'task_sheet'
                                          -- | 'self_check' | 'answer_key'
  lo_id         text,                    -- null for cbc_module
  section_type  text,                    -- null unless doc_type = 'cblm_section'
  content       jsonb not null,          -- STRUCTURED content, not just the rendered file.
                                          -- Required so post-MVP chat / "Improve with AI"
                                          -- can read and patch a section without
                                          -- re-parsing the .docx. See §9.
  storage_path  text not null,           -- rendered .docx
  status        text not null,           -- 'ok' | 'failed_after_retries'
  created_at    timestamptz default now()
)
```

**Why `job_events` as its own table (assumption):** a single `jobs.progress` JSON blob
would work for the status view, but a normalized event log is what lets the minimal UI
(or a debug endpoint) show "Parser succeeded in 4s → align_sources succeeded → Session Plan
LO-2 failed validation, retrying (1/2) → ..." — that trace *is* the agent-workflow
evidence for the capstone, not an afterthought.

---

## 4. API contracts

```
POST   /projects
       { title, qualification_code? }              → { id }

POST   /projects/{id}/sources                       (multipart; call twice)
       { role: "tr" | "cbc" }
       → { source_upload_id }
       or 400 { error: "no text layer detected" }        (TR, PDF)
       or 400 { error: "CBC must be .docx" }             (CBC, format guard)

POST   /projects/{id}/parse                         → { job_id }   kind=parse

GET    /projects/{id}/structure                     → { ucs: [{ id, title,
         los: [{ id, title, tr_element_id }] }], unmatched: [...] }
       Drives the UC / Learning Outcome dropdown.

POST   /projects/{id}/generate                      → { job_id }   kind=generate
       { uc_id, lo_ids: [...], scope: "session_plan" | "cblm" | "both" }

POST   /jobs/{job_id}/resume                        → { job_id }
       { session_plan_id, action: "approve" | "edit", content? }
       Valid only while status = awaiting_review. Resumes the graph from the
       checkpoint; the CBLM drafter reads the approved/edited plan.

GET    /jobs/{job_id}
       → { status, events: [job_event...], error? }

GET    /jobs/{job_id}/events                         (optional, if events list grows large)
       → [job_event...]

GET    /projects/{id}/documents
       → [{ doc_type, lo_id?, section_type?, status, download_url }]

GET    /documents/{doc_id}/download
       → signed Supabase Storage URL (redirect) or streamed file
```

No auth middleware for MVP (per `PLAN.md` — single user, local dev). **(assumption)**
`project_id`/`job_id` are UUIDs, not sequential — cheap guard against casual URL
guessing even without real auth, at zero cost.

---

## 5. Deep dive: error handling and retry logic

Three distinct retry/failure layers — don't conflate them:

1. **Transient API failures** (Groq/OpenRouter/embeddings 429s, timeouts, 5xxs).
   Wrap every external call with exponential backoff (`tenacity`, 3–5 attempts). This is
   plumbing, not part of the graded agent logic — it should be invisible when it works.

2. **Validation failure → LangGraph retry edge** (the graded conditional branching).
   Validator fails a specific LO's Session Plan or CBLM section → route back to that
   section's Drafter with the validation failure reason appended to its prompt context.
   Bounded at **2 retries per section (assumption)**. On exhausting retries: mark that
   `generated_documents` row `status = 'failed_after_retries'`, log a `job_events` entry,
   and **let the rest of the pipeline continue** — one bad LO does not fail the whole
   competency run. The job's final status is `done` with a partial-failure summary, not
   `failed`, unless *everything* failed.

3. **Job-level failure** (RQ job crashes: Parser can't extract anything usable, out of
   retries on a transient error, uncaught exception). Job status → `failed`, error
   surfaced verbatim in `jobs.error`. **Do not auto-retry the whole job** — nodes have
   side effects (Storage writes, corpus reads) and re-running from scratch on a partial
   failure wastes free-tier rate-limit budget. **(assumption, revisit if it becomes
   annoying):** user re-triggers manually via a new `POST /generate` call; add
   checkpoint/resume only if manual re-runs prove costly in practice.

**A fourth state that is not a failure: `awaiting_review`.** The Session Plan interrupt
suspends the graph mid-run. It must not be modelled as an error, a timeout, or a stalled
job — the UI shows it as a state requiring action, and the RQ job **ends** at the interrupt
(the checkpoint is persisted in `jobs.checkpoint`) rather than blocking a worker slot for
however long the trainer takes. `POST /jobs/{id}/resume` enqueues a *new* RQ job that
resumes the graph from that checkpoint. Consequences worth stating: a job may sit in
`awaiting_review` indefinitely, so any job-timeout sweep must exclude that status; and
resuming twice must be idempotent — guard on `session_plans.approved_at` being null.

**Fail-fast vs partial-success is the one design call here worth flagging explicitly:**
partial success (continue past a failed LO, mark it, keep going) was chosen over
fail-fast (abort the whole run on first validation failure) because a capstone demo
where "one LO's task sheet had a formatting hiccup" doesn't want to also mean "you get
zero output for the other four LOs." This also happens to be the more realistic
behavior for a real tool.

---

## 6. Scale and reliability

### Load estimate (MVP)
One competency run ≈ 1 Parser call + (5 LOs × ~2 section-type retrieval queries) +
(5 Session Plan drafts + 5 × 4 CBLM drafts) ≈ **25–30 LLM calls per run**, single user,
essentially zero concurrency. The real constraint isn't throughput, it's free-tier
**rate limits** (e.g. Groq's free tier is commonly ~30 req/min depending on model) —
Milestone 0's smoke test should also note observed rate-limit behavior, since a 25–30
call run may need pacing (stagger Drafter calls, don't fan them all out at once).

### What doesn't need solving now, and why
- **Horizontal scaling / multiple workers:** not needed at single-user MVP. If this
  became a real multi-trainer tool, add RQ workers and consider separating "interactive"
  jobs (Parser, cheap) from "heavy" jobs (Drafters) into different queues with different
  worker pools.
- **Failover/redundancy:** none — single local Redis, single Supabase project, single
  Supabase project. A capstone demo doesn't need HA; note it as a known, deliberate gap
  rather than an oversight.
- **Auth/multi-tenancy:** deferred per `PLAN.md`. Re-enabling Google OAuth via Supabase
  is the first thing to reintroduce if this becomes a real product, at which point every
  query in §3 needs a `user_id` scope added.
- **Full-qualification scope (all competencies, not one):** the milestone structure in
  `PLAN.md` treats this as a config change once the single-competency loop is proven —
  but at that volume (~4× the calls above), free-tier rate limits stop being a minor
  pacing concern and become the dominant design constraint; likely needs chunking into
  one sub-job per competency rather than one job for the whole qualification.

### Observability
Structured logging on every node entry/exit (timing, retry count) plus the
`job_events` table covers MVP observability. **Worth considering (not required):**
LangGraph has native LangSmith integration — free tier, near-zero code change (env vars
+ existing graph), and gives a visual trace of every run. For a capstone graded on the
agent workflow specifically, a LangSmith trace screenshot/link is a strong piece of
evidence to include in the writeup. Flagging as optional, not folding into the milestone
list — it's additive, not a blocker.

---

## 7. Trade-off summary

| Decision | Chosen | Alternative | Why not the alternative |
|---|---|---|---|
| Partial vs fail-fast on validation failure | Partial success, mark failed sections | Fail-fast, abort whole run | One bad LO shouldn't zero out four good ones; also more realistic |
| Job-level retry | Manual re-trigger, no auto-retry-whole-job | RQ automatic job retry | Side-effecting nodes (Storage writes) make blind re-runs wasteful and non-idempotent |
| Progress tracking | Normalized `job_events` table | Single `jobs.progress` JSON blob | Event log doubles as the agent-workflow trace/demo evidence, not just a progress bar |
| Corpus scope | Global `corpus_chunks`, not per-project | Per-project corpus | Exemplars are reusable style references across qualifications; no reason to silo them |
| TR validity check | Fail fast at upload (before job enqueue) | Discover failure inside the job | Cheap check, avoids burning a job slot and rate-limit budget on unusable input |
| Human-in-the-loop shape | Two jobs (parse / generate) **plus** a LangGraph interrupt at Session Plan → CBLM | One job that blocks, or a fully synchronous parse | A blocked worker holds a slot for an unbounded human delay; a synchronous 91-page parse blows the HTTP timeout. Ending the job at the interrupt and resuming from a checkpoint costs neither |
| Grounding | TR-grounded traceability chain | Exemplar RAG over a vector store | The Style Specification Matrix supplies style as *checkable rules*; retrieval's original job disappeared. Traceability is assertable, RAG similarity is not |
| CBC handling | Required `.docx` input, parsed deterministically | Generated by an LLM node from the TR | Generating it means inventing course structure the human has already authored, and every downstream artifact inherits its errors |

---

## 8. What to revisit as the system grows

1. Reintroduce auth (Supabase Google OAuth) + `user_id` scoping — first thing, if this
   becomes multi-trainer.
2. Move from single RQ worker to a worker pool, likely split by node weight
   (parsers cheap, drafters heavy).
3. Chunk full-qualification runs into per-competency sub-jobs once single-competency is
   proven, driven by free-tier rate-limit reality rather than assumption.
4. Add checkpoint/resume to jobs if manual re-triggering after a job-level failure
   proves costly in practice.
5. Consider a paid LLM tier for the Drafter/Validator nodes specifically (not a full
   swap) if Milestone 0's smoke test shows the free model is unreliable at structured
   output — see `PLAN.md` §3.
6. Add LangSmith tracing if the capstone writeup would benefit from visual run traces.

---

## 9. Post-MVP: conversational layer over parsed + generated content

**Not in scope for the capstone.** Recorded so today's schema does not block it.

The idea: a chat surface and an "Improve with AI" control over a project's own content —
*"what are the LOs in UC 1"*, *"add more learning content to this info sheet"*.

### Three mechanisms, only one of which is RAG

| Ask | Mechanism | Not this |
|---|---|---|
| "What are the LOs in UC 1?" | **Structured query** over `parsed_structures.structure` | Not vector search — it can return 4 of 5 LOs and sound certain. Silently dropping an LO from a compliance document is the worst available failure |
| "Add more content here" / "Improve with AI" | **Targeted regeneration** — assemble context by ID (section + CBC criteria + TR grounding + house rules), re-run the drafter with the existing draft in the prompt | Not retrieval at all |
| "How did I phrase this in my other CBLMs?" | **Genuine RAG** across the user's own finished output | — |

The third is where a vector store finally earns its keep — and note it retrieves the
user's *own* material, so the cross-qualification leakage problem that shaped the original
corpus rules does not arise.

### What today's design must not foreclose

1. **`generated_documents.content jsonb`** — structured content stored alongside the
   rendered `.docx`. Without it, every edit means re-parsing your own Word output.
2. **Per-section regeneration.** `USER_FLOWS.md` §3 states *"There is no per-document retry
   endpoint… the refusal is the design."* That refusal is correct **for MVP** — a retry
   button that could only restart the whole run would be lying. But "Improve with AI" *is*
   per-section regeneration, so record this as **not in MVP**, not *never*.
3. **`RetrieverProtocol`** already exists as the seam for mechanism 3.

### What must stay true if it is built

Every regenerated section re-enters the **same validator** — numbering integrity,
traceability, Style Spec §8. An "Improve with AI" path that bypasses validation would let
a human-in-the-loop feature quietly break the compliance guarantees the pipeline exists to
enforce. And the AI-assistance disclosure (§8 of `CBC_DOMAIN_RULES.md`) still applies.
