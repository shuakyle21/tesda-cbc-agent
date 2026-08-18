# CBC / Session Plan / CBLM — Domain Rules

Source: practitioner notes from the **Capability Building Program on Competency-Based
Learning Materials** ("CBLM Caravan"), captured by the project owner.

This is the **domain source of truth** for what the pipeline must produce. Where these
rules conflict with a locked decision in `PLAN.md`, the rules win and `PLAN.md` gets
amended — these describe how TESDA documents are actually authored; `PLAN.md` describes
one engineer's model of it.

---

## 1. Verbatim notes

> Capability Building Program on Competency-Based Learning Materials
>
> ASSESSMENT CRITERIA is from PERFORMANCE CRITERIA -> CRITICAL ASPECT OF COMPETENCY (which is applicable)
> IF blended - add to methodologies
>
> Apply chunking strategy.
>
> IN CBLM, change: This "unit" changed to "this module"
>
> CRITICAL ASPECTS OF COMPETENCY SHOULD FOCUS ON MAKING CBC
>
> SEGREGATE THE CRITICAL ASPECTS OF COMPETENCY TO ALL LEARNING OUTCOMES SINCE IT IS FROM THE WHOLE UC
>
> TOPICS from CBC are from REQUIRED KNOWLEDGE OR UNDERPINNING KNOWLEDGE /
>
> RANGE OF VARIABLES are italicized, pwede siya maging content/topic
>
> CONDITION from CBC are from RESOURCE IMPLICATION, if BROAD, check to the RANGE OF VARIABLES.
>
> // METHODS OF ASSESSMENT TR
>
> CBC methods of assessment should reflect the ASSESSMENT CRITERIA
>
> ALL TRAINING should be PORTFOLIO-based output
>
> Training Regulation is the main source
>
> Course Structure
>
> Critical Aspects of Criteria is main
>
> Contents: should be arranged from BASIC to COMPLEX
>
> CBC TM 2 Matrix
>
> TEMPLATE is OLD FORMAT
>
> Active Voice Form in ASSESSMENT CRITERIA
>
> PER Topic - one infosheet
>
> TOPIC
>     - Subtopic
>
> MODULE STYLE MATRIX FOR CBC TEMPLATE
>
> specific and accurate to the range of variables which is necessary for that Learning
> Outcome, but not limited to those listed only. Possible adapt to new technologies.
>
> Assessment Methods - Method of Assessment from TR
>
> Remove common competencies found in Core competencies
>
> Search for topics relevant to the Assessment Criteria and Sort it per progress sequence
>
> LEARNING ACTIVITY with -ing verb and LEARNING CONTENT only topic ex. Plan
>
> Lecture -> Active lecture format
>
> SESSION PLAN == "this session"
>
> The trainee will observe == demonstration
>
> * Case to Case basis
>
> Learner-centered training description
>
> each topic should atleast have 2 methods
>
> ENHANCED CBC -> SESSION PLAN -> CBLM

---

## 2. Derived field mapping (TR → CBC)

**Interpretation of §1 — confirm before implementing.** The TR is the main source; the
CBC is *derived* from it by this mapping, not authored freely.

| CBC field | Sourced from (TR) | Transform |
|---|---|---|
| Assessment Criteria | Performance Criteria + Critical Aspects of Competency | Union, filtered to those *applicable* to the LO; rewritten in **active voice** |
| Topics / Contents | Required Knowledge (a.k.a. Underpinning Knowledge) | Selected for relevance to the Assessment Criteria, then **sorted basic → complex** in progression sequence |
| Contents (supplementary) | Range of Variables | May become content/topic; rendered *italicized* |
| Conditions | Resource Implications | If the Resource Implication is broad, narrow it against Range of Variables |
| Methodologies | — | Must reflect the Assessment Criteria; add blended-delivery methods when delivery is blended; **≥2 methods per topic**; "Lecture" → *active lecture* format |
| Assessment Methods | Methods of Assessment (TR) | Must reflect the Assessment Criteria; all training is **portfolio-based output** |

**Critical Aspects of Competency** are stated once for the whole Unit of Competency and
must be **segregated across all LOs** — each LO takes the aspects that apply to it. This
is a distribution step, not a copy.

**Common competencies appearing inside Core competencies must be removed.**

### The TR is a floor, not a ceiling

The Training Regulation states **minimum requirements**. The CBC may add topics beyond
those in the TR's Required Knowledge, provided each addition **traces to an Assessment
Criterion (or Learning Criterion)**. This is what makes the node authorship rather than
a reformat — and it constrains the Validator: it may assert *"every topic traces to an
assessment criterion"*, but it must **never** assert *"every topic appears in the TR."*
A topics-⊆-TR check would fail correct output.

---

## 3. Pipeline order

**SUPERSEDED 2026-08-18.** The authoring chain is `TR → ENHANCED CBC → SESSION PLAN →
CBLM`, but **this system does not build the first arrow.** The Enhanced CBC is supplied
by the human, not generated.

```
INPUTS (both required)          SELECTION            GENERATED
┌──────────────────┐
│  TR (PDF)        │──┐      ┌──────────────┐      ┌───────────────┐
├──────────────────┤  ├─parse─▶│ pick UC      │──────▶│ Session Plan  │
│  Enhanced CBC    │──┘      │ pick LO(s)   │      ├───────────────┤
└──────────────────┘         └──────────────┘      │ CBLM          │
                              (human-in-loop)      └───────────────┘
```

- **Both TR and Enhanced CBC are required uploads.** No CBC-generation node exists.
- After parsing, the user selects a **Unit of Competency**, then **Learning Outcome(s)**,
  from a dropdown built out of the parsed structure.
- **Session Plan and CBLM are separate outputs.** CBLM is the primary deliverable.

### Vocabulary bridge (load-bearing)

| TR term | CBC term |
|---|---|
| **Element** | **Learning Outcome** |

The same concept is named differently in the two source documents. Aligning TR Elements
to CBC Learning Outcomes is a required join, and the two documents may not word them
identically.

---

## 4. Session Plan rules

- Learning Activity phrased with an **-ing verb**; Learning Content is the **topic only**
  (e.g. Activity: "Planning…" / Content: "Plan").
- Self-reference is **"this session"**.
- "The trainee will observe" is recorded as the **demonstration** method.
- Training description is **learner-centered**.
- Each topic carries **at least 2 methods**.

## 5. CBLM rules

- Self-reference changes from "this **unit**" to "this **module**".
- **One Information Sheet per topic.** Structure is TOPIC → subtopic.
- Apply a **chunking strategy** to content.

## 6. Template notes

- CBC template in hand is the **old format** — "CBC TM 2 Matrix" / "Module Style Matrix".
- Range of Variables entries are *italicized* in output.
- Content scope: specific and accurate to the Range of Variables necessary for that LO,
  **but not limited to those listed** — may adapt to new technologies.

---

## 7. Open questions

- [x] ~~Is "ENHANCED CBC" a distinct artifact from the CBC Module?~~ Same document.
- [x] ~~Does the pipeline receive an existing CBC, or derive it?~~ **Derives it from the
      TR via an LLM agent node.** Resolved 2026-08-18.
- [ ] Which TESDA template files back the CBC / Session Plan / CBLM exports?
- [ ] Rule for "case to case basis" items — which decisions stay with the human?

---

## 8. Style Specification Matrix (2026 CBLM Caravan)

Source: `reference/2026-STYLE-SPECIFICATION-MATRIX-CBLM-CARAVAN-2026.pdf`
(prepared by Gilbert Jon S. Cometa, SVTESDS). This is a **formal, machine-checkable
spec** — most of it is deterministic template configuration or validator assertions, not
generation guidance.

### Document formatting → belongs in the `docxtpl` template, not the LLM

| Component | Standard |
|---|---|
| Paper size | A4 (210 × 297 mm) |
| Margins | 1 inch all sides |
| Font | Arial *or* Bookman Old Style — one family throughout |
| Body size | 11–12 pt |
| Heading 1 | 16 pt bold — Learning Outcome titles |
| Heading 2 | 14 pt bold — Information Sheet, Job Sheet, etc. |
| Heading 3 | 12 pt bold — sub-sections |
| Line spacing | 1.15–1.5 |
| Alignment | Justified |
| Page number | Bottom centre or bottom right, continuous |
| Header | Qualification Title, Unit of Competency — every page |
| Footer | Version No., Revision Date, Institution |
| Image width | 5 × 7.6 cm or 7.5 × 10 cm |
| Image format | PNG preferred (diagrams), JPG (photos) |
| Diagrams | Vector (SVG/PDF) preferred |
| Captions | "Figure 1", "Figure 2" — descriptive, below the image |

### Information Sheet — required sections (validator: all present, none empty)

Title (LO number + title) → Learning Objectives → Introduction (importance of the
competency) → Main Discussion (concepts under headings) → Illustrations → Summary
(key points) → Self-Check (10–20 questions) → Answer Key (end of module) →
References (APA 7th).

### Self-Check / Examination — item counts are checkable

| Exam type | Count | Purpose |
|---|---|---|
| Multiple Choice | 10–20 | Knowledge recall |
| True or False | 5–10 | Concept verification |
| Matching Type | 5–10 | Terminology |
| Identification | 10 | Technical vocabulary — **not recommended (LOTS)** |
| Short Answer | 5 | Application |
| Essay | 1–2 | Critical thinking |
| Case Analysis | optional | Higher-order thinking |

Answer Key format: `Item No. | Correct Answer` (e.g. `1 | A`, `2 | True`, `3 | Cable Tray`).

### Task/Job/Operation Sheet — required fields

Title (task name) → Learning Outcome (competency reference) → Objective (expected
performance) → Time Required → Resources (tools/equipment/materials, based on the task)
→ Safety Requirements (PPE, hazards, precautions) → Procedures (step-by-step) →
Expected Output (product or service) → Assessment Method — **at least two methods**.

### Citation

APA 7th Edition. In-text `(Author, Year)`. Books: `Author. (Year). Title. Publisher.`
Websites: `Author/Organization. (Year). Title. URL`. Images: credit creator or licensed
source.

> **AI-Assisted Content — disclose use according to institutional policy and verify
> technical accuracy.**
>
> This applies to *this project's own output*. Every generated document must carry an
> AI-assistance disclosure, and the design must keep a human verification step. Treat as
> a hard requirement, not a nicety.

---

## 9. Session Plan matrix — actual column structure

Observed from a real Session Plan (OAP NC II, LO1: Establish Nursery, 5 hours):

| Learning Content | Methods | Presentation | Practice | Feedback | Resources | Time |
|---|---|---|---|---|---|---|

- **Learning Content** carries the numbered topic (`1.1.1 Seed Selection`) with its
  subtopics beneath it, *italicized* (`Germination testing`, `Physical evaluation of
  seeds`) — consistent with the Range-of-Variables italics rule.
- **One row per method**, so a topic with two methods spans two rows — this is how the
  "≥2 methods per topic" rule is realized structurally.
- Methods observed: `Self-paced/modular learning`, `Active lecture`.
- **Presentation / Practice / Feedback** are prose cells naming concrete artifacts:
  *"The trainee will read Information Sheet 1.1.1…"*, *"The trainee will answer
  Self-Check 1.1-1"*, *"The trainee will compare their answers with Answer Key 1.1-1"*.
  Later rows switch to -ing form (*"Performing Self-Check 1.1.1…"*, *"Comparing answers
  with Answer Key 1.1.1"*).
- **Resources** enumerates the CBLM artifacts by number plus physical materials
  (`Assorted vegetable seeds`).
- **Time** is per topic (`1 hour`), summing to the LO's total hours (`5 hours`).

**Numbering is load-bearing and cross-referential:** topic `1.1.1` binds Information
Sheet 1.1.1, Self-Check 1.1.1, and Answer Key 1.1.1. The Session Plan therefore
*determines* which CBLM artifacts must exist. Note the source document is internally
inconsistent (`Self-Check 1.1-1` vs `Self-Check 1.1.1`) — pick one convention and
enforce it deterministically.

### Number of Information Sheets is a human decision

Per the project owner: how many Information Sheets a topic gets depends on how many
contents the **trainer** decides on, so long as they remain reflected in the Session
Plan. The AI's job is **not** to decide the count — it is to generate content matching
this Style Specification Matrix for whatever contents are given.
