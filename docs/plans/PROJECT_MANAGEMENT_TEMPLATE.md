# tesda-cbc-agent — Project Management Template

Use this template to plan and run an execution cycle for this repository without
drifting from locked scope decisions.

---

## 1) Execution cycle info

- Cycle name:
- Start date:
- Target end date:
- Owner:
- Participants:

---

## 2) Scope guardrails (must stay true)

- Source of scope truth: `docs/plans/PLAN.md` (locked decisions).
- Source of execution truth: GitHub Project board.
- Build order baseline: `docs/todos/BUILD_CHECKLIST.md`.
- Product shape for MVP:
  - Required uploads: TR `.pdf` + Enhanced CBC `.docx`
  - Backend-first delivery
  - Minimal Gradio UI (separate process)
- Explicitly out of scope unless a locked decision is revised:
  - Multi-user auth
  - Full qualification generation in one run
  - Reintroducing exemplar RAG as MVP default

---

## 3) Milestone map for this cycle

Mark included milestones and state what "done" means in this cycle.

| Milestone | Included (Y/N) | Cycle goal | Done signal |
|---|---|---|---|
| Contract (1a) |  |  |  |
| M0 |  |  |  |
| M1 |  |  |  |
| M2 |  |  |  |
| M3 |  |  |  |
| M4 |  |  |  |
| M5 |  |  |  |
| M5.5 |  |  |  |
| M6 |  |  |  |
| M7 |  |  |  |
| M8 |  |  |  |

---

## 4) Issue decomposition worksheet

Treat each selected checklist bullet as an issue candidate, then split into atomic
issues when needed.

| Candidate source (file + section) | Proposed issue title | Type | Priority | Milestone | Component | Dependency notes |
|---|---|---|---|---|---|---|
|  |  | Feature/Bug/Docs/Chore/Spike | P0/P1/P2/P3 | M0–M8/Contract | API/Parser/LangGraph/Export/UI/Infra |  |

### Issue quality bar (required per issue)

1. Problem statement
2. Scope boundaries aligned to locked decisions
3. Acceptance criteria
4. Dependencies/blockers
5. Verification steps

---

## 5) Label and metadata checklist

Apply and keep consistent:

- Type labels: `type:feature`, `type:bug`, `type:docs`, `type:chore`, `type:spike`
- Priority labels: `priority:p0`..`priority:p3`
- Milestone labels: `milestone:m0`..`milestone:m8`, `milestone:contract`
- Component labels: `component:api`, `component:parser`, `component:langgraph`,
  `component:export`, `component:ui`, `component:infra`
- Workflow labels: `needs-triage`, `blocked`, `good-first-issue`,
  `capstone-critical`

Project fields to maintain:

- Priority: `P0`/`P1`/`P2`/`P3`
- Milestone: `M0`, `M1`, `M2`, `M3`, `M4`, `M5`, `M5.5`, `M6`, `M7`, `M8`,
  `Contract`
- Component: `API`, `Parser`, `LangGraph`, `Export`, `UI`, `Infra`
- Risk/Blocker (text): missing fixtures, missing credentials, external dependency,
  rate-limit risk, etc.

---

## 6) Delivery board setup checklist

- [ ] Project board exists: `tesda-cbc-agent execution board`
- [ ] Views: Board + Table
- [ ] Status values configured: Backlog, Ready, In Progress, Blocked, In Review, Done
- [ ] Automation:
  - [ ] New issue -> Backlog
  - [ ] Issue assigned -> In Progress
  - [ ] Linked PR opened -> In Review
  - [ ] PR merged or issue closed -> Done

---

## 7) Dependency and blocker log

| Date | Issue/PR | Blocker | Owner | Mitigation | Next check date | Status |
|---|---|---|---|---|---|---|
|  |  |  |  |  |  | Open/Resolved |

Blocked-work hygiene:

- Weekly filter: `Status:Blocked`
- Each blocked item keeps an owner + date note in `Risk/Blocker`

---

## 8) Weekly operating cadence

### Weekly triage

- Re-rank backlog by priority and milestone impact.
- Resolve stale blocked items or reaffirm owner/date.
- Confirm new work still maps to `BUILD_CHECKLIST.md`.

### Milestone review

- Compare open/closed issues per milestone vs checklist intent.
- Verify no milestone is claiming done while required acceptance signals are missing.
- Re-scope only by updating planning docs intentionally (no silent drift).

---

## 9) Cycle-level done criteria

Fill this table at cycle close.

| Check | Result (Pass/Fail) | Evidence |
|---|---|---|
| One competency runs end-to-end (if in-cycle) |  |  |
| Review pause + resume behavior works (if in-cycle) |  |  |
| Output aligns with edited Session Plan (if in-cycle) |  |  |
| Job trace represented honestly in `job_events` |  |  |
| Export fidelity holds for TESDA template output |  |  |
| Selected rubric concepts remain demoable |  |  |

---

## 10) Copy-ready issue body template

```md
## Problem statement
<what is broken/missing and why it matters>

## Scope boundaries
- In scope:
  - <item>
- Out of scope:
  - <item>
- Locked-decision checks:
  - [ ] Honors docs/plans/PLAN.md constraints

## Acceptance criteria
- [ ] <objective criterion>
- [ ] <objective criterion>

## Dependencies / blockers
- Depends on: <issue/none>
- External blocker: <detail/none>

## Verification steps
1. <step>
2. <step>
3. <expected result>
```
