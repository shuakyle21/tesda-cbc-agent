"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import Icon from "@/components/Icon";
import AddSourceModal from "@/components/AddSourceModal";
import { PROJECTS, sourcesFor, ROLE_LABEL, type SourceRole } from "@/lib/mock";
import { useProjects } from "@/lib/projects-store";

/* Figma 13:231 "Sources & Generate Page", reconciled.

   The design put the unit-of-competency picker, document-type picker and run-budget meter
   on this screen, under a "Generate 5 Session Plans" button — one job, start to finish.
   PLAN.md §2 splits execution into two jobs (kind=parse, then kind=generate) with a human
   selection step between them, and the picker is fed by GET /projects/{id}/structure,
   which cannot answer until the parse job has run. So all of that moved to /select and
   this screen ends at "Parse sources". */

const REQUIRED: SourceRole[] = ["tr", "cbc"];

export default function SourcesPage() {
  const params = useParams<{ id: string }>();
  /* from the store, not the const: a project created this session must resolve here
     too, otherwise its Sources page silently renders a different project. */
  const { projects } = useProjects();
  const project = projects.find((p) => p.id === params.id) ?? PROJECTS[1];
  const sources = sourcesFor(project);

  const present = new Set(sources.map((s) => s.role));
  const missing = REQUIRED.filter((r) => !present.has(r));
  const ready = missing.length === 0;

  return (
    <>
      <div className="card">
        <div className="page-hd" style={{ marginBottom: 4 }}>
          <h2>{project.title}</h2>
          <span className="id">{project.code}</span>
        </div>
        <p className="sub">
          Both the Training Regulation and the Enhanced CBC are required inputs. The TR is
          parsed in full and is the grounding authority; the CBC drives per-LO generation.
        </p>

        <div className="rowlist">
          {sources.map((s) => (
            <div key={s.role} className="row" style={{ height: 52 }}>
              <Icon name="file" className="row__icon" />
              <span style={{ minWidth: 0 }}>
                <span
                  className="row__name"
                  style={{ display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
                >
                  {s.filename}
                </span>
                <span className="row__phrase" style={{ display: "block" }}>
                  {s.detail}
                </span>
              </span>
              <span className="row__spacer" />
              <span className="badge badge--info">{ROLE_LABEL[s.role]}</span>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12 }}>
          <AddSourceModal />
          <span style={{ fontSize: "var(--text-sm)", color: "var(--color-text-secondary)" }}>
            TR must be a text-layer PDF · CBC must be .docx · both required
          </span>
        </div>

        <div className="gap" />

        {ready ? (
          <div className="callout callout--info">
            <Icon name="info" />
            <span>
              Both sources are present. Parsing extracts the units of competency and
              learning outcomes you will choose from next — it does not generate anything.
            </span>
          </div>
        ) : (
          <div className="callout callout--warning">
            <Icon name="tri" />
            <span>
              Parsing stays unreachable until both sources are attached. Missing:{" "}
              {missing.map((m) => ROLE_LABEL[m]).join(", ")}. The CBC supplies the per-LO
              structure the generated documents are built against — without it there is
              nothing to generate for.
            </span>
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
          <Link
            href={`/projects/${project.id}/select`}
            className="btn btn--primary"
            style={{ textDecoration: "none", pointerEvents: ready ? undefined : "none", opacity: ready ? 1 : 0.5 }}
            aria-disabled={!ready}
          >
            <Icon name="play" />
            Parse sources
          </Link>
        </div>
      </div>

    </>
  );
}
