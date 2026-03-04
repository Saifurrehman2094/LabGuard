# Programming Questions & AI Test Case Generation

## Summary

This PR adds AI-powered programming question extraction and automatic test case generation to LAB-Guard. Teachers can extract questions from exam PDFs/Word documents, generate test cases with one click, and students' code is auto-graded against those test cases in a secure sandbox.

---

## What We Have Done

### 1. AI Question Extraction
- **Groq API** (llama-3.1-8b-instant) extracts programming questions from raw exam text
- Supports PDF and Word documents
- Returns structured JSON: `[{id, text}]` for each question

### 2. Automatic Test Case Generation
- **Execution-based approach**: AI generates a reference solution + test inputs; we **run** the solution via Judge0 to get correct expected outputs (no AI-predicted outputs)
- **Multi-language**: Python, C, C++, Java, JavaScript
- **5–6 test cases** per question covering normal, edge, and boundary cases
- **Robust parsing**: Handles malformed AI JSON (trailing commas, unterminated strings, etc.)

### 3. Code Execution Sandbox
- **Judge0 CE** (https://ce.judge0.com) – free, no API key required
- Runs student code in isolated containers
- Time limit (2s default), memory limit (256 MB)
- Supports Python, C, C++, Java, JavaScript

### 4. Input Normalization
- AI sometimes returns array inputs as JSON (`[0,1,0,2]`) but solutions expect space-separated (`0 1 0 2`)
- `normalizeInputForStdin()` converts and retries when execution fails
- Ensures test cases work for problems like Trapping Rain Water, Max Product Subarray, etc.

### 5. 3 Best Solutions Feature
- Generate 3 different approaches: efficient, readable, alternative
- Shown in tabs for teacher reference
- Same multi-language support

### 6. Fill Expected Outputs
- Button appears when test cases have empty expected outputs
- Runs reference solution via Judge0 to populate them
- Fallback for edge cases or when generation partially fails

### 7. New UI Components
- **ProgrammingQuestionsManager** – Extract from PDF, paste, generate test cases, view/edit
- **ProgrammingCodeEditor** – Student code editor with run/submit
- **ThemeToggle** – Light/dark mode
- Table and Cards view for test cases

---

## Tech Stack Added

| Component | Technology |
|-----------|------------|
| AI | Groq SDK (groq-sdk) |
| Code execution | Judge0 CE (fetch API) |
| Env config | dotenv, .env.example |

---

## Configuration

Add to `.env` (copy from `.env.example`):
```
GROQ_API_KEY=gsk_your_key_here
```
Get free key at: https://console.groq.com/

Without the key, teachers can still add questions and test cases manually.

---

## Files Changed/Added

- `backend/services/aiService.js` – AI integration
- `backend/services/codeExecutionService.js` – Judge0 client
- `frontend/src/components/ProgrammingQuestionsManager.tsx`
- `frontend/src/components/ProgrammingCodeEditor.tsx`
- `frontend/src/components/ThemeToggle.tsx`
- `docs/COMMITTEE-EXPLANATION.md` – Full technical doc for committee
- `docs/PROGRAMMING-TEST-CASE-GENERATION.md` – Feature spec
- Database schema updates for `programming_questions`, `question_test_cases`, `code_submissions`, `submission_results`

---

## Testing

1. Add `GROQ_API_KEY` to `.env`
2. Create an exam, add a programming question (or extract from PDF)
3. Click "Generate Test Cases" – verify expected outputs are filled
4. As student, write code and submit – verify auto-grading

---

## Documentation

- **Committee Q&A**: `docs/COMMITTEE-EXPLANATION.md`
- **Setup**: `SETUP.md` (updated with GROQ_API_KEY)
