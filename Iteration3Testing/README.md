# Iteration 3 Testing (Code Evaluation Module)

This folder documents and verifies the **current implemented behavior** of the LabGuard code evaluation module.

This README is intentionally practical: it explains the exact workflow, criteria, and how to manually verify the full pipeline from exam creation to AI summary.

---

## 1) Final Module Workflow (as implemented)

### Step A: Teacher creates exam, uploads PDF, extracts questions
- Teacher uploads exam PDF.
- System extracts text and candidate questions.
- Teacher reviews/edits extracted questions.

### Step B: Teacher defines constraints per question
In **Code Questions** tab, each question supports `constraints_json` with:
- `required_loop` (boolean)
- `required_recursion` (boolean)
- `max_loop_nesting` (number; 0 means no limit)
- `expected_complexity` (string, e.g. `O(n)`, `O(n^2)`)

These are saved on the `exam_questions` table and are used during evaluation.

### Step C: Teacher generates/edits test cases
- LLM generation uses Groq (primary) with Gemini as automatic fallback.
- Includes fault-tolerant JSON parsing and automatic input normalization (bracket arrays → stdin format).
- If expected outputs are missing from LLM response, a batch AI prediction fills them and marks for teacher review.
- While generating test cases, teacher constraints are appended as a hint to the LLM prompt.
- Teacher can manually edit/save test cases (`basic`, `hidden`, `edge`, etc. via flags/metadata).

### Step D: Student submits C++ solution
- Student submits `.cpp` in exam submission.
- Evaluator compiles (`g++ -std=c++17`) and runs in sandbox process with timeout.

### Step E: Evaluation computes correctness + analysis signals
- Per-test pass/fail is saved.
- Category stats are built (basic/hidden/edge/metadata category).
- Requirement checks and heuristics run on source.
- Hardcoding suspicion and near-correct indicators are computed.
- Results are persisted in:
  - `analysis_breakdown_json`
  - `requirement_checks_json`
  - `hardcoding_flags_json`

### Step F: Teacher reviews results and optional AI summary
- Teacher sees all evidence in **Code Evaluation** detail panel.
- Teacher can click **Generate summary** to get AI-assisted 5–6 line feedback.
- If LLM fails/rate-limits, fallback summary is generated.
- Teacher remains final authority via manual score override.

---

## 2) Criteria and Signals (exactly what code uses)

## Correctness
- Each test case has weight.
- Submission score = sum of passed test weights.
- `max_score` = sum of all test weights.

## Output comparison (tolerance rules)
Comparison passes if **any** of the following match:
1. Exact match after newline normalization + trimEnd.
2. Line-trimmed whitespace-only difference.
3. Case-insensitive match (if enabled by metadata/options).
4. Float epsilon token comparison (if epsilon is configured).

If none match, result is `output_mismatch`.

## Requirement checks
From source analysis:
- `loop_detected` (for/while/do presence)
- `recursion_detected` (AST-based if clang available, otherwise heuristic self-call detection)
- `loop_nesting_max`
- `loop_count`

Constraint violations currently flagged as unmet requirements:
- `loop_required_but_missing`
- `recursion_required_but_missing`
- `loop_nesting_exceeds_limit`

## Time complexity signal (heuristic)
Current estimator is loop-nesting-based:
- nesting <= 0 -> `O(1)`
- nesting = 1 -> `O(n)`
- nesting = 2 -> `O(n^2)`
- nesting >= 3 -> `O(n^3+)`

Then it compares estimated complexity against teacher’s `expected_complexity` and sets:
- `complexity.met = true/false/null`

Important:
- This is explicitly a **heuristic teacher signal**, not a formal Big-O proof.

## Hardcoding suspicion
Current reasons are produced from:
1. Static suspicious patterns:
   - `large_if_else_chain` (if count >= 10)
   - `many_numeric_literals` (numeric literals >= 40)
   - `literal_mapping_pattern` (regex for mapping-like literal structures)
2. Behavioral mismatch:
   - `fails_hidden_after_basic_pass`
   - `fails_all_edge_cases`

Suspicion level:
- `high` if reasons >= 3
- `medium` if reasons >= 1
- `low` otherwise

## Near-correct indicator
`near_correct = (pass_rate >= 0.8) AND (failed_examples.length <= 2)`

Where:
- `pass_rate = score / max_score`
- `failed_examples` stores up to first 5 mismatch samples for explainability.

---

## 3) UI Evidence (what teacher sees)

Evaluation detail panel shows:
- Category stats (`passed/total` per category)
- Requirement checks (loop/recursion, detection source)
- Complexity section:
  - expected complexity
  - estimated complexity
  - complexity met (Yes/No/N/A)
- Hardcoding suspicion level + reasons
- Near-correct indicator
- AI-assisted summary + confidence + timestamp

Also shown:
- Analyzer runtime mode:
  - AST recursion mode available (if clang found), else heuristic fallback.

---

## 4) LLM Setup (free-tier only)

### Groq key (primary – recommended)
- Env var: `GROQ_API_KEY`
- Or local file: `backend/data/llm-config.json` (gitignored), key `groqApiKey`
- Model: `llama-3.3-70b-versatile` (free tier with generous rate limits)
- Includes automatic retry with backoff on 429 rate-limit responses (up to 3 attempts)

### Gemini key (fallback)
- Env var: `GEMINI_API_KEY` or `GOOGLE_API_KEY`
- Or local file: `backend/data/llm-config.json`, key `geminiApiKey`
- Used automatically when Groq is unavailable or fails

### Routing
- Default provider is `auto`: tries Groq first, falls back to Gemini.
- Teachers can also force `groq` or `gemini` individually if needed.
- HuggingFace support has been removed.

No paid APIs are required.

---

## 5) Automated Verification Scripts

### PDF extraction
```bash
npx electron Iteration3Testing/phase2-verify.js
```
Expected:
- sample PDF created
- extracted full text
- candidate split questions

### LLM test-case generation parsing (+optional live)
```bash
npx electron Iteration3Testing/phase3-verify.js
npx electron Iteration3Testing/phase3-verify.js --live
```
Expected:
- mock parsing passes
- live call passes if key exists; graceful message otherwise

### Strengthened analysis checks
```bash
npx electron Iteration3Testing/phase4-verify.js
```
Expected:
- static checks pass
- tolerant comparator checks pass

---

## 6) End-to-End Manual Test (recommended demo script)

1. Start app:
```bash
npm run start:dev
```

2. Login as teacher/admin.

3. Create exam and upload PDF.

4. In Code Questions:
- Extract questions from PDF.
- Save questions.
- For one question, set constraints:
  - Require loop = true
  - Require recursion = as needed
  - Max loop nesting = e.g. 1
  - Expected complexity = e.g. `O(n)`
- Save questions again.

5. Generate test cases (AI) and save them.

6. Submit student `.cpp` solution(s).

7. Run evaluation (single submission or all).

8. Open evaluation details and verify:
- category stats populated,
- loop/recursion checks populated,
- expected/estimated complexity and met status shown,
- hardcoding suspicion level shown,
- near-correct indicator shown.

9. Click **Generate summary**:
- if Gemini key is configured -> AI summary appears.
- if API unavailable -> fallback summary appears.

10. (Optional) set manual score override to show teacher final control.

---

## 7) Known limitations (current implementation)

- Complexity check is heuristic, not theorem-level static analysis.
- Hardcoding detection is signal-based (patterns + behavior), not plagiarism/semantic proof.
- Recursion AST check requires local `clang` binary; otherwise heuristic fallback is used.

These limitations are acceptable for a teacher-assist university project and are clearly surfaced in UI.
