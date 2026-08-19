/* Static fixture data.
   No backend endpoints exist yet - BUILD_CHECKLIST.md §1 (data model) and §3 (parsers)
   are both unchecked, so there is nothing to fetch. Every screen renders from this file.
   Shapes deliberately mirror PLAN.md §2's PipelineState so the swap to real API calls is
   a data-source change, not a rewrite. */

export type RunOutcome = "complete" | "partial" | "failed" | "none";

export type Project = {
  id: string;
  title: string;
  code: string;
  uploadedAt: string;
  outcome: RunOutcome;
};

export const PROJECTS: Project[] = [
  { id: "bpp-2", title: "Bread and Pastry Production NC II", code: "BPP NC II", uploadedAt: "11 Aug 2026", outcome: "complete" },
  { id: "oap-2", title: "Organic Agriculture Production NC II", code: "OAP NC II", uploadedAt: "14 Aug 2026", outcome: "complete" },
  { id: "css-2", title: "Computer Systems Servicing NC II", code: "CSS NC II", uploadedAt: "16 Aug 2026", outcome: "none" },
  { id: "fpr-2", title: "Food Processing NC II", code: "FPR NC II", uploadedAt: "09 Aug 2026", outcome: "none" },
  { id: "hsk-2", title: "Housekeeping NC II", code: "HSK NC II", uploadedAt: "02 Aug 2026", outcome: "partial" },
  { id: "eim-2", title: "Electrical Installation and Maintenance NC II", code: "EIM NC II", uploadedAt: "28 Jul 2026", outcome: "failed" },
  { id: "drs-2", title: "Dressmaking NC II", code: "DRS NC II", uploadedAt: "22 Jul 2026", outcome: "complete" },
  { id: "coo-2", title: "Cookery NC II", code: "COO NC II", uploadedAt: "05 Aug 2026", outcome: "partial" },
  { id: "acp-2", title: "Agricultural Crops Production NC II", code: "ACP NC II", uploadedAt: "19 Jul 2026", outcome: "failed" },
  { id: "smaw-2", title: "Shielded Metal Arc Welding NC II", code: "SMAW NC II", uploadedAt: "13 Aug 2026", outcome: "none" },
];

export const OUTCOME_LABEL: Record<RunOutcome, string> = {
  complete: "COMPLETE",
  partial: "PARTIAL",
  failed: "RUN FAILED",
  none: "NO RUNS",
};

export const OUTCOME_BADGE: Record<RunOutcome, string> = {
  complete: "badge--succeeded",
  partial: "badge--partial",
  failed: "badge--job-failed",
  none: "badge--queued",
};

/* ---- sources ------------------------------------------------------------------ */

/* Only two roles. PLAN.md §1 cuts the vector store and marks the exemplar corpus
   SUPERSEDED, so the "Reference" role the Figma design shows has nothing behind it. */
export type SourceRole = "tr" | "cbc";

export type Source = {
  role: SourceRole;
  filename: string;
  detail: string;
};

/* Derived from the project so a project's Sources page names that project's files. A const
   list meant every project displayed Organic Agriculture's TR and CBC. */
export function sourcesFor(project: Project): Source[] {
  if (project.outcome === "none") return [];
  const name = project.title.replace(/ NC I+$/, "");
  return [
    {
      role: "tr",
      filename: `TR — ${project.title}.pdf`,
      detail: "91 pages · 11 units of competency · text layer present",
    },
    {
      role: "cbc",
      filename: `Enhanced CBC — ${name}.docx`,
      detail: "64 pages · 11 modules · parsed with python-docx",
    },
  ];
}

export const ROLE_LABEL: Record<SourceRole, string> = { tr: "TR", cbc: "CBC" };

/* CBC is .docx only - python-docx cannot read a PDF (BUILD_CHECKLIST.md §3). */
export const ROLE_ACCEPT: Record<SourceRole, string> = {
  tr: ".pdf",
  cbc: ".docx",
};

/* ---- parsed structure (GET /projects/{id}/structure) --------------------------- */

export type LearningOutcome = { id: string; title: string; criteria: number };

export type UnitOfCompetency = {
  id: string;
  code: string;
  title: string;
  kind: "Core" | "Common" | "Basic";
  los: LearningOutcome[];
};

export const UNITS: UnitOfCompetency[] = [
  {
    id: "agri12301",
    code: "AGR612301",
    kind: "Core",
    title: "Raise organic chicken",
    los: [
      { id: "LO-1", title: "Select healthy chicks", criteria: 5 },
      { id: "LO-2", title: "Prepare brooding tools and equipment", criteria: 6 },
      { id: "LO-3", title: "Perform pre-operative checks", criteria: 4 },
      { id: "LO-4", title: "Conduct chicken health care programme", criteria: 7 },
      { id: "LO-5", title: "Harvest and market chicken", criteria: 5 },
    ],
  },
  {
    id: "agri12302",
    code: "AGR612302",
    kind: "Core",
    title: "Produce organic fertilizer",
    los: [
      { id: "LO-1", title: "Prepare composting area", criteria: 4 },
      { id: "LO-2", title: "Collect and prepare raw materials", criteria: 5 },
      { id: "LO-3", title: "Carry out composting", criteria: 6 },
      { id: "LO-4", title: "Harvest and store compost", criteria: 4 },
    ],
  },
];

/* align_sources surfaces these instead of guessing (PLAN.md §2, BUILD_CHECKLIST.md §3). */
export const UNMATCHED = [
  {
    side: "TR" as const,
    label: "Element 5 — Dispose of farm waste",
    note: "no Learning Outcome in the CBC matched this element",
  },
];

/* ---- run --------------------------------------------------------------------- */

export type StepStatus =
  | "succeeded"
  | "running"
  | "waiting"
  | "retrying"
  | "failed"
  | "awaiting_review";

export type Step = {
  name: string;
  lo?: string;
  status: StepStatus;
  phrase: string;
  meta: string;
};

/* No Retriever step: retrieval was cut, so a row for it would report on a node the graph
   never runs. The awaiting_review halt that PLAN.md §2 requires is here instead.

   Built as a function of `approved` so that approving on the Review screen actually
   releases the halt on Run Progress, rather than the two screens contradicting each
   other. */
export function runSteps(approved: boolean): Step[] {
  const upTo: Step[] = [
    { name: "Parse TR", status: "succeeded", phrase: "succeeded", meta: "4s" },
    { name: "Parse CBC", status: "succeeded", phrase: "succeeded", meta: "1s" },
    { name: "Align sources", status: "succeeded", phrase: "succeeded — 1 unmatched", meta: "0s" },
    { name: "Session Plan", lo: "LO-1", status: "succeeded", phrase: "succeeded", meta: "11s" },
    { name: "Session Plan", lo: "LO-2", status: "succeeded", phrase: "succeeded on retry", meta: "(2/2)" },
    { name: "Session Plan", lo: "LO-3", status: "succeeded", phrase: "succeeded", meta: "9s" },
    { name: "Session Plan", lo: "LO-4", status: "succeeded", phrase: "succeeded", meta: "10s" },
    { name: "Session Plan", lo: "LO-5", status: "succeeded", phrase: "succeeded", meta: "8s" },
  ];

  if (!approved) {
    return [
      ...upTo.slice(0, 4),
      { name: "Session Plan", lo: "LO-2", status: "retrying", phrase: "failed validation, retrying", meta: "(1/2)" },
      { name: "Session Plan", lo: "LO-3", status: "running", phrase: "drafting", meta: "running" },
      { name: "Session Plan", lo: "LO-4", status: "waiting", phrase: "waiting", meta: "—" },
      { name: "Session Plan", lo: "LO-5", status: "waiting", phrase: "waiting", meta: "—" },
      { name: "Review", status: "awaiting_review", phrase: "waiting for you to approve the plan", meta: "paused" },
      { name: "CBLM Sections", status: "waiting", phrase: "waiting", meta: "—" },
      { name: "Validate", status: "waiting", phrase: "waiting", meta: "—" },
      { name: "Export", status: "waiting", phrase: "waiting", meta: "—" },
    ];
  }

  return [
    ...upTo,
    { name: "Review", status: "succeeded", phrase: "approved — job resumed", meta: "0s" },
    { name: "CBLM Sections", status: "running", phrase: "drafting the approved plan's topics", meta: "running" },
    { name: "Validate", status: "waiting", phrase: "waiting", meta: "—" },
    { name: "Export", status: "waiting", phrase: "waiting", meta: "—" },
  ];
}

export const JOB_ID = "3f9a1c2e";

/* ---- session plan (for Review) ------------------------------------------------ */

export type TopicRow = {
  number: string;
  content: string;
  subtopics: string[];
  methods: string[];
  presentation: string;
  practice: string;
  feedback: string;
  resources: string[];
  time: string;
};

export const SESSION_PLAN: { lo: string; title: string; rows: TopicRow[] } = {
  lo: "LO-1",
  title: "Select healthy chicks",
  rows: [
    {
      number: "1.1.1",
      content: "Characteristics of healthy day-old chicks",
      subtopics: ["Physical indicators", "Common defects"],
      methods: ["Active lecture", "Demonstration"],
      presentation: "Illustrated walk-through of healthy vs. culled chicks",
      practice: "Sorting exercise against a graded sample tray",
      feedback: "Checklist review with the trainer",
      resources: ["Sample chicks", "Sorting tray", "Grading checklist"],
      time: "1.5 hrs",
    },
    {
      number: "1.1.2",
      content: "Breed selection for organic production",
      subtopics: ["Native breeds", "Stocking density"],
      methods: ["Active lecture", "Small group discussion"],
      presentation: "Comparison of breeds against organic standards",
      practice: "Group selection of a breed for a given farm brief",
      feedback: "Peer critique, then trainer summary",
      resources: ["Breed reference sheets", "Farm brief handout"],
      time: "2 hrs",
    },
  ],
};

/* ---- results ------------------------------------------------------------------ */

export type DocStatus = "ok" | "missing";

export type ResultDoc = { label: string; status: DocStatus; note?: string };

export type ResultGroup = {
  lo: string;
  title: string;
  docs: ResultDoc[];
};

/* Keyed off the project's outcome. A const list meant every project rendered the same
   completed-with-gaps run — including ones badged NO RUNS, which is exactly the
   green-over-a-gap dishonesty USER_FLOWS §3 exists to prevent. It also left the empty
   state unreachable, though USER_FLOWS §5 claims it is covered. */
export function resultsFor(outcome: RunOutcome): ResultGroup[] {
  if (outcome === "none" || outcome === "failed") return [];
  if (outcome === "complete") {
    return PARTIAL_GROUPS.map((g) => ({
      ...g,
      docs: g.docs.map((d) => ({ label: d.label, status: "ok" as DocStatus })),
    }));
  }
  return PARTIAL_GROUPS;
}

const PARTIAL_GROUPS: ResultGroup[] = [
  {
    lo: "LO-1",
    title: "Select healthy chicks",
    docs: [
      { label: "Session Plan", status: "ok" },
      { label: "Information Sheet", status: "ok" },
      { label: "Task Sheet", status: "ok" },
      { label: "Self-Check", status: "ok" },
      { label: "Answer Key", status: "ok" },
    ],
  },
  {
    lo: "LO-3",
    title: "Perform pre-operative checks",
    docs: [
      { label: "Session Plan", status: "ok" },
      { label: "Information Sheet", status: "ok" },
      {
        label: "Task Sheet",
        status: "missing",
        note: "not generated, validation failed after 2 retries",
      },
      { label: "Self-Check", status: "ok" },
      { label: "Answer Key", status: "ok" },
    ],
  },
  {
    lo: "LO-4",
    title: "Conduct chicken health care programme",
    docs: [
      { label: "Session Plan", status: "ok" },
      { label: "Information Sheet", status: "ok" },
      { label: "Task Sheet", status: "ok" },
      { label: "Self-Check", status: "ok" },
      {
        label: "Answer Key",
        status: "missing",
        note: "not generated, validation failed after 2 retries",
      },
    ],
  },
];
