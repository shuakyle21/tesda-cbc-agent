# tesda-cbc-agent — Technical Diagrams

Companion to `PLAN.md` (scope, milestones), `SYSTEM_DESIGN.md` (architecture),
`PLANNING_DIAGRAM.md` (milestone flow), and `USECASE_DIAGRAM.md` (actors/use cases).

All diagrams below are validated Mermaid. Section references point back to the
source-of-truth docs so nothing here drifts silently.

---

## 1. LangGraph pipeline — nodes, state, and the retry edge

The capstone centerpiece. Source: `PLAN.md` §2, `SYSTEM_DESIGN.md` §5.
Blue = LLM node, green = deterministic node, amber = conditional branch, red = failure path.

```mermaid
flowchart TD
    START([START]) --> PARSER

    PARSER["<b>parser</b><br/>pdfplumber extract_tables<br/>→ whitespace repair<br/>→ LLM structuring<br/>→ CompetencyData"]
    RETRIEVER["<b>retriever</b><br/>Pinecone search<br/>filtered by section_type"]

    PARSER -->|"state.competency<br/>state.los[]"| RETRIEVER

    RETRIEVER --> FANOUT{{"fan-out per LO<br/>(paced for rate limits)"}}

    FANOUT --> CBC["<b>cbc_formatter</b><br/>deterministic<br/>NO LLM call"]
    FANOUT --> SP["<b>session_plan_drafter</b><br/>1 call per LO"]
    FANOUT --> CBLM["<b>cblm_drafter</b><br/>4 sections per LO<br/>info / task / self-check / key"]

    CBC --> JOIN(( ))
    SP --> JOIN
    CBLM --> JOIN

    JOIN --> VALIDATOR["<b>validator</b><br/>structural checks only<br/>sections present, no empty<br/>placeholders, LO count match"]

    VALIDATOR --> COND{"validation<br/>result?"}

    COND -->|"pass"| EXPORT
    COND -->|"fail AND retry_count &lt; 2<br/><i>the graded conditional edge</i>"| REDRAFT["append failure reason<br/>to drafter context<br/>retry_count += 1"]
    COND -->|"fail AND retry_count = 2"| MARK["mark section<br/>failed_after_retries<br/><i>pipeline continues</i>"]

    REDRAFT -.->|"route back to the<br/>specific failing drafter"| SP
    REDRAFT -.-> CBLM
    MARK --> EXPORT

    EXPORT["<b>export</b><br/>docxtpl → TESDA templates<br/>→ Supabase Storage"]
    EXPORT --> END([END])

    classDef llm fill:#1e3a5f,stroke:#4a90d9,color:#fff
    classDef det fill:#2d5a3d,stroke:#5cb85c,color:#fff
    classDef gate fill:#5a3d1e,stroke:#d9a04a,color:#fff
    classDef fail fill:#5a1e1e,stroke:#d94a4a,color:#fff
    classDef term fill:#333,stroke:#888,color:#fff

    class PARSER,SP,CBLM llm
    class CBC,VALIDATOR,EXPORT,RETRIEVER det
    class COND,FANOUT gate
    class REDRAFT,MARK fail
    class START,END,JOIN term
```

> **Note vs `USECASE_DIAGRAM.md`:** the CBC Formatter is deterministic and does *not*
> depend on the Validator — only the two Drafter outputs flow through validation and
> the retry edge. This diagram is the accurate one on that point.

---

## 2. Runtime sequence — upload to download

Source: `SYSTEM_DESIGN.md` §2 (data flow) and §4 (API contracts).
Note FastAPI never touches the LLM — all AI work is inside the RQ worker.

```mermaid
sequenceDiagram
    autonumber
    actor T as Trainer
    participant UI as Next.js UI<br/>(React client)
    participant API as FastAPI
    participant R as Redis (RQ)
    participant W as RQ Worker<br/>(LangGraph)
    participant LLM as Groq/OpenRouter
    participant EMB as Embeddings API
    participant DB as Supabase<br/>(PG + Storage)
    participant V as Pinecone<br/>(vector index)

    T->>UI: select TR PDF
    UI->>API: POST /projects/{id}/tr
    API->>API: cheap text-layer check<br/>first + 1 sampled page only<br/>(full table parse belongs in the worker)
    alt no text layer
        API-->>UI: 400 "no text layer detected"
    else valid
        API->>DB: stream to Storage + insert tr_uploads
        API-->>UI: { tr_upload_id }
    end

    UI->>API: POST /projects/{id}/generate
    API->>DB: insert jobs (status=parsing)
    API->>R: enqueue job
    API-->>UI: { job_id } (returns immediately)

    R->>W: dequeue

    Note over W,DB: every node writes job_events<br/>on entry and exit

    W->>DB: job_events (parser, started)
    W->>W: pdfplumber extract_tables per page<br/>+ whitespace repair on OCR artifacts
    W->>LLM: structure table rows → CompetencyData
    LLM-->>W: JSON (Pydantic-validated)
    W->>DB: cache parsed_json + job_events (parser, succeeded)

    loop per section_type
        W->>EMB: embed retrieval query
        EMB-->>W: vector
        W->>V: similarity search + metadata filter
        V-->>W: exemplar chunks
    end

    loop per LO (paced)
        W->>LLM: draft session plan + 4 CBLM sections
        LLM-->>W: drafts
        W->>W: validator (structural)
        alt fails and retries remain
            W->>DB: job_events (status=retried)
            W->>LLM: redraft with failure reason
        else exhausted
            W->>DB: mark failed_after_retries, continue
        end
    end

    W->>DB: docxtpl render → Storage + generated_documents
    W->>DB: jobs.status = done

    loop polling every 2s while non-terminal
        UI->>API: GET /jobs/{job_id}
        API->>DB: read jobs + job_events
        DB-->>API: status + trace
        API-->>UI: { status, events, error? }
        Note over UI: collapse to latest row per<br/>(node_name, lo_id) — see DESIGN.md §2
    end

    UI->>API: GET /projects/{id}/documents
    API->>DB: signed Storage URLs
    API-->>UI: download links
    T->>DB: download .docx
```

---

## 3. Data model — entity relationships

Source: `SYSTEM_DESIGN.md` §3. Note `corpus_chunks` is deliberately unlinked —
the RAG corpus is global, not per-project (trade-off table §7).

```mermaid
erDiagram
    projects ||--o{ tr_uploads : "has"
    projects ||--o{ jobs : "has"
    projects ||--o{ generated_documents : "owns"
    jobs ||--o{ job_events : "traces"
    jobs ||--o{ generated_documents : "produces"

    projects {
        uuid id PK
        text title
        text qualification_code
        timestamptz created_at
    }

    tr_uploads {
        uuid id PK
        uuid project_id FK
        text storage_path
        jsonb parsed_json "parser cache"
        timestamptz created_at
    }

    jobs {
        uuid id PK
        uuid project_id FK
        text status "parsing..done|failed"
        text error
        timestamptz created_at
        timestamptz updated_at
    }

    job_events {
        uuid id PK
        uuid job_id FK
        text node_name
        text lo_id "null for job-level nodes"
        text status "started|succeeded|failed|retried"
        jsonb detail "retry_count, reason"
        timestamptz created_at
    }

    generated_documents {
        uuid id PK
        uuid project_id FK
        uuid job_id FK
        text doc_type "cbc_module|session_plan|cblm_section"
        text lo_id
        text section_type
        text storage_path
        text status "ok|failed_after_retries"
        timestamptz created_at
    }

    corpus_chunks {
        uuid id PK
        text section_type "filter key for RAG"
        text content
        text pinecone_id "vector payload key"
        text source_doc
        timestamptz created_at
    }
```

---

## 4. Job status lifecycle

Source: `SYSTEM_DESIGN.md` §3 (`jobs.status`) and §5 (failure semantics).
The key subtlety: `done` can include partial failures.

```mermaid
stateDiagram-v2
    [*] --> parsing : job dequeued by worker

    parsing --> retrieving : CompetencyData validated
    parsing --> failed : no usable text extracted

    retrieving --> drafting : exemplars fetched
    retrieving --> failed : embeddings/Pinecone exhausted retries

    drafting --> validating : all drafts attempted
    drafting --> failed : uncaught exception

    validating --> drafting : validation failed,<br/>retry_count &lt; 2
    validating --> exporting : all sections pass<br/>or marked failed_after_retries

    exporting --> done : .docx written to Storage
    exporting --> failed : template render error

    done --> [*]
    failed --> [*]

    note right of validating
        The retry edge back to drafting
        is the graded conditional branching.
        Bounded at 2 retries per section.
    end note

    note right of done
        "done" may include partial failures.
        Only a total failure of every section
        results in "failed".
    end note

    note right of failed
        No auto-retry of the whole job:
        nodes have side effects (Storage
        writes) and re-running wastes
        free-tier rate-limit budget.
        Trainer re-triggers manually.
    end note
```

---

## 5. Three distinct failure layers

Source: `SYSTEM_DESIGN.md` §5. The doc's own warning — *don't conflate them* —
is the whole point of this diagram. Only Layer 2 is graded agent logic.

```mermaid
flowchart TD
    subgraph L1["Layer 1 — Transient API failure (plumbing)"]
        direction TB
        A1["external call<br/>LLM / embeddings"] --> A2{"429 / timeout / 5xx?"}
        A2 -->|"yes"| A3["tenacity exponential backoff<br/>3–5 attempts"]
        A3 --> A1
        A2 -->|"no"| A4["return result"]
        A3 -.->|"attempts exhausted"| ESCALATE1["escalate to Layer 3"]
    end

    subgraph L2["Layer 2 — Validation failure (THE GRADED LOGIC)"]
        direction TB
        B1["validator runs<br/>structural checks"] --> B2{"section valid?"}
        B2 -->|"yes"| B3["accept section"]
        B2 -->|"no"| B4{"retry_count &lt; 2?"}
        B4 -->|"yes"| B5["route back to that<br/>section's drafter with<br/>failure reason in context"]
        B5 --> B1
        B4 -->|"no"| B6["generated_documents.status =<br/>failed_after_retries<br/><b>pipeline continues</b>"]
    end

    subgraph L3["Layer 3 — Job-level failure"]
        direction TB
        C1["RQ job crashes<br/>or parser unusable"] --> C2["jobs.status = failed<br/>error surfaced verbatim"]
        C2 --> C3["<b>NO auto-retry</b><br/>side-effecting nodes make<br/>blind re-runs non-idempotent"]
        C3 --> C4["trainer re-triggers<br/>POST /generate manually"]
    end

    A4 --> B1
    ESCALATE1 --> C1
    B6 --> OUT["job completes as <b>done</b><br/>with partial-failure summary"]
    B3 --> OUT

    classDef plumbing fill:#3a3a3a,stroke:#777,color:#ccc
    classDef graded fill:#1e3a5f,stroke:#4a90d9,color:#fff
    classDef jobfail fill:#5a1e1e,stroke:#d94a4a,color:#fff
    classDef good fill:#2d5a3d,stroke:#5cb85c,color:#fff

    class A1,A2,A3,A4,ESCALATE1 plumbing
    class B1,B2,B4,B5 graded
    class B6 jobfail
    class C1,C2,C3,C4 jobfail
    class B3,OUT good
```

---

## 6. RAG retrieval — section-type filtering, not generic similarity

Source: `PLAN.md` §1 (grounding decision), `SYSTEM_DESIGN.md` §3 (`corpus_chunks`).
The design call worth understanding: retrieval supplies **style**, the TR supplies **facts**.

> **The uploaded TR is never embedded.** It goes into the drafter prompt whole, as
> `CompetencyData`. Chunking it would risk retrieving 3 of 5 elements when the drafter
> needs all of them verbatim. Only the seeded exemplar corpus is vectorised.

```mermaid
flowchart LR
    subgraph SEED["Corpus seeding (one-time, offline)"]
        direction TB
        S1["exemplar CBLMs<br/>+ Session Plans<br/>(no TRs — see PLAN.md §1)"]
        S2["chunk + tag<br/>with section_type"]
        S3["embed via<br/>free-tier API"]
        S4[("corpus_chunks<br/>global, not per-project")]
        S1 --> S2 --> S3 --> S4
    end

    subgraph QUERY["Retrieval at draft time"]
        direction TB
        Q1["LO title +<br/>assessment criteria"]
        Q2{"target<br/>section_type?"}
        Q1 --> Q2
    end

    Q2 -->|"task_sheet"| F1["WHERE section_type<br/>= 'task_sheet'"]
    Q2 -->|"info_sheet"| F2["WHERE section_type<br/>= 'info_sheet'"]
    Q2 -->|"self_check"| F3["WHERE section_type<br/>= 'self_check'"]
    Q2 -->|"session_plan"| F4["WHERE section_type<br/>= 'session_plan'"]

    F1 --> VEC
    F2 --> VEC
    F3 --> VEC
    F4 --> VEC

    VEC["Pinecone similarity<br/>within the filtered set"]
    S4 -.-> VEC

    VEC --> OUT["top-k exemplars<br/>of the RIGHT KIND"]
    OUT --> D["drafter prompt"]

    TR["TR (in prompt)"] --> D
    D --> NOTE["<b>Division of labour:</b><br/>TR supplies the FACTS<br/>retrieval supplies the STYLE"]

    classDef store fill:#2d5a3d,stroke:#5cb85c,color:#fff
    classDef filter fill:#5a3d1e,stroke:#d9a04a,color:#fff
    classDef key fill:#1e3a5f,stroke:#4a90d9,color:#fff

    class S4,VEC store
    class F1,F2,F3,F4,Q2 filter
    class NOTE,D key
```

---

## 7. Parser internals — why table extraction, not flat text

Source: `SYSTEM_DESIGN.md` §3 (`tr_uploads.parsed_json`), validated against
*TR — Organic Agriculture Production NC II* (91 pages, text layer present).

A TR is tables all the way down. The ELEMENT → PERFORMANCE CRITERIA mapping and the
Evidence Guide both live in cell boundaries. Flat text extraction returns the same
words in reading order with the column boundary gone — the structure must then be
re-inferred by regex, and it fails silently by attaching criteria to the wrong element.

```mermaid
flowchart TD
    P0["TR PDF page"]
    P1{"text layer<br/>present?"}
    P0 --> P1

    P1 -->|"no"| PFAIL["jobs.status = failed<br/><i>OCR is out of MVP scope</i>"]
    P1 -->|"yes"| P2["pdfplumber<br/>page.extract_tables()"]

    P2 --> R1["ELEMENT / PERFORMANCE CRITERIA<br/>label → criteria cell pairs"]
    P2 --> R2["EVIDENCE GUIDE<br/>critical aspects, required knowledge,<br/>required skills, method of assessment"]

    R1 --> NORM
    R2 --> NORM

    NORM["whitespace repair<br/><i>'Pre pared' → 'prepared'</i><br/><i>'preven tive' → 'preventive'</i>"]
    NORM --> LLM2["LLM structuring<br/>rows → typed fields"]
    LLM2 --> CD["<b>CompetencyData</b><br/>Pydantic-validated"]
    CD --> CACHE[("tr_uploads.parsed_json<br/>cached, parse once")]

    REJECT["flat extract_text()<br/><b>rejected</b><br/>column boundary lost,<br/>fails silently"]
    P2 -.->|"the alternative"| REJECT

    classDef det fill:#2d5a3d,stroke:#5cb85c,color:#fff
    classDef llm fill:#1e3a5f,stroke:#4a90d9,color:#fff
    classDef gate fill:#5a3d1e,stroke:#d9a04a,color:#fff
    classDef fail fill:#5a1e1e,stroke:#d94a4a,color:#fff

    class P2,NORM,R1,R2,CACHE det
    class LLM2,CD llm
    class P1 gate
    class PFAIL,REJECT fail
```

> **Dependency note:** `pdfplumber` only — pure Python, no system deps, no ML stack.
> MarkItDown and PyMuPDF were considered and dropped: MarkItDown wraps flat pypdf
> extraction (the rejected branch above), and Docling's layout model breaks the
> free-tier / no-GPU constraint in `SYSTEM_DESIGN.md` §1.

---

## 8. Rate-limit budget — pacing the fan-out

Source: `PLAN.md` §1 (free-tier LLM), diagram 1 (`fan-out per LO — paced for rate limits`).

Diagram 5 Layer 1 handles *one call* that fails. This diagram handles the different
problem: **the whole job is a burst.** One competency with 5 LOs is 1 parse + 5 session
plans + 20 CBLM sections = **26 LLM calls**, plus a retry allowance of up to 2 per
drafted section (50 more in the worst case). Fired concurrently on a free tier, that
trips the per-minute limit and every worker hits Layer 1 backoff simultaneously —
turning a rate-limit problem into a thundering-herd problem.

The fix is a semaphore plus a token-bucket, *before* the call, not backoff after it.

```mermaid
flowchart TD
    JOB["job dequeued<br/>1 competency, ~5 LOs"] --> BUDGET["<b>estimate call budget</b><br/>1 parse + 5 session plans<br/>+ 20 CBLM sections = 26<br/>+ retry allowance"]

    BUDGET --> CHECK{"budget &gt; per-job cap?"}
    CHECK -->|"yes"| REJECT["fail fast<br/>jobs.status = failed<br/><i>'competency too large for MVP'</i>"]
    CHECK -->|"no"| SEM

    SEM["<b>asyncio.Semaphore(N)</b><br/>N = 2–3, NOT len(los)<br/><i>caps in-flight calls</i>"]

    SEM --> BUCKET["<b>token bucket</b><br/>refills at the tier's<br/>documented req/min"]

    BUCKET --> WAIT{"token<br/>available?"}
    WAIT -->|"no"| SLEEP["sleep until refill<br/><i>deliberate wait, not a 429</i>"]
    SLEEP --> WAIT
    WAIT -->|"yes"| CALL["LLM call<br/>→ enters Layer 1 (diagram 5)"]

    CALL --> RESULT{"429 anyway?"}
    RESULT -->|"no"| OK["release token<br/>release semaphore slot"]
    RESULT -->|"yes"| ADAPT["<b>shrink the bucket rate</b><br/>the documented limit was wrong<br/>— adapt, don't just retry"]
    ADAPT --> BUCKET

    OK --> NEXT["next queued LO section"]
    NEXT --> SEM

    classDef det fill:#2d5a3d,stroke:#5cb85c,color:#fff
    classDef gate fill:#5a3d1e,stroke:#d9a04a,color:#fff
    classDef fail fill:#5a1e1e,stroke:#d94a4a,color:#fff
    classDef key fill:#1e3a5f,stroke:#4a90d9,color:#fff

    class SEM,BUCKET,BUDGET key
    class CHECK,WAIT,RESULT gate
    class REJECT,ADAPT fail
    class CALL,OK,SLEEP,NEXT,JOB det
```

> **Why this is a separate concern from Layer 1.** Backoff is reactive and per-call:
> it fixes a request that already failed. Pacing is proactive and per-job: it stops the
> burst from happening. Building only the first means the M4 demo stalls in retry storms
> and looks like a broken pipeline. This also caps the *cost* of the retry edge — a
> bounded retry count bounds correctness work, but only the budget check bounds spend.

---

## 9. Observability — one trace per job, two consumers

Source: `SYSTEM_DESIGN.md` §3 (`job_events`), diagram 3 (ER model).

`job_events` already exists in the schema. This diagram is about the thing that makes it
worth having: **the same rows serve both the trainer's progress bar and your debugging.**
No Prometheus, no separate metrics stack — one append-only table, two readers.

```mermaid
flowchart LR
    subgraph W["RQ worker — every node writes on entry and exit"]
        direction TB
        N1["parser"] --> E1["node_name, lo_id,<br/>status, detail, ts"]
        N2["retriever"] --> E1
        N3["drafters<br/>(per LO, per section)"] --> E1
        N4["validator<br/>(incl. status=retried)"] --> E1
        N5["export"] --> E1
    end

    E1 --> TBL[("<b>job_events</b><br/>append-only<br/>one row per node transition")]

    TBL --> C1
    TBL --> C2

    subgraph C1["Consumer 1 — the trainer (live)"]
        direction TB
        P1["GET /jobs/{job_id}"] --> P2["<b>collapse to latest row per<br/>(node_name, lo_id)</b><br/>→ progress list"]
        P2 --> P3["React polls every 2s<br/>while status is non-terminal"]
    end

    subgraph C2["Consumer 2 — you (post-hoc)"]
        direction TB
        D1["SELECT * WHERE job_id<br/>ORDER BY created_at"] --> D2["full node-by-node trace:<br/>which LO, which section,<br/>which retry, how long"]
        D2 --> D3["<b>this is how M4 gets demoed</b><br/>break a drafter → show the<br/>retried row in the trace"]
    end

    classDef store fill:#2d5a3d,stroke:#5cb85c,color:#fff
    classDef key fill:#1e3a5f,stroke:#4a90d9,color:#fff

    class TBL store
    class D3,E1 key
```

> **The rule that makes this work:** a node writes its event row in the *same*
> transaction boundary as its state change. An event log that can disagree with
> `jobs.status` is worse than no event log — you'd debug the logger instead of the
> pipeline.

> **Collapse on the pair, not the node.** The drafters run once per LO, and `job_events`
> carries `lo_id`. Collapsing on `node_name` alone makes LO-2's retry overwrite LO-1's
> success — the trainer watches rows blink between states for no visible reason. The
> correct key is `(node_name, lo_id)`, which yields ~19–24 rows for a 5-LO competency.
> Full UI treatment in `DESIGN.md` §2 (Truth 5) and §8 (N1).

---

## Diagram index

| # | Diagram | Type | Answers |
|---|---------|------|---------|
| 1 | LangGraph pipeline | flowchart | What are the nodes and where is the conditional branching? |
| 2 | Runtime sequence | sequence | Who calls what, in what order, across processes? |
| 3 | Data model | ER | What's persisted and how does it relate? |
| 4 | Job lifecycle | state | What states can a job be in, and what moves it? |
| 5 | Failure layers | flowchart | Which retry mechanism handles which kind of failure? |
| 6 | RAG retrieval | flowchart | How does retrieval stay section-type-aware? |
| 7 | Parser internals | flowchart | Why table extraction rather than flat text? |
| 8 | Rate-limit budget | flowchart | How does a 26-call job avoid tripping the free tier? |
| 9 | Observability | flowchart | Where does the progress bar and the M4 demo trace come from? |
