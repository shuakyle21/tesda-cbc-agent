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
                  Groq/OpenRouter  Embeddings     Pinecone     Supabase
                     (LLM)           (API)      (vectors)   (Postgres + Storage)
```

**The load-bearing boundary: FastAPI never calls an LLM.** All AI work happens inside the
worker process. The API's job is to accept uploads, enqueue work, and serve status and
files — so it stays responsive for polling while a multi-minute job runs. If a code
change would put an LLM call behind an HTTP handler, that change is wrong.

## 2. Components

| Component | Responsibility | Explicitly not responsible for |
|---|---|---|
| **Next.js UI** | Upload form, job-status view, download links | Any product surface beyond those three things |
| **FastAPI** | Sole API surface; upload + fail-fast text-layer check; enqueue; status; signed downloads | LLM calls, generation logic, orchestration |
| **Redis / RQ** | Job queue and worker lifecycle | Application state (that lives in Postgres) |
| **LangGraph graph** | The agent workflow — nodes, explicit state, conditional branching | Being simplified into a linear chain |
| **Supabase** | Postgres (projects, uploads, jobs, events, documents) + Storage (TR PDFs, generated `.docx`) | Auth (not used in MVP), vectors |
| **Pinecone** | Exemplar corpus vectors, filtered by `section_type` | Holding any TR content |

Supabase is used as a database and a bucket. No auth, no RLS, no edge functions in MVP.

## 3. The pipeline

```
Parser ──▶ Retriever ──┬──▶ CBC Formatter (deterministic, no LLM)
                       ├──▶ Session Plan Drafter  (1 per LO)
                       └──▶ CBLM Drafter          (4 sections per LO)
                                   │
                                   ▼
                              Validator ──fail──▶ back to the failing drafter
                                   │              (bounded: 2 retries)
                                  pass
                                   ▼
                                Export (docxtpl → TESDA templates)
```

Node responsibilities:

- **Parser** — `pdfplumber.extract_tables()` → whitespace repair → LLM structuring →
  Pydantic validation. Table-aware by requirement: flat text extraction loses column
  boundaries and misattributes performance criteria *silently*. Output is cached in
  `tr_uploads.parsed_json` so re-runs skip re-parsing.
- **Retriever** — Pinecone similarity search filtered by target section type. Never
  returns TR content, by corpus construction.
- **CBC Formatter** — deterministic. Applies the TR→CBC mapping in
  `CBC_DOMAIN_RULES.md` §2. No LLM call, no RAG, no fresh authorship.
- **Drafters** — LLM, RAG-grounded. Facts from the TR via prompt; style from retrieved
  exemplars. Session Plans and CBLM sections are drafted from the derived CBC, not
  directly from the TR.
- **Validator** — deterministic structural checks only. Never an LLM-as-judge.
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

Full schema in `SYSTEM_DESIGN.md` §3. The tables and why each exists:

- `projects` — document-set container. Multiple projects, no versioning.
- `tr_uploads` — storage path + `parsed_json` parse cache.
- `corpus_chunks` — RAG corpus metadata, **global not per-project**; vectors live in
  Pinecone keyed by `pinecone_id`, filterable by `section_type`.
- `jobs` — one row per generation run.
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
- The CBC Formatter becoming an LLM agent.
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
