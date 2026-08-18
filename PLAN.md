# tesda-cbc-agent — Project Plan

**What this is:** A backend-first AI application that takes a TESDA Training Regulation
(TR) PDF and generates a CBC Module, a set of per-Learning-Outcome Session Plans, and a
CBLM (Competency-Based Learning Material) section-set, via an explicit multi-agent
LangGraph pipeline.

**Why it exists:** Capstone project for Flyrank's Backend AI Engineering track. The
graded artifact is the agent workflow — not the product, not the UI. Every scope
decision below optimizes for a working, demo-able, reliable agent pipeline first.

**Deadline:** none fixed. Treat this as the highest-risk fact in the plan: unbounded
timelines are how projects don't finish. Countermeasures are built into the milestones
below — each one is independently demo-able, and a "minimum submittable artifact" line
is defined so scope has a floor to stop drifting at.

---

## 1. Scope decisions (locked)

| Decision | Choice | Why |
|---|---|---|
| Primary user | Individual trainer, single-user MVP | Capstone, not a product launch |
| Input | **Two required uploads: official TESDA TR PDF + Enhanced CBC** | TRs are digitally-typed text PDFs — no OCR/vision needed. CBC format/text-layer status is UNVERIFIED — open risk |
| MVP document volume | **One competency (~4–5 LOs)**, not a full qualification | Full qualification = ~15–20 Session Plans + ~60–80 CBLM sections in one job — proves nothing extra about the agent design and multiplies free-tier rate-limit risk |
| Session Plan scope | One per Learning Outcome | Matches actual TESDA structure |
| CBLM scope | Per LO: Information Sheet, Task/Job/Operation Sheet, Self-Check, Answer Key | Standard CBLM section set |
| CBC Module | **Not generated — required input.** | REVERSED AGAIN 2026-08-18 (final). The Enhanced CBC is uploaded alongside the TR, not derived. This deletes the pipeline's hardest node and its compounding-error chain. Deterministic string rules and the Style Specification Matrix still apply to generated output — see `CBC_DOMAIN_RULES.md` |
| Output | Generate → export to `.docx` via **docxtpl** against real TESDA template files | No in-app rich editor to build; trainer does final edits in Word |
| Pipeline order | **TR + Enhanced CBC (both required inputs) → parse → human selects UC + LO(s) → Session Plan → CBLM** | CBLM is the primary output; Session Plan is a separate output. The human selection step splits execution into two jobs (parse, then generate), not one |
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
| Frontend | **Minimal Next.js UI**: one upload form, one job-status view, one download link | Full trainer product (dashboard, multi-project management) demonstrates nothing on a backend-AI rubric — cut until after the capstone is submitted |
| Auth | **None for MVP.** Supabase used only for Postgres + file storage | Google OAuth was scoped for a multi-trainer product; with a single-user minimal UI it's pure overhead. Revisit post-MVP if this becomes a real product |
| Document management | `projects` table (multiple saved document-sets) kept in schema | Nearly free to include now; no versioning |
| Output validation | Basic structural checks (required sections present, no empty placeholders, LO count matches TR) — deterministic, not another LLM call | |
| Deployment | None yet — local dev only | Decide hosting after the pipeline works |
| Repo | `~/tesda-cbc-agent`, separate from `web_portfolio` | Unrelated project |

---

## 2. The agent workflow (capstone centerpiece)

**Revised 2026-08-18** after the CBLM Caravan rules landed. See `CBC_DOMAIN_RULES.md`.

```
Upload TR (.pdf)  +  Enhanced CBC (.docx)     ← BOTH required
        │
        ▼   job(kind=parse)
┌────────────────┐   ┌────────────────┐
│  parse_tr      │   │  parse_cbc     │  python-docx — deterministic,
│  pdfplumber →  │   │  (no LLM)      │  no whitespace repair, no OCR
│  repair → LLM  │   └───────┬────────┘
└───────┬────────┘           │
        └──────────┬─────────┘
                   ▼
          ┌────────────────┐
          │ align_sources  │  TR "Element" ↔ CBC "Learning Outcome"
          │ (no LLM)       │  unmatched pairs surfaced, never guessed
          └───────┬────────┘
                  ▼  parsed_structure  →  dropdown: pick UC, pick LO(s)
        ╔═════════════════════════════════════╗
        ║   HUMAN SELECTION  (job boundary)   ║
        ╚═════════════════════════════════════╝
                  ▼   job(kind=generate)
          ┌──────────────────────┐
          │ draft_session_plan   │  one per LO, 7-column matrix,
          │ (agent)              │  one row per method, ≥2 methods/topic
          └──────────┬───────────┘
                     ▼
        ╔═════════════════════════════════════╗
        ║  ⏸ INTERRUPT — trainer reviews and  ║   LangGraph interrupt_before
        ║    edits the Session Plan, then     ║   + checkpointer;
        ║    POST /jobs/{id}/resume           ║   jobs.status = awaiting_review
        ╚═════════════════════════════════════╝
                     ▼
          ┌──────────────────────┐
          │ draft_cblm (agent)   │  loops the APPROVED plan's topics —
          │ 4 sections × topic   │  cannot invent or skip a topic
          └──────────┬───────────┘
                     ▼
          ┌──────────────────────┐
          │ apply_house_rules    │  deterministic: "this unit"→"this module",
          │ (no LLM)             │  "Lecture"→active lecture, italics,
          └──────────┬───────────┘  portfolio default, AI-use disclosure
                     ▼
          ┌──────────────────────┐
          │ validate (no LLM)    │  numbering integrity + traceability
          └──────────┬───────────┘  + Style Spec §8 (CBLM only)
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
    methods: list[str]                # ≥2
    presentation: str
    practice: str
    feedback: str
    resources: list[str]
    time: str

class LOState(BaseModel):
    lo_id: str                        # CBC "Learning Outcome"
    tr_element_id: str | None         # TR "Element" — None if align_sources failed
    title: str
    assessment_criteria: list[str]
    session_plan: SessionPlanDoc | None = None
    session_plan_approved: bool = False
    cblm_sections: CBLMSectionSet | None = None
    validation: ValidationResult | None = None
    retry_count: int = 0

class PipelineState(BaseModel):
    tr: TRData                        # parsed in full — grounding authority
    cbc: CBCData                      # per-LO structure, drives generation
    los: list[LOState]
    job_status: Literal["parsing","aligning","drafting_plan","awaiting_review",
                        "drafting_cblm","validating","exporting","done","failed"]
```

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
2. **M1 — Both parsers + `align_sources`.** TR (pdfplumber) and CBC (python-docx) parsed,
   Element↔LO join demonstrable. Demo: the JSON, showing no cross-attached criteria and a
   complete join with unmatched pairs surfaced rather than guessed.
3. **M2 — Traceability assertable.** Every CBC assessment criterion traces to a TR
   performance criterion or critical aspect; every Critical Aspect assigned to ≥1 LO.
   *(This replaces the former Retriever milestone.)*
4. **M3 — Session Plan drafter.** 7-column matrix for one LO, ≥2 methods per topic,
   times summing to the LO's hours.
5. **M4 — Interrupt + resume, then CBLM.** Job reaches `awaiting_review`; trainer edits the
   plan; resume produces CBLM aligned to the **edited** topics.
6. **M5 — Validator + retry edge.** Deliberately break a draft and show the graph catching
   and retrying it. **Centerpiece demo.**
7. **M5.5 — Templatize the TESDA `.docx` files.** Both are in hand but are *filled
   documents, not templates*: strip sample content, insert docxtpl Jinja tags, preserve
   every style, header, footer, and table structure. **Schedulable in parallel with M1–M3**
   — needs no pipeline code and de-risks M6.
8. **M6 — Export working.** `.docx` matching the real templates, downloadable.
9. **M7 — Minimal UI + RQ/Redis job wiring.**

**Minimum submittable artifact = M6.** A working LangGraph pipeline (parse → align →
Session Plan → interrupt → CBLM → validate/retry → export) runnable via FastAPI's `/docs`,
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
- Numbering convention: the reference Session Plan is internally inconsistent
  (`Self-Check 1.1-1` vs `1.1.1`). Pick one and normalize deterministically.
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
