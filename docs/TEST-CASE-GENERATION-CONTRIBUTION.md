# My Contribution to Test Case Generation – Panel Explanation

Use this document to explain your work to the committee. It highlights the **technical depth** and **problem-solving** behind the feature, not just "we used AI."

---

## 1. The Problem I Solved

**Before:** Teachers had to manually write every test case (input + expected output) for programming questions. This is:
- Time-consuming (5–10 minutes per question)
- Error-prone (wrong expected outputs lead to incorrect grading)
- Hard to scale (exams with 20+ questions become unmanageable)

**After:** The system generates test cases automatically from the problem statement, with **execution-verified** expected outputs.

---

## 2. Design Decision: Why Execution-Based, Not AI-Predicted?

**Key insight:** AI can hallucinate wrong outputs. If we ask the model "what is the output for input X?", it can guess incorrectly.

**My approach:**
1. AI generates a **reference solution** (correct code) + **test inputs**
2. We **run** that solution via Judge0 (sandbox) for each input
3. The **stdout** of that run becomes the expected output
4. Result: **100% correct** expected outputs, because they come from actual execution, not prediction

This is a deliberate architectural choice that improves reliability.

---

## 3. Technical Implementation – What I Built

### 3.1 AI Integration (Dual Provider)
- **Groq** (primary) – Free, fast inference
- **Gemini** (fallback) – Free tier, used when Groq fails or is unavailable
- **Unified `callAI()`** – Single interface; tries Groq first, falls back to Gemini automatically
- **Benefit:** System keeps working even if one provider is down or rate-limited

### 3.2 Robust Parsing
AI often returns invalid JSON (trailing commas, unclosed strings, markdown). I implemented:
- **`safeParseJSON()`** – Fixes common issues (trailing commas, control chars, unterminated strings)
- **`parseSolutionAndInputs()`** – Multiple strategies: TEST_INPUTS regex, JSON array extraction, regex fallbacks, problem-text examples
- **Retry logic** – Up to 2 retries with different prompts if the first attempt fails

### 3.3 Input Format Handling
For array-based problems (e.g. Trapping Rain Water, Max Product Subarray), AI sometimes returns:
- `[0,1,0,2,1,0,1,3,2,1,2,1]` (JSON format)

But the reference solution expects:
- `0 1 0 2 1 0 1 3 2 1 2 1` (space-separated, for `input().split()`)

**My solution:** `normalizeInputForStdin()` – Detects JSON array format, converts to space-separated, and retries execution. If the first run fails, we retry with normalized input and store the working format.

### 3.4 Code Execution Sandbox
- **Judge0 CE** – Industry-standard sandbox (used by many coding platforms)
- No local code execution (security)
- Supports Python, C, C++, Java, JavaScript
- Time and memory limits to prevent infinite loops

### 3.5 UI Components
- **ProgrammingQuestionsManager** – Extract from PDF, paste text, generate test cases, view/edit, 3-solutions, fill expected outputs
- **ProgrammingCodeEditor** – Student code editor with run/submit
- **Fill expected outputs** – Button to run reference solution when some expected outputs are empty (recovery mechanism)

---

## 4. Challenges I Addressed

| Challenge | Solution |
|-----------|----------|
| AI returns invalid JSON | `safeParseJSON()` with repair logic, multiple parse strategies |
| Array inputs don't match solution format | `normalizeInputForStdin()` + retry with converted input |
| Single AI provider fails | Dual provider (Groq + Gemini) with automatic fallback |
| Empty expected outputs | Retry with normalized input; "Fill expected outputs" button for manual recovery |
| Different problem types (strings, arrays, 2D) | Prompt engineering + input normalization for common cases |

---

## 5. Code Metrics (Evidence of Work)

- **`aiService.js`** – ~600 lines: AI client, parsing, normalization, retry logic
- **`codeExecutionService.js`** – Judge0 integration, output comparison
- **`ProgrammingQuestionsManager.tsx`** – Full UI for the feature
- **Database** – New tables: `programming_questions`, `question_test_cases`, `code_submissions`, `submission_results`
- **IPC handlers** – `ai:generate-test-cases`, `code:verify-test-cases-with-solution`, etc.

---

## 6. What Makes This "Real Work"

1. **Architecture** – Execution-based design is a deliberate choice, not a default
2. **Robustness** – Parsing, retries, normalization handle real-world AI output
3. **Resilience** – Dual AI providers, fallback mechanisms
4. **End-to-end** – From PDF extraction → AI generation → Judge0 execution → DB storage → student grading
5. **Documentation** – Committee explanation, setup guide, PR description

---

## 7. One-Minute Pitch for the Panel

> "I built an automatic test case generation system for programming exams. The key design choice is that we don't trust the AI to predict outputs—instead, we run a reference solution in a sandbox and use its actual output. I also added robust parsing for when the AI returns invalid JSON, input normalization for array-based problems, and a dual AI provider setup (Groq + Gemini) so the system keeps working if one fails. The feature is integrated end-to-end: teachers can extract questions from PDFs, generate test cases with one click, and students' code is auto-graded against those cases."

---

## 8. If Asked: "Did you just use ChatGPT?"

> "I used AI as a *component*—Groq and Gemini for generating solutions and inputs. But the core value is in the *system I built*: the execution-based verification, the parsing and retry logic, the input normalization, the dual-provider fallback, and the full integration with Judge0 and the exam flow. The AI generates raw content; my code ensures it's correct, parseable, and usable for grading."
