# Pipeline Prompts

The LLM prompts for each node. Companion to `PLAN.md` §2 (the graph) and
`TECHNICAL_DIAGRAMS.md` §7 (why the Parser works the way it does).

**Status:** TR Parser is complete and usable. The CBLM Drafter is blocked on TM I/II
reference materials — see §5 for exactly what is needed and why writing it without them
would be worse than useless. **The Session Plan Drafter no longer exists** (CBLM-only
reversal, 2026-08-22) — Session Plan is a required, parsed upload, not a generated
artifact; see §2.

---

## 0. Which nodes have prompts at all

| Node | Prompt? | Why |
|---|---|---|
| **TR Parser** | **Yes** — §1 | Structured extraction from repaired table rows |
| **CBC Parser** | **No** | `python-docx`, deterministic. CBC is a required upload, never generated (`PLAN.md` §1) |
| **Session Plan Parser** | **No** — §2 | `pdfplumber.extract_tables()`, deterministic. Numbering and content are already literal on the page — extraction, not interpretation |
| `align_sources` | No | Deterministic three-way join, no LLM |
| Retriever | No | Few-shot lookup by default, no vector DB, no embeddings call — insurance only, not on the critical path (`PLAN.md` §1 Vector store / RAG row) |
| **CBLM Drafter** | Yes — §3, **blocked** | Needs real CBLM section exemplars |
| **Validator** | **No** — §4 | Structural checks in Python. Deliberately not another LLM call |

Two of six pipeline nodes make LLM calls (TR Parser, CBLM Drafter). That is the design
working: every node that *can* be deterministic *is* deterministic, which is what keeps a
run inside a free tier.

---

## 1. TR Parser — complete

Runs **after** `pdfplumber.extract_tables()` and the whitespace-repair pass. Its input is
repaired table rows, never raw page text — the column boundary is the whole point
(`TECHNICAL_DIAGRAMS.md` §7).

### Contract

```python
class AssessmentCriterion(BaseModel):
    text: str

class LearningOutcome(BaseModel):
    lo_id: str                              # "LO-1", assigned in order encountered
    title: str
    assessment_criteria: list[AssessmentCriterion]

class EvidenceGuide(BaseModel):
    critical_aspects: list[str]
    required_knowledge: list[str]
    required_skills: list[str]
    methods_of_assessment: list[str]

class TRData(BaseModel):
    unit_title: str
    unit_code: str | None
    unit_descriptor: str | None
    nominal_hours: str | None
    learning_outcomes: list[LearningOutcome]
    evidence_guide: EvidenceGuide | None
```

### System prompt

```
You extract structured data from Philippine TESDA Training Regulation (TR) documents.

You are given rows from tables that were extracted from a TR PDF. Each row is a list of
cell values. Empty cells appear as empty strings. The column boundaries in these rows are
authoritative: a value in the second column belongs to the label in the first column of
that same row, or to the nearest preceding row that has a first-column value.

Your only job is to map these cells into the requested schema. You are a transcriber,
not an author.

RULES

1. Copy text verbatim. Do not paraphrase, summarise, expand, correct grammar, or
   "improve" any wording. TESDA wording is regulatory text.

2. Never invent content. If a field is not present in the rows you were given, return
   null for it, or an empty list. An empty list is always correct when the source is
   silent. A plausible guess is always wrong.

3. Never move a performance criterion from one element to another. If you are unsure
   which element a criterion belongs to, attach it to the nearest preceding element in
   the row order. Do not redistribute criteria to make elements look evenly sized —
   real TESDA elements have uneven criteria counts.

4. ELEMENT rows become learning outcomes. Assign lo_id as "LO-1", "LO-2", ... in the
   order the elements appear. Do not renumber, sort, or deduplicate them.

5. PERFORMANCE CRITERIA cells often contain several criteria in one cell, separated by
   line breaks or leading bullets/dashes. Split them into separate entries on those
   boundaries only. Do not split on sentence boundaries — a single criterion frequently
   spans multiple sentences.

6. The EVIDENCE GUIDE section has four known sub-sections: critical aspects of
   competency, required knowledge, required skills, and methods of assessment. Map only
   what is present. Section headings vary slightly between TRs; match on meaning, not
   exact string.

7. Text may still contain spacing damage from the source PDF, for example "Pre pared"
   or "preven tive". Repair obvious intra-word splits when transcribing. Do not change
   anything else — no capitalisation, punctuation, or terminology changes.

8. Return only valid JSON matching the schema. No commentary, no markdown fences.

If the rows you were given do not appear to contain a competency unit at all, return
null for unit_title and empty lists elsewhere. Do not attempt to reconstruct one.
```

### User message

```
Competency unit rows extracted from pages {page_range} of the TR:

{rows_json}

Extract into the TRData schema.
```

### Notes on why it reads this way

- **"You are a transcriber, not an author"** is load-bearing. Free-tier open models
  paraphrase by default, and paraphrased regulatory text is the failure that makes the whole
  output unusable for an assessor.
- **Rule 3 exists because of the specific silent failure** documented in
  `TECHNICAL_DIAGRAMS.md` §7 — criteria attaching to the wrong element. It also names the
  distortion an LLM will otherwise reach for: evening out the counts.
- **Rule 5 exists because** criteria commonly run to two or three sentences; splitting on
  sentences fragments them into nonsense.
- **Rule 2 is what makes the Validator's job possible.** If the model invents, structural
  checks pass while the content is wrong. Empty is recoverable; fabricated is not.

### M0 smoke test

`PLAN.md` §3 calls for 10 runs of a structured-output test before the graph is built. Run it
with **this** prompt, against a real TR, and count schema-valid parses. Then check something the
schema cannot: **do LO-2's criteria actually belong to LO-2?** Schema-valid and correct are
different questions, and only the second one matters.

---

## 2. Session Plan Parser — no prompt needed

**Reversed 2026-08-22.** There is no Session Plan Drafter. Session Plan is a required
upload, parsed deterministically (`pdfplumber.extract_tables()`, no LLM) into `TopicRow`
(number, content, subtopics) per LO — see `CBC_DOMAIN_RULES.md` §9 for the observed
column structure and the canonical `1.1.1` numbering. `draft_cblm` (§3) reads this list;
it never drafts, derives, or renumbers a Session Plan.

**What this section used to block on — now largely resolved:** the old blocker here was
exactly the item requested in §5.1 below (a real Session Plan, because the form matters
more than any prompt could guess). `reference/SAMPLE-session-plan.pdf` fills that role
now. What's still open is build-time, not prompt-writing: confirm the parser's table
extraction against the real file once it's checked into the repo (`PLAN.md` §5 Open
items).

---

## 3. CBLM Drafter — blocked

**Contract:** four sections per LO — Information Sheet, Task/Job/Operation Sheet, Self-Check,
Answer Key. Each is a separate call with its own prompt and its own retrieval filter
(`TECHNICAL_DIAGRAMS.md` §6: Task Sheet queries retrieve Task Sheet exemplars, never generic
similarity).

**One design note that holds regardless of materials:** the Self-Check and Answer Key must be
generated **together, in one call**, or as a strictly ordered pair with the Answer Key receiving
the Self-Check verbatim. Generating them independently produces answers that do not correspond to
the questions — a failure that looks fine until a trainee uses it.

---

## 4. Validator — deterministic, not a prompt

`PLAN.md` §1 and §2 make this Python, not an LLM call. That decision is right and should hold:

- required sections present and non-empty
- no unfilled placeholders (`[insert …]`, `TODO`, `{{ }}`, empty template slots)
- LO count matches the TR
- Self-Check question count equals Answer Key answer count
- no criterion text appears under an LO it does not belong to

A validator that is itself an LLM can hallucinate a pass, and then the retry edge — the graded
artifact — is checking nothing. Determinism here is what makes the retry meaningful.

---

## 5. What I need from you

To write §3 properly, in rough order of value:

1. ~~One real Session Plan~~ **In progress** — `reference/SAMPLE-session-plan.pdf` covers
   this (the parser still needs verifying against it once it's added; see §2). Session
   Plan is no longer a prompt-writing blocker, since there's no Session Plan prompt to
   write — it unblocked *parsing*, not drafting.
2. **One complete CBLM section set for a single LO** — Information Sheet, Task Sheet, Self-Check,
   Answer Key. One good LO beats five partial ones.
3. **The blank CBLM TESDA template(s)** (`.docx`) if you have them. These are also the M6
   export dependency already flagged in `PLAN.md` §5, so sourcing them unblocks two
   milestones at once. (No longer a Session Plan template — CBLM is the only export.)
4. **The TM I/II reference** for how CBLM development is assessed, if you have it — the
   evaluation criteria tell me what the prompts must guarantee.

**Why I will not draft these from general knowledge.** I know the CBLM section names and the
broad shape. I do not know the field-level structure of the current TESDA forms, and a prompt
built on a plausible-but-wrong structure produces documents that look right, pass the Validator,
and get rejected by an assessor. That failure is worse than no prompt at all, because it is
discovered late and it discredits the whole tool.

Drop the files anywhere and point me at them. One LO's CBLM set is enough to write the
CBLM Drafter prompt properly.
