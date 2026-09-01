# Issue Candidates from Build Checklist

Source of truth: `/home/runner/work/tesda-cbc-agent/tesda-cbc-agent/docs/todos/BUILD_CHECKLIST.md`

Use this file to open atomic GitHub issues. Each issue should link back to the source section in `BUILD_CHECKLIST.md`.

## Contract track (BUILD_CHECKLIST §1a)

1. **Replace `GET /projects` stub with DB-backed query**  
   Done when endpoint returns persisted `Project` rows via `get_db` and `ProjectOut`.  
   Source: `/home/runner/work/tesda-cbc-agent/tesda-cbc-agent/docs/todos/BUILD_CHECKLIST.md` §1a
2. **Add `POST /projects` create endpoint**  
   Done when `{title, qualification_code?}` creates a project and returns `{id}`.  
   Source: same as above.
3. **Add CORS middleware for Gradio origin**  
   Done when allowed origin is configurable and integrated in `main.py`.  
   Source: same as above.
4. **Add projects endpoint tests**  
   Done when `backend/tests/test_projects.py` covers GET/POST behavior and DB dependency wiring.  
   Source: same as above.

## M0 smoke test (BUILD_CHECKLIST §2)

5. **Hand-label one competency as extraction ground truth**  
   Done when TR Elements→criteria mapping fixture is committed.
6. **Select structured extraction model**  
   Done when chosen model is documented in repo.
7. **Run 10x structured-output smoke test**  
   Done when 10 repeated runs are recorded.
8. **Validate criterion-to-LO attachment quality**  
   Done when attachment correctness is evaluated against ground truth.
9. **Record rate-limit behavior observations**  
   Done when pacing observations are documented.
10. **Persist M0 results in repository artifact**  
    Done when test report/output is saved under docs or tests fixture area.

## M1 parsers and alignment (BUILD_CHECKLIST §3)

11. **Implement upload storage for TR/CBC roles**
12. **Add TR text-layer guard; reject scanned PDFs**
13. **Add CBC extension guard; reject non-`.docx`**
14. **Implement TR table extraction with `pdfplumber.extract_tables()`**
15. **Add whitespace-repair pass before structuring**
16. **Implement LLM structuring to Pydantic TR models**
17. **Add Redis hash cache for TR structuring output**
18. **Implement deterministic CBC parser with `python-docx`**
19. **Implement deterministic `align_sources` (TR Element ↔ CBC LO)**
20. **Surface unmatched alignments for human confirmation**
21. **Persist `parsed_structures` cache rows**
22. **Add `GET /projects/{id}/structure` endpoint**

Done criteria for items 11–22: feature-specific tests exist and pass, and output shape is consumable by UC/LO selector flow.  
Source: `/home/runner/work/tesda-cbc-agent/tesda-cbc-agent/docs/todos/BUILD_CHECKLIST.md` §3

## M2 grounding checks (BUILD_CHECKLIST §4)

23. **Assert AC traces to TR PC or critical aspect**
24. **Assert each Critical Aspect maps to ≥1 LO**
25. **Define `RetrieverProtocol` interface**
26. **Implement default `FewShotRetriever`**
27. **Add env-gated `PineconeRetriever` stub**

Done criteria: deterministic checks fail on broken fixtures and pass on aligned fixtures.  
Source: `.../docs/todos/BUILD_CHECKLIST.md` §4

## M3–M5 LangGraph pipeline (BUILD_CHECKLIST §5)

28. **Define `PipelineState`, `LOState`, `TopicRow`**
29. **Add `HOUSE_RULES` prompt constant**
30. **Add `STYLE_SPEC` prompt constant (CBLM only)**
31. **Implement session-plan drafter node (7-column, ≥2 methods/topic)**
32. **Implement interrupt + checkpoint persistence (`jobs.checkpoint`)**
33. **Implement `POST /jobs/{id}/resume` with idempotency guard**
34. **Implement CBLM drafter over approved topics only**
35. **Implement deterministic `apply_house_rules` pass**
36. **Implement deterministic validator node**
37. **Implement bounded retry loop for validation failures**
38. **Write per-node `job_events`**
39. **Add `GET /jobs/{id}/report` coverage+validation read model**
40. **Ensure partial-success jobs continue and report honestly**
41. **Implement topology-level rate-limit pacing**

Done criteria: one competency run demonstrates parse→draft→interrupt→resume→validate/retry→report path.  
Source: `.../docs/todos/BUILD_CHECKLIST.md` §5

## M5.5/M6 export track (BUILD_CHECKLIST §6)

42. **Templatize TESDA Session Plan `.docx`**
43. **Templatize TESDA CBLM `.docx`**
44. **Render documents with `docxtpl`**
45. **Diff rendered output against originals for style fidelity**
46. **Store generated files and add download endpoints**
47. **Verify one-competency export completes cleanly**

Done criteria: generated output preserves template structure/styles and is downloadable.  
Source: `.../docs/todos/BUILD_CHECKLIST.md` §6

## M7 minimal Gradio UI (BUILD_CHECKLIST §7)

48. **Scaffold separate-process `gradio_ui/` app**
49. **Add project creation/open flow in UI**
50. **Add dual upload controls (`TR .pdf`, `CBC .docx`)**
51. **Add UC/LO selector backed by `/structure`**
52. **Add `gr.Timer` job-status polling with `awaiting_review` handling**
53. **Add review/edit + resume step on `awaiting_review`**
54. **Surface `/jobs/{id}/report` in status UI**
55. **Add `gr.DownloadButton` output flow**
56. **Keep scope minimal; preserve frozen `frontend/` untouched**

Done criteria: UI can create/open project, upload, run, pause/review/resume, and download outputs.  
Source: `.../docs/todos/BUILD_CHECKLIST.md` §7

## M8 done criteria verification (BUILD_CHECKLIST §8)

57. **Verify one-competency end-to-end with review pause/resume**
58. **Verify CBLM output tracks edited session plan**
59. **Verify complete job trace in `job_events`**
60. **Verify partial-failure representation is honest**
61. **Verify `.docx` export matches TESDA template**
62. **Verify AI-assistance disclosure is present in outputs**
63. **Verify UI path from start→review→resume→download**
64. **Verify capstone concept coverage count (≥5)**

Done criteria: each checklist assertion has evidence (test, run artifact, or demo note) linked in issue closure comment.  
Source: `.../docs/todos/BUILD_CHECKLIST.md` §8
