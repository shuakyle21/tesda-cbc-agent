# Pipeline Prompts

The LLM prompts for each node. Companion to `PLAN.md` §2 (the graph) and
`TECHNICAL_DIAGRAMS.md` §7 (why the Parser works the way it does).

**Status:** Parser is complete and usable. Drafters are blocked on TM I/II reference materials —
see §5 for exactly what is needed and why writing them without it would be worse than useless.

---

## 0. Which nodes have prompts at all

| Node | Prompt? | Why |
|---|---|---|
| **Parser** | **Yes** — §1 | Structured extraction from repaired table rows |
| Retriever | No | pgvector similarity, no LLM |
| **CBC Formatter** | **No** | Deterministic reformat of data the Parser already extracted (`PLAN.md` §1). **Zero LLM calls** — this is why the UI shows `No AI calls` on that option |
| **Session Plan Drafter** | Yes — §2, **blocked** | Needs the real Session Plan form |
| **CBLM Drafter** | Yes — §3, **blocked** | Needs real CBLM section exemplars |
| **Validator** | **No** — §4 | Structural checks in Python. Deliberately not another LLM call |

Two of six nodes make LLM calls. That is the design working: every node that *can* be
deterministic *is* deterministic, which is what keeps a run inside a free tier.

---

## 1. Parser — complete

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

class CompetencyData(BaseModel):
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

Extract into the CompetencyData schema.
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

## 2. Session Plan Drafter — blocked

**Contract:** one `SessionPlanDoc` per `LOState`. Input: the LO's title and criteria, the
competency's evidence guide, plus retrieved Session Plan exemplars (style only — the TR supplies
facts, retrieval supplies form; `PLAN.md` §1).

**Blocked because** a TESDA Session Plan is a *form*, not prose. Its sections, their order, and
their expected content are fixed by the template an assessor checks against. I can write a prompt
that produces something reasonable-looking; I cannot write one that produces something an
assessor accepts, without seeing the form. See §5.

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

To write §2 and §3 properly, in rough order of value:

1. **One real Session Plan** you have written or been assessed on. The form matters more than the
   content — a filled-in blank sample is fine, and a real one is better because it shows how much
   detail is actually expected per field.
2. **One complete CBLM section set for a single LO** — Information Sheet, Task Sheet, Self-Check,
   Answer Key. One good LO beats five partial ones.
3. **The blank TESDA templates** (`.docx`) if you have them. These are also the M5 export
   dependency already flagged in `PLAN.md` §5, so sourcing them unblocks two milestones at once.
4. **The TM I/II reference** for how CBLM development is assessed, if you have it — the
   evaluation criteria tell me what the prompts must guarantee.

**Why I will not draft these from general knowledge.** I know the CBLM section names and the
broad shape. I do not know the field-level structure of the current TESDA forms, and a prompt
built on a plausible-but-wrong structure produces documents that look right, pass the Validator,
and get rejected by an assessor. That failure is worse than no prompt at all, because it is
discovered late and it discredits the whole tool.

Drop the files anywhere and point me at them. Even one Session Plan and one LO's CBLM set is
enough to write both prompts properly.
