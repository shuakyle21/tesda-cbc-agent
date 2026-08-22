# tesda-cbc-agent — Planning Diagram

Companion to `PLAN.md` / `SYSTEM_DESIGN.md`. Visualizes the milestone sequence
(M0–M6) and the minimum-submittable-artifact cutoff.

```mermaid
flowchart TD
    M0["M0 — Structured-output smoke test\nPydantic schema × ~10 runs vs free model\n≥9/10 clean? proceed : add fallback"]
    M1["M1 — Parser working\nTR PDF → pdfplumber extract_tables\n→ validated CompetencyData JSON"]
    M2["M2 — Retriever working\nsection type + LO → exemplar chunks (pgvector)"]
    M3["M3 — Drafters + CBC formatter\nfull graph run → PipelineState\n(no validation/retry yet)"]
    M4["M4 — Validator + retry edge\nbroken draft → caught → retried\n(capstone centerpiece demo)"]
    M5["M5 — Export working\n.docx via docxtpl, real TESDA templates"]
    M6["M6 — Minimal UI + RQ/Redis wiring\nupload → job → progress → download"]

    M0 --> M1 --> M2 --> M3 --> M4 --> M5 --> M6

    subgraph FLOOR["Minimum submittable artifact"]
        M5
    end

    M6 -.first thing cut if time runs out.-> CUT["demonstrates nothing on the rubric"]

    classDef floor fill:#2d5a3d,stroke:#1a3324,color:#fff,stroke-width:2px
    classDef cut fill:#4a4a4a,stroke:#333,color:#ccc,stroke-dasharray: 4 3
    classDef milestone fill:#1e3a5f,stroke:#0f1f33,color:#fff

    class M0,M1,M2,M3,M4,M6 milestone
    class M5 floor
    class CUT cut
```

## Planning agent decision flow

How `cbc-pipeline-planner` gates work against the locked plan.

```mermaid
flowchart TD
    REQ["Incoming request\n(build/design/scope question)"]
    READ["Re-read PLAN.md + SYSTEM_DESIGN.md\n(source of truth, not memory)"]
    ORDER{"Skips ahead of\ncurrent milestone?"}
    SCOPE{"Expands locked\nMVP scope?\n(full qualification, auth, etc.)"}
    ASSUME{"Touches an\n(assumption)-tagged\ndecision?"}
    FLAG["Flag explicitly,\nask user to confirm"]
    DECOMPOSE["Decompose into\nfile-scoped tasks\n(TaskCreate)"]
    HANDOFF["Hand off to\nimplementation\n(not this agent)"]

    REQ --> READ --> ORDER
    ORDER -- yes --> FLAG
    ORDER -- no --> SCOPE
    SCOPE -- yes --> FLAG
    SCOPE -- no --> ASSUME
    ASSUME -- yes --> FLAG
    ASSUME -- no --> DECOMPOSE
    FLAG -- user confirms --> DECOMPOSE
    DECOMPOSE --> HANDOFF

    classDef gate fill:#5a3d1e,stroke:#332210,color:#fff
    classDef go fill:#1e3a5f,stroke:#0f1f33,color:#fff
    classDef stop fill:#5a1e1e,stroke:#331010,color:#fff

    class ORDER,SCOPE,ASSUME gate
    class DECOMPOSE,HANDOFF go
    class FLAG stop
```
