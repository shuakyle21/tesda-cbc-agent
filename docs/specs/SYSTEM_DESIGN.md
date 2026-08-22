# tesda-cbc-agent — System Design

Companion to `PLAN.md` (scope, decisions, milestones). This document covers the
technical architecture: data model, API contracts, error handling, and what changes as
the system grows. Where `PLAN.md` made a product/scope call, this document treats it as
fixed input. Where a decision below is an implementation detail not covered by the
grilling session, it's marked **(assumption)** — flag if you'd choose differently.

---

## 1. Requirements

### Functional
**Revised 2026-08-18, then twice more on 2026-08-22** — see `CBC_DOMAIN_RULES.md` and
`PLAN.md` §1.

- Accept **three required uploads**: a TR PDF, an Enhanced CBC `.docx`, and a trainer's
  Session Plan (PDF), scoped to one competency (~4–5 LOs) for MVP.
- Parse the TR **in full** (grounding authority), the CBC (per-LO structure), and the
  Session Plan (per-LO topic numbering), then join TR *Element* ↔ CBC *Learning Outcome*
  ↔ Session Plan LO heading.
- Present the parsed structure so the trainer can **review the TR↔CBC↔Session-Plan
  alignment and select a Unit of Competency and its Learning Outcomes** before generation
  begins.
- Generate **CBLM section-sets only** (4 sections per topic) — this system's sole
  generated output. Neither the CBC Module nor the Session Plan is generated; both are
  required, parsed inputs.
- **Pause once, right after `align_sources`** (a genuine LangGraph interrupt, not a plain
  job boundary — see §2), for the trainer to review the alignment and pick UC + LO(s),
  then generate CBLM using the topic numbering read directly from the parsed Session Plan.
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
- **Latency:** not real-time. A full competency run (~30 LLM calls, see §6) completing in
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
┌────────────┐  upload TR (.pdf) + CBC (.docx) + Session Plan (.pdf)  ┌──────────────┐
│   Gradio   │ ─────────────────────────────────────────────────────▶│   FastAPI    │
│ (minimal   │                                                        │  (sole API   │
│  UI, own   │ ◀───────────────────────────────────────────────────  │   surface)   │
│  process)  │   status / review / download                          └──────┬───────┘
└────────────┘                                                               │
       ▲                                                                     │ enqueue
       │  awaiting_review                                                    ▼
       │  ──────────────▶ trainer reviews the                       ┌──────────────┐
       │       TR↔CBC↔Session-Plan alignment,                       │  Redis (RQ)  │
       │       picks UC + LO(s), resumes                            └──────┬───────┘
       │                                                                    │ dequeue
       │                                                                    ▼
       │                                                             ┌───────────────┐     ┌────────────────┐
       └──────────────────────────────────────────────────────────  │   RQ worker   │────▶│ Groq/OpenRouter│
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

**One job, one interrupt.** A single job runs the whole graph — parse (all three
sources), align, **[interrupt]**, `draft_cblm`, house rules, validate, export. There is no
`parse`/`generate` job-kind split: `POST /projects/{id}/parse` starts the only job, and
`POST /jobs/{id}/resume` continues that **same** graph run from its checkpoint rather than
starting a new one. The job **ends** at the interrupt (checkpoint persisted to
`jobs.checkpoint`) — no worker slot is ever held waiting on a human.

**No vector store.** Retrieval sits behind `RetrieverProtocol`; the MVP implementation is a
few-shot lookup. A Pinecone adapter is retained but unused — see `PLAN.md` §1.

### Data flow
1. Client uploads **all three** sources → `POST /projects/{id}/sources` (×3,
   `role=tr｜cbc｜session_plan`) → FastAPI streams each to Supabase Storage, creates a
   `source_uploads` row, and *synchronously* validates (TR: text layer present? CBC:
   really `.docx`? Session Plan: really a PDF with the expected table columns?).
2. `POST /projects/{id}/parse` → the **only** job-start endpoint → parses all three,
   joins TR *Element* ↔ CBC *Learning Outcome* ↔ Session Plan LO heading, writes
   `parsed_structures` (with any `unmatched` pairs), then **hits the interrupt**: persists
   the checkpoint, sets `status = awaiting_review`, and exits.
3. Client reads `GET /projects/{id}/structure` and the trainer reviews the alignment and
   picks a Unit of Competency and Learning Outcomes.
4. `POST /jobs/{id}/resume` with `{ uc_id, lo_ids }` → resumes the **same** job from its
   checkpoint → `draft_cblm` reads topic numbering straight from the parsed Session Plan
   for the selected LO(s) → house rules → validate/retry → export.
5. Client polls `GET /jobs/{job_id}`; on `done`, fetches `GET /projects/{id}/documents`
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

source_uploads (                        -- was tr_uploads; three required sources now
  id            uuid primary key,
  project_id    uuid references projects(id),
  role          text not null,           -- 'tr' | 'cbc' | 'session_plan' | 'reference'
  mime_type     text not null,           -- TR = application/pdf, CBC = .docx,
                                          -- Session Plan = application/pdf (assumed —
                                          -- confirm at M1, see PLAN.md §1 Input row)
  storage_path  text not null,
  created_at    timestamptz default now()
)

parsed_structures (                      -- cache + the source of the UC/LO dropdown
  id            uuid primary key,
  project_id    uuid references projects(id),
  structure     jsonb not null,          -- Pydantic-validated: UCs -> LOs -> criteria
                                           -- -> topics (number, content, subtopics),
                                           -- with TR Element <-> CBC LO <-> Session Plan
                                           -- heading join results
  unmatched     jsonb,                   -- join failures, surfaced to the human
  created_at    timestamptz default now()
)

-- session_plans table REMOVED 2026-08-22. Session Plan is a parsed, required upload,
-- not an editable artifact this system produces or the trainer edits in-app — its
-- per-LO topic list lives directly in parsed_structures.structure. There is nothing
-- left for a separate table to track (no approved_at: nothing here to approve, only to
-- read).

corpus_chunks (                          -- RAG INSURANCE ONLY, unused by default.
                                          -- Retrieval is behind RetrieverProtocol; the
                                          -- MVP uses FewShotRetriever (no vector DB).
                                          -- See PLAN.md "Vector store / RAG" row.
  id            uuid primary key,
  section_type  text not null,           -- 'info_sheet' | 'task_sheet' | 'self_check'
                                          -- | 'answer_key'
  content       text not null,
  vector_id     text unique,             -- null unless a vector backend is enabled
  source_doc    text,                    -- provenance, for corpus auditing
  created_at    timestamptz default now()
)
-- unused by default; kept so enabling a vector backend is an adapter swap

jobs (                                   -- one job kind now — no more parse/generate
  id            uuid primary key,        -- split (removed 2026-08-22, see §2)
  project_id    uuid references projects(id),
  status        text not null,           -- parsing|aligning|awaiting_review
                                          -- |drafting_cblm|validating|exporting
                                          -- |done|failed
  checkpoint    jsonb,                   -- LangGraph checkpointer state; required to
                                          -- resume after the align_sources interrupt
  error         text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
)

job_events (                             -- per-node trace, drives both UI progress
  id            uuid primary key,        -- and the agent-workflow demo/debug story
  job_id        uuid references jobs(id),
  node_name     text not null,           -- 'parse_tr' | 'parse_cbc' | 'parse_session_plan'
                                          -- | 'align_sources' | 'retriever' | 'cblm_drafter'
                                          -- | 'apply_house_rules' | 'validator'
  lo_id         text,                    -- null for job-level nodes (parsers, align_sources)
  status        text not null,           -- started|succeeded|failed|retried
  detail        jsonb,                   -- e.g. {"retry_count": 1, "reason": "..."}
  created_at    timestamptz default now()
)

generated_documents (
  id            uuid primary key,
  project_id    uuid references projects(id),
  job_id        uuid references jobs(id),
  doc_type      text not null,           -- 'info_sheet' | 'task_sheet' | 'self_check'
                                          -- | 'answer_key'
  lo_id         text not null,
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
(or a debug endpoint) show "Parser succeeded in 4s → align_sources succeeded → CBLM LO-2
Info Sheet failed validation, retrying (1/2) → ..." — that trace *is* the agent-workflow
evidence for the capstone, not an afterthought.

---

## 4. API contracts

```
POST   /projects
       { title, qualification_code? }              → { id }

POST   /projects/{id}/sources                       (multipart; call three times)
       { role: "tr" | "cbc" | "session_plan" }
       → { source_upload_id }
       or 400 { error: "no text layer detected" }        (TR, PDF)
       or 400 { error: "CBC must be .docx" }             (CBC, format guard)
       or 400 { error: "Session Plan must be a PDF with a Learning Content column" }
                                                          (Session Plan, format guard)

POST   /projects/{id}/parse                         → { job_id }
       The only job-start endpoint. Parses all three sources and pauses at the
       align_sources interrupt (status = awaiting_review) — see §2.

GET    /projects/{id}/structure                     → { ucs: [{ id, title,
         los: [{ id, title, tr_element_id,
                 topics: [{ number, content, subtopics }] }] }], unmatched: [...] }
       Drives the UC / Learning Outcome dropdown and the alignment-review view; `topics`
       is what was parsed from the Session Plan for that LO.

POST   /jobs/{job_id}/resume                        → { job_id }
       { uc_id, lo_ids: [...] }
       Valid only while status = awaiting_review. Resumes the **same** graph from its
       checkpoint; `draft_cblm` reads topic numbering for the selected LO(s) straight
       from `parsed_structures` — nothing to approve or edit, so no separate
       approve/edit payload shape.

GET    /jobs/{job_id}
       → { status, events: [job_event...], error? }

GET    /jobs/{job_id}/events                         (optional, if events list grows large)
       → [job_event...]

GET    /projects/{id}/documents
       → [{ doc_type, lo_id, section_type?, status, download_url }]

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
   Validator fails a specific LO's CBLM section → route back to that section's Drafter
   with the validation failure reason appended to its prompt context. (Session Plan has
   no drafter and nothing to validate here — its own failure mode, e.g. an unexpected
   table layout, is a `parse_session_plan` failure and belongs to point 3 below, the same
   as a TR/CBC parse failure.)
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

**A fourth state that is not a failure: `awaiting_review`.** The `align_sources` interrupt
suspends the graph mid-run. It must not be modelled as an error, a timeout, or a stalled
job — the UI shows it as a state requiring action, and the RQ job **ends** at the interrupt
(the checkpoint is persisted in `jobs.checkpoint`) rather than blocking a worker slot for
however long the trainer takes. `POST /jobs/{id}/resume` enqueues a *new* RQ job that
resumes the graph from that checkpoint. Consequences worth stating: a job may sit in
`awaiting_review` indefinitely, so any job-timeout sweep must exclude that status; and
resuming twice must be idempotent — guard on `jobs.status` still being `awaiting_review` at
resume time (transition it away from that status inside the same handler that starts the
resume), since there's no separate editable artifact left to carry an `approved_at` flag.

**Fail-fast vs partial-success is the one design call here worth flagging explicitly:**
partial success (continue past a failed LO, mark it, keep going) was chosen over
fail-fast (abort the whole run on first validation failure) because a capstone demo
where "one LO's task sheet had a formatting hiccup" doesn't want to also mean "you get
zero output for the other four LOs." This also happens to be the more realistic
behavior for a real tool.

---

## 6. Scale and reliability

### Load estimate (MVP)
One competency run ≈ 1 Parser call (TR structuring) + (5 LOs × ~2 section-type retrieval
queries) + (5 LOs × 4 CBLM drafts) ≈ **~30 LLM calls per run**, single user, essentially
zero concurrency. (Down from the earlier two-output design's ~35 — cutting Session Plan
*generation* removes 5 drafter calls, a modest saving since CBLM's 4-sections-per-topic
drafting was always the dominant cost, not Session Plan.) The real constraint isn't
throughput, it's free-tier **rate limits** (e.g.
Groq's free tier is commonly ~30 req/min depending on model) — Milestone 0's smoke test
should also note observed rate-limit behavior, since a ~30-call run may need pacing
(stagger Drafter calls, don't fan them all out at once).

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
| Human-in-the-loop shape | One job, one LangGraph interrupt right after `align_sources` | A plain two-job boundary (parse job ends, client starts a separate generate job) — no checkpoint needed | A plain boundary works too and is simpler, but the pipeline would then have zero mid-graph interrupts. `PLAN.md` names the interrupt as one of only two things that make this an agent workflow rather than a script, so it's kept even though Session Plan drafting — the original reason for a mid-graph pause — is gone (REVISED 2026-08-22) |
| Grounding | TR-grounded traceability chain | Exemplar RAG over a vector store | The Style Specification Matrix supplies style as *checkable rules*; retrieval's original job disappeared. Traceability is assertable, RAG similarity is not |
| CBC handling | Required `.docx` input, parsed deterministically | Generated by an LLM node from the TR | Generating it means inventing course structure the human has already authored, and every downstream artifact inherits its errors |
| Session Plan handling | Required PDF input, parsed deterministically (no LLM) | Generated by this system, or kept as an out-of-band reference doc | Parsing it directly lets `draft_cblm` reuse the trainer's real topic numbering instead of guessing one — see `CBC_DOMAIN_RULES.md` §9 (REVISED 2026-08-22, twice) |

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
