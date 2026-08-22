# tesda-cbc-agent — Architecture

**Status:** pre-implementation — this describes the target architecture, not code that
exists. Check `BUILD_CHECKLIST.md` for what is actually built.

This is the orientation document: the shape of the system, the boundaries between its
parts, and the rules that hold across it. It is deliberately narrower than
`SYSTEM_DESIGN.md`, which carries the full data model, API contracts, error-handling deep
dive, and scaling notes — read that for detail. `PRD.md` covers requirements;
`CBC_DOMAIN_RULES.md` is the domain source of truth; `PLAN.md` §1 holds the locked
decisions this architecture is downstream of.

---

## 1. Shape

```
Gradio (minimal UI)  ──▶  FastAPI  ──enqueue──▶  Redis (RQ)
        ▲                     │                       │
        └── status/download ──┘                       ▼
                                                  RQ worker
                                             (runs LangGraph graph)
                                                      │
                        ┌──────────────┬──────────────┼──────────────┐
                        ▼              ▼              ▼              ▼
                  Groq/OpenRouter   RetrieverProtocol  Pinecone     Supabase
                     (LLM)         (few-shot default) (unused by  (Postgres + Storage)
                                                        default —
                                                        RAG insurance)
```

All three of the TR PDF, the Enhanced CBC `.docx`, and the trainer's Session Plan (PDF)
are uploaded up front (`source_uploads.role` = `tr` | `cbc` | `session_plan` |
`reference`) — neither the CBC nor the Session Plan is a pipeline output; CBLM is the
system's only generated output. See §3.

**The load-bearing boundary: FastAPI never calls an LLM.** All AI work happens inside the
worker process. The API's job is to accept uploads, enqueue work, and serve status and
files — so it stays responsive for polling while a multi-minute job runs. If a code
change would put an LLM call behind an HTTP handler, that change is wrong.

## 2. Components

| Component | Responsibility | Explicitly not responsible for |
|---|---|---|
| **Gradio UI** | Upload form (TR + Enhanced CBC + Session Plan), job-status view (`gr.Timer` polling), download links; own process, calls FastAPI over HTTP | Any product surface beyond those three things; being mounted into the FastAPI app |
| **FastAPI** | Sole API surface; upload + fail-fast validation (TR text-layer, CBC format, Session Plan format); enqueue; status; signed downloads | LLM calls, generation logic, orchestration |
| **Redis / RQ** | Job queue and worker lifecycle | Application state (that lives in Postgres) |
| **LangGraph graph** | The agent workflow — nodes, explicit state, conditional branching | Being simplified into a linear chain; generating the CBC Module or the Session Plan |
| **Supabase** | Postgres (projects, source uploads, parsed structures, jobs, events, documents) + Storage (TR PDFs, CBC `.docx`, Session Plan PDFs, generated `.docx`) | Auth (not used in MVP), vectors |
| **Pinecone** | Exemplar corpus vectors, filtered by `section_type` — kept as RAG insurance, unused by default | Holding any TR content |

Supabase is used as a database and a bucket. No auth, no RLS, no edge functions in MVP.

## 3. The pipeline

All three of the TR PDF, the Enhanced CBC `.docx`, and the trainer's Session Plan are
required uploads — neither the CBC Module nor the Session Plan is **generated**; both are
input. This deletes the pipeline's hardest node (the old TR→CBC Formatter) and its
compounding-error chain (locked `PLAN.md` §1, 2026-08-18), and removes topic-numbering
guesswork from CBLM drafting by sourcing it straight from the parsed Session Plan
(`PLAN.md` §1 Session Plan row, revised 2026-08-22 twice).

One job, one graph run, one interrupt — no separate `generate` job or job-kind split.

```
Parser (TR + CBC + Session Plan) ──▶ align_sources
                                          │
                                          ▼
                              ⏸ Interrupt — trainer reviews
                              TR↔CBC↔Session-Plan alignment,
                              picks UC + LO(s)
                              (checkpoint, job ends)
                                          │
                                 resume ──┘
                                          ▼
                          CBLM Drafter (4 sections per LO,
                          topic numbering read from parsed
                          Session Plan — not derived)
                                          │
                                          ▼
                Validator ──fail──▶ back to CBLM Drafter
                     │               (bounded: 2 retries)
                    pass
                     ▼
            Export (docxtpl → TESDA templates)
```

Node responsibilities:

- **Parser** — `pdfplumber.extract_tables()` on the TR → whitespace repair → LLM
  structuring → Pydantic validation; a `.docx` parse of the Enhanced CBC (no LLM); a
  `pdfplumber.extract_tables()` parse of the Session Plan (no LLM — numbering and topic
  labels are literal on the page, so this extracts rather than interprets). Table-aware
  by requirement across all three: flat text extraction loses column boundaries and
  misattributes performance criteria (or topic numbering) *silently*. Output is cached in
  `parsed_structures.structure` so re-runs skip re-parsing.
- **`align_sources`** — TR *Element* ↔ CBC *Learning Outcome* ↔ Session Plan LO heading,
  a three-way join. Not an LLM step; unmatched pairs are surfaced, never guessed.
- **Interrupt** — the graph pauses right after `align_sources` for the trainer to review
  the alignment and pick a Unit of Competency and Learning Outcome(s)
  (`SYSTEM_DESIGN.md` §5, `DATA_MODEL_DIAGRAMS.md` §2). The RQ job ends here; state lives
  in `jobs.checkpoint`. Not a failure or a stall — and not a plain job boundary either:
  it's a genuine LangGraph `interrupt_before`, kept deliberately even though its original
  reason (Session Plan review) is gone, because it's one of only two things `PLAN.md`
  names as what makes this an agent workflow rather than a script.
- **CBLM Drafter** — LLM, TR-grounded. Facts and traceability come from the TR via
  prompt; the CBC drives per-LO generation; topic numbering comes from the parsed Session
  Plan, not from the drafter; style is supplied deterministically by the 2026 Style
  Specification Matrix + Caravan house rules, not by retrieval (`CBC_DOMAIN_RULES.md` §1,
  §8, §9). `RetrieverProtocol` (few-shot default) is kept behind the interface as
  insurance, not the grounding source. Everything generated must trace to an Assessment
  Criterion → CBC assessment criterion → TR performance criterion / critical aspect.
- **Validator** — deterministic structural checks only, asserting the traceability
  chain above. Never an LLM-as-judge.
- **Export** — `docxtpl` against real TESDA template files.

**The retry edge is the architecture's centerpiece.** Validator → back to the specific
failing drafter, with the failure reason appended to prompt context, bounded. It is what
makes this an agent workflow rather than a script, and it is what the capstone is graded
on. Do not collapse it.

## 4. State

One Pydantic `PipelineState` threads through the graph (`tr`, `cbc`, `session_plan`,
`los[]`, `job_status`), with per-LO `LOState` carrying that LO's parsed `topics`
(sourced from the Session Plan, not drafted), CBLM sections, validation result, and
retry count. Shape is in `PLAN.md` §2.

Two rules:

1. **State is explicit and typed.** Nodes read and return `PipelineState`; nothing passes
   between nodes out of band.
2. **Retry counters are per-LO, per-section** — not global. Bounding globally would let
   one pathological section consume the whole budget.

## 5. Persistence

Full schema in `SYSTEM_DESIGN.md` §3 and `DATA_MODEL_DIAGRAMS.md` §1. The tables and why
each exists:

- `projects` — document-set container. Multiple projects, no versioning.
- `source_uploads` — storage path + `role` (`tr` | `cbc` | `session_plan` | `reference`)
  for each uploaded file. Three required uploads per project (TR + Enhanced CBC +
  Session Plan).
- `parsed_structures` — one row per project holding the parsed TR/CBC/Session-Plan
  `structure` (JSONB, includes per-LO `topics`) plus any `unmatched` elements the
  three-way join couldn't resolve.
- `jobs` — one row per run. No `kind` column — one job type, spanning parse through
  export, that pauses at the `align_sources` interrupt and resumes via
  `POST /jobs/{id}/resume`.
- `corpus_chunks` — RAG corpus metadata, retained as **insurance only** and unused by
  default (the MVP retriever is few-shot, no vector store); vectors would live in
  Pinecone keyed by `vector_id`, filterable by `section_type`.
- `job_events` — per-node trace (node, LO, started/succeeded/failed/retried, detail).
  Normalized on purpose: it is simultaneously the UI progress feed, the debugging log,
  and the capstone's evidence that the orchestration is real. A `jobs.progress` blob
  would serve the progress bar and none of the rest.
- `generated_documents` — one row per output artifact, carrying `ok` or
  `failed_after_retries`.

UUID keys throughout — a cheap guard against URL guessing in an unauthenticated MVP.

## 6. Failure handling

Three layers, deliberately not conflated (detail in `SYSTEM_DESIGN.md` §5):

1. **Transient API failure** (429s, timeouts, 5xx) — `tenacity` exponential backoff,
   3–5 attempts, wrapped around every external call. Plumbing; invisible when it works.
2. **Validation failure** — the LangGraph retry edge. Bounded at 2 per section. On
   exhaustion: mark the document `failed_after_retries`, log a `job_events` row, **keep
   going**. Partial success beats fail-fast: one bad LO must not zero out four good ones.
   The job ends `done` with a partial-failure summary unless *everything* failed.
3. **Job-level failure** — status `failed`, error surfaced verbatim. **No automatic
   whole-job retry** — nodes have side effects (Storage writes) and blind re-runs burn
   free-tier rate-limit budget. The user re-triggers manually.

## 7. Constraints that shape the design

- **$0 API spend.** Every model, embedding, and vector-store choice is free-tier. The
  real ceiling is not throughput but **rate limits** (~30 req/min): a ~30-call run must
  be paced, not fanned out.
- **No GPU, no local models.** Rules out layout-model parsers like Docling.
- **No OCR.** TRs are digitally-typed; the text layer carries OCR-era spacing damage
  (`"Pre pared"`), which the whitespace-repair pass exists to fix before that damage gets
  copied verbatim into generated text.
- **Single user, single machine.** No HA, no failover, no worker pool, no auth.

## 8. Boundaries worth defending

Regressions to watch for — each of these is a locked decision, and any task that seems to
require crossing one should be flagged rather than implemented (`CLAUDE.md`):

- LLM calls inside FastAPI request handlers.
- Flat-text TR (or Session Plan) extraction replacing table-aware extraction.
- The CBC Module or the Session Plan becoming a generated artifact instead of a
  required upload.
- `draft_cblm` deriving or inventing topic numbering instead of reading it from the
  parsed Session Plan.
- Style being supplied by exemplar retrieval instead of the deterministic Style
  Specification Matrix + house rules.
- TRs entering the retrieval corpus.
- An LLM-as-judge replacing deterministic validation.
- The graph collapsing into a linear chain — losing the conditional retry edge, **or**
  losing the `align_sources` interrupt (e.g. reverting it to a plain job boundary) —
  those are the only two things that make this an agent workflow rather than a script.
- Adding auth, a full trainer dashboard, or full-qualification runs before M5.

## 9. Growth path

In the order they'd be reintroduced (`SYSTEM_DESIGN.md` §8):

1. Auth + `user_id` scoping on every query, plus per-user Pinecone namespaces.
2. Worker pool split by node weight (Parser/Retriever cheap, Drafters heavy).
3. Full-qualification runs chunked into per-competency sub-jobs — at ~4× the calls, rate
   limits become the dominant design constraint.
4. Job checkpoint/resume, if manual re-triggering proves costly.
5. A paid tier for Drafter/Validator nodes only, if M0 shows the free model unreliable.
6. LangSmith tracing — near-zero code change, useful visual run traces for the writeup.
