# tesda-cbc-agent — Data Model Diagrams

Source of truth: `SYSTEM_DESIGN.md` §3 and the lifecycle rules in `SYSTEM_DESIGN.md` §5.

**Revised 2026-08-18.** Two required sources, two job kinds, and a human review pause.

These diagrams model the current backend schema and the way it behaves at runtime.
If the source model changes later, update these diagrams first.

## 1. Entity relationships

```mermaid
erDiagram
    projects ||--o{ source_uploads : has
    projects ||--o{ parsed_structures : has
    jobs ||--o{ session_plans : drafts
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

    session_plans {
        uuid id PK
        uuid job_id FK
        text uc_id
        text lo_id
        jsonb content
        timestamptz approved_at
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
        text kind
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
    [*] --> parsing : job(kind=parse) created

    parsing --> aligning : both sources parsed
    parsing --> failed : no usable text / not .docx / parse exception

    aligning --> done : parsed_structure written<br/><i>parse job ends here</i>
    aligning --> failed : Element/LO join unusable

    [*] --> drafting_plan : job(kind=generate) created<br/>after UC + LO selection

    drafting_plan --> awaiting_review : Session Plan drafted,<br/>graph interrupted
    drafting_plan --> failed : uncaught exception

    awaiting_review --> drafting_cblm : POST /jobs/id/resume<br/>(approve or edit)

    drafting_cblm --> validating : all drafts attempted
    drafting_cblm --> failed : uncaught exception

    validating --> drafting_cblm : validation failed,<br/>retry_count < 2
    validating --> exporting : all sections pass<br/>or marked failed_after_retries

    exporting --> done : .docx written to Storage
    exporting --> failed : template render error

    failed --> [*]

    note right of awaiting_review
        NOT a failure and NOT a stall.
        The RQ job ENDS here; state lives in
        jobs.checkpoint. Resume enqueues a new job.
        Exclude this status from any job-timeout sweep.
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

## 3. Runtime writes

This diagram shows which tables are written during each major phase.

```mermaid
flowchart LR
    UPLOAD["Source upload (tr + cbc)"] --> T1["source_uploads"]
    PARSEREQ["Parse request"] --> J0["jobs<br/>kind = parse"]
    J0 --> PS["parsed_structures"]
    PS --> SELECT["Human picks UC + LOs"]
    SELECT --> GENERATE["Generate request"]
    GENERATE --> J1["jobs<br/>kind = generate"]
    J1 --> SP["session_plans"]
    SP --> PAUSE["status = awaiting_review<br/>checkpoint persisted"]
    PAUSE --> RESUME["POST /jobs/id/resume"] --> J1
    WORKER["RQ worker / LangGraph"] --> E1["job_events"]
    WORKER --> D1["generated_documents"]
    WORKER --> C1["corpus_chunks<br/>read only"]

    RESUME --> DRAFT["cblm_drafter"]
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

    class T1,J0,J1,PS,SP,E1,D1,EXPORT,DONE write
    class C1 read
    class RETRY decision
    class SELECT,PAUSE,RESUME human
```

## 4. Event semantics

```mermaid
flowchart TD
    A["job_events row"] --> B{"node_name"}
    B -->|"parser"| C["Parse TR tables"]
    B -->|"parse_cbc"| D["Parse CBC .docx"]
    B -->|"align_sources"| E["Join TR Element to CBC LO"]
    B -->|"session_plan_drafter"| F["Draft one LO session plan"]
    B -->|"cblm_drafter"| G["Draft one LO CBLM set"]
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
- Resuming must be idempotent: guard on `session_plans.approved_at` being null.
- `generated_documents.content` stores structured content **alongside** the rendered
  `.docx`. This is what keeps the post-MVP chat / "Improve with AI" layer possible without
  re-parsing Word output — see `SYSTEM_DESIGN.md` §9.
- ~~If you later move to the TR + CBC source model…~~ **Done** — `source_uploads` landed
  2026-08-18.
