"use client";

import { useParams } from "next/navigation";
import Icon from "@/components/Icon";
import { PROJECTS, resultsFor } from "@/lib/mock";
import { useProjects } from "@/lib/projects-store";

/* Figma 12:51 "Results — rebuilt".

   The banner is derived from the documents list, never from jobs.status — a run is `done`
   whether it produced 20 of 20 or 18 of 20, and deriving it from status would show green
   over a gap (USER_FLOWS §3). There is deliberately no per-document retry: no such
   endpoint exists, so a per-row button could only restart the whole run and its label
   would be a lie. Re-run says so instead. */

export default function ResultsPage() {
  const params = useParams<{ id: string }>();
  /* from the store, not the const: a project created this session must resolve here
     too, otherwise its Sources page silently renders a different project. */
  const { projects } = useProjects();
  const project = projects.find((p) => p.id === params.id) ?? PROJECTS[1];

  const groups = resultsFor(project.outcome);
  const all = groups.flatMap((g) => g.docs);
  const gaps = all.filter((d) => d.status === "missing");
  const ok = all.length - gaps.length;
  const clean = gaps.length === 0;

  /* Reachable now that groups are keyed off the project's outcome. USER_FLOWS §5:
     "Results must have a real empty state, not a blank screen." */
  if (all.length === 0) {
    const failed = project.outcome === "failed";
    return (
      <>
        <div className="page-hd">
          <h2>Results</h2>
          <span className="id">{project.code}</span>
        </div>
        <div className="rowlist">
          <div className="empty">
            <Icon name={failed ? "fileoff" : "files"} />
            <p className="empty__h">
              {failed ? "This run failed — nothing was generated" : "Nothing generated yet"}
            </p>
            <p className="empty__p">
              {failed
                ? "The run produced no documents. Run Progress holds the verbatim error."
                : "Results are durable and always reachable, so this screen is a real destination even before a run exists."}
            </p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="page-hd">
        <h2>Results</h2>
        <span className="id">{project.code}</span>
      </div>

      <div className={`callout ${clean ? "callout--success" : "callout--warning"}`}>
        <Icon name={clean ? "check" : "tri"} />
        <div style={{ minWidth: 0 }}>
          <strong>
            {clean
              ? `All ${all.length} documents generated.`
              : `Completed with gaps — ${ok} of ${all.length} documents generated.`}
          </strong>
          {gaps.length > 0 && (
            <div style={{ marginTop: 8 }}>
              {groups.flatMap((g) =>
                g.docs
                  .filter((d) => d.status === "missing")
                  .map((d) => (
                    <div
                      key={`${g.lo}-${d.label}`}
                      style={{
                        fontSize: "var(--text-sm)",
                        borderTop: "1px solid var(--color-amber-border)",
                        padding: "6px 0",
                      }}
                    >
                      {d.label} · {g.lo} — failed validation after 2 retries
                    </div>
                  )),
              )}
            </div>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            <button className="btn btn--primary" type="button">
              <Icon name="files" />
              Download all {ok}
            </button>
            <button className="btn" type="button">
              <Icon name="refresh" />
              Re-run generation
            </button>
          </div>
          {gaps.length > 0 && (
            <p
              style={{
                fontSize: "var(--text-sm)",
                margin: "10px 0 0",
                color: "var(--color-amber-dk)",
              }}
            >
              Re-running regenerates every document and spends the full budget again — there
              is no way to retry just the {gaps.length} that failed.
            </p>
          )}
        </div>
      </div>

      <div className="gap" />

      {groups.map((g) => {
        const groupOk = g.docs.filter((d) => d.status === "ok").length;
        const partial = groupOk < g.docs.length;
        return (
          <div key={g.lo} style={{ marginBottom: 16 }}>
            <div className="rowlist">
              <div className="lohead">
                <span className="lohead__chip">{g.lo}</span>
                <span className="lohead__title">{g.title}</span>
                <span className="lohead__count">
                  {groupOk} / {g.docs.length}
                </span>
                <span
                  className={`badge ${partial ? "badge--partial" : "badge--ok"}`}
                  style={{ marginLeft: 8 }}
                >
                  {partial ? "PARTIAL" : "OK"}
                </span>
              </div>
              {g.docs.map((d) => (
                <div
                  key={d.label}
                  className={`doc${d.status === "missing" ? " doc--missing" : ""}`}
                >
                  <Icon
                    name={d.status === "missing" ? "fileoff" : "file"}
                    className="doc__icon"
                  />
                  {/* missing state uses text-secondary, not muted: it is the only
                      explanation of what went wrong, so it must pass AA (tokens.css) */}
                  <span className="doc__label">
                    {d.status === "missing" ? `${d.label} — ${d.note}` : d.label}
                  </span>
                  <span style={{ marginLeft: "auto" }} />
                  <span
                    className={`badge ${d.status === "missing" ? "badge--failed" : "badge--ok"}`}
                  >
                    {d.status === "missing" ? "NOT GENERATED" : "OK"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </>
  );
}
