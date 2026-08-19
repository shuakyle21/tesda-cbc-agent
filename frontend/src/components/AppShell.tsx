"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Icon, { type IconName } from "./Icon";
import { RunStateProvider } from "@/lib/run-state";
import { ProjectsProvider } from "@/lib/projects-store";

/* The Figma file has two Projects frames: 1:380 carries the government header strip and a
   condensed list, 1:429 carries the fuller table and no strip. They are the same screen, so
   the strip and chrome are taken from 1:380 here and the table from 1:429 on the page. */

/* Used only when the current route is not project-scoped (i.e. the Projects list), so the
   step tabs still lead somewhere. Any project route drives the tabs from its own id. */
const FALLBACK_PROJECT = "oap-2";

/* Nav follows the reconciled flow, so it has five steps rather than the design's four:
   Selection is a job boundary between the parse and generate jobs (PLAN.md §2) and had no
   tab because the design ran parse and generate as one job. */
const NAV: { seg: string; label: string; icon: IconName }[] = [
  { seg: "", label: "Projects", icon: "folder" },
  { seg: "sources", label: "Sources", icon: "upload" },
  { seg: "select", label: "Selection", icon: "list" },
  { seg: "run", label: "Run Progress", icon: "play" },
  { seg: "results", label: "Results", icon: "files" },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  /* Derive the project from the URL. Hardcoding one id meant the tabs silently switched
     you to a different project when you opened any other one from the list, and the
     active-tab test never matched. */
  const projectId = pathname.match(/^\/projects\/([^/]+)/)?.[1] ?? FALLBACK_PROJECT;

  const hrefFor = (seg: string) =>
    seg === "" ? "/" : `/projects/${projectId}/${seg}`;

  const isActive = (seg: string) => {
    if (seg === "") return pathname === "/";
    const base = `/projects/${projectId}/${seg}`;
    // /run stays active while on the nested review screen
    return pathname === base || pathname.startsWith(`${base}/`);
  };

  return (
    <RunStateProvider>
    <ProjectsProvider>
    <div style={{ minHeight: "100dvh" }}>
      <header
        style={{
          background: "var(--color-surface)",
          borderBottom: "1px solid var(--color-border)",
        }}
      >
        {/* government strip — 1:242 / 1:249 */}
        <div
          style={{
            background: "var(--color-surface-alt)",
            borderBottom: "1px solid var(--color-border-faint)",
          }}
        >
          <div
            className="govstrip"
            style={{
              maxWidth: 888,
              margin: "0 auto",
              padding: "4px 24px",
              display: "flex",
              justifyContent: "space-between",
              gap: 16,
              fontFamily: "var(--font-mono)",
              fontSize: "var(--text-2xs)",
              lineHeight: "var(--text-2xs--line-height)",
              color: "var(--color-text-secondary)",
              letterSpacing: "0.04em",
            }}
          >
            <span>
              REPUBLIC OF THE PHILIPPINES · TECHNICAL EDUCATION AND SKILLS
              DEVELOPMENT AUTHORITY
            </span>
            <span style={{ whiteSpace: "nowrap" }}>
              PROVINCIAL TRAINING CENTER — SURALLAH
            </span>
          </div>
        </div>

        <div className="appbar">
          {/* brand — 1:253 logo slot + 1:282 / 1:287 */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              flex: "none",
              whiteSpace: "nowrap",
            }}
          >
            <div
              aria-hidden="true"
              style={{
                width: 32,
                height: 32,
                flex: "none",
                borderRadius: "var(--radius-full)",
                border: "1px solid var(--color-border-strong)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: "var(--font-mono)",
                fontSize: "var(--text-2xs)",
                color: "var(--color-text-secondary)",
              }}
            >
              /
            </div>
            <div>
              <div
                style={{
                  fontSize: "var(--text-md)",
                  lineHeight: "var(--text-md--line-height)",
                  fontWeight: 600,
                }}
              >
                CBLM Developer
              </div>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "var(--text-2xs)",
                  lineHeight: "var(--text-2xs--line-height)",
                  color: "var(--color-text-secondary)",
                }}
              >
                PTC-SURALLAH · TESDA
              </div>
            </div>
          </div>

          {/* The design is drawn at 1680w where brand + nav + chip fit on one line. Below
              that the nav scrolls rather than wrapping — a wrapped tab row would push the
              56px header out of its own height and break the underline baseline. */}
          <nav
            aria-label="Main"
            className="tabs appbar__nav"
            style={{ border: 0, height: "auto" }}
          >
            {NAV.map((item) => {
              const active = isActive(item.seg);
              return (
                <Link
                  key={item.seg}
                  href={hrefFor(item.seg)}
                  className={`tab${active ? " tab--active" : ""}`}
                  aria-current={active ? "page" : undefined}
                  style={{
                    height: 36,
                    textDecoration: "none",
                    whiteSpace: "nowrap",
                    flex: "none",
                  }}
                >
                  <Icon name={item.icon} style={{ width: 14, height: 14 }} />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* 1:318 — 1:429 renders this slot as "Name of Trainer"; 1:380's concrete
              "Trainer II · TM I/II" is used since it shows the real shape of the value. */}
          <span className="appbar__chip">Trainer II · TM I/II</span>
        </div>
      </header>

      <main style={{ maxWidth: 888, margin: "0 auto", padding: "32px 24px 64px" }}>
        {children}
      </main>
    </div>
    </ProjectsProvider>
    </RunStateProvider>
  );
}
