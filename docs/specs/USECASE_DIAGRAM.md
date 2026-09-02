# tesda-cbc-agent — Use Case Diagram

Originally generated via `/generate-usecase-diagram`; hand-updated 2026-08-22 for the
CBLM-only, three-upload, single-job-interrupt reversal (`PLAN.md` §1, `ARCHITECTURE.md`
§3). **Regenerate with a `todiagram` MCP tool next time this needs a full redraw** rather
than hand-editing Mermaid further — see the diagram-generation preference in memory.

> **What changed from the previous version:** this diagram predated even the "two
> required uploads" era — it modeled a single TR upload, RAG-grounded drafting via an
> Embeddings API + vector store, an LLM-formatted CBC module, and a drafted Session Plan.
> None of that is current: CBC and Session Plan are both required uploads (not
> generated), grounding is TR-traceability (not RAG — Embeddings API/vector store removed
> as primary actors), and CBLM is the only generated output. The align/review/select step
> — previously entirely missing from this diagram — is now UC7, the pipeline's one
> LangGraph interrupt.

```mermaid
%%{init: {'theme': 'dark'}}%%
flowchart LR
    Trainer((Trainer))

    subgraph CBC [CBC Agent Backend]
        UC1(["Upload Sources (TR + CBC + Session Plan)"])
        UC2(["Validate Source Formats"])
        UC3(["Parse TR into Structured Data"])
        UC4(["Parse CBC into Structured Data"])
        UC5(["Parse Session Plan into Topic Numbering"])
        UC6(["Align Sources (TR ↔ CBC ↔ Session Plan)"])
        UC7(["Review Alignment &amp; Select UC/LO"])
        UC8(["Draft CBLM Sections"])
        UC9(["Retrieve Few-Shot Style Examples"])
        UC10(["Validate Generated Content"])
        UC11(["Retry Failed Draft"])
        UC12(["Export to DOCX"])
        UC13(["Track Job Progress"])
        UC14(["Download Generated Documents"])
    end

    LLM[["Groq / OpenRouter LLM"]]
    Supabase[["Supabase (Postgres/Storage)"]]
    Pinecone[["Pinecone (RAG insurance, unused by default)"]]

    Trainer --- UC1
    Trainer --- UC7
    Trainer --- UC13
    Trainer --- UC14

    UC1 -.->|"&lt;&lt;include&gt;&gt;"| UC2
    UC2 -.->|"&lt;&lt;include&gt;&gt;"| UC3
    UC2 -.->|"&lt;&lt;include&gt;&gt;"| UC4
    UC2 -.->|"&lt;&lt;include&gt;&gt;"| UC5
    UC3 -.->|"&lt;&lt;include&gt;&gt;"| UC6
    UC4 -.->|"&lt;&lt;include&gt;&gt;"| UC6
    UC5 -.->|"&lt;&lt;include&gt;&gt;"| UC6
    UC6 -.->|"&lt;&lt;include&gt;&gt;"| UC7
    UC7 -.->|"&lt;&lt;include&gt;&gt;"| UC8
    UC8 -.->|"&lt;&lt;extend&gt;&gt;"| UC9
    UC8 -.->|"&lt;&lt;include&gt;&gt;"| UC10
    UC10 -.->|"&lt;&lt;extend&gt;&gt;"| UC11
    UC10 -.->|"&lt;&lt;include&gt;&gt;"| UC12

    UC3 --- LLM
    UC8 --- LLM
    UC9 -.-> Pinecone
    UC1 --- Supabase
    UC7 --- Supabase
    UC12 --- Supabase
    UC13 --- Supabase
    UC14 --- Supabase

    classDef actor fill:#4a148c,stroke:#ba68c8,color:#fff
    classDef usecase fill:#bf360c,stroke:#ff8a65,color:#fff
    classDef external fill:#1b5e20,stroke:#81c784,color:#fff

    class Trainer actor
    class UC1,UC2,UC3,UC4,UC5,UC6,UC7,UC8,UC9,UC10,UC11,UC12,UC13,UC14 usecase
    class LLM,Supabase,Pinecone external
```

## Actors

| Actor | Description |
|:------|:------------|
| Trainer | End user who uploads TR/CBC/Session-Plan, reviews the alignment and selects UC/LO, monitors progress, and downloads outputs |

## External systems (secondary actors)

| System | Role |
|:-------|:-----|
| Groq/OpenRouter LLM | Structures extracted TR table rows, and drafts CBLM sections. Does *not* validate — validation is deterministic. CBC and Session Plan parsing use **no LLM** — see UC4/UC5 |
| Supabase | Stores uploaded files, structured data, job state, and generated documents |
| Pinecone | Exemplar-vector backend behind `RetrieverProtocol`, kept as RAG insurance — **unused by default**; the MVP retriever is few-shot, no vector store or embeddings call |

## Use cases

| ID   | Use Case | Description | Actor(s) |
|:-----|:---------|:-------------|:---------|
| UC1  | Upload Sources (TR + CBC + Session Plan) | Trainer uploads all three required sources to start a job — one TR PDF, one Enhanced CBC `.docx`, one Session Plan PDF | Trainer |
| UC2  | Validate Source Formats | TR: extractable text layer present. CBC: really `.docx`. Session Plan: PDF with a recognizable Learning Content column. All synchronous, at upload time — before a job is enqueued | - |
| UC3  | Parse TR into Structured Data | Extracts ELEMENT/PERFORMANCE CRITERIA and Evidence Guide tables with `pdfplumber.extract_tables()`, repairs OCR whitespace artifacts, then structures the rows into `TRData` via the LLM | - |
| UC4  | Parse CBC into Structured Data | Extracts per-LO assessment criteria and topics with `python-docx` — deterministic, **no LLM** | - |
| UC5  | Parse Session Plan into Topic Numbering | Extracts per-LO `TopicRow` (number, content, subtopics) with `pdfplumber.extract_tables()` — deterministic, **no LLM**: numbering is already literal on the page, this extracts rather than interprets | - |
| UC6  | Align Sources (TR ↔ CBC ↔ Session Plan) | Three-way join: TR *Element* ↔ CBC *Learning Outcome* ↔ Session Plan LO heading. Unmatched pairs surfaced, never guessed. No LLM call | - |
| UC7  | Review Alignment & Select UC/LO | The pipeline's one LangGraph interrupt (`interrupt_before` + checkpoint, `jobs.status = awaiting_review`) — not a plain job boundary. Trainer reviews the join and picks a Unit of Competency and Learning Outcome(s); `POST /jobs/{id}/resume` continues the same job | Trainer |
| UC8  | Draft CBLM Sections | LLM generates the four CBLM sections per selected LO — Information Sheet, Task/Job/Operation Sheet, Self-Check, Answer Key — grounded in the TR and CBC, numbered per the parsed Session Plan (UC5), never derived | - |
| UC9  | Retrieve Few-Shot Style Examples | Optional style seam behind `RetrieverProtocol` (few-shot default) — insurance only, not the grounding source. Style itself comes deterministically from the Style Specification Matrix + house rules | - |
| UC10 | Validate Generated Content | Structural checks on drafter output — sections present, no empty placeholders, LO count matches the TR, numbering matches the Session Plan. Deterministic, no LLM call | - |
| UC11 | Retry Failed Draft | Re-attempts CBLM drafting for one section when validation fails, bounded at 2 retries | - |
| UC12 | Export to DOCX | Converts the drafted CBLM sections into Word documents via `docxtpl` against real TESDA templates | - |
| UC13 | Track Job Progress | Trainer monitors job status, including `awaiting_review`, in real time | Trainer |
| UC14 | Download Generated Documents | Trainer retrieves finished CBLM `.docx` files | Trainer |
