"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

/* Holds the one piece of cross-screen state the fixtures cannot: whether the trainer has
   approved the Session Plan for a given project.

   Without this, Review's "Approve and resume" is local useState — it shows "the job
   resumed" while /run still says "Paused — waiting for your review". Since the interrupt
   and its resume are the mechanism the two new screens exist for (and PLAN.md §2 names it
   as a capstone talking point), the release has to actually propagate.

   In the wired version this is server state: approving is POST /jobs/{id}/resume, and
   both screens read jobs.status. */

type RunState = {
  isApproved: (projectId: string) => boolean;
  approve: (projectId: string) => void;
};

const Ctx = createContext<RunState | null>(null);

export function RunStateProvider({ children }: { children: React.ReactNode }) {
  const [approved, setApproved] = useState<Record<string, boolean>>({});

  const isApproved = useCallback(
    (projectId: string) => Boolean(approved[projectId]),
    [approved],
  );

  const approve = useCallback((projectId: string) => {
    setApproved((prev) => ({ ...prev, [projectId]: true }));
  }, []);

  const value = useMemo(() => ({ isApproved, approve }), [isApproved, approve]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useRunState() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useRunState must be used inside RunStateProvider");
  return ctx;
}
