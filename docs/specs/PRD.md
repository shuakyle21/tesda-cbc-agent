# tesda-cbc-agent — Product Requirements

**Status:** pre-implementation. Companion to `PLAN.md` (scope decisions + milestones),
`SYSTEM_DESIGN.md` (technical architecture), and `CBC_DOMAIN_RULES.md` (domain source of
truth). This document states *what* the product must do and how we know it's done.
Where it restates a decision, `PLAN.md` §1 is the authority; where it states a domain
rule, `CBC_DOMAIN_RULES.md` is the authority.

---

## 1. Problem

A TESDA trainer preparing to deliver a qualification must author, by hand, a full CBLM
(Competency-Based Learning Material) section-set per Learning Outcome — grounded in
documents the trainer already has: the official Training Regulation (TR), the Enhanced
CBC, and a Session Plan. The derivation from TR/CBC facts and Session Plan topic
numbering into CBLM content is rule-heavy (see `CBC_DOMAIN_RULES.md` §2, §9), tedious,
and error-prone: performance criteria get attached to the wrong element, topic numbering
drifts, methodologies don't reflect the assessment criteria.

The work is days of copying, restructuring, and re-voicing per competency. It is not
creative work, but it is not pure mechanical transformation either — parts require
authorship grounded in house style.

## 2. Goal and non-goals

**Goal.** Given a TESDA TR PDF, an Enhanced CBC `.docx`, and a trainer's Session Plan
(PDF), produce a trainer-editable first draft of the CBLM section-set for one competency,
as `.docx` files matching real TESDA templates — correct in structure, grounded in the
TR's facts and the CBC's assessment criteria, numbered per the Session Plan's own topic
breakdown, and stylistically consistent with the 2026 Style Specification Matrix.

**Primary success measure.** A trainer's remaining work is *editing a draft*, not
*authoring from scratch*.

**Non-goals for MVP** (each is a locked decision in `PLAN.md` §1):

- Not a trainer product. No dashboard, no multi-project management UI, no collaboration.
- No authentication and no multi-tenancy — single user, local dev.
- No in-app rich-text editor. Final edits happen in Word.
- No full-qualification runs. One competency (~4–5 LOs) per job.
- No OCR / vision parsing. TR/CBC/Session Plan are all digitally-typed, not scanned.
- No hosting/deployment. Local only until the pipeline works.
- No CBC or Session Plan generation. Both are required, parsed uploads — CBLM is the
  system's only generated output (REVISED 2026-08-22, twice — was CBC-generated then
  CBC-as-input; was Session-Plan-generated then Session-Plan-as-input).

**The graded artifact is the agent workflow**, not the product. Any requirement below
that competes with "the LangGraph pipeline is legible, observable, and demonstrably
branching" loses.

## 3. Users

| User | Context | What they need |
|---|---|---|
| TESDA trainer (primary, MVP) | Has the TR; needs the teaching documents | Upload → wait → download editable `.docx` |
| Project owner / capstone assessor | Grading the agent workflow | An inspectable per-node trace of a real run, including a retry |

Single-user MVP: these are, in practice, the same person. The second row is why
`job_events` (`SYSTEM_DESIGN.md` §3) is a product requirement and not just telemetry.

## 4. Scope: what the system produces

Per competency run:

| Artifact | Count | Produced by |
|---|---|---|
| CBC Module | — | **Not produced.** Required upload, parsed deterministically. |
| Session Plan | — | **Not produced.** Required upload, parsed deterministically — supplies CBLM's topic numbering directly. |
| CBLM section-set | 4 per LO — Information Sheet, Task/Job/Operation Sheet, Self-Check, Answer Key | LLM drafter, TR-grounded (not retrieval-grounded) |

For ~5 LOs that is 20 documents, ≈30 LLM calls (`SYSTEM_DESIGN.md` §6).

**Grounding contract (revised 2026-08-18 — TR-grounded traceability, not exemplar RAG).**
The uploaded TR supplies **facts** via the prompt, parsed in full as the grounding
authority; the uploaded CBC drives per-LO generation (assessment criteria); the uploaded
Session Plan supplies topic numbering. **Style** is supplied deterministically by the
2026 Style Specification Matrix + Caravan house rules (`CBC_DOMAIN_RULES.md` §1, §8), not
by retrieval — retrieval's original job disappeared once style became checkable rules.
`RetrieverProtocol` (few-shot default) is kept behind the interface as insurance, not the
grounding source. The Validator asserts the traceability chain: generated CBLM content →
CBC assessment criterion → TR performance criterion / critical aspect.

## 5. Functional requirements

**FR-1 — Project.** Create a project (title, optional qualification code) to hold a
document-set. Multiple projects persist; no versioning.

**FR-2 — Uploads.** Accept one TR PDF, one Enhanced CBC `.docx`, and one Session Plan PDF
per project — all three required. Reject at upload time, with a clear error: TR without a
usable text layer, CBC that isn't `.docx`, Session Plan that isn't a PDF with a
recognizable Learning Content column — before a job is enqueued.

**FR-3 — Parse.** Extract all three sources into validated structured data. TR:
competency → learning outcomes → performance criteria, required knowledge, range of
variables, resource implications, methods of assessment, and critical aspects of
competency — table-aware (`pdfplumber.extract_tables()`), whitespace-repaired,
LLM-structured, Pydantic-validated; **each element must carry its own performance
criteria** — silent cross-attachment is the specific failure mode this requirement exists
to prevent. CBC: per-LO assessment criteria and topics — `python-docx`, deterministic, no
LLM. Session Plan: per-LO `TopicRow` (number, content, subtopics) —
`pdfplumber.extract_tables()`, deterministic, no LLM (the numbering is already literal on
the page; this extracts, it doesn't interpret). Then `align_sources`: join TR *Element* ↔
CBC *Learning Outcome* ↔ Session Plan LO heading; unmatched pairs surfaced, never guessed.

**FR-4 — Review and select.** Pause the job after `align_sources` (a LangGraph
`interrupt_before`, not a plain job boundary — `ARCHITECTURE.md` §3) for the trainer to
review the TR↔CBC↔Session-Plan alignment and pick a Unit of Competency and one or more
Learning Outcomes. `POST /jobs/{id}/resume` continues the same job.

**FR-5 — Retrieve (insurance only).** `RetrieverProtocol` with a `FewShotRetriever`
default is kept as a seam, not the grounding mechanism — see the Grounding contract in
§4. Not required for MVP correctness.

**FR-6 — Draft CBLM sections.** Four per selected LO. Topic numbering comes directly from
the parsed Session Plan (FR-3) — `draft_cblm` reads it, does not derive or renumber it.
Self-reference is "this module" (never "this unit"); one Information Sheet per topic (per
however many Learning-Content rows the Session Plan lists for that topic —
`CBC_DOMAIN_RULES.md` §9); TOPIC → subtopic structure; chunking strategy applied.

**FR-7 — Validate.** Deterministic structural checks — required sections present, no
empty placeholders, LO count matches the TR, numbering matches the Session Plan.
**No LLM-as-judge.**

**FR-8 — Retry on validation failure.** A failed section routes back to `draft_cblm`
with the failure reason appended to prompt context, bounded at 2 retries. On exhaustion,
mark that document `failed_after_retries`, log the event, and **continue the run** — one
bad LO must not zero out the others.

**FR-9 — Export.** Render every CBLM artifact to `.docx` via `docxtpl` against real
TESDA template files, and make each downloadable.

**FR-10 — Background execution and progress.** The whole pipeline — parse through
export, including the FR-4 interrupt — runs as a single RQ job, not a synchronous
request. The client can poll job status and see a per-node event trace (node, LO,
started/succeeded/failed/retried) while the job runs.

## 6. Non-functional requirements

- **Cost:** $0 API spend. Free-tier LLM, embeddings, and vector store only.
- **Reliability:** never silently emit malformed output; partial success over
  all-or-nothing; every external call wrapped in bounded exponential backoff.
- **Observability:** every node transition inspectable mid-run. This is a hard
  requirement — it is the capstone's evidence that the orchestration is real.
- **Latency:** a full competency run completing in low single-digit minutes is fine. Runs
  must be *paced* against free-tier rate limits (~30 req/min), not fanned out at once.
- **Availability:** none beyond local dev. Single Redis, single Supabase project, single
  Pinecone index — a deliberate, documented gap.

## 7. User flow

1. Create project.
2. Upload TR PDF, Enhanced CBC `.docx`, and Session Plan PDF → immediate accept/reject on
   each format guard.
3. Trigger parse → receive `job_id` immediately; the job parses all three and pauses at
   the alignment-review interrupt.
4. Review the TR↔CBC↔Session-Plan alignment; pick a Unit of Competency and Learning
   Outcome(s); resume the job.
5. Poll status; watch the per-node event trace advance through CBLM drafting.
6. On `done`, download `.docx` files; any section that failed after retries is listed as
   failed rather than silently missing.
7. Edit in Word.

See `USER_FLOWS.md` and `prototype/` for the UI rendering of this; the UI is the last
thing built and the first thing cut.

## 8. Acceptance criteria

The product is done for MVP when, for one real TR PDF:

1. Parsing yields structured data (TR, CBC, Session Plan) in which no performance
   criterion is attached to the wrong element, and no topic number is mis-transcribed.
2. `align_sources` produces a complete TR↔CBC↔Session-Plan join, with unmatched pairs
   surfaced rather than guessed.
3. A full LangGraph run — including the review/select interrupt — produces four CBLM
   sections per selected LO, numbered per the parsed Session Plan.
4. A deliberately broken draft is caught by the Validator, retried via the conditional
   edge, and the retry is visible in the event trace.
5. Exhausting retries on one section leaves the other sections' output intact and
   downloadable.
6. Every artifact exports to `.docx` against the real TESDA templates and opens cleanly
   in Word.
7. A run's full per-node trace can be shown after the fact.

This set corresponds to milestone **M6** in `PLAN.md` §4 — the minimum submittable
artifact. M7 (the minimal Gradio UI) is additive.

## 9. Risks

| Risk | Mitigation |
|---|---|
| Free-tier models unreliable at strict structured output | M0 smoke test before the graph is built; fallback is a stronger model on Drafter/Validator only, or lean on the retry edge |
| Free-tier rate limits throttle a ~30-call run | Pace/stagger drafter calls; measure during M0 |
| Unbounded timeline → scope drift | Milestones are independently demo-able; M6 is the declared floor |
| Silent parse misattribution (TR criteria, or Session Plan numbering) | Table-aware extraction is locked for all three sources; M1's demo is specifically about criteria attribution and the three-way join |
| ~~Exemplars that quote their source TR inline leak facts anyway~~ | **Superseded** — grounding is TR-traceability, not exemplar RAG (see §4); retrieval is insurance-only, not on the critical path |

## 10. Open questions

Carried from `CBC_DOMAIN_RULES.md` §7 and `PLAN.md` §5 — resolve during build:

- Which TESDA template `.docx` file(s) back the CBLM export (one combined template vs.
  one per section type)?
- Which "case to case basis" decisions stay with the human?
- Exact free model per node (settled by M0).
- Confirm the Session Plan upload format assumption (PDF) against a second real sample,
  not just `reference/SAMPLE-session-plan.pdf` (`PLAN.md` §1 Input row).
