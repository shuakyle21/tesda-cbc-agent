# tesda-cbc-agent — Project Management Setup

## 1) Tracking scope

Track execution against:

- `/home/runner/work/tesda-cbc-agent/tesda-cbc-agent/docs/todos/BUILD_CHECKLIST.md` sections 2–8 (M0–M8 workstream intent)
- Section 1a "Project API contract"
- Section 6 optional template track (templatize TESDA `.docx` files)

Treat each checklist bullet as an issue candidate, then split into atomic issues where needed.

## 2) GitHub Project definition

Create one repository project for `shuakyle21/tesda-cbc-agent`:

- Name: `tesda-cbc-agent execution board`
- Views: Board + Table
- Status values:
  - Backlog
  - Ready
  - In Progress
  - Blocked
  - In Review
  - Done

## 3) Standard issue types and metadata

Use these issue types:

- Feature
- Bug
- Docs
- Chore
- Spike

Use these fields in the GitHub Project:

- **Priority**: `P0`, `P1`, `P2`, `P3`
- **Milestone**: `M0`, `M1`, `M2`, `M3`, `M4`, `M5`, `M5.5`, `M6`, `M7`, `M8`, `Contract`
- **Component**: `API`, `Parser`, `LangGraph`, `Export`, `UI`, `Infra`
- **Risk/Blocker** (text): external dependency, missing fixture, missing credential, rate-limit risk, etc.

## 4) Labels

Apply this label set:

### Type labels
- `type:feature`
- `type:bug`
- `type:docs`
- `type:chore`
- `type:spike`

### Priority labels
- `priority:p0`
- `priority:p1`
- `priority:p2`
- `priority:p3`

### Milestone labels
- `milestone:m0`
- `milestone:m1`
- `milestone:m2`
- `milestone:m3`
- `milestone:m4`
- `milestone:m5`
- `milestone:m5.5`
- `milestone:m6`
- `milestone:m7`
- `milestone:m8`
- `milestone:contract`

### Component labels
- `component:api`
- `component:parser`
- `component:langgraph`
- `component:export`
- `component:ui`
- `component:infra`

### Workflow labels
- `needs-triage`
- `blocked`
- `good-first-issue`
- `capstone-critical`

## 5) Issue decomposition source

Seed issues from `/home/runner/work/tesda-cbc-agent/tesda-cbc-agent/docs/todos/ISSUE_CANDIDATES.md`.

Each created issue should include:

1. Problem statement
2. Scope boundaries (must honor `/home/runner/work/tesda-cbc-agent/tesda-cbc-agent/docs/plans/PLAN.md` locked decisions)
3. Acceptance criteria
4. Dependencies/blockers
5. Verification steps

## 6) Automation rules

Configure GitHub Project automation:

- New issue → `Backlog`
- Issue assigned → `In Progress`
- Linked PR opened → `In Review`
- PR merged or issue closed → `Done`

For blocked-work hygiene:

- Weekly query/filter: `Status:Blocked`
- During weekly triage, update `Risk/Blocker` and either move to `Ready` or keep `Blocked` with an owner/date note.

## 7) Operating cadence

- Weekly triage: backlog priority and unblock review
- Milestone review: compare open/closed issues per milestone against `BUILD_CHECKLIST.md`
- Source of execution truth: GitHub Project
- Source of scope/architecture truth: docs under `/home/runner/work/tesda-cbc-agent/tesda-cbc-agent/docs/`
