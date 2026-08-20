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
Next.js (minimal UI)  ──▶  FastAPI  ──enqueue──▶  Redis (RQ)
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

Both the TR PDF and the Enhanced CBC `.docx` are uploaded up front
(`source_uploads.role` = `tr` | `cbc` | `reference`) — the CBC is a required input, not
a pipeline output. See §3.

**The load-bearing boundary: FastAPI never calls an LLM.** All AI work happens inside the
worker process. The API's job is to accept uploads, enqueue work, and serve status and
files — so it stays responsive for polling while a multi-minute job runs. If a code
change would put an LLM call behind an HTTP handler, that change is wrong.

## 2. Components

| Component | Responsibility | Explicitly not responsible for |
|---|---|---|
| **Next.js UI** | Upload form (TR + Enhanced CBC), job-status view, download links | Any product surface beyond those three things |
| **FastAPI** | Sole API surface; upload + fail-fast text-layer check; enqueue; status; signed downloads | LLM calls, generation logic, orchestration |
| **Redis / RQ** | Job queue and worker lifecycle | Application state (that lives in Postgres) |
| **LangGraph graph** | The agent workflow — nodes, explicit state, conditional branching | Being simplified into a linear chain; generating the CBC Module |
| **Supabase** | Postgres (projects, source uploads, parsed structures, jobs, events, session plans, documents) + Storage (TR PDFs, CBC `.docx`, generated `.docx`) | Auth (not used in MVP), vectors |
| **Pinecone** | Exemplar corpus vectors, filtered by `section_type` — kept as RAG insurance, unused by default | Holding any TR content |

Supabase is used as a database and a bucket. No auth, no RLS, no edge functions in MVP.

## 3. The pipeline

Both the TR PDF and the Enhanced CBC `.docx` are required uploads — the CBC Module is
**not generated**; it is input. This deletes the pipeline's hardest node (the old
TR→CBC Formatter) and its compounding-error chain (locked `PLAN.md` §1, 2026-08-18).

```
Parser (TR + CBC) ──▶ Human selects UC + LO(s)
                            │
                            ▼
                  Session Plan Drafter (1 per LO) ──▶ Review interrupt
                                                       (checkpoint, job ends)
                                                              │
                                                     resume ──┘
                                                              ▼
                                              CBLM Drafter (4 sections per LO)
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
  structuring → Pydantic validation, plus a `.docx` parse of the Enhanced CBC.
  Table-aware by requirement: flat text extraction loses column boundaries and
  misattributes performance criteria *silently*. Output is cached in
  `parsed_structures.structure` so re-runs skip re-parsing.
- **Human selection** — trainer picks a Unit of Competency and one or more Learning
  Outcomes from the parsed CBC before generation starts. Not an LLM step.
- **Drafters** — LLM, TR-grounded. Facts and traceability come from the TR via prompt;
  the CBC drives per-LO generation; style is supplied deterministically by the 2026
  Style Specification Matrix + Caravan house rules, not by retrieval
  (`CBC_DOMAIN_RULES.md` §1, §8). `RetrieverProtocol` (few-shot default) is kept behind
  the interface as insurance, not the grounding source. Everything generated must trace
  to an Assessment Criterion → CBC assessment criterion → TR performance criterion /
  critical aspect.
- **Review interrupt** — the Session Plan pauses the graph for human approval/edit
  before CBLM drafting starts (`SYSTEM_DESIGN.md` §5, `DATA_MODEL_DIAGRAMS.md` §2). The
  RQ job ends here; state lives in `jobs.checkpoint`. Not a failure or a stall.
- **Validator** — deterministic structural checks only, asserting the traceability
  chain above. Never an LLM-as-judge.
- **Export** — `docxtpl` against real TESDA template files.

**The retry edge is the architecture's centerpiece.** Validator → back to the specific
failing drafter, with the failure reason appended to prompt context, bounded. It is what
makes this an agent workflow rather than a script, and it is what the capstone is graded
on. Do not collapse it.

## 4. State

One Pydantic `PipelineState` threads through the graph (`tr_tables`, `competency`,
`los[]`, `cbc_module`, `job_status`), with per-LO `LOState` carrying that LO's session
plan, CBLM sections, validation result, and retry count. Shape is in `PLAN.md` §2.

Two rules:

1. **State is explicit and typed.** Nodes read and return `PipelineState`; nothing passes
   between nodes out of band.
2. **Retry counters are per-LO, per-section** — not global. Bounding globally would let
   one pathological section consume the whole budget.

## 5. Persistence

Full schema in `SYSTEM_DESIGN.md` §3 and `DATA_MODEL_DIAGRAMS.md` §1. The tables and why
each exists:

- `projects` — document-set container. Multiple projects, no versioning.
- `source_uploads` — storage path + `role` (`tr` | `cbc` | `reference`) for each
  uploaded file. Two required uploads per project (TR + Enhanced CBC).
- `parsed_structures` — one row per project holding the parsed TR/CBC `structure`
  (JSONB) plus any `unmatched` elements the parse couldn't join.
- `jobs` — one row per run, `kind` = `parse` | `generate`. A parse job ends at
  `parsed_structures`; a generate job starts after UC + LO selection.
- `session_plans` — one row per LO's drafted Session Plan, with `approved_at` marking
  the review-interrupt resume point.
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
  real ceiling is not throughput but **rate limits** (~30 req/min): a 25–30 call run must
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
- Flat-text TR extraction replacing table-aware extraction.
- The CBC Module becoming a generated artifact instead of a required upload.
- Style being supplied by exemplar retrieval instead of the deterministic Style
  Specification Matrix + house rules.
- TRs entering the retrieval corpus.
- An LLM-as-judge replacing deterministic validation.
- The graph collapsing into a linear chain — losing the conditional retry edge.
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
