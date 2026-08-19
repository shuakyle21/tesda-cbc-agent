"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import Icon from "./Icon";
import { useProjects } from "@/lib/projects-store";

/* Built to the kit's spec in ui_kits/cbc/screens/projects.html: two fields, Title and an
   optional mono qualification code. Its note says why this is a modal and not a route -
   "two fields do not justify a page".

   Deliberately NOT an upload form. Creating a project and attaching sources are separate
   steps in PLAN.md's flow: the TR and CBC go through the text-layer check on the Sources
   screen, and the parse gate reads from there. Folding uploads in here would duplicate
   AddSourceModal and bypass that gate. Create then hands off to Sources, which is the
   upload step. */

export default function NewProjectModal() {
  const router = useRouter();
  const { create } = useProjects();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [code, setCode] = useState("");

  const canCreate = title.trim().length > 0;

  function reset() {
    setTitle("");
    setCode("");
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canCreate) return;
    const project = create({ title, code });
    setOpen(false);
    reset();
    /* Straight to the upload step. The kit wanted the new row visible in the list, and it
       is - but a project with no sources can do exactly one thing next, so sending the
       trainer there beats making them find the row and click it. */
    router.push(`/projects/${project.id}/sources`);
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      {/* Trigger lives inside Dialog.Root so Radix has something to restore focus to on
          close - the same thing that silently failed on AddSourceModal. */}
      <Dialog.Trigger asChild>
        <button className="btn btn--primary" type="button">
          <Icon name="plus" />
          New project
        </button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay
          className="ovl"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,14,11,0.32)",
            zIndex: 50,
          }}
        />
        <Dialog.Content
          className="modal dlg"
          style={{
            position: "fixed",
            top: 80,
            left: "50%",
            transform: "translateX(-50%)",
            width: 420,
            maxWidth: "calc(100vw - 32px)",
            zIndex: 51,
          }}
        >
          <Dialog.Title className="modal__h">New project</Dialog.Title>
          <Dialog.Description className="modal__p">
            A project holds one qualification&rsquo;s sources and every document generated
            from them. You will attach the TR and the Enhanced CBC next.
          </Dialog.Description>

          <form onSubmit={onSubmit}>
            <div className="field">
              <label htmlFor="np-title">Title</label>
              <input
                id="np-title"
                className="input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Prepare Bakery Products"
                autoFocus
                required
              />
            </div>

            <div className="field">
              <label htmlFor="np-code">
                Qualification code{" "}
                <span style={{ color: "var(--color-text-secondary)" }}>(optional)</span>
              </label>
              <input
                id="np-code"
                className="input mono"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="BPP NC II"
              />
              {/* helper text is present in markup even when empty - the kit's form rule */}
              <p
                style={{
                  fontSize: "var(--text-sm)",
                  color: "var(--color-text-secondary)",
                  margin: "4px 0 0",
                }}
              >
                Detected from the TR once it is parsed, so you can leave this blank.
              </p>
            </div>

            <div className="modal__actions" style={{ marginTop: 20 }}>
              <Dialog.Close asChild>
                <button type="button" className="btn">
                  Cancel
                </button>
              </Dialog.Close>
              <button type="submit" className="btn btn--primary" disabled={!canCreate}>
                Create
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
