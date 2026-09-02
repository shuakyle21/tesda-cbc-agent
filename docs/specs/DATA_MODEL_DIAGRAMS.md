# tesda-cbc-agent — Data Model Diagrams

Source of truth: `SYSTEM_DESIGN.md` §3 and the lifecycle rules in `SYSTEM_DESIGN.md` §5.

**Revised 2026-08-18, then twice more on 2026-08-22.** Three required sources (TR, CBC,
Session Plan — all parsed, none generated), **one** job kind spanning parse through
export, and a single human review pause right after `align_sources` — CBLM is the
system's only generated output.

These diagrams model the current backend schema and the way it behaves at runtime.
If the source model changes later, update these diagrams first.

## 1. Entity relationships

```mermaid
erDiagram
    projects ||--o{ source_uploads : has
    projects ||--o{ parsed_structures : has
    projects ||--o{ jobs : has
    projects ||--o{ generated_documents : owns
    jobs ||--o{ job_events : traces
    jobs ||--o{ generated_documents : produces

    projects {
        uuid id PK
        text title
        text qualification_code
        timestamptz created_at
    }

    source_uploads {
        uuid id PK
        uuid project_id FK
        text role
        text mime_type
        text storage_path
        timestamptz created_at
    }

    parsed_structures {
        uuid id PK
        uuid project_id FK
        jsonb structure
        jsonb unmatched
        timestamptz created_at
    }

    corpus_chunks {
        uuid id PK
        text section_type
        text content
        text vector_id
        text source_doc
        timestamptz created_at
    }

    jobs {
        uuid id PK
        uuid project_id FK
        jsonb checkpoint
        text status
        text error
        timestamptz created_at
        timestamptz updated_at
    }

    job_events {
        uuid id PK
        uuid job_id FK
        text node_name
        text lo_id
        text status
        jsonb detail
        timestamptz created_at
    }

    generated_documents {
        uuid id PK
        uuid project_id FK
        uuid job_id FK
        text doc_type
        text lo_id
        text section_type
        jsonb content
        text storage_path
        text status
        timestamptz created_at
    }
```

## 2. Job lifecycle

```mermaid
stateDiagram-v2
    [*] --> parsing : job created,<br/>POST /projects/id/parse<br/><i>the only job-start endpoint</i>

    parsing --> aligning : all three sources parsed
    parsing --> failed : no usable text / not .docx /<br/>bad Session Plan table / parse exception

    aligning --> awaiting_review : align_sources done,<br/>graph interrupted, checkpoint persisted
    aligning --> failed : three-way join unusable

    awaiting_review --> drafting_cblm : POST /jobs/id/resume<br/>{ uc_id, lo_ids } — SAME job resumes

    drafting_cblm --> validating : all drafts attempted
    drafting_cblm --> failed : uncaught exception

    validating --> drafting_cblm : validation failed,<br/>retry_count < 2
    validating --> exporting : all sections pass<br/>or marked failed_after_retries

    exporting --> done : .docx written to Storage
    exporting --> failed : template render error

    done --> [*]
    failed --> [*]

    note right of awaiting_review
        NOT a failure and NOT a stall.
        The RQ job ENDS here; state lives in
        jobs.checkpoint. Resume enqueues a NEW RQ job
        that continues the SAME graph run.
        Exclude this status from any job-timeout sweep.
        No jobs.kind column — one job kind, not two.
    end note

    note right of validating
        Validation can loop back to drafting.
        That retry edge, plus the interrupt above,
        is what makes this an agent workflow.
    end note

    note right of done
        "done" can still contain partial failures.
        Fully failed only if the job dies
        or every section fails.
    end note
```

> **What changed vs the previous version:** the old diagram modeled two disconnected
> state machines — `job(kind=parse)` ending at `done` on its own, and a separate
> `job(kind=generate)` starting fresh after `drafting_plan`. That's gone: one job, one
> continuous state machine, `awaiting_review` sitting where the old `parsing→aligning→done`
> chain used to terminate.

## 3. Runtime writes

This diagram shows which tables are written during each major phase.

```mermaid
flowchart LR
    UPLOAD["Source upload (tr + cbc + session_plan)"] --> T1["source_uploads"]
    PARSEREQ["Parse request<br/>POST /projects/id/parse"] --> J0["jobs<br/><i>one kind — no jobs.kind column</i>"]
    J0 --> PS["parsed_structures<br/>incl. per-LO topics from<br/>the parsed Session Plan"]
    PS --> PAUSE["status = awaiting_review<br/>checkpoint persisted<br/><i>job ends here</i>"]
    PAUSE --> SELECT["Human reviews alignment,<br/>picks UC + LOs"]
    SELECT --> RESUME["POST /jobs/id/resume<br/>{ uc_id, lo_ids }"] --> J0
    WORKER["RQ worker / LangGraph"] --> E1["job_events"]
    WORKER --> D1["generated_documents"]
    WORKER --> C1["corpus_chunks<br/>read only, insurance path"]

    RESUME --> DRAFT["cblm_drafter<br/>topic numbering FROM<br/>parsed_structures, not derived"]
    DRAFT --> HOUSE["apply_house_rules"]
    HOUSE --> VALIDATE["Validator"]
    VALIDATE --> RETRY{"retry_count < 2?"}
    RETRY -->|yes| DRAFT
    RETRY -->|no| EXPORT["Export"]
    EXPORT --> DONE["jobs.status = done"]

    classDef write fill:#e6f1fb,stroke:#185fa5,color:#18180f
    classDef read fill:#f9f9f9,stroke:#b0aea8,color:#18180f
    classDef decision fill:#f8f5ff,stroke:#534ab7,color:#18180f
    classDef human fill:#f8f5ff,stroke:#534ab7,color:#18180f

    class T1,J0,PS,E1,D1,EXPORT,DONE write
    class C1 read
    class RETRY decision
    class SELECT,PAUSE,RESUME human
```

> **What changed vs the previous version:** no `session_plans` table write — Session
> Plan is parsed input, its topics live in `parsed_structures.structure`. One `jobs` row
> per run, not two (`kind=parse` then `kind=generate`) — `RESUME` loops back into the
> *same* `J0`, not a new `J1`.

## 4. Event semantics

```mermaid
flowchart TD
    A["job_events row"] --> B{"node_name"}
    B -->|"parse_tr"| C["Parse TR tables (LLM)"]
    B -->|"parse_cbc"| D["Parse CBC .docx (no LLM)"]
    B -->|"parse_session_plan"| F1["Parse Session Plan tables<br/>(no LLM)"]
    B -->|"align_sources"| E["Join TR Element to CBC LO<br/>to Session Plan LO heading"]
    B -->|"cblm_drafter"| G["Draft one LO's<br/>4 CBLM sections"]
    B -->|"apply_house_rules"| F2["Deterministic post-processing"]
    B -->|"validator"| H["Check structure"]
    B -->|"export"| I["Render and store DOCX"]

    A --> J{"status"}
    J -->|"started"| K["Blue: in progress"]
    J -->|"succeeded"| L["Green: done"]
    J -->|"retried"| M["Amber: working, not broken"]
    J -->|"failed"| N["Red: broken"]

    A --> O["detail"]
    O --> P["retry_count"]
    O --> Q["reason"]
    O --> R["timing / diagnostics"]
```

## 5. Notes

- `job_events` is append-only. The UI should collapse it by `(node_name, lo_id)`.
- `generated_documents.status = failed_after_retries` is not the same as job failure.
- `corpus_chunks` is retained as **RAG insurance only** and is unused by default; the MVP
  retriever is a few-shot lookup with no vector store.
- `awaiting_review` is a normal state, not an error. The RQ job ends at the interrupt and a
  resume enqueues a new one — never hold a worker slot for human latency.
- Resuming must be idempotent: guard on `jobs.status` still being `awaiting_review` at
  resume time — there's no `session_plans.approved_at` to guard on any more, the table is
  dropped (Session Plan is parsed input, not an editable artifact this system tracks
  approval for).
- `generated_documents.content` stores structured content **alongside** the rendered
  `.docx`. This is what keeps the post-MVP chat / "Improve with AI" layer possible without
  re-parsing Word output — see `SYSTEM_DESIGN.md` §9.
- ~~If you later move to the TR + CBC source model…~~ **Done** — `source_uploads` landed
  2026-08-18; extended to a third role (`session_plan`) 2026-08-22.
