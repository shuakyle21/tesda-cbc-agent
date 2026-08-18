# Prototype

The interactive TESDA CBC Agent prototype, pulled out of Claude Design and made
self-contained so this repo owns a copy that runs offline.

**Source:** Claude Design project `91061793-d681-45ab-8f76-344a9bbe8f44`
("Prototype scope and interactivity") → `TESDA CBC Agent Prototype.dc.html`.
That project imports the published design system
`cblm-developer-shares-9e7e2a0d` and the docs from this repo.

## Run it

```
open standalone.html
```

No server, no build step, no network — except Google Fonts for IBM Plex, which
degrades to the fallback stack when offline.

## What it covers

Four screens and three modals, all state-driven:

| Screen | Contents |
|---|---|
| Projects | Project list with latest-run outcome badges, New project modal |
| Sources & Generate | Source library (TR / CBC / Reference, removable, with a "simulate a scanned PDF" path), qualification header, unit-of-competency selector, document-type picker, run cost meter, earlier runs |
| Run Progress | Live pipeline step list, phase label, document counter |
| Results | Outcome banner, per-LO accordion, document rows, preview and re-run modals |

### Sources & Generate

**TR and CBC are both required inputs; CBC is never an output.** The TR defines what
competence means, the CBC what is taught and assessed — Session Plans need the
second set. Generate is gated until both are present, with the reason stated.

Sources carry a role that decides which pipeline they enter: **TR and CBC are
parsed into structured facts**, **References are chunked into the retrieval
corpus**. Facts vs style.

Two document types, neither free:

| Type | Per LO | 5-LO unit |
|---|---|---|
| Session Plans | 1 | ~5 calls |
| CBLM | 4 | ~20 calls |

The cost meter is reactive — changing the unit or the type recomputes it, and the
Generate label reads e.g. `Generate 20 CBLM`. `BUDGET_CAP` is **20**, which makes
all three meter states reachable: 5/20 nominal, 20/20 at cap, 24/20 over budget
(the 6-LO unit) where Generate disables. The unit with no matching CBC module is
listed but **disabled**, not hidden — the gap is in the source, not the tool.

It honours the design system's load-bearing rules: no stepper, amber `PARTIAL`
rather than green on a run with gaps, `NOT GENERATED` rows carrying no retry
control, and the outcome banner derived from the documents list.

## Files

| File | Role |
|---|---|
| `standalone.html` | **The artifact.** Generated — do not hand-edit |
| `index.dc.html` | Design-component document exported from Claude Design |
| `support.js` | dc-runtime (vendored) |
| `image-slot.js` | `<image-slot>` custom element (vendored) |
| `react.umd.js`, `react-dom.umd.js` | React 18.3.1 UMD (vendored) |
| `build.py` | Bundles all of the above into `standalone.html` |

## Rebuild

```bash
python3 build.py
```

Deterministic — same inputs give a byte-identical `standalone.html`.

To refresh React:

```bash
curl -sSL -o react.umd.js     https://unpkg.com/react@18.3.1/umd/react.production.min.js
curl -sSL -o react-dom.umd.js https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js
```

Babel is **not** needed. `support.js` only fetches `@babel/standalone` (~3 MB)
when the embedded script is JSX; this one is `type="text/x-dc"` plain JS.

## Why not Claude Design's own Standalone export

The project contains `TESDA CBC Agent Prototype (Standalone).html`, but it is
larger than DesignSync's **256 KiB `get_file` cap**, so fetching it returns a
truncated file that boots to `Error: missing bundle data`
(`[bundler] Missing script tags — manifestEl: true templateEl: false`).
`index.dc.html` is 75 KB and arrives intact, so this build starts from that.

## Two traps if you hand-edit the bundle

`build.py` asserts against both. They cost real debugging time.

**1 — The runtime finds the template by regex over the raw source, not the DOM.**
It uses `/<x-dc(?:\s[^>]*)?>/` and `lastIndexOf("</x-dc>")`. `support.js`
contains those exact strings in one regex literal and two error messages, so
inlining it verbatim makes the runtime treat *support.js's own text* as the
template boundary — the page then renders JavaScript source as body text.
`build.py` rewrites them as `\x78` (`== "x"`), identical at runtime in both
regex and string contexts but invisible to the raw-source scan.

The same applies to comments: **never write the element's tag name literally**
anywhere above it in the file, including inside an HTML comment.

**2 — Everything inside the design-component element is the template.**
`image-slot.js` is referenced from `<helmet>`, which sits inside it. Inlining it
there feeds 65 KB of JavaScript to the template compiler. It has to go in
`<head>` instead.

## Relationship to the rest of the repo

This prototype uses the **warm off-white** system (`#F5F4F0` canvas, IBM Plex,
`#185FA5` blue) from `DESIGN.md` and `ui_kits/cbc/` — not the violet Shares
system in `~/cblm-developer-ui/`. Those two systems both describe this product
and one should eventually be retired; see `cblm-developer-ui/DESIGN.md` §9.

It has been brought forward to the TR **+ CBC** two-input model with the sources
panel, matching `cblm-developer-ui/DESIGN.md`. `index.dc.html.bak` is the previous
single-TR version if you need to diff against it.
