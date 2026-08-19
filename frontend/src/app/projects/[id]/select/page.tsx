"use client";

import { useMemo, useState } from "react";
import * as Select from "@radix-ui/react-select";
import * as RadioGroup from "@radix-ui/react-radio-group";
import Link from "next/link";
import { useParams } from "next/navigation";
import Icon from "@/components/Icon";
import { PROJECTS, UNITS, UNMATCHED } from "@/lib/mock";
import { useProjects } from "@/lib/projects-store";

/* New screen — it has no Figma frame.

   PLAN.md §2 marks this a hard job boundary: job(kind=parse) ends here, the trainer picks
   a unit of competency and learning outcomes from parsed_structure, and only then does
   job(kind=generate) start. A state the pipeline cannot advance through without a human
   needs UI, and the design had none because it ran both jobs as one.

   The document-type picker and run-budget meter moved here from the Sources design
   (13:231) for the same reason: they size the generate job, which does not exist yet
   while the trainer is still on Sources. */

/* Sized so the over-budget rejection is actually reachable: a 5-LO unit costs 5 calls as
   Session Plans and 20 as CBLM, so a ceiling above 20 would make USER_FLOWS §2 blocking
   point #3 dead code. The real ceiling comes from the free-tier rate limit (PLAN.md §5
   calls pacing a topology decision, not a tuning knob). */
const BUDGET = 15;

type DocType = "session_plans" | "cblm";

export default function SelectPage() {
  const params = useParams<{ id: string }>();
  /* from the store, not the const: a project created this session must resolve here
     too, otherwise its Sources page silently renders a different project. */
  const { projects } = useProjects();
  const project = projects.find((p) => p.id === params.id) ?? PROJECTS[1];

  const [unitId, setUnitId] = useState(UNITS[0].id);
  const [docType, setDocType] = useState<DocType>("session_plans");

  const unit = UNITS.find((u) => u.id === unitId) ?? UNITS[0];

  /* Session Plans: one per LO. CBLM: 4 sections per LO (Information Sheet, Task Sheet,
     Self-Check, Answer Key) — PLAN.md §1. */
  const calls = useMemo(
    () => (docType === "session_plans" ? unit.los.length : unit.los.length * 4),
    [docType, unit.los.length],
  );
  const overBudget = calls > BUDGET;

  return (
    <div className="card">
      <div className="page-hd" style={{ marginBottom: 4 }}>
        <h2>What should I generate?</h2>
        <span className="id">{project.code}</span>
      </div>
      <p className="sub">
        Read from the parsed TR and CBC. Nothing has been generated yet — this choice sizes
        the run.
      </p>

      {UNMATCHED.length > 0 && (
        <>
          <div className="callout callout--warning">
            <Icon name="tri" />
            <span>
              <strong>{UNMATCHED.length} unmatched between the TR and the CBC.</strong>{" "}
              {UNMATCHED.map((u) => `${u.side} ${u.label} — ${u.note}`).join("; ")}. These
              are surfaced rather than guessed, so an unmatched element simply generates
              nothing until you fix the source.
            </span>
          </div>
          <div className="gap" />
        </>
      )}

      <div className="step-h">Unit of competency</div>
      {/* Radix Select rather than a native <select>: typeahead, arrow-key navigation and
          a listbox that can be styled from tokens.css, which a native control cannot. */}
      <Select.Root value={unitId} onValueChange={setUnitId}>
        <Select.Trigger
          id="uc"
          className="input"
          aria-label="Unit of competency"
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, textAlign: "left" }}
        >
          <Select.Value />
          <Select.Icon>
            <Icon name="chev" style={{ width: 14, height: 14 }} />
          </Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Content
            className="pop"
            position="popper"
            sideOffset={4}
            style={{
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-lg)",
              boxShadow: "var(--shadow-lg)",
              padding: 4,
              zIndex: 60,
              width: "var(--radix-select-trigger-width)",
            }}
          >
            <Select.Viewport>
              {UNITS.map((u) => (
                <Select.Item
                  key={u.id}
                  value={u.id}
                  className="row"
                  style={{ borderBottom: 0, borderRadius: "var(--radius-md)", cursor: "pointer", outline: "none" }}
                >
                  <Select.ItemText>
                    {u.kind} — {u.title} ({u.code}) — {u.los.length} LOs
                  </Select.ItemText>
                  <span className="row__spacer" />
                  <Select.ItemIndicator>
                    <Icon name="check" style={{ width: 14, height: 14, color: "var(--color-blue)" }} />
                  </Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>

      <div className="step-h">Learning outcomes</div>
      <div className="rowlist">
        {unit.los.map((lo) => (
          <div key={lo.id} className="row">
            <span className="row__lo">{lo.id}</span>
            <span className="row__name">{lo.title}</span>
            <span className="row__spacer" />
            <span className="row__meta">{lo.criteria} criteria</span>
          </div>
        ))}
      </div>

      <div className="step-h" id="doctype-label">Document type</div>
      {/* RadioGroup gives roving tabindex and arrow-key selection: one tab stop for the
          group, not one per option. */}
      <RadioGroup.Root
        className="rowlist"
        value={docType}
        onValueChange={(v) => setDocType(v as DocType)}
        aria-labelledby="doctype-label"
      >
        {(
          [
            {
              id: "session_plans" as DocType,
              label: "Session Plans",
              detail: `One per learning outcome — ${unit.los.length} documents`,
              n: unit.los.length,
            },
            {
              id: "cblm" as DocType,
              label: "CBLM",
              detail: `Information Sheet, Task Sheet, Self-Check, Answer Key — per LO, ${unit.los.length * 4} documents`,
              n: unit.los.length * 4,
            },
          ] as const
        ).map((opt) => (
          <label
            key={opt.id}
            className="row"
            style={{ height: 52, cursor: "pointer" }}
          >
            <RadioGroup.Item
              value={opt.id}
              aria-label={`${opt.label} — ${opt.detail}`}
              style={{
                width: 16,
                height: 16,
                flex: "none",
                borderRadius: "var(--radius-full)",
                border: `1px solid ${docType === opt.id ? "var(--color-blue)" : "var(--color-border-strong)"}`,
                background: "var(--color-surface)",
                display: "grid",
                placeItems: "center",
              }}
            >
              <RadioGroup.Indicator
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "var(--radius-full)",
                  background: "var(--color-blue)",
                }}
              />
            </RadioGroup.Item>
            <span style={{ minWidth: 0 }}>
              <span className="row__name" style={{ display: "block" }}>
                {opt.label}
              </span>
              <span className="row__phrase" style={{ display: "block" }}>
                {opt.detail}
              </span>
            </span>
            <span className="row__spacer" />
            <span
              className={`badge ${opt.n > BUDGET ? "badge--failed" : "badge--partial"}`}
            >
              ~{opt.n} calls
            </span>
          </label>
        ))}
      </RadioGroup.Root>

      <div className="gap" />

      <div className="rps__top">
        <span className="rps__phase">Run budget</span>
        <span className="rps__count">
          {calls} of {BUDGET} calls
        </span>
      </div>
      <div className="bar">
        <div
          className={`bar__fill ${overBudget ? "bar__fill--failed" : "bar__fill--running"}`}
          style={{ width: `${Math.min(100, (calls / BUDGET) * 100)}%` }}
        />
      </div>

      {overBudget && (
        <>
          <div className="gap" />
          <div className="callout callout--error">
            <Icon name="alert" />
            <span>
              {calls} calls exceeds the {BUDGET}-call budget, so no job is enqueued and
              nothing is spent. Pick a unit with fewer learning outcomes, or generate
              Session Plans first — the TM order is plan, review, then build materials
              against the approved plan.
            </span>
          </div>
        </>
      )}

      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          alignItems: "center",
          gap: 12,
          marginTop: 16,
        }}
      >
        <Link
          href={`/projects/${project.id}/run`}
          className="btn btn--primary"
          style={{
            textDecoration: "none",
            pointerEvents: overBudget ? "none" : undefined,
            opacity: overBudget ? 0.5 : 1,
          }}
          aria-disabled={overBudget}
        >
          <Icon name="play" />
          Generate {calls} {docType === "session_plans" ? "Session Plans" : "CBLM sections"}
        </Link>
      </div>
      <p
        className="measure-end"
        style={{
          fontSize: "var(--text-sm)",
          color: "var(--color-text-secondary)",
          textAlign: "right",
          margin: "8px 0 0",
        }}
      >
        The cost is on the button because this is the only irreversible spend in the flow.
      </p>
    </div>
  );
}
