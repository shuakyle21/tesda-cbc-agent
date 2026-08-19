"use client";

import Link from "next/link";
import NewProjectModal from "@/components/NewProjectModal";
import { useProjects } from "@/lib/projects-store";
import { OUTCOME_BADGE, OUTCOME_LABEL } from "@/lib/mock";

/* Figma 1:429 (table + column headers) merged with 1:380 (same screen, condensed).
   The header strip and chrome from 1:380 live in AppShell. */

export default function ProjectsPage() {
  const { projects } = useProjects();

  return (
    <>
      <div className="page-hd">
        <h2>Projects</h2>
        <span className="sp">
          <NewProjectModal />
        </span>
      </div>

      <div className="rowlist">
        <div className="thead" aria-hidden="true">
          <span className="prow__t" style={{ fontWeight: 400 }}>
            Name of Program
          </span>
          <span className="col-code">Course Code</span>
          <span className="col-date">Date Uploaded</span>
          <span className="col-status">Status</span>
        </div>

        {projects.map((p) => (
          <Link key={p.id} href={`/projects/${p.id}/sources`} className="prow">
            <span className="prow__t">{p.title}</span>
            <span className="prow__c col-code">{p.code}</span>
            <span className="prow__c col-date">{p.uploadedAt}</span>
            <span className="col-status">
              {/* PARTIAL is amber even though that job's status is `done` — the badge is
                  derived from the documents list, never from jobs.status (USER_FLOWS §3). */}
              <span className={`badge ${OUTCOME_BADGE[p.outcome]}`}>
                {OUTCOME_LABEL[p.outcome]}
              </span>
            </span>
          </Link>
        ))}
      </div>
    </>
  );
}
