"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import Icon, { type IconName } from "@/components/Icon";
import { PROJECTS, runSteps, JOB_ID, type StepStatus } from "@/lib/mock";
import { useProjects } from "@/lib/projects-store";
import { useRunState } from "@/lib/run-state";

/* Figma 11:51 "Run Progress — rebuilt", reconciled.

   Two changes. The design's "Retriever succeeded 2s" row is gone: retrieval was cut
   (PLAN.md §1, Vector store / RAG), so that row reported on a node the graph never runs.
   And an `awaiting_review` row is added, because PLAN.md §2's interrupt halts the job
   until POST /jobs/{id}/resume — the design ran straight from drafting to export. */

const ROW_CLASS: Record<StepStatus, string> = {
  succeeded: "row--succeeded",
  running: "row--active",
  waiting: "row--pending",
  retrying: "row--retried",
  failed: "row--failed",
  awaiting_review: "row--active",
};

const ROW_ICON: Record<StepStatus, IconName> = {
  succeeded: "check",
  running: "loader",
  waiting: "circle",
  retrying: "refresh",
  failed: "alert",
  awaiting_review: "clock",
};

export default function RunPage() {
  const params = useParams<{ id: string }>();
  /* from the store, not the const: a project created this session must resolve here
     too, otherwise its Sources page silently renders a different project. */
  const { projects } = useProjects();
  const project = projects.find((p) => p.id === params.id) ?? PROJECTS[1];
  const { isApproved } = useRunState();

  const steps = runSteps(isApproved(project.id));
  const done = steps.filter((s) => s.status === "succeeded").length;
  const halted = steps.find((s) => s.status === "awaiting_review");

  return (
    <div className="card">
      <div className="page-hd" style={{ marginBottom: 16 }}>
        <h2>{project.title}</h2>
        <span className="id">job {JOB_ID}</span>
      </div>

      <div className="rps__top">
        <span className="rps__phase">
          {halted
            ? "Paused — waiting for your review"
            : "Drafting CBLM sections from the approved plan"}
        </span>
        <span className="rps__count">
          {done} of {steps.length} steps
        </span>
      </div>
      <div className="bar">
        <div
          className="bar__fill bar__fill--running"
          style={{ width: `${(done / steps.length) * 100}%` }}
        />
      </div>

      <div className="gap" />

      <div className="rowlist">
        {steps.map((s, i) => (
          <div key={i} className={`row ${ROW_CLASS[s.status]}`}>
            <Icon
              name={ROW_ICON[s.status]}
              className={`row__icon${s.status === "running" ? " pulse" : ""}`}
            />
            <span className="row__name">{s.name}</span>
            {s.lo && <span className="row__lo">{s.lo}</span>}
            {/* the phrase carries retried-vs-failed, never the row fill: amber-lt and
                red-lt are near-identical (tokens.css, DESIGN.md §11 Finding 3) */}
            <span className="row__phrase">{s.phrase}</span>
            <span className="row__spacer" />
            <span className="row__meta">{s.meta}</span>
          </div>
        ))}
      </div>

      {halted && (
        <>
          <div className="gap" />
          <div className="callout callout--info">
            <Icon name="clock" />
            <span>
              The job is healthy and will not advance on its own. <code>draft_cblm</code>{" "}
              runs only after the Session Plan is approved — nothing is being spent while
              it waits.
            </span>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
            <Link
              href={`/projects/${project.id}/run/review`}
              className="btn btn--primary"
              style={{ textDecoration: "none" }}
            >
              <Icon name="list" />
              Review the Session Plan
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
