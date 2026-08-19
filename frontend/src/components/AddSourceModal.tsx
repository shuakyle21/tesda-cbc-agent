"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as ToggleGroup from "@radix-ui/react-toggle-group";
import Icon from "./Icon";
import { ROLE_ACCEPT, ROLE_LABEL, type SourceRole } from "@/lib/mock";

/* Figma 23:66. All three states are preserved — idle (23:67), validating (23:95),
   rejected (23:113) — because the scanned-PDF rejection is USER_FLOWS §2 blocking point
   #1 and the only free one: it happens inside the upload request and the file is not kept.

   Reconciled: the design's third role, "Reference", is gone. PLAN.md §1 cuts the vector
   store and marks the exemplar corpus SUPERSEDED, so a Reference upload would be indexed
   into a corpus nothing reads. The role copy is rewritten accordingly, and the accepted
   extension is now per-role — python-docx cannot read a PDF (BUILD_CHECKLIST.md §3).

   Built on Radix Dialog rather than a bare fixed-position div. The hand-rolled version had
   the ARIA attributes right but none of the behaviour: no focus trap, no Esc, no scroll
   lock, no focus restore on close. Radix supplies all four, and the design system keeps
   full control of the visuals — every class here is still from tokens.css. */

type ModalState = "idle" | "validating" | "rejected";

const DEMO_FILENAME = "TR — Organic Agriculture Production NC II.pdf";

export default function AddSourceModal() {
  const [state, setState] = useState<ModalState>("idle");
  const [role, setRole] = useState<SourceRole>("tr");

  return (
    <Dialog.Root onOpenChange={(next) => !next && setState("idle")}>
      {/* The opener lives inside Dialog.Root as a Trigger rather than being a controlled
          button outside it. With an external opener Radix has no trigger to hand focus
          back to on close, and focus landed on the document instead — verified failing
          before this change. */}
      <Dialog.Trigger asChild>
        <button type="button" className="btn">
          <Icon name="plus" />
          Add source
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
            top: 60,
            left: "50%",
            transform: "translateX(-50%)",
            width: 480,
            maxWidth: "calc(100vw - 32px)",
            maxHeight: "calc(100dvh - 120px)",
            overflowY: "auto",
            zIndex: 51,
          }}
        >
          <Dialog.Title className="modal__h">Add source</Dialog.Title>

          <Dialog.Description className="modal__p">
            {state === "idle" &&
              "The Training Regulation and the Enhanced CBC are both required, and both are parsed for facts."}
            {state === "validating" &&
              "The text-layer check runs inside the upload request, so the answer arrives before you leave this dialog."}
            {state === "rejected" &&
              "Rejection replaces the dropzone body, so the explanation sits where the file was dropped."}
          </Dialog.Description>

          {state === "idle" && (
            <button
              type="button"
              
              className="drop"
              style={{ width: "100%", display: "block", cursor: "pointer" }}
              onClick={() => setState("validating")}
            >
              <Icon name="upload" />
              <input type="file" />

              <p className="drop__h">Drop a file here, or browse</p>
              <p className="drop__p">
                {role === "tr"
                  ? "PDF only · must have a text layer, not a scan"
                  : "DOCX only · parsed with python-docx"}
              
              </p>
              
            </button>
          )}

          {state === "validating" && (
            <div className="drop">
              <Icon name="loader" className="pulse" />
              <p className="drop__h">Checking text layer…</p>
              <p className="drop__p">First page plus one sampled page</p>
            </div>
          )}

          {state === "rejected" && (
            <div className="drop drop--rejected">
              <Icon name="alert" />
              <p className="drop__h">No text layer detected</p>
              <p className="drop__p">
                This PDF appears to be scanned. Upload a digitally-typed file.
              </p>
              <button
                type="button"
                className="btn"
                style={{ marginTop: 12 }}
                onClick={() => setState("idle")}
              >
                Choose another file
              </button>
            </div>
          )}

          {state !== "idle" && (
            <p
              style={{
                fontFamily: state === "validating" ? "var(--font-mono)" : undefined,
                fontSize: "var(--text-sm)",
                color: "var(--color-text-secondary)",
                margin: "16px 0 0",
              }}
            >
              {state === "validating" ? DEMO_FILENAME : "The file was not kept."}
            </p>
          )}

          {state === "idle" && (
            <div style={{ marginTop: 16 }}>
              <span
                id="role-label"
                style={{
                  display: "block",
                  fontSize: "var(--text-base)",
                  color: "var(--color-text-secondary)",
                  marginBottom: 6,
                }}
              >
                Role
              </span>
              {/* ToggleGroup gives roving-tabindex arrow-key navigation, which the
                  two plain buttons did not have. */}
              <ToggleGroup.Root
                type="single"
                value={role}
                onValueChange={(v) => v && setRole(v as SourceRole)}
                aria-labelledby="role-label"
                style={{ display: "flex", gap: 6 }}
              >
                {(["tr", "cbc"] as SourceRole[]).map((r) => (
                  <ToggleGroup.Item
                    key={r}
                    value={r}
                    className="btn btn--sm"
                    style={
                      role === r
                        ? {
                            background: "var(--color-blue-lt)",
                            borderColor: "var(--color-blue-border)",
                            color: "var(--color-blue-dk)",
                          }
                        : undefined
                    }
                  >
                    {ROLE_LABEL[r]}
                  </ToggleGroup.Item>
                ))}
              </ToggleGroup.Root>
              <p
                style={{
                  fontSize: "var(--text-sm)",
                  color: "var(--color-text-secondary)",
                  margin: "8px 0 0",
                }}
              >
                Detected from the document header. Change it if the detection is wrong — the
                role picks the parser, and the two are not interchangeable: the TR goes to
                pdfplumber ({ROLE_ACCEPT.tr}), the CBC to python-docx ({ROLE_ACCEPT.cbc}).
              </p>
            </div>
          )}

          <div className="modal__actions" style={{ marginTop: 20 }}>
            {/* Fixture affordance only — there is no upload to fail yet. Delete this when
                the real text-layer check is wired to the upload request. */}
            {state === "validating" && (
              <button
                type="button"
                className="btn"
                style={{ marginRight: "auto" }}
                onClick={() => setState("rejected")}
              >
                Simulate a scanned PDF
              </button>
            )}
            <Dialog.Close asChild>
              <button type="button" className="btn">
                Cancel
              </button>
            </Dialog.Close>
            <button type="button" className="btn btn--primary" disabled>
              Add source
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
