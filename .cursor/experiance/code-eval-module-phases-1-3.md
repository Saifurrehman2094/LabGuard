## Code Evaluation Module – Phases 1–3 Experience Notes

This file captures key decisions, trade-offs, and pitfalls from implementing **Phases 1–3** of the code evaluation module, for future you (and future agents) and for a final write‑up.

---

## Phase 1 – Database schema & backend plumbing

**What we did**
- Added four core tables: `exam_questions`, `question_test_cases`, `code_evaluations`, `test_case_results`.
- Added indexes on exam/question/evaluation IDs for fast lookups.
- Implemented `DatabaseService` CRUD helpers for all four tables and wired deletion cascades into `deleteExam`.

**Key decisions**
- **Separate tables for questions, test cases, evaluations, results**
  - Decision: keep questions and test cases independent of submissions, and store each evaluation run plus per‑test‑case results in their own tables.
  - Why: this mirrors how online judges structure data, keeps the schema flexible (multiple evaluations per submission, manual overrides, etc.), and makes reporting queries straightforward.
- **Manual cascade logic instead of foreign-key `ON DELETE CASCADE`**
  - Decision: perform explicit deletes in `deleteExam` for `test_case_results` → `code_evaluations` → `question_test_cases` → `exam_questions`.
  - Why: existing code already used manual clean‑up; we stayed consistent and explicit, avoiding surprises from implicit cascades.
- **`manual_score` + `final_score` on `code_evaluations`**
  - Decision: store both raw auto score (`score`) and a teacher override (`manual_score`), with `final_score` recomputed as `manual_score` if present, otherwise `score`.
  - Why: keeps teacher overrides simple to apply and easy to query later without re‑deriving the logic in multiple places.

**Pitfalls & lessons**
- **Foreign key constraints can break tests if you fake IDs**  
  - When we first wrote Phase 1 tests, we tried to insert questions & evaluations using fake exam/submission IDs and hit `SQLITE_CONSTRAINT_FOREIGNKEY`.
  - Fix: create or reuse real `exam` + `exam_submissions` rows (via `createExam` + `submitExam`) inside test scripts or dev‑only IPC handlers.
- **Always recompute `final_score` whenever `score` or `manual_score` changes**
  - We initially only recomputed when `manual_score` changed. We corrected this to always recompute in `updateCodeEvaluation` to keep data consistent.

---

## Phase 2 – PDF text extraction

**What we did**
- Chose a pure JS extractor and implemented `PDFTextExtractor` to read PDFs and return:
  - `fullText` (entire document text),
  - `numPages`,
  - optional `pageTexts` array.
- Implemented a heuristic splitter (`splitCandidateQuestions`) to turn raw text into candidate questions (title + description + optional page).
- Added IPC `exam:extract-questions` and `electronAPI.extractQuestions(examId)`.
- Created **Iteration3Testing** scripts (`phase2-verify.js`) and a sample PDF to verify extraction + splitting.

**Key decisions**
- **Use `pdf-parse` (modern TypeScript implementation) instead of rolling our own `pdfjs-dist` usage**
  - Decision: `pdf-parse` as the primary extraction tool.
  - Why: it already wraps `pdfjs-dist` with higher‑level helpers and is actively maintained; good enough for demo‑quality exam PDFs and reduces code surface area.
- **Heuristic splitter rather than trying to be “smart” NLP**
  - Decision: split on patterns like `Q1:`, `Question 1`, or `1.` headings and let the teacher fix boundaries in the UI.
  - Why: perfect parsing of arbitrary PDF layouts is a deep problem; for a thesis‑demo, a simple heuristic plus human review is more reliable and much cheaper than over‑engineering.
- **Error messages emphasise “you can still add questions manually”**
  - Decision: whenever extraction fails (missing file, corrupt PDF, etc.), IPC returns a friendly error that explicitly points to the manual path.
  - Why: avoids dead‑end UX; even if the PDF is bad, the teacher is not blocked from creating questions.

**Pitfalls & lessons**
- **Library API drift / complexity**  
  - Modern `pdf-parse` is an ES module with more complex internals; blindly reading its `dist` files is noisy. We leaned on its public API rather than trying to depend on internals.
- **Heuristic splitting can over‑ or under‑split**  
  - Expect that some PDFs will not follow `Q1:` or simple numbering. The splitter is intentionally conservative and designed for teacher review, not automation without oversight.
- **Sample PDFs should live in `Iteration3Testing`, not in `backend/data`**
  - We initially wrote test PDFs under `backend/data`, which cluttered the repo. We moved them into `Iteration3Testing` and added them to `.gitignore` when generated.

---

## Phase 3 – LLM test-case generation

**What we did**
- Implemented `LLMTestCaseService` with:
  - **Primary:** Google **Gemini** via REST.
  - **Fallback:** Hugging Face **Serverless Inference API** (e.g. Llama‑3.2‑3B‑Instruct).
  - Config loading from env or `backend/data/llm-config.json` (gitignored).
  - Robust JSON extraction/parsing, normalization, and error handling.
- Added IPC `exam:generate-testcases` and `electronAPI.generateTestCases(examId, questionId, llmProvider)`.
- Added **Phase 3 verification** in `Iteration3Testing/phase3-verify.js` with:
  - **T6:** mock response + JSON parsing tests (no API needed).
  - **T7:** optional real call to Gemini (or skipped gracefully if no key).

**LLM provider decisions**
- **Primary: Gemini (`gemini-flash-latest`)**
  - Why:
    - Good free tier, no credit card, and strong performance for code/test‑case generation.
    - Official REST API is well‑documented and compatible with simple `fetch` in Node/Electron.
  - Implementation details:
    - Endpoint: `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`.
    - Model: we started with `gemini-1.5-flash` but **switched to `gemini-flash-latest`** when we hit a `404` “model not found” due to deprecation.
    - API key: `GEMINI_API_KEY` / `GOOGLE_API_KEY` (or `geminiApiKey` in `llm-config.json`).
- **Fallback: Hugging Face serverless**
  - Why:
    - Gives an alternative if the user doesn’t want Google or if Gemini limits are an issue.
    - Simple HTTP JSON interface; can swap models without changing the rest of the code.
  - Implementation details:
    - Endpoint: `https://api-inference.huggingface.co/models/meta-llama/Llama-3.2-3B-Instruct`.
    - Token: `HUGGINGFACE_TOKEN` / `HF_TOKEN` (or `huggingfaceToken` in `llm-config.json`).
    - Uses conservative generation params (low temperature, `max_new_tokens`, `return_full_text: false`).

**Prompt & parsing decisions**
- **Single‑message “combined prompt” instead of fancy role structure**
  - Decision: embed “system‑like” instructions plus question text into a single user message string.
  - Why: REST `generateContent` with v1beta is simplest to call this way, avoids uncertainty about future changes in role semantics, and still lets us strongly constrain output.
- **Strict schema + post‑processing instead of trusting “JSON mode”**
  - Decision: always:
    - Strip optional ```json ... ``` code fences.
    - Parse JSON with `JSON.parse`.
    - Accept arrays in a few shapes (`[ ... ]`, `{ testCases: [...] }`, `{ tests: [...] }`).
    - Normalize each object with `normalizeTestCase`.
  - Why: even with `responseMimeType: 'application/json'`, LLMs can still emit extra text; we treat them as unreliable string generators and strictly sanitize.
- **Shape for each test case**
  - `name`, `description`, `input`, `expectedOutput`
  - `isHidden`, `isEdgeCase`, `timeLimitMs`, `notes`
  - This is enough for UI display, evaluation, and teacher annotations without over‑designing the schema.

**Error-handling decisions**
- **Always surface clear, teacher‑friendly messages**
  - 401 / 403: explain that the API key is invalid or forbidden and point to where to create/fix keys.
  - 429: explicit “rate limit reached, please wait or continue manually” message.
  - Parse errors: “Could not parse test cases: ... You can add test cases manually.”
- **Do not hard‑fail the workflow when LLM fails**
  - IPC `exam:generate-testcases` returns `{ success: false, error, code }` rather than throwing.
  - UI is expected to keep manual test‑case editing path open regardless of LLM status.

**Pitfalls & lessons**
- **Model deprecation is real; prefer “latest” aliases where possible**
  - We hit `404` with `gemini-1.5-flash`. The fix was to switch to `gemini-flash-latest`.  
  - Lesson: check model docs/changelog and prefer stable aliases; avoid hard‑coding specific versioned IDs unless needed.
- **Testing must not depend on LLM availability**
  - T6 (mock) verifies parsing and normalization offline with a canned JSON snippet and a markdown‑wrapped variant.
  - T7 is explicitly **optional**: it runs only with `--live` and skips gracefully if no key is configured.
- **Never store real keys in the repo**
  - We added `backend/data/llm-config.json` to `.gitignore` and shipped `llm-config.example.json` as the template.
  - Iteration3Testing README clearly documents where to get keys and how to set env vars or the local config file.

---

## Cross-phase patterns & recommendations for future work

- **Keep tests and demo data in `Iteration3Testing`, not scattered across backend**
  - Makes the main app clean and keeps all verification scripts in one place.
  - Future phases (CodeEvalService, UI, dashboard) should add their tests there as well.

- **Prefer explicit, developer‑facing errors over “silent” failures**
  - For DB, PDF extraction, and LLM calls, we consistently:
    - Log a detailed error on the backend.
    - Return a **human‑readable** message and a short `code` tag (`NO_API_KEY`, `PARSE_ERROR`, etc.).

- **Document integration dependencies next to the code that needs them**
  - PDF extraction docs live in Iteration3Testing README.
  - LLM provider setup and constraints also live there, referenced from `llmTestCaseService`.
  - Future agents should follow this pattern: when adding a new external dependency (compiler, cloud service, etc.), document:
    - How to install / get keys.
    - What we used and why (trade‑offs).
    - How to run a minimal verification script.

- **When in doubt, bias toward “demo‑quality but honest” design**
  - We explicitly note that:
    - Code execution is not hardened against hostile adversaries.
    - PDF heuristic splitting is best‑effort.
    - LLM outputs are always teacher‑reviewed, not blindly trusted.
  - This is important context for a thesis write‑up and for any future work that aims to harden or productize the module.

