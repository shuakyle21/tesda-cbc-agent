#!/usr/bin/env python3
"""Bundle the Claude Design prototype into one dependency-free HTML file.

    python3 build.py            # -> standalone.html

Inputs (all in this directory):
    index.dc.html      the design-component document exported from Claude Design
    support.js         dc-runtime
    image-slot.js      <image-slot> custom element
    react.umd.js       React 18.3.1 UMD          (curl from unpkg, see README)
    react-dom.umd.js   ReactDOM 18.3.1 UMD

Why this script exists rather than using Claude Design's own "Standalone" export:
that export is larger than DesignSync's 256 KiB get_file cap, so fetching it
returns a truncated file that boots to "Error: missing bundle data".

Two traps, both learned the hard way — the asserts below enforce them:

1.  The runtime locates the template with a REGEX OVER THE RAW SOURCE
    (`/<x-dc(?:\\s[^>]*)?>/` and `lastIndexOf("</x-dc>")`), not via the DOM.
    support.js contains those exact strings in a regex literal and two error
    strings. Inlining it verbatim makes the runtime treat support.js's own text
    as the template start or end, and the page renders JS source as body text.
    Fix: rewrite them as `\\x78` (== "x") — identical at runtime in both regex
    and string contexts, invisible to the raw-source scan.

2.  Anything inside the design-component element is the template. image-slot.js
    is referenced from <helmet>, which lives inside it, so inlining it there
    feeds 65 KB of JS to the template compiler. It must go in <head> instead.

The same applies to comments: do not write the element's tag name literally
anywhere above it, or trap 1 fires from your own comment.
"""

import re
import sys
from pathlib import Path

HERE = Path(__file__).parent


def read(name: str) -> str:
    p = HERE / name
    if not p.exists():
        sys.exit(f"missing {name} — see README.md for how to fetch it")
    return p.read_text(encoding="utf-8")


def inline(js: str, label: str) -> str:
    return f'<script data-inlined="{label}">\n{js}\n</script>'


def main() -> None:
    dc = read("index.dc.html")
    react = read("react.umd.js")
    rdom = read("react-dom.umd.js")
    sup = read("support.js")
    slot = read("image-slot.js")

    # -- trap 1 --------------------------------------------------------------
    n = len(re.findall(r"</?x-dc", sup))
    sup = sup.replace("</x-dc", "</\\x78-dc").replace("<x-dc", "<\\x78-dc")
    assert not re.search(r"</?x-dc", sup), "failed to neutralise runtime literals"
    print(f"neutralised {n} template markers inside support.js")

    # -- trap 2 --------------------------------------------------------------
    dc, a = re.subn(r'\s*<script\s+src="\.?/?image-slot\.js"\s*>\s*</script>', "", dc)
    assert a == 1, f"expected 1 image-slot reference in <helmet>, found {a}"

    head = "\n".join([
        inline(react, "react"),        # React first: loadReactUmd() skips the CDN
        inline(rdom, "react-dom"),     #   when window.React && window.ReactDOM exist
        inline(slot, "image-slot"),    # must be in <head>, never in <helmet>
        inline(sup, "dc-runtime"),
    ])
    dc, b = re.subn(r'<script\s+src="\./support\.js"\s*>\s*</script>', lambda m: head, dc)
    assert b == 1, f"expected 1 support.js reference, found {b}"

    # -- invariants ----------------------------------------------------------
    opens = re.findall(r"<x-dc[\s>]", dc)
    closes = re.findall(r"</x-dc>", dc)
    assert len(opens) == 1, f"{len(opens)} template openings — start is ambiguous"
    assert len(closes) == 1, f"{len(closes)} template closings — end is ambiguous"
    assert not re.findall(r'<script[^>]+src="(?!data:)', dc), "an external script survived"

    out = HERE / "standalone.html"
    out.write_text(dc, encoding="utf-8")
    print(f"template markers: {len(opens)} open, {len(closes)} close")
    print(f"wrote {out.name}  ({len(dc):,} bytes, no external scripts)")
    print("note: Google Fonts (IBM Plex) is the one remaining network call; "
          "it degrades to the fallback stack offline.")


if __name__ == "__main__":
    main()
