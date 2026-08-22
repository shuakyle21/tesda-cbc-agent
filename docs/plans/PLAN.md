# tesda-cbc-agent — Project Plan

**What this is:** A backend-first AI application that takes a TESDA Training Regulation
(TR) PDF, an Enhanced CBC `.docx`, and a trainer's Session Plan, and generates a
per-Learning-Outcome CBLM (Competency-Based Learning Material) section-set, via an
explicit multi-agent LangGraph pipeline. The TR, the CBC, and the Session Plan are all
trainer-supplied/trainer-owned — CBLM is the only document the system generates.

**Why it exists:** Capstone project for Flyrank's Backend AI Engineering track. The
graded artifact is the agent workflow — not the product, not the UI. Every scope
decision below optimizes for a working, demo-able, reliable agent pipeline first.

**Deadline:** none fixed. Treat this as the highest-risk fact in the plan: unbounded
timelines are how projects don't finish. Countermeasures are built into the milestones
below — each one is independently demo-able, and a "minimum submittable artifact" line
is defined so scope has a floor to stop drifting at.

**Rubric constraint (added 2026-08-21):** the capstone brief requires implementing at
least 5 of {API endpoints, database, authentication, background/cron jobs, reporting,
caching, LLM integration}, with up to 2 swappable for other concepts learned. As
originally scoped this plan hit 4 (API, database, background jobs, LLM) and explicitly
excluded auth by design (single-user MVP — reversing that would fight the actual
product need). Caching and reporting are added below to reach 5 without reopening the
auth decision — both slot into work already planned rather than adding new surface
area.

---

## 1. Scope decisions (locked)

| Decision | Choice | Why |
|---|---|---|
| Primary user | Individual trainer, single-user MVP | Capstone, not a product launch |
| Input | **Three required uploads: official TESDA TR PDF + Enhanced CBC + trainer's Session Plan** | TRs are digitally-typed text PDFs — no OCR/vision needed. CBC format/text-layer status is UNVERIFIED — open risk. Session Plan format assumed PDF (per `reference/SAMPLE-session-plan.pdf`) — confirm during M1 |
| MVP document volume | **One competency (~4–5 LOs)**, not a full qualification | Full qualification = ~60–80 CBLM sections in one job — proves nothing extra about the agent design and multiplies free-tier rate-limit risk |
| Session Plan | **Not generated — required input, parsed (no LLM).** | REVISED 2026-08-22 (second pass, same day). First reversal removed `draft_session_plan` (the generation node) and moved the interrupt to right after `align_sources`, collapsing two pauses into one — that part still stands. This pass makes Session Plan a required **upload** rather than an out-of-band reference: the pipeline needs its topic numbering at generation time, so it's parsed alongside TR and CBC and supplies `TopicRow` (number, content, subtopics) to `draft_cblm` directly — no derivation, no LLM guess. Session Plan is still never *generated* by this system; only sourced. See `CBC_DOMAIN_RULES.md` §9 |
| CBLM scope | Per LO: Information Sheet, Task/Job/Operation Sheet, Self-Check, Answer Key | Standard CBLM section set |
| CBC Module | **Not generated — required input.** | REVERSED AGAIN 2026-08-18 (final). The Enhanced CBC is uploaded alongside the TR, not derived. This deletes the pipeline's hardest node and its compounding-error chain. Deterministic string rules and the Style Specification Matrix still apply to generated output — see `CBC_DOMAIN_RULES.md` |
| Output | Generate → export to `.docx` via **docxtpl** against real TESDA template files | No in-app rich editor to build; trainer does final edits in Word |
| Pipeline order | **TR + Enhanced CBC + Session Plan (three required inputs) → parse → align → ⏸ trainer reviews the alignment and picks UC + LO(s) → CBLM** | CBLM is the pipeline's only generated output — see Session Plan row. The review interrupt and the UC/LO selection happen at the same pause, right after `align_sources`, instead of splitting selection (job boundary) from review (post-drafting interrupt) |
| Grounding | **TR-grounded traceability, not exemplar RAG** | LOCKED 2026-08-18. The TR is the foundational, core reference document dictating the content, standards, and evaluation framework for the enhanced CBC — so it is parsed in full and treated as the grounding authority. Style is supplied deterministically by the 2026 Style Specification Matrix + Caravan house rules (`CBC_DOMAIN_RULES.md` §1, §8), which displaced retrieval's original job. The Validator asserts the chain: generated CBLM content → CBC assessment criterion → TR performance criterion / critical aspect |
| Vector store / RAG | **Cut from MVP (assumption — reverse if the rubric requires RAG)** | Pinecone + embeddings existed to supply style; style is now rules. Retrieval interface kept as a seam in the graph (few-shot lookup by section type) so a vector backend can be swapped in without touching state or node contracts |
| Corpus | Self-collected exemplar CBLMs/Session Plans, **already in hand**. TRs deliberately excluded | Confirmed available now — retrieval is testable from day one. TRs are excluded so retrieval structurally *cannot* return TR content: the uploaded TR supplies facts via the prompt, the corpus supplies style. Including TRs would let a chunk of one qualification's TR leak facts into another's draft — **SUPERSEDED — see Grounding row. Exemplar corpus not required for MVP.** |
| Vector store | Pinecone free tier | Dedicated vector service, keeps retrieval separate from app state — **SUPERSEDED — see Vector store / RAG row.** |
| Embeddings | Free-tier embeddings API (Cohere or Jina — pick one during setup, no local GPU needed) — **SUPERSEDED — not required for MVP.** |
| LLM | Free-tier cloud API serving open models (Groq and/or OpenRouter) | Free, no hardware to manage |
| TR parsing | **`pdfplumber.extract_tables()`** → whitespace repair → LLM structuring → Pydantic | TRs are table-structured: ELEMENT/PERFORMANCE CRITERIA and the Evidence Guide live in cell boundaries. Flat text extraction (pypdf, MarkItDown) loses the column boundary and fails *silently* — criteria attach to the wrong element. Verified against *TR — Organic Agriculture Production NC II*: 91 pages, text layer present, tables recovered cleanly. Vision-per-page would burn free-tier rate limits for no accuracy gain; Docling's layout model breaks the no-GPU/free-tier constraint |
| TR text hygiene | Whitespace-repair pass before LLM structuring | The text layer carries OCR-era spacing damage — `"Pre pared"`, `"preven tive"`, `"i nformal"`. Harmless for retrieval, but it would otherwise be copied verbatim into generated CBLM text |
| Agent orchestration | **LangGraph** | Purpose-built for a graph of agent nodes with explicit state and conditional branching — this *is* the graded artifact |
| Job execution | RQ + Redis (background job, not synchronous request) | Multi-minute multi-LLM-call jobs need async execution + progress visibility, not a spinner on one HTTP request |
| Backend | FastAPI, Python, sole API surface | |
| Frontend | **Minimal Gradio UI**, separate process, calls FastAPI over HTTP: three file uploads, submit, `gr.Timer`-polled job-status view (incl. `awaiting_review`), UC/LO selection + TR↔CBC alignment review as a conditionally-visible step, one download link | REVERSED 2026-08-21. Backend-first capstone — a Python UI cuts scaffolding versus Next.js with no HTTP client wired in yet. Deploy as its own service hitting FastAPI's public URL, not `mount_gradio_app`: mounting has known queue/websocket breakage (gradio-app/gradio#2292, #8839) and couples two deployment lifecycles for no benefit. The Next.js app (`frontend/`) is frozen in place, not deleted — no further work goes into it |
| Auth | **None for MVP.** Supabase used only for Postgres + file storage | Google OAuth was scoped for a multi-trainer product; with a single-user minimal UI it's pure overhead. Revisit post-MVP if this becomes a real product |
| Document management | `projects` table (multiple saved document-sets) kept in schema | Nearly free to include now; no versioning |
| Output validation | Basic structural checks (required sections present, no empty placeholders, LO count matches TR) — deterministic, not another LLM call | |
| Caching | **Redis-backed cache on TR structuring**, keyed by uploaded-file hash — re-parsing an identical TR skips both `pdfplumber` extraction and the LLM structuring call | ADDED 2026-08-21 for rubric coverage. Reuses the Redis instance already provisioned for RQ (`docs/todos/BUILD_CHECKLIST.md` §5) — no new infra. Genuinely useful too: a trainer re-uploading the same TR across projects shouldn't re-spend free-tier LLM budget |
| Reporting | **Per-job traceability/validation report** (`GET /jobs/{id}/report`): LO/Assessment-Criterion coverage, validator pass/fail detail, surfaced in the Gradio job-status view | ADDED 2026-08-21 for rubric coverage. Restates data the Validator node and `job_events` already produce (§4, §5 pipeline) as a structured report rather than raw event rows — no new domain logic, just a read model over existing state |
| Deployment | None yet — local dev only | Decide hosting after the pipeline works |
| Repo | `~/tesda-cbc-agent`, separate from `web_portfolio` | Unrelated project |

---

## 2. The agent workflow (capstone centerpiece)

**Revised 2026-08-18** after the CBLM Caravan rules landed. See `CBC_DOMAIN_RULES.md`.

```
Upload TR (.pdf) + Enhanced CBC (.docx) + Session Plan (.pdf)   ← ALL three required
        │
        ▼   job(kind=parse)
┌────────────────┐  ┌────────────────┐  ┌──────────────────────┐
│  parse_tr      │  │  parse_cbc     │  │  parse_session_plan  │  pdfplumber tables —
│  pdfplumber →  │  │  (no LLM)      │  │  (no LLM)             │  numbering/content are
│  repair → LLM  │  └───────┬────────┘  └──────────┬────────────┘  literal, no LLM needed
└───────┬────────┘          │                       │
        └──────────┬────────┴───────────────────────┘
                   ▼
          ┌────────────────┐
          │ align_sources  │  TR "Element" ↔ CBC "Learning Outcome" ↔
          │ (no LLM)       │  Session Plan LO heading; unmatched pairs
          └───────┬────────┘  surfaced, never guessed
                  ▼  parsed_structure
        ╔═════════════════════════════════════╗
        ║  ⏸ INTERRUPT — trainer reviews the  ║   LangGraph interrupt_before
        ║    TR↔CBC alignment, picks UC + LO(s)║  + checkpointer;
        ║    then POST /jobs/{id}/resume       ║   jobs.status = awaiting_review
        ╚═════════════════════════════════════╝
                     ▼   job(kind=generate)
          ┌──────────────────────┐
          │ draft_cblm (agent)   │  loops the SELECTED LO(s)' Session-Plan
          │ 4 sections × topic   │  topics — cannot invent or skip one
          └──────────┬───────────┘
                     ▼
          ┌──────────────────────┐
          │ apply_house_rules    │  deterministic: "this unit"→"this module",
          │ (no LLM)             │  "Lecture"→active lecture, italics,
          └──────────┬───────────┘  portfolio default, AI-use disclosure
                     ▼
          ┌──────────────────────┐
          │ validate (no LLM)    │  numbering integrity + traceability
          └──────────┬───────────┘  + Style Spec §8
             fail ┌──┴──┐ pass
                  ▼     ▼
          retry the   ┌──────────┐
          failing     │  export  │  docxtpl → real TESDA templates
          drafter     └──────────┘
          (max 2)
```

**Two things make this an agent workflow rather than a script:** the bounded
validation-retry edge, and the mid-graph interrupt that hands control to a human and
resumes from a checkpoint. Call both out in the capstone writeup.

**State object (shape, refine during build):**

```python
class TopicRow(BaseModel):
    number: str                       # "1.1.1" — binds InfoSheet/SelfCheck/AnswerKey
    content: str
    subtopics: list[str] = []         # italicized in output

class LOState(BaseModel):
    lo_id: str                        # CBC "Learning Outcome"
    tr_element_id: str | None         # TR "Element" — None if align_sources failed
    title: str
    assessment_criteria: list[str]
    topics: list[TopicRow] = []       # sourced from parse_session_plan, not derived
    cblm_sections: CBLMSectionSet | None = None
    validation: ValidationResult | None = None
    retry_count: int = 0

class PipelineState(BaseModel):
    tr: TRData                        # parsed in full — grounding authority
    cbc: CBCData                      # per-LO structure, drives generation
    session_plan: SessionPlanData     # per-LO topic numbering, parsed not generated
    los: list[LOState]
    job_status: Literal["parsing","aligning","awaiting_review",
                        "drafting_cblm","validating","exporting","done","failed"]
```

**Resolved 2026-08-22 (second pass):** `topics` are not invented by `draft_cblm` and not
derived from the CBC either — Session Plan is now a required upload (§1), parsed by
`parse_session_plan` (no LLM: the numbering and topic labels are already literal on the
page, so parsing extracts rather than interprets) directly into `TopicRow.number` /
`.content` / `.subtopics`. `draft_cblm` reads this list, it doesn't build it. Canonical
numbering form is `1.1.1` (the sample source is internally inconsistent — normalize during
parsing). See `CBC_DOMAIN_RULES.md` §9 for the full column structure and rationale.

---

## 3. Milestone 0 — do this before building the graph

**Structured-output smoke test.** Free-tier open models can be unreliable at strict
JSON/schema output, and if that's discovered mid-build it looks like "the pipeline is
flaky" — i.e. it reads as a failure of the exact thing being graded. De-risk it in an
hour:

1. Write a Pydantic schema with real nesting (`Competency` → `list[LearningOutcome]` →
   `list[AssessmentCriterion]`).
2. Run one throwaway script against the chosen Groq/OpenRouter model, ~10 times, with
   the same structured-extraction prompt.
3. Count clean, schema-valid parses.

- **≥9/10 clean:** proceed as planned.
- **<9/10:** two options — (a) use a paid/stronger model for the Drafter and Validator
  nodes only (parsers can stay on the free model), or (b) keep the free model
  and add the validation-failure retry edge as the fix — which is *better* for the
  capstone rubric, since it's exactly the kind of conditional branching an agent-workflow
  grader wants to see. Either way, this is learned before the graph is built, not during.

---

## 4. Milestones (each independently demo-able)

**Revised 2026-08-18.** M2 changed meaning (retrieval → traceability); the interrupt and
templatization are new.

1. **M0 — Structured-output smoke test.** Gate on **criteria attaching to the correct LO**,
   not merely schema-valid JSON. Requires one hand-labeled competency as ground truth.
2. **M1 — All three parsers + `align_sources`.** TR (pdfplumber), CBC (python-docx), and
   Session Plan (pdfplumber tables) parsed; Element↔LO↔Session-Plan-heading join
   demonstrable. Demo: the JSON, showing no cross-attached criteria and a complete join
   with unmatched pairs surfaced rather than guessed.
3. **M2 — Traceability assertable.** Every CBC assessment criterion traces to a TR
   performance criterion or critical aspect; every Critical Aspect assigned to ≥1 LO.
   *(This replaces the former Retriever milestone.)*
4. **M3 — Interrupt + resume.** Job reaches `awaiting_review` right after `align_sources`;
   trainer reviews the TR↔CBC alignment and picks UC + LO(s); resume starts CBLM drafting
   for the selected LO(s) only.
5. **M4 — CBLM drafter.** For one LO: read the topic list and `1.1.1`-style numbering
   straight from the parsed Session Plan (no derivation — see §2), then draft 4 sections ×
   topic per `CBC_DOMAIN_RULES.md`.
6. **M5 — Validator + retry edge.** Deliberately break a draft and show the graph catching
   and retrying it. **Centerpiece demo.**
7. **M5.5 — Templatize the TESDA `.docx` files.** Both are in hand but are *filled
   documents, not templates*: strip sample content, insert docxtpl Jinja tags, preserve
   every style, header, footer, and table structure. **Schedulable in parallel with M1–M3**
   — needs no pipeline code and de-risks M6.
8. **M6 — Export working.** `.docx` matching the real templates, downloadable.
9. **M7 — Minimal UI + RQ/Redis job wiring.**

**Minimum submittable artifact = M6.** A working LangGraph pipeline (parse → align →
interrupt/resume → CBLM → validate/retry → export) runnable via FastAPI's `/docs`,
producing correct `.docx` for one competency, with the M0 smoke-test note. M7 (the UI) is
the first thing to cut if time runs out.

---

## 5. Open items to resolve during build, not before

- ~~Cohere vs Jina for embeddings~~ — moot; RAG demoted (see Grounding row).
- Exact free model(s) for each node — settled by the M0 smoke test.
- ~~Source real TESDA templates~~ — **in hand**; they need templatizing (M5.5).
- Confirm whether the capstone rubric names RAG explicitly. Handled by a two-implementation
  retriever either way, but confirm **before M7** — seeding a corpus late is cheap;
  discovering the requirement on submission day is not.
- ~~Topic-breakdown source~~ — resolved, see §2 above and `CBC_DOMAIN_RULES.md` §9:
  Session Plan is a required upload, parsed (no LLM) directly into `TopicRow`, numbering
  canonicalized to `1.1.1`. Remaining: `parse_session_plan`'s actual extraction strategy
  (pdfplumber table layout, column mapping) is a real parsing problem, same category as
  TR parsing — build and verify it against `reference/SAMPLE-session-plan.pdf` at M1, the
  same way TR parsing was verified against the *Organic Agriculture Production NC II* TR.
  `CBC_DOMAIN_RULES.md` §9's column notes are currently hand-transcribed, not read from
  the file — confirm them once the file's added.
- Rate-limit pacing is a **graph topology** decision (sequence drafters or semaphore), not
  a tuning knob — decide it when building the graph, not after.

---

## 6. Explicitly post-MVP (do not build before M6)

- **Conversational layer / "Improve with AI"** over parsed and generated content. Designed
  in `SYSTEM_DESIGN.md` §9; today's only obligation is `generated_documents.content jsonb`.
  Most of it is structured query and targeted regeneration, not RAG — the genuine RAG case
  is cross-document search over the user's own finished CBLMs.
- Full-qualification runs (all competencies).
- Auth / multi-tenancy.
- Deployment.

Scope creep is named in this plan as the top risk. Items here are recorded so the schema
does not foreclose them — **not** as work to pull forward.
