"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { PROJECTS, type Project } from "./mock";

/* Holds projects created during the session.

   The kit's note on this modal (ui_kits/cbc/screens/projects.html) is explicit: it
   "returns the trainer to the list with the new project already in place - no navigation,
   no lost context." That only works if the new row actually appears, so creation needs
   somewhere to live. With no POST /projects yet, that is client state.

   A new project starts with outcome "none", which is what makes its Sources screen show
   the blocked state with both uploads missing - the upload entry point. */

type ProjectsState = {
  projects: Project[];
  create: (input: { title: string; code: string }) => Project;
};

const Ctx = createContext<ProjectsState | null>(null);

function slugify(title: string, taken: Set<string>) {
  /* Trim AFTER slicing, not before: trimming first then slicing re-introduces a trailing
     hyphen whenever the cut lands on one ("Automotive Servicing NC I" produced the id
     "automotive-servicing-nc-", losing the meaningful final character). */
  const base =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .slice(0, 24)
      .replace(/^-+|-+$/g, "") || "project";
  let id = base;
  let n = 2;
  while (taken.has(id)) id = `${base}-${n++}`;
  return id;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function ProjectsProvider({ children }: { children: React.ReactNode }) {
  const [added, setAdded] = useState<Project[]>([]);

  const projects = useMemo(() => [...added, ...PROJECTS], [added]);

  const create = useCallback(
    ({ title, code }: { title: string; code: string }) => {
      const taken = new Set([...PROJECTS, ...added].map((p) => p.id));
      /* Date is stamped at click time, not render time, so it cannot desync the server
         and client render. */
      const now = new Date();
      const project: Project = {
        id: slugify(title, taken),
        title: title.trim(),
        code: code.trim(),
        uploadedAt: `${String(now.getDate()).padStart(2, "0")} ${MONTHS[now.getMonth()]} ${now.getFullYear()}`,
        outcome: "none",
      };
      setAdded((prev) => [project, ...prev]);
      return project;
    },
    [added],
  );

  const value = useMemo(() => ({ projects, create }), [projects, create]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useProjects() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useProjects must be used inside ProjectsProvider");
  return ctx;
}
