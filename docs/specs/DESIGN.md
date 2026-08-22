# tesda-cbc-agent — Design

The visual source of truth for this project's UI, and the brief its component library is
generated from.

Companion to `PLAN.md` (scope, milestones), `SYSTEM_DESIGN.md` (architecture, API contracts),
`TECHNICAL_DIAGRAMS.md` (9 diagrams), `USECASE_DIAGRAM.md` (actors/use cases).

---

## 0. Source-of-truth hierarchy

This project inherits from the **`tesda-cams-frontend-design`** skill — the design system
built for TESDA TVI-CAMS. Same institution, same user population, deliberately the same
visual language.

When sources disagree, resolve in this order (highest wins):

1. **This file** — for anything it speaks to. It encodes decisions specific to this app's
   domain (a long-running agent pipeline) that CAMS has no analogue for.
2. **`tesda-cams-frontend-design` → `references/tokens.md`** — canonical for every hex,
   size, radius, shadow, and duration.
3. **`tesda-cams-frontend-design` → `references/deviations.md`** — why the CAMS prototype
   disagrees with its own prose spec, and why the prototype wins.
4. **`tesda-cams-frontend-design` → `references/components.md`** — component anatomy,
   variants, states.
5. The CAMS prose spec — principles and rationale only. Treat its pixel/hex values as a
   first draft.

**Where this file is silent, CAMS wins. Where this file speaks, it wins.**

Inheritance policy used throughout: **restate anything a generator must not get wrong**
(every hex, every size, all four deviations); **reference by pointer** anything CAMS-specific
that does not apply here (TWSP/CFSP program semantics, the AOU→Billing batch lifecycle,
day-count urgency tiers).

---

## 1. Product context

A trainer uploads a TR PDF, an Enhanced CBC `.docx`, and a Session Plan PDF — all three
required. A LangGraph pipeline — Parsers → `align_sources` → *(review + select
interrupt)* → CBLM Drafter → Validator (with a bounded retry edge) → Export — generates
one competency's worth of CBLM documents and exports them as `.docx` against real TESDA
templates. Neither the CBC nor the Session Plan is generated; CBLM is the only output.

A single run produces **20 documents**: 4 CBLM sections per selected LO (Information
Sheet, Task Sheet, Self-Check, Answer Key) × ~5 LOs — topic numbering comes from the
uploaded Session Plan, not from generation. A full run takes **low single-digit minutes**
(`SYSTEM_DESIGN.md` §1).

The trainer is a **Word user, not a web-app power user** — `PLAN.md` §1 is explicit that
final edits happen in Word, and the app is a generator, not an editor. There is no auth and
no multi-user story in the MVP.

**Scope honesty:** the UI is milestone M7 and `PLAN.md` §4 names it the first thing to cut.
This document exists so that whenever the UI *is* built, the hard decisions are already made.

---

## 2. The nine UX truths

**This is the load-bearing section.** Every component decision downstream derives from one of
these. A design that gets the tokens right and these wrong is a failed design.

### Truth 1 — `done` ≠ success

A job's final status is `done` even when individual sections are `failed_after_retries`.
Only a total failure of every section yields `failed` (`SYSTEM_DESIGN.md` §5;
`TECHNICAL_DIAGRAMS.md` §4).

**Consequence:** the run outcome banner is derived from the **documents list**, never from
`jobs.status` alone. **There is no green "Done" state reachable without first checking
whether any document is `failed_after_retries`.** A green checkmark over 18 of 20 documents
is a lie the trainer discovers in Word, three days later.

### Truth 2 — progress goes backwards

The validator→drafter retry edge moves status `validating` → `drafting` again
(`TECHNICAL_DIAGRAMS.md` §4). This is the graded conditional branching, not a bug.

**Consequence: no stepper.** A 6-step progress stepper encodes an ordering guarantee this
pipeline does not make. Rows update **in place**, ordered by pipeline stage then `lo_id` —
never by `created_at`, which would make rows jump around whenever a retry lands.

### Truth 3 — long silent waits are normal

Token-bucket pacing (`TECHNICAL_DIAGRAMS.md` §8) deliberately sleeps to stay inside free-tier
rate limits. Multi-second gaps with no visible progress are the system working correctly.

**Consequence:** after **20 s** with no new event on a non-terminal job, show a pacing
notice. After **90 s**, soften to "still working, longer than usual." **Never the word
"stalled", and never red or amber at these thresholds** — nothing in the contract proves
failure. See §12 for why 20/90 are tunable guesses.

### Truth 4 — transient backoff is invisible

Tenacity exponential backoff on 429s and timeouts is Layer 1 plumbing, and `SYSTEM_DESIGN.md`
§5 says it "should be invisible when it works."

**Consequence:** the UI **never** surfaces a tenacity retry. The only retry the trainer ever
sees is the Layer 2 validation retry, which is a different thing and is meaningful.

### Truth 5 — collapse to the latest row per `(node_name, lo_id)`

`job_events` is append-only. The progress display collapses it — but the collapse key is the
**pair**, not `node_name` alone, because `job_events` carries `lo_id` and the drafters run
once per LO.

**Consequence:** collapsing on `node_name` alone makes LO-2's retry overwrite LO-1's success.
The correct collapse yields ~20 rows: parse_tr 1 + parse_cbc 1 + parse_session_plan 1 +
align_sources 1 + cblm_drafter ×5 + apply_house_rules ×5 + validator ×5 + export 1.

> Note: `job_events` has **no `section_type` column**. CBLM drafting collapses to one row per
> LO, not one per section. Do not design a row per CBLM section — the data does not exist.

### Truth 6 — `jobs.error` is verbatim

`SYSTEM_DESIGN.md` §5 Layer 3: the error is "surfaced **verbatim**." That may be a raw Python
traceback.

**Consequence:** a plain-language header derived from **structured fields only** (the last
`job_events.node_name`), then the raw string in a collapsed monospace block.
**Never regex, truncate, or prettify the exception.** The trainer may need to paste it to
whoever can fix it.

### Truth 7 — there is no per-section retry

The only retry API is whole-job re-trigger — `POST /projects/{id}/parse` for a fresh run
(there is no `/generate` endpoint any more; `SYSTEM_DESIGN.md` §4). `SYSTEM_DESIGN.md` §5
is explicit that the whole job is not auto-retried and the user re-triggers manually.

**Consequence:** a per-row, per-LO, or per-section "retry" control **would be a lie**. This is
an explicit anti-pattern. There is exactly one re-run control per run, and its confirmation
copy says plainly that all 20 documents are regenerated.

### Truth 8 — upload rejection is synchronous and inline

`POST /projects/{id}/sources` runs a cheap format check in the request per source (TR
text-layer, CBC `.docx`, Session Plan table structure) and returns
`400 {error: "..."}` (`SYSTEM_DESIGN.md` §4, `TECHNICAL_DIAGRAMS.md` §2).

**Consequence:** rejection renders **in place, inside the dropzone** — not as a toast, not on
a separate screen. The file is not retained. The trainer's next action (pick a different file)
is one click from where they are looking.

### Truth 9 — budget rejection happens before the job starts

`TECHNICAL_DIAGRAMS.md` §8: an oversized competency is rejected up front with
"competency too large for MVP."

**Consequence:** this surfaces on the **generate step**, before a job exists — not on a
progress screen for a job that instantly failed.

---

## 3. Inherited foundations (restated verbatim)

Copied from `tesda-cams-frontend-design/references/tokens.md`. Restated rather than
referenced because a generator must never guess a hex.

### Neutrals

| Token | Hex | Usage |
|---|---|---|
| `--color-bg` | `#F5F4F0` | Page background — **warm off-white, never clinical white** |
| `--color-surface` | `#FFFFFF` | Cards, panels, modals, dropdowns |
| `--color-surface-alt` | `#EEECEA` | Alternating rows, input backgrounds |
| `--color-surface-raised` | `#FAF9F6` | Hover state for cards |
| `--color-border` | `#D8D6D0` | Default borders, dividers, input edges |
| `--color-border-strong` | `#B0AEA8` | Section dividers, active input borders |
| `--color-border-faint` | `#E8E6E2` | Subtle separators, internal card dividers |

### Text

| Token | Hex | Usage |
|---|---|---|
| `--color-text-primary` | `#18180F` | Headlines, card titles, primary labels |
| `--color-text-secondary` | `#5A5950` | Body text, descriptions, form labels |
| `--color-text-muted` | `#97968E` | Placeholders, metadata, timestamps |
| `--color-text-disabled` | `#C4C2BC` | Disabled inputs, inactive nav |
| `--color-text-inverse` | `#F5F4F0` | Text on dark backgrounds |

### Semantic (5-tier)

These are the **implemented** values, already re-tinted from the CAMS prose spec. Use these.

| Family | base | lt (bg) | dk (text) | border | hover |
|---|---|---|---|---|---|
| Blue | `#185FA5` | `#E6F1FB` | `#0C447C` | `#B5D0EE` | `#D4E8F8` |
| Green | `#3B6D11` | `#EAF3DE` | `#27500A` | `#B5D98A` | `#D5EBB8` |
| Amber | `#C7600F` | `#FCE6CC` | `#7A3806` | `#F2B673` | `#F8D4A8` |
| Red | `#C81F1F` | `#FCE4E4` | `#8B1414` | `#ED9999` | `#F6C2C2` |

CAMS also defines Teal `#0F6E56` and Purple `#534AB7`. **Both are ruled out for this app —
see §4.** They are omitted from the table above so a generator cannot reach for them.

### Type scale

Fonts: `'IBM Plex Sans', system-ui, sans-serif` and `'IBM Plex Mono', 'Courier New', monospace`.
**Never substitute** Inter, Geist, Roboto, Arial, or a bare system stack.

| Token | Size | Line height | Weight | Usage |
|---|---|---|---|---|
| `text-2xs` | 10px | 14px | 400 | Footnotes |
| `text-xs` | 11px | 15px | 400/500 | Badge labels, metadata |
| `text-sm` | 12px | 17px | 400 | Row content |
| `text-base` | 13px | 19px | 400 | **Primary body text** |
| `text-md` | 14px | 20px | 500 | Card titles, section sub-labels |
| `text-lg` | 16px | 22px | 500/600 | Section headings, panel titles |
| `text-xl` | 20px | 26px | 600 | Page headings |
| `text-2xl` | 24px | 30px | 600 | Metric values |

### Spacing — 4px base grid

`space-0.5` 2px (icon-to-text only) · `space-1` 4px · `space-2` 8px · `space-3` 12px ·
`space-4` 16px (card padding) · `space-5` 20px · `space-6` 24px · `space-8` 32px ·
`space-10` 40px · `space-12` 48px · `space-16` 64px (sparingly).

### Border, radius, shadow

`border-thin` 0.5px · `border-base` 1px · `border-strong` 2px.
`radius-sm` 3px · `radius-md` 6px (badges) · `radius-lg` 8px (cards, inputs, buttons) ·
`radius-xl` 12px (modals) · `radius-full` 9999px.
**Hard ceiling: nothing above 12px.** Larger radii read as consumer app, not government tooling.

| Level | Value |
|---|---|
| `shadow-sm` | `0 1px 2px rgba(15,14,11,0.06)` |
| `shadow-md` | `0 2px 6px rgba(15,14,11,0.08), 0 1px 2px rgba(15,14,11,0.04)` |
| `shadow-lg` | `0 4px 16px rgba(15,14,11,0.10), 0 2px 4px rgba(15,14,11,0.06)` |

**Never tint a shadow with color.** Flat surfaces, no gradients.

### Motion

`duration-fast` 100ms · `duration-base` 150ms · `duration-slow` 300ms · `duration-pulse` 2000ms.
Easings: `ease-standard cubic-bezier(0.2,0,0,1)`, `ease-enter cubic-bezier(0,0,0.2,1)`,
`ease-exit cubic-bezier(0.4,0,1,1)`.
Motion is **functional, never decorative** — it must always communicate a state change.
Wrap everything in `@media (prefers-reduced-motion: reduce)` collapsing to ~0.01ms.

### Component heights

Row 40px · Input 32px (**never 36 or 40**) · Button 32px · Button-small 26px ·
Badge 20px · Tab 36px · Progress bar 6px (4px mini).

### Icons

Tabler Icons, 2px stroke. **Never** Heroicons, Material, or Font Awesome.

---

## 4. Palette narrowing for this app

CAMS uses six semantic colors. This app has four. Each still means **exactly one thing**.

| Color | Means here — and only this |
|---|---|
| **Blue** `#185FA5` | Informational, and **active/in-progress**. The currently-running node. |
| **Green** `#3B6D11` | **Succeeded.** `job_events.status = 'succeeded'`, `generated_documents.status = 'ok'`, and a whole run with zero gaps. |
| **Amber** `#C7600F` | **Partial success, retrying, pacing wait, budget warning.** |
| **Red** `#C81F1F` | **`jobs.status = 'failed'`, `failed_after_retries`, upload rejection.** Never decorative. |

### Why amber carries "partial"

In CAMS, amber is the *warning tier* — moderate urgency, pending approval, not-yet-a-problem.
"Completed with gaps" is exactly that shape: the run finished, most of it is usable, some of
it needs attention. **Do not invent a new color for partial.** The one-meaning-per-color
discipline is the most valuable thing inherited from CAMS, and partial fits amber's existing
meaning without stretching it.

Amber also covers the `retried` state, and this is deliberate: a validation retry is the
pipeline **working**, not failing. Amber says "watch this", red says "this is broken."
A retry in red would misrepresent the graded behavior as an error.

### Teal and Purple — ruled out

- **Teal** `#0F6E56` is CFSP-exclusive in CAMS. This app has no program dimension. Ruled out.
- **Purple** `#534AB7` is NC-level-exclusive in CAMS. The one edge case here is the NC level
  inside a qualification code ("BPP NC II") — but nothing in this app *compares* NC levels;
  the code is an identifier, and monospace type already marks identifiers. Ruled out.

This ruling is recorded so a future session does not reach for an unused color to add variety.
**Variety is not a design goal. One meaning per color is.**

---

## 5. Typography rules for this app

IBM Plex Sans for everything except identifiers and numbers. IBM Plex Mono is a **semantic
signal**, not decoration — it means "this is a value you might copy, compare, or quote."

**Mono is for:**
- UUIDs — `job_id`, `project_id`, `doc_id`
- LO identifiers — `LO-1` … `LO-5`
- Qualification codes — `BPP NC II`
- Timestamps and durations — `14:02`, `4s`
- Counts — `18 / 20`
- Retry counters — `(1/2)`
- The verbatim error block

**Mono is never for:**
- Document titles, node display names, qualification *titles*
- Navigation labels, headings, buttons
- Body prose, empty-state copy, callout text

---

## 6. The four standing deviations

These are corrections the user already made to the CAMS prototype. They override the CAMS
prose spec, and they apply here in full. **A generator's default instinct is exactly the
rejected pattern, so these are stated as prohibitions.**

**1. No 3px left-border urgency accent.** The user's word for it was **"AI-slop"** — the
generic gradient-left-border-card look that signals "AI made this" rather than "a government
compliance tool made this." Urgency is carried by a badge plus colored text.

**2. Info Callouts use a 1px tinted full-perimeter border**, not a left accent, with the light
semantic background and 8px radius.

**3. Metric/severity cards do not change border on warning or critical.** Tint the icon and
sub-label in the semantic color; border, shadow, and radius stay identical across variants.

**4. Amber and red are the re-tinted values** in §3 — warmer and more vivid than the CAMS
prose spec. If deriving a new shade in either family, derive it from the implemented base.

### Generalization clause

> **No left-border accent on *any* component in this system as a severity, urgency, or
> importance signal.** This applies to components CAMS never had — progress rows, result rows,
> outcome banners, pacing notices. Before adding one, ask whether a badge or tinted text
> carries the same information. It does.

**The one exemption**, inherited from CAMS Data Table Row: a 2px left border on a **selected**
row. That signals selection, not severity, and is exempt.

---

## 7. Domain → visual mapping

Four lookup tables a generator can implement directly. **Raw `snake_case` must never reach the
screen.**

### `jobs.status`

| Value | Display | Color | Icon |
|---|---|---|---|
| `parsing` | Parsing TR, CBC, Session Plan | Blue | `ti-file-search` |
| `aligning` | Aligning sources | Blue | `ti-arrows-join` |
| `awaiting_review` | Waiting for your review | Blue | `ti-eye-check` |
| `drafting_cblm` | Drafting CBLM sections | Blue | `ti-pencil` |
| `validating` | Checking output | Blue | `ti-checkup-list` |
| `exporting` | Building .docx files | Blue | `ti-file-export` |
| `done` | **see Truth 1 — resolve against the documents list** | Green *or* Amber | `ti-check` / `ti-alert-triangle` |
| `failed` | Run failed | Red | `ti-alert-circle` |

### `job_events.node_name`

| Value | Display name |
|---|---|
| `parse_tr` | Parse TR |
| `parse_cbc` | Parse CBC |
| `parse_session_plan` | Parse Session Plan |
| `align_sources` | Align Sources |
| `retriever` | Retriever *(insurance path only, off by default)* |
| `cblm_drafter` | CBLM Sections |
| `apply_house_rules` | House Rules |
| `validator` | Validator |
| `export` | Export |

### `job_events.status`

| Value | Badge variant | Color | Reads as |
|---|---|---|---|
| `started` | `started` | Blue | in progress |
| `succeeded` | `succeeded` | Green | done |
| `retried` | `retried` | **Amber** | **working, not broken** |
| `failed` | `failed` | Red | broken |

### `generated_documents`

| `doc_type` | Display name | Group |
|---|---|---|
| `info_sheet` | Information Sheet | per LO |
| `task_sheet` | Task Sheet | per LO |
| `self_check` | Self-Check | per LO |
| `answer_key` | Answer Key | per LO |

| `status` | Badge | Download link? |
|---|---|---|
| `ok` | Green `ok` | yes |
| `failed_after_retries` | Red `failed-after-retries` | **no — and no retry control (Truth 7)** |

---

## 8. Component inventory

The test applied throughout: **does this app have the data dimension the component encodes?**

### 8.1 Carried over unchanged (3)

| Component | Note |
|---|---|
| **Info Callout** | Verbatim, deviation intact — 1px full-perimeter tinted border, light semantic bg, 8px radius. Variants `info`/`warning`/`success`/`error`. |
| **Empty State** | Verbatim geometry — 32px muted icon, `text-md` 500 heading, `text-sm` muted sub-text max-width 320px, 48px vertical padding. New copy in §10. |
| **Tab Bar** | Underline only, never pills. Icon + label, never icon-only. Optional here — see §9. |

### 8.2 Adapted (2)

**Status Badge.** Same geometry — 20px height, 2px/8px padding, 6px radius, `text-xs` mono 500,
non-interactive, never resized to fit text. The CAMS variant set (`twsp`, `cfsp`, `nc-ii`,
`ongoing`…) is replaced wholesale:

| Variant | Color pair | Used for |
|---|---|---|
| `queued` | neutral (`surface-alt` / `text-secondary`) | job not yet started |
| `started` | blue-lt / blue-dk | node in progress |
| `succeeded` | green-lt / green-dk | node succeeded |
| `retried` | **amber**-lt / amber-dk | validation retry — reads as working |
| `failed` | red-lt / red-dk | node failed |
| `ok` | green-lt / green-dk | document generated |
| `failed-after-retries` | red-lt / red-dk | document not generated |
| **`partial`** | **amber**-lt / amber-dk | **new — CAMS has no partial concept** |
| `job-failed` | red-lt / red-dk | whole run failed |

**Document Link Row → Document Result Row.** CAMS anatomy retained — 32px height,
`ti-file-text` blue icon + label `text-sm` + `ti-external-link` muted 12px. Two additions:

- A trailing Status Badge (`ok` / `failed-after-retries`).
- A **missing state** reusing CAMS's `ti-file-off` + italic muted pattern: when
  `status === 'failed_after_retries'` there is no `download_url`, so the row reads
  *"Not generated — validation failed after 2 retries"* with **no retry control** (Truth 7).

Downloads open the signed Supabase Storage URL with `target="_blank" rel="noopener noreferrer"`.

### 8.3 Dropped (4) — with reasons, so nobody re-adds them

| Dropped | Why |
|---|---|
| **Lifecycle Pipeline** | **The most important deletion.** A fixed-step stepper encodes an ordering guarantee the validator→drafter retry edge breaks (Truth 2). Replaced by N1. |
| **Urgency Indicator** | No deadlines exist in this domain. Nothing is computed from `Date.now()`. |
| **Trainer Avatar** | Single-user, no auth (`PLAN.md` §1). Trainers are not entities here. |
| **Progress Bar (percentage tiers)** | CAMS's amber/blue/green tiers encode "behind schedule." No percentage-of-completion exists here. Replaced by N2's count bar. |

### 8.4 New components

#### N1 — Pipeline Activity List *(the centerpiece)*

Renders collapsed `job_events` as the run trace. **This is what replaces the stepper.**

- **Anatomy.** Vertical list of 40px rows. Each row, left to right: status icon (16px) ·
  node display name (`text-base` sans) · optional `LO-2` chip (`text-xs` mono) · outcome
  phrase (`text-sm` secondary) · right-aligned mono duration or retry counter.
  Row rhythm reuses CAMS Data Table Row: odd `surface`, even `surface-alt`, hover
  `surface-raised`. No shadow — alternating backgrounds do the work.
- **Target string** (`SYSTEM_DESIGN.md` §3): *"Parse TR succeeded in 4s"*, *"CBLM LO-2 Info
  Sheet failed validation, retrying (1/2)"*.
- **Data rule.** Collapse to the latest row per `(node_name, lo_id)` (Truth 5). Order by
  **pipeline stage, then `lo_id` — never by `created_at`.** This is what makes non-monotonic
  progress feel calm: rows update in place instead of jumping when a retry lands.

| Row state | Icon | Color | Reads as |
|---|---|---|---|
| `pending` | outlined dot | muted | not started |
| `active` | `ti-player-play` | blue, 2s pulse | running now |
| `succeeded` | `ti-check` | green | done, + mono duration |
| `retried` | `ti-refresh` | **amber** | **working** — "retrying (1/2)" |
| `failed-after-retries` | `ti-alert-circle` | red | "failed after 2 retries — continuing" |
| `job-failed` | `ti-alert-circle` | red | run stopped here |

- **Variants:** `live` (polling, active row pulses) · `historical` (terminal job, no pulse, no
  pacing logic).
- **Never renders** tenacity/backoff activity (Truth 4).
- **a11y:** `role="log" aria-live="polite" aria-relevant="text"`. **Diff before announcing** —
  a 2 s poll must not re-announce unchanged rows to a screen reader.

#### N2 — Run Progress Summary

The honest top-level "how far along" that does not lie about monotonicity.

- **Anatomy.** Phase label (from the `jobs.status` map in §7) · 6px `radius-full` track ·
  right-aligned mono `14 / 20 documents`.
- **The rule that matters:** the bar tracks **completed document count**, which never
  decreases — even when the phase label moves `validating` → `drafting_cblm` (Truth 2).
  **The label may go backwards. The bar may not.**
- **Color:** single blue while running → green when all `ok` → **amber if any
  `failed_after_retries`.** Deliberately *not* CAMS's percentage tiers.
- **States:** `queued` · `running` · `complete-clean` · `complete-partial` · `failed`.
- **a11y:** `role="progressbar"` with `aria-valuenow` / `aria-valuemin` / `aria-valuemax` /
  `aria-label`.

#### N3 — Pacing Notice

The "long silence is normal" affordance (Truth 3).

- **Anatomy.** Info Callout, `info`/blue variant, `ti-clock-pause`, one line. Optional mono
  elapsed counter.
- **Trigger.** Client-side inference only — non-terminal status AND >20 s since the newest
  event. At >90 s swap to the softer phrasing.
- **Placement.** Directly under N2. Appears and disappears on a 150 ms fade; it must not push
  the activity list around jarringly.
- **Hard rule:** never the word "stalled", never red or amber at these thresholds.

#### N4 — Run Outcome Banner

**This is the "partial-failure summary" that `SYSTEM_DESIGN.md` §5 leaves unspecified.**

Derivation — **from the documents list, not `jobs.status`** (Truth 1):

| Condition | Variant | Content |
|---|---|---|
| `status === 'failed'` | **red** | "Run failed. No documents were generated." + N5 |
| `status === 'done'` && any `failed_after_retries` | **amber** | "Completed with gaps — 18 of 20 documents generated." + one line per gap + a single N6 |
| `status === 'done'` && all `ok` | **green** | "All 20 documents generated." |

- **Anatomy.** Info Callout geometry (1px full-perimeter tinted border, **no left accent**),
  `text-md` 500 heading, mono counts, gap list, action row.
- **Gap line format:** *"Task Sheet · LO-3 — failed validation after 2 retries"*.
- **Hard rule for the generator:** there is no green state reachable without checking the
  documents list.

#### N5 — Verbatim Error Block

Shows `jobs.error` without making the UI look broken (Truth 6).

- **Anatomy.** Plain-language header derived from the last `job_events.node_name` — *"The
  Parser stopped unexpectedly."* Then a collapsed disclosure, *"Show technical detail"* →
  `surface-alt` background, 1px border, `radius-md`, IBM Plex Mono `text-xs`,
  `white-space: pre-wrap`, `overflow-x: auto`, `max-height: 240px` with scroll, plus a
  copy-to-clipboard button.
- **Hard rule:** **never regex, truncate, or prettify the exception string.** The header comes
  from structured fields; the block is byte-for-byte what the backend returned.
- **States:** collapsed (default) · expanded · copied.

#### N6 — Re-run Action + Confirm

One control, whole-job only (Truth 7).

- 32px secondary button, "Re-run generation", `ti-refresh`.
- Confirm dialog, 12px radius, focus-trapped, returns focus to the trigger on close:
  > "This starts a completely new run — all 20 documents are regenerated, including the 18
  > that succeeded. There is no way to retry just the failed sections."
- **Disabled** while any job for the project is non-terminal, with an explanatory tooltip.
- **Documented anti-pattern:** no per-row, per-LO, or per-section retry affordance anywhere.

#### N7 — TR Upload Dropzone

Truths 8 and 9.

- **Anatomy.** Dashed 1px `border-strong`, 8px radius, `surface-alt`, `ti-file-upload`,
  "Drop a TESDA Training Regulation PDF, or browse", sub-line "Text-layer PDF only — scanned
  or image-only PDFs are rejected."

| State | Treatment |
|---|---|
| `idle` | as above |
| `dragover` | blue-lt tint, blue border |
| `validating` | spinner + "Checking text layer…" — **synchronous, same request** |
| `rejected` | **red, inline, in place** — replaces the dropzone body; file not retained |
| `accepted` | filename + mono size + `ti-check` + "change file" link |

- **Companion — Budget Rejection.** An amber Info Callout on the **generate step, before the
  job exists** (Truth 9): "This competency is too large for the current run budget
  (N estimated LLM calls; the cap is M). Select a single competency."

#### N8 — LO Group Header *(recommended)*

Accordion header for the 5×4 results grouping. 20 flat rows is a poor layout.

- **Anatomy.** `LO-2` mono chip · LO title (`text-md` 500) · mono `4 / 4` count · aggregate
  Status Badge (`ok` if all ok, `partial` if any failed) · chevron.
- **States:** collapsed · expanded · all-ok · partial.

---

## 9. Screens

Five routes. `PLAN.md` §1 scopes the UI to "one upload form, one job-status view, one download
link" — this is that, plus the minimum navigation to reach it twice.

### `/` — Projects

Project rows: title · mono qualification code · mono created date · latest-run outcome badge.
Primary button "New project". Thin by design.
**States:** `loading` · `loaded` · `empty`.

### New Project — **modal, not a route**

Two 32px inputs (title, optional qualification code) → `POST /projects`. A modal keeps the
route count down and returns the trainer to the list with the new project in place.
**States:** `idle` · `submitting` · `error`.

### `/projects/[id]` — Upload & Generate

Project header · **N7** dropzone (×3 for TR/CBC/Session Plan) → `POST /projects/{id}/sources`
· competency selector (`competency_index?`) · budget-rejection callout · "Parse & review"
primary button → `POST /projects/{id}/parse` → redirect to the run. Prior runs listed below.
**States:** `no-upload` · `validating` · `rejected` · `uploaded` · `budget-rejected` ·
`generating`.

### `/jobs/[job_id]` — Run Progress

**N2** count bar + phase label · **N3** pacing notice · **N1** activity list. On terminal
status, **N4** outcome banner appears (+ **N5** on failure, + **N6**).

Polls `GET /jobs/{job_id}` every **2 s** while status is non-terminal; **stops on `done` or
`failed`.** On completion, move focus to the outcome banner.
**States:** `queued` · `running` · `pacing` · `done-clean` · `done-partial` · `failed`.

### `/projects/[id]/documents` — Results

**N4** banner · then **grouped by run** (see §12 — the endpoint has no job filter, so a
re-run doubles the list), latest run expanded and prior runs collapsed as "superseded" ·
within a run: **N8** LO-1…LO-5 accordions (4 each) of **Document Result Rows**. Tab Bar
filter optional and probably redundant once grouped.
**States:** `loading` · `all-ok` · `partial` · `empty` (job still running).

> Progress and Results stay **separate routes**. Progress is live and ephemeral; results are
> durable and re-visitable. Merging them makes the durable thing feel temporary.

---

## 10. Copy deck

Exact strings, owned centrally so a generator does not invent phrasing.

**Upload**
- Idle: "Drop a TESDA Training Regulation PDF, or browse"
- Idle sub: "Text-layer PDF only — scanned or image-only PDFs are rejected."
- Validating: "Checking text layer…"
- Rejected: "No text layer detected. This PDF appears to be scanned. Upload a digitally-typed
  TR PDF."

**Budget**
- "This competency is too large for the current run budget ({n} estimated LLM calls; the cap
  is {m}). Select a single competency."

**Pacing**
- >20 s: "Pacing LLM calls to stay inside the free-tier rate limit. This is expected — a full
  run takes a few minutes."
- >90 s: "Still working. This run is taking longer than usual."

**Outcome banner**
- Clean: "All 20 documents generated."
- Partial: "Completed with gaps — {ok} of {total} documents generated."
- Partial sub: "The sections below could not be generated. Re-running regenerates everything,
  including the {ok} that succeeded."
- Failed: "Run failed. No documents were generated."

**Error block**
- Header: "The {Node} stopped unexpectedly."
- Disclosure: "Show technical detail" / "Hide technical detail"
- Copy button: "Copy" → "Copied"

**Re-run confirm**
- Title: "Re-run generation?"
- Body: "This starts a completely new run — all 20 documents are regenerated, including the
  {ok} that succeeded. There is no way to retry just the failed sections."
- Actions: "Re-run" / "Cancel"

**Document row, missing**
- "Not generated — validation failed after 2 retries"

**Empty states**
- Projects: "No projects yet" / "Create a project, then upload a TR, an Enhanced CBC, and a
  Session Plan to generate its CBLM documents."
- Documents (running): "Documents will appear here as the run completes."
- Documents (never run): "No documents yet" / "Upload a TR PDF and run generation."
- Prior runs: "This is the first run for this project."

---

## 11. Motion and accessibility

**Motion.** Inherited durations from §3. Only three moving things in this app:
the active-row 2 s pulse in N1, the 150 ms fade of N3, and the N2 bar fill
(`ease-spring cubic-bezier(0.34,1.56,0.64,1)`, on change only, never on every poll).
Everything collapses under `prefers-reduced-motion: reduce` — the pulse becomes a static
blue fill.

**Accessibility.** WCAG AA (4.5:1 normal, 3:1 large/UI). Focus rings `2px solid` blue with
`2px` offset — **never `outline: none`.**

### Measured contrast — three findings, not inherited assumptions

Computed against the §3 values rather than assumed from CAMS:

| Pair | Ratio | AA normal | AA large/UI |
|---|---|---|---|
| Blue / Green / Amber / Red `dk` on `lt` | 8.60 / 8.21 / 7.23 / 7.86 | pass | pass |
| `text-primary` on bg | 16.22 | pass | pass |
| `text-secondary` on bg | 6.40 | pass | pass |
| **`text-muted #97968E` on bg** | **2.70** | **fail** | **fail** |
| **`text-muted` on surface** | **2.97** | **fail** | **fail** |
| **Amber base `#C7600F` on bg** | **3.74** | **fail** | pass |

**Finding 1 — `text-muted` fails AA and must not carry meaning.** It is inherited from CAMS
for "placeholders, metadata, timestamps." In this app it must be restricted to text that is
genuinely redundant — a value already conveyed by an adjacent badge or label.
**Anything a trainer needs to read uses `text-secondary` `#5A5950` (6.40).** Specifically, the
Document Result Row missing-state line *"Not generated — validation failed after 2 retries"*
and all Empty State sub-text are **`text-secondary`, not muted** — they are the only
explanation of what went wrong, so they cannot fail contrast.

**Finding 2 — amber base is not a text color on the page background.** At 3.74 it is fine for
icons, borders, and the progress-bar fill (UI components, 3:1) but **fails for normal-size
text.** Amber text always sits on `amber-lt` (7.23), never directly on `bg`.

**Finding 3 — badge fill alone cannot separate `retried` from `failed`.**
`amber-lt #FCE6CC` and `red-lt #FCE4E4` differ by a contrast ratio of **1.00** — they are
near-identical as 20px badge fills. This is the single most important distinction in the
activity list (Truth 4: retrying is *working*, failing is not), so:

> **The `retried` / `failed` distinction is carried by the icon (`ti-refresh` vs
> `ti-alert-circle`) and the label text — never by the fill.** Any design that relies on fill
> color to tell those two apart is unreadable, and doubly so for red-green or protan/deutan
> color vision. This is consistent with the deviations doctrine in §6: badge plus text, not
> color alone.

```
N1 activity list   role="log" aria-live="polite" aria-relevant="text"
                   — diff before announcing; a 2s poll must not spam
N1 row             aria-current="true" on the active row
N2 count bar       role="progressbar" aria-valuenow/min/max aria-label
N4 outcome banner  role="status"; receives focus when a run terminates
N5 error block     <details>/<summary>; the pre block is aria-label'd
N6 confirm dialog  role="dialog" aria-modal="true"; focus trapped;
                   focus returns to the trigger on close
N7 dropzone        a real <input type="file"> behind it — keyboard reachable,
                   never a div-only drop target
Status badges      aria-label spelling the status out in full
```

Tab order follows visual reading order. Every interactive element is keyboard reachable.

---

## 12. Assumptions, open questions, deferred

### Assumed contract

`SYSTEM_DESIGN.md` §4 defines `GET /jobs/{job_id}` returning JSON. `TECHNICAL_DIAGRAMS.md`
§2/§9 briefly described an HTMX UI polling a `GET /jobs/{job_id}/status` HTML fragment — that
endpoint does not exist in §4, and the HTMX approach was reversed in favour of React/Next.js.
**Assumed at the time this was written:** a React client polls `GET /jobs/{job_id}` every
2 s while non-terminal. **No longer current** — the frontend was reversed to a minimal
Gradio UI (`PLAN.md` §1 Frontend row, 2026-08-21); `TECHNICAL_DIAGRAMS.md` now shows
`gr.Timer` polling instead. This document's component-system framing (React, the routes
in §9, N1–N8) was not reconciled with that pivot and describes the frozen Next.js
prototype's design system, not the active Gradio plan — see `CLAUDE.md`'s Frontend
section for current status.

### Proposed backend additions — *not assumed*

Every screen in §9 renders against `SYSTEM_DESIGN.md` §4 **as written**. These two would
improve the UI but are proposals, and the design degrades gracefully without them:

1. **`?job_id=` on `GET /projects/{id}/documents`.** Today the endpoint has no job filter, so
   a second run returns 52 rows with no way to tell them apart. Mitigated by grouping by run
   client-side; a filter would be cleaner.
2. **A rate-limit `job_events` row** — `detail: {"reason": "rate_limit_pacing"}` written when
   the token bucket sleeps. Would replace N3's client-side inference with a fact. Currently
   the worker writes events on node entry/exit only, so the UI cannot know.

### Tunable constants

**20 s / 90 s** (N3 pacing thresholds) are guesses until M0's structured-output smoke test
(`PLAN.md` §3) reports real free-tier rate-limit behavior. Tune against an observed run.
They are design constants, not design law.

### Deferred

No dark mode (single-user internal tool, no request for one). No mobile layout — this is a
desktop workflow ending in Word. No in-app document preview or editor (`PLAN.md` §1: "No
in-app rich editor to build"). No versioning of generated document sets (`PLAN.md` §1).

### Scope note

This document and its component library are **design artifacts only**, and (per the
Assumed-contract note above) were built for the since-abandoned Next.js plan — the active
plan is a minimal Gradio UI. No Next.js scaffolding, API client, or polling hook should be
built from them until M6 is complete, and even then only if the UI reverts to Next.js.
`PLAN.md` §4: "minimum submittable artifact = M6", and M7 (the UI) is the first thing cut.
What survives a cut is this file and the library — which is exactly why they were built
first — as a historical record, per `CLAUDE.md`'s Frontend section.
