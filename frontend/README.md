# frontend

Minimal Next.js UI for tesda-cbc-agent, implemented from the Figma file
`zHVq44RqdAqLVrhGH9qzYJ`.

```bash
cd frontend && npm run dev
```

**Every screen renders from `src/lib/mock.ts`.** There are no API calls, because there is
no API yet — `BUILD_CHECKLIST.md` §1 (data model) and §3 (parsers) are both unchecked. The
mock shapes mirror `PLAN.md` §2's `PipelineState`, so wiring real endpoints should be a
data-source change rather than a rewrite.

Note this inverts the checklist's stated order ("Backend first. UI last." — UI is §7).

## Component library: Radix Primitives (and why not Tremor)

Interactive behaviour comes from [Radix Primitives](https://www.radix-ui.com/primitives)
— `Dialog`, `Select`, `RadioGroup`, `ToggleGroup`. Radix is **unstyled**, so `tokens.css`
remains the sole source of visual truth; every Radix node here carries a design-system
class or a `var(--*)` value.

It was adopted to fix real defects in the hand-rolled versions, each verified failing
before and passing after:

| | before | after |
|---|---|---|
| Focus trapped in dialog | no | yes |
| Closes on Esc | no | yes |
| Body scroll lock | no | yes |
| Focus restored to opener | no | yes |
| Outside content `aria-hidden` while open | no | yes |
| Arrow-key nav on role / doc-type groups | no | yes |

Note the opener must live inside `Dialog.Root` as a `Dialog.Trigger`. A controlled
`open` prop with the button outside gives Radix no trigger to hand focus back to, and
focus restore silently fails — measured, not assumed.

### Tremor was evaluated and rejected

Not on compatibility — current Tremor requires Tailwind v4+ and React 18.2+, and this app
is on Tailwind v4 / React 19, so it would install. (Only the legacy `@tremor/react` npm
package is a problem: it pins `react: ^18.0.0` and last published 2025-01-13.)

It was rejected on fit:

1. **There are no charts.** Tremor's own pitch is "components for dashboards and charts."
   Grepping this codebase for `chart|graph|metric|kpi|sparkline|donut|axis` returns zero
   matches, and none of the seven Figma designs contains a chart. The only quantitative UI
   is the 6px `.bar` progress bar, already defined in `tokens.css`.
2. **`PLAN.md` §1 cut the dashboard**, in the locked Frontend row: "Full trainer product
   (dashboard, multi-project management) demonstrates nothing on a backend-AI rubric."
3. **It would fight `tokens.css`.** Tremor ships its own visual language; this design
   system encodes deliberate constraints (teal and purple absent, 12px radius ceiling, and
   the AA rules in the token comments).

If a chart ever appears — a run-history or cost view — Tremor's chart components can be
dropped into that one screen without adopting it as the frontend framework.

## Design tokens

`src/app/globals.css` is a port of `ui_kits/cbc/tokens.css`, following that file's own
PORTING NOTE: the token block was already authored in Tailwind v4 CSS-first format, so
`:root {` became `@theme {` and nothing inside it changed. The component classes below
`@theme` (`.badge`, `.row`, `.btn`, `.callout`, `.drop`, `.modal`, …) are kept as a plain
stylesheet rather than rewritten as utilities — their comments carry accessibility
constraints that are part of the design system's contract:

- `--color-text-muted` fails AA and is for redundant text only.
- The missing-document state uses `text-secondary`, never `muted` — it is the only
  explanation of what went wrong.
- `amber-lt` and `red-lt` are near-identical fills, so the icon and label carry
  retried-vs-failed, never the background.

## Screens

| Route | Figma node |
|---|---|
| `/` | 1:429 + 1:380 (merged — same screen) |
| `/projects/[id]/sources` | 13:231 |
| Add Source modal | 23:66 (all three states) |
| `/projects/[id]/select` | — none |
| `/projects/[id]/run` | 11:51 |
| `/projects/[id]/run/review` | — none |
| `/projects/[id]/results` | 12:51 |

Node 1:195 is the html.to.design import of the standalone prototype, labelled
`(Components)`. It is a component reference, not a screen, and was not implemented.

## Where this deviates from the Figma designs, and why

The designs encode an earlier architecture. `PLAN.md` (revised 2026-08-18) is treated as
the authority; each deviation is also commented at its call site.

1. **No Retriever step** in Run Progress. The design shows `Retriever succeeded 2s`.
   Retrieval was cut (`PLAN.md` §1, Vector store / RAG), so that row reported on a node the
   graph never runs.
2. **No Reference role** in the Add Source modal. Same reason — a Reference upload would be
   indexed into a corpus nothing reads. Two roles remain: TR and CBC.
3. **CBC is `.docx`, not `.pdf`.** The design lists `CBC — ….pdf`. It is parsed by
   `python-docx`, which cannot read a PDF (`BUILD_CHECKLIST.md` §3).
4. **Selection is a new screen.** `PLAN.md` §2 makes this a hard job boundary: `kind=parse`
   ends, the trainer picks a unit of competency and LOs from `parsed_structure`, and only
   then does `kind=generate` start. The design ran both as one job.
5. **The document-type picker and run-budget meter moved** from Sources to Selection. They
   size the generate job, which does not exist while the trainer is still on Sources — and
   the picker is fed by `GET /projects/{id}/structure`, which cannot answer before parsing.
6. **Review is a new screen.** `jobs.status = awaiting_review`, resumed by
   `POST /jobs/{id}/resume`. A state the pipeline cannot advance through without a human
   needs UI.

### One open question, deliberately not guessed

`PLAN.md` §2's interrupt says the trainer "reviews and **edits** the Session Plan", but
§1's Output row says "No in-app rich editor to build; trainer does final edits in Word",
and `LOState.session_plan_approved` is a plain bool. `BUILD_CHECKLIST.md` §7 repeats
"review/edit".

Review is therefore **read-only plus approve** — the minimum the pipeline actually
requires. A 7-column matrix editor would breach the locked minimal-frontend scope. If the
editor is genuinely wanted, that is a scope decision to make explicitly.

## What the fixtures drive

Screens key off `project.outcome`, so the states are reachable rather than decorative:

| Project | Outcome | Sources | Results |
|---|---|---|---|
| `css-2`, `fpr-2`, `smaw-2` | `none` | blocked — both sources missing | empty state |
| `oap-2`, `bpp-2`, `drs-2` | `complete` | both attached | all documents OK |
| `hsk-2`, `coo-2` | `partial` | both attached | completed-with-gaps banner |
| `eim-2`, `acp-2` | `failed` | both attached | "run failed — nothing generated" |

On `/select`, choosing **CBLM** (20 calls) against the 15-call budget triggers the
over-budget rejection: the Generate button disables and no job is enqueued.

`src/lib/run-state.tsx` holds the one piece of cross-screen state — whether the Session
Plan is approved. Approving on `/run/review` releases the halt on `/run` (the Review row
flips to `approved — job resumed` and CBLM Sections starts). It is in-memory, so a page
reload returns to the paused state. In the wired version this is server state:
`POST /jobs/{id}/resume`, with both screens reading `jobs.status`.

## Known gaps

- **Results has no red / run-failed detail state.** `failed` projects get an honest empty
  state, but the verbatim-error screen is not built. 12:51 draws only the amber state, and
  `ui_kits/cbc/components/verbatim-error-block.html` plus the ported `.errblk` styles are
  there whenever it is wanted.
- **"Download all" and "Re-run generation" are inert.** No endpoints exist behind them.
- **Unknown project ids fall back to a real project instead of 404ing.** Every scoped page
  ends `?? PROJECTS[1]`, so a bad id silently renders Organic Agriculture rather than
  failing. This masked a live routing bug (see below); `notFound()` would be more honest.
- **"Simulate a scanned PDF"** in the Add Source modal is a fixture affordance for reaching
  the rejected state; it goes away once the real text-layer check is wired.
- **`AGENTS.md` / `CLAUDE.md` in this directory are generated by `next dev`** (see
  `node_modules/next/dist/server/lib/generate-agent-files.js`), not hand-written.

## Design audit (2026-08-18)

Audited with `impeccable audit` (technical) and Emil Kowalski's design-engineering lens
(motion). Measured in-browser, not eyeballed.

**Fixed:**

- **Mobile navigation was completely unreachable.** Flex shrink crushed the nav to
  `width: 0` below ~760px — all five tabs in the DOM, none visible. It now drops to its
  own row. Regression from an earlier header fix.
- **Rows clipped wrapped text.** `.row`/`.doc` used fixed `height`; a wrapped label was cut
  mid-glyph. Now `min-height`.
- **Progress bar used a bounce curve.** `--ease-spring` on `.bar__fill` overshoots, so a bar
  whose stated contract is "never decreases" visibly ran past its value and came back.
- **Buttons had no press feedback.** Added `scale(0.97)` on `:active`.
- **Dialog and select appeared instantly.** Both now animate (modal 200ms centred, select
  150ms from its trigger origin).
- **`prefers-reduced-motion` killed everything at 0.01ms**, including the colour and opacity
  transitions that carry meaning. Movement goes; comprehension aids stay.
- **Hover states weren't gated** behind `@media (hover: hover)`, so they fired on tap.

**Accepted, not fixed:**

- `transition: width` on `.bar__fill` — the detector flags layout animation, correctly in
  general. Kept because `scaleX` distorts the pill end-caps, and this is one 6px element
  updating a handful of times per run, not a loop.
- `--ease-spring` is still *declared* in the token block (now unreferenced). Removing it
  here would diverge this port from `ui_kits/cbc/tokens.css`, which is the source of truth
  — **delete it there and re-port** rather than editing only this copy.

**Not fixed, needs a decision:** no page has an `<h1>`. The app title in the header is a
`div` and every page starts at `<h2>`.

**Clean:** zero contrast failures across the palette — the AA discipline in `tokens.css`
holds under measurement.

## Typography

The type scale is **inherited and locked**, not designed here. `DESIGN.md` §0 puts
`tesda-cams-frontend-design` → `references/tokens.md` above this app for "every hex, size,
radius, shadow, and duration." Do not introduce a competing scale.

| Token | Size | Line height | Ratio | Used for |
|---|---|---|---|---|
| `--text-2xs` | 10px | 14px | 1.40 | gov strip, brand sub-label |
| `--text-xs` | 11px | 15px | 1.36 | badges, mono meta, table headers |
| `--text-sm` | 12px | 17px | 1.42 | secondary prose, row phrases, doc rows |
| `--text-base` | 13px | 19px | 1.46 | **body default**, buttons, inputs, callouts |
| `--text-md` | 14px | 20px | 1.43 | step headings, LO titles, run phase |
| `--text-lg` | 16px | 22px | 1.38 | modal titles |
| `--text-xl` | 20px | 26px | 1.30 | page headings (`h2`) |
| `--text-2xl` | 24px | 30px | 1.25 | unused in-app |

Families: `IBM Plex Sans` (UI) and `IBM Plex Mono` (codes, counts, IDs, verbatim errors),
both via `next/font`. Weights in use: 400 / 500 / 600 only.

**Mono is semantic, not decorative.** It marks machine-generated or machine-checked values
— qualification codes, LO ids, job ids, durations, call counts, verbatim exceptions. Do not
use it for emphasis.

### Where this scale diverges from generic guidance

A 13px body with a 1.46 ratio sits below the usual "16px, 1.5" advice. That is a deliberate
density choice for a desk tool, inherited from CAMS, and it is **not** a WCAG violation:
WCAG sets no minimum font size, and 1.4.12 Text Spacing asks that content *survive* a user
forcing 1.5, not that it ship at 1.5.

Tested rather than assumed — applying the full 1.4.12 override set (`line-height: 1.5`,
`letter-spacing: 0.12em`, `word-spacing: 0.16em`, `2em` paragraph spacing): **no horizontal
scroll, zero clipped components, page reflows correctly.** Passes. The `min-height` change
on `.row` / `.doc` is part of why.

If the 13px base is ever revisited, that is a change to `ui_kits/cbc/tokens.css` and its
CAMS parent, not to this port.

### Measure (line length)

Body prose ran to ~92 characters per line in the 888px column. Capped at `62ch` on `.sub`,
`.modal__p`, callout text, and `.measure-end`. Rows, tables, and badges are excluded — they
are scan targets, not reading text.

`ch` is the width of the "0" glyph, wider than average lowercase, so the unit does not map
1:1 to characters. Measure the result rather than trusting the number if the typeface
changes.


## New project

`NewProjectModal` implements the spec in `ui_kits/cbc/screens/projects.html`: two fields
(Title, optional mono qualification code), Create disabled until Title is non-empty, and a
modal rather than a route because "two fields do not justify a page".

It is **not** an upload form. Creating a project and attaching sources are separate steps:
the TR and CBC go through the text-layer check in `AddSourceModal`, and the parse gate on
Sources reads from that. Folding uploads in here would duplicate that component and bypass
the gate. Create hands off to `/projects/<id>/sources`, which *is* the upload step, and a
new project starts at `outcome: "none"` so it lands on the both-sources-missing state.

Created projects live in `src/lib/projects-store.tsx` (client state, session-only) so the
new row actually appears in the list, as the kit's note requires. Real persistence is
`POST /projects`.

**Slug gotcha, fixed:** ids are derived from the title and truncated to 24 characters. The
first version trimmed hyphens *before* slicing, so a cut landing on a hyphen left a trailing
one — "Automotive Servicing NC I" became `automotive-servicing-nc-`, which then failed to
resolve as a route param and silently rendered a different project. Slice first, trim after.
