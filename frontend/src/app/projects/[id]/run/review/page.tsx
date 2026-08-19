"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import Icon from "@/components/Icon";
import { PROJECTS, SESSION_PLAN, JOB_ID } from "@/lib/mock";
import { useProjects } from "@/lib/projects-store";
import { useRunState } from "@/lib/run-state";

/* New screen — it has no Figma frame.

   PLAN.md §2: jobs.status = awaiting_review, LangGraph interrupt_before + checkpointer,
   resumed by POST /jobs/{id}/resume. The pipeline cannot advance without this, so it needs
   a screen.

   Read-only plus approve, NOT an editor. PLAN.md §2's interrupt says the trainer "reviews
   and edits", but PLAN.md §1's Output row says "No in-app rich editor to build; trainer
   does final edits in Word", and LOState.session_plan_approved is a plain bool. The
   approve affordance is the minimum the pipeline actually requires, and a 7-column matrix
   editor would breach the locked minimal-frontend scope. Flagged rather than guessed. */

const COLUMNS = [
  "Content",
  "Methods",
  "Presentation",
  "Practice",
  "Feedback",
  "Resources",
  "Time",
];

export default function ReviewPage() {
  const params = useParams<{ id: string }>();
  /* from the store, not the const: a project created this session must resolve here
     too, otherwise its Sources page silently renders a different project. */
  const { projects } = useProjects();
  const project = projects.find((p) => p.id === params.id) ?? PROJECTS[1];
  const { isApproved, approve } = useRunState();
  const approved = isApproved(project.id);

  return (
    <div className="card">
      <div className="page-hd" style={{ marginBottom: 4 }}>
        <h2>Review the Session Plan</h2>
        <span className="id">job {JOB_ID}</span>
      </div>
      <p className="sub">
        <span className="row__lo">{SESSION_PLAN.lo}</span> {SESSION_PLAN.title} ·{" "}
        {project.code}
      </p>

      <div className="callout callout--info">
        <Icon name="info" />
        <span>
          The CBLM drafter loops the <strong>approved</strong> plan&rsquo;s topics and
          cannot invent or skip one. Approving is what resumes the job.
        </span>
      </div>

      <div className="gap" />

      {/* wide matrix scrolls inside its own container rather than the page */}
      <div style={{ overflowX: "auto", border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)" }}>
        <table
          style={{
            borderCollapse: "collapse",
            width: "100%",
            minWidth: 900,
            fontSize: "var(--text-sm)",
            background: "var(--color-surface)",
          }}
        >
          <thead>
            <tr style={{ background: "var(--color-surface-alt)" }}>
              <th style={th}>#</th>
              {COLUMNS.map((c) => (
                <th key={c} style={th}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SESSION_PLAN.rows.map((r) => (
              <tr key={r.number}>
                <td style={{ ...td, fontFamily: "var(--font-mono)", whiteSpace: "nowrap" }}>
                  {r.number}
                </td>
                <td style={td}>
                  <div style={{ fontWeight: 500 }}>{r.content}</div>
                  {/* subtopics are italicised in the exported document */}
                  {r.subtopics.length > 0 && (
                    <div style={{ fontStyle: "italic", color: "var(--color-text-secondary)" }}>
                      {r.subtopics.join(" · ")}
                    </div>
                  )}
                </td>
                <td style={td}>{r.methods.join(", ")}</td>
                <td style={td}>{r.presentation}</td>
                <td style={td}>{r.practice}</td>
                <td style={td}>{r.feedback}</td>
                <td style={td}>{r.resources.join(", ")}</td>
                <td style={{ ...td, whiteSpace: "nowrap" }}>{r.time}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p
        style={{
          fontSize: "var(--text-sm)",
          color: "var(--color-text-secondary)",
          margin: "12px 0 0",
        }}
      >
        Read-only here. Final wording edits happen in Word after export — see PLAN.md §1,
        Output.
      </p>

      {approved && (
        <>
          <div className="gap" />
          <div className="callout callout--success">
            <Icon name="check" />
            <span>
              Approved — <code>approved_at</code> is set and the job resumed. The CBLM
              drafter is now looping these topics.
            </span>
          </div>
        </>
      )}

      <div
        style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}
      >
        <Link
          href={`/projects/${project.id}/run`}
          className="btn"
          style={{ textDecoration: "none" }}
        >
          Back to run
        </Link>
        <button
          type="button"
          className="btn btn--primary"
          disabled={approved}
          onClick={() => approve(project.id)}
        >
          <Icon name="check" />
          {approved ? "Approved" : "Approve and resume"}
        </button>
      </div>
    </div>
  );
}

const th: React.CSSProperties = {
  textAlign: "left",
  fontWeight: 500,
  fontSize: "var(--text-xs)",
  color: "var(--color-text-secondary)",
  padding: "8px 10px",
  borderBottom: "1px solid var(--color-border)",
  whiteSpace: "nowrap",
};

const td: React.CSSProperties = {
  padding: "10px",
  borderBottom: "1px solid var(--color-border-faint)",
  verticalAlign: "top",
};
