# tesda-cbc-agent — Product Requirements

**Status:** pre-implementation. Companion to `PLAN.md` (scope decisions + milestones),
`SYSTEM_DESIGN.md` (technical architecture), and `CBC_DOMAIN_RULES.md` (domain source of
truth). This document states *what* the product must do and how we know it's done.
Where it restates a decision, `PLAN.md` §1 is the authority; where it states a domain
rule, `CBC_DOMAIN_RULES.md` is the authority.

---

## 1. Problem

A TESDA trainer preparing to deliver a qualification must author, by hand, a Competency-
Based Curriculum (CBC) module, one Session Plan per Learning Outcome, and a full CBLM
(Competency-Based Learning Material) section-set per LO. All of it is derived — almost
mechanically in places — from a document the trainer already has: the official Training
Regulation (TR). The derivation is rule-heavy (see `CBC_DOMAIN_RULES.md` §2), tedious,
and error-prone: performance criteria get attached to the wrong element, critical aspects
of competency don't get segregated across LOs, methodologies don't reflect the assessment
criteria.

The work is days of copying, restructuring, and re-voicing per competency. It is not
creative work, but it is not pure mechanical transformation either — parts require
authorship grounded in house style.

## 2. Goal and non-goals

**Goal.** Given a TESDA TR PDF, produce a trainer-editable first draft of the CBC module,
Session Plans, and CBLM sections for one competency, as `.docx` files matching real TESDA
templates — correct in structure, grounded in the TR's facts, and stylistically
consistent with real exemplar materials.

**Primary success measure.** A trainer's remaining work is *editing a draft*, not
*authoring from scratch*.

**Non-goals for MVP** (each is a locked decision in `PLAN.md` §1):

- Not a trainer product. No dashboard, no multi-project management UI, no collaboration.
- No authentication and no multi-tenancy — single user, local dev.
- No in-app rich-text editor. Final edits happen in Word.
- No full-qualification runs. One competency (~4–5 LOs) per job.
- No OCR / vision parsing. TRs are digitally-typed text PDFs.
- No hosting/deployment. Local only until the pipeline works.

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
| CBC Module | 1 | Deterministic formatter — **no LLM call** |
| Session Plan | 1 per LO | LLM drafter, RAG-grounded |
| CBLM section-set | 4 per LO — Information Sheet, Task/Job/Operation Sheet, Self-Check, Answer Key | LLM drafter, RAG-grounded |

For ~5 LOs that is 1 + 5 + 20 = 26 documents, ≈25–30 LLM calls.

**Grounding contract.** The uploaded TR supplies **facts** via the prompt. The exemplar
corpus supplies **style** via retrieval, filtered by section type (a Task Sheet query
retrieves Task Sheet exemplars only). TRs are deliberately excluded from the retrieval
corpus so retrieval structurally cannot leak one qualification's facts into another's
draft. This is a correctness requirement, not an optimization.

## 5. Functional requirements

**FR-1 — Project.** Create a project (title, optional qualification code) to hold a
document-set. Multiple projects persist; no versioning.

**FR-2 — TR upload.** Accept one TR PDF per project. Reject at upload time, with a clear
error, any PDF without a usable text layer — before a job is enqueued.

**FR-3 — Parse.** Extract the TR into validated structured data: competency → learning
outcomes → assessment criteria, plus required knowledge, range of variables, resource
implications, methods of assessment, and critical aspects of competency. Extraction is
table-aware (`pdfplumber.extract_tables()`), whitespace-repaired, LLM-structured, and
Pydantic-validated. **Each element must carry its own performance criteria** — silent
cross-attachment is the specific failure mode this requirement exists to prevent.

**FR-4 — Retrieve.** For a given target section type and LO, return relevant exemplar
chunks from the seeded corpus, filtered by section type.

**FR-5 — Derive the CBC.** Apply the TR→CBC field mapping in `CBC_DOMAIN_RULES.md` §2:
assessment criteria from performance criteria ∪ applicable critical aspects, rewritten in
active voice; topics from required knowledge sorted basic→complex; conditions from
resource implications narrowed against range of variables; ≥2 methodologies per topic;
critical aspects of competency segregated across all LOs; common competencies appearing
inside core competencies removed.

**FR-6 — Draft Session Plans.** One per LO, from the derived CBC (not directly from the
TR). Learning Activity uses an -ing verb; Learning Content is the topic only;
self-reference is "this session"; "the trainee will observe" is recorded as
demonstration; training description is learner-centered; ≥2 methods per topic.

**FR-7 — Draft CBLM sections.** Four per LO. Self-reference is "this module" (never "this
unit"); one Information Sheet per topic; TOPIC → subtopic structure; chunking strategy
applied.

**FR-8 — Validate.** Deterministic structural checks — required sections present, no
empty placeholders, LO count matches the TR. **No LLM-as-judge.**

**FR-9 — Retry on validation failure.** A failed section routes back to its own drafter
with the failure reason appended to prompt context, bounded at 2 retries. On exhaustion,
mark that document `failed_after_retries`, log the event, and **continue the run** — one
bad LO must not zero out the others.

**FR-10 — Export.** Render every artifact to `.docx` via `docxtpl` against real TESDA
template files, and make each downloadable.

**FR-11 — Background execution and progress.** Generation runs as an RQ job, not a
synchronous request. The client can poll job status and see a per-node event trace
(node, LO, started/succeeded/failed/retried) while the job runs.

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
2. Upload TR PDF → immediate accept/reject on text-layer check.
3. Trigger generate → receive `job_id` immediately.
4. Poll status; watch the per-node event trace advance.
5. On `done`, download `.docx` files; any section that failed after retries is listed as
   failed rather than silently missing.
6. Edit in Word.

See `USER_FLOWS.md` and `prototype/` for the UI rendering of this; the UI is the last
thing built and the first thing cut.

## 8. Acceptance criteria

The product is done for MVP when, for one real TR PDF:

1. Parsing yields structured competency data in which no performance criterion is
   attached to the wrong element.
2. Retrieval returns section-type-correct exemplars for at least three distinct section
   types, and never returns TR content.
3. A full LangGraph run produces the CBC module, one Session Plan per LO, and four CBLM
   sections per LO.
4. A deliberately broken draft is caught by the Validator, retried via the conditional
   edge, and the retry is visible in the event trace.
5. Exhausting retries on one section leaves the other sections' output intact and
   downloadable.
6. Every artifact exports to `.docx` against the real TESDA templates and opens cleanly
   in Word.
7. A run's full per-node trace can be shown after the fact.

This set corresponds to milestone **M5** in `PLAN.md` §4 — the minimum submittable
artifact. M6 (the minimal Next.js UI) is additive.

## 9. Risks

| Risk | Mitigation |
|---|---|
| Free-tier models unreliable at strict structured output | M0 smoke test before the graph is built; fallback is a stronger model on Drafter/Validator only, or lean on the retry edge |
| Free-tier rate limits throttle a 25–30 call run | Pace/stagger drafter calls; measure during M0 |
| Unbounded timeline → scope drift | Milestones are independently demo-able; M5 is the declared floor |
| Silent parse misattribution | Table-aware extraction is locked; M1's demo is specifically about criteria attribution |
| Exemplars that quote their source TR inline leak facts anyway | Open — see `PLAN.md` §5; may need chunk filtering during corpus seeding |

## 10. Open questions

Carried from `CBC_DOMAIN_RULES.md` §7 and `PLAN.md` §5 — resolve during build:

- Is "ENHANCED CBC" a distinct artifact from the CBC Module, or the same document?
- **Is the CBC an input or an output?** `CLAUDE.md` records a locked decision that "TR and
  CBC are **both required inputs**; CBC is never an output," while `PLAN.md` §1 and §2 and
  `CBC_DOMAIN_RULES.md` §3 treat the CBC module as a produced artifact (`TR → ENHANCED CBC
  → SESSION PLAN → CBLM`). These cannot both hold. This PRD is written on the
  `PLAN.md`/domain-rules reading (CBC derived from the TR, FR-5), because the domain
  rules are declared to win on conflict — but this needs an explicit call before M3.
- Which TESDA template `.docx` files back each export?
- Which "case to case basis" decisions stay with the human?
- Cohere vs Jina for embeddings; exact free model per node (settled by M0).
