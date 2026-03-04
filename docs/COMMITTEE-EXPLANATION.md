# LAB-Guard: Complete Technical Explanation for Committee

This document provides a comprehensive overview of the LAB-Guard exam monitoring system, including architecture, technologies, and the programming test case generation feature. Use this to answer committee questions during project defense or review.

---

## 1. Project Overview

**LAB-Guard** is a desktop exam monitoring system for university computer labs. It provides:

- **Exam management** – Create exams, attach PDFs, manage programming questions
- **Proctoring** – Face authentication, screenshot monitoring, application detection
- **Programming questions** – AI-assisted question extraction and **automatic test case generation**
- **Code execution** – Run student code in a sandbox (Judge0) and auto-grade against test cases

---

## 2. Technology Stack

### 2.1 Core Framework

| Component | Technology | Purpose |
|-----------|------------|---------|
| **Desktop app** | Electron 38.x | Cross-platform desktop (Windows focus) |
| **Frontend** | React 19 + TypeScript | UI components |
| **Backend** | Node.js (inside Electron main process) | API, IPC, services |
| **Database** | SQLite (better-sqlite3) | Local data storage |

### 2.2 Key Dependencies

| Package | Version | Use |
|---------|---------|-----|
| **groq-sdk** | ^0.37.0 | AI API for question extraction & test case generation |
| **better-sqlite3** | ^11.10.0 | SQLite database |
| **bcrypt** | ^6.0.0 | Password hashing |
| **jsonwebtoken** | ^9.0.2 | JWT authentication |
| **dotenv** | ^17.3.1 | Environment variables (.env) |
| **uuid** | ^13.0.0 | Unique IDs for questions, test cases |
| **@vladmandic/face-api** | ^1.7.15 | Face recognition |
| **canvas** | ^3.2.0 | Image processing for face detection |
| **koffi** | ^2.14.1 | Native bindings (Windows API for monitoring) |
| **pdfjs-dist** | ^3.11.174 | PDF text extraction |
| **mammoth** | ^1.11.0 | Word document text extraction |

### 2.3 External Services (No API Key Required)

| Service | URL | Purpose |
|---------|-----|---------|
| **Judge0 CE** | https://ce.judge0.com | Code execution sandbox (free, public) |

### 2.4 External Services (API Key Required)

| Service | Purpose |
|---------|---------|
| **Groq API** | AI for question extraction, test case generation, 3-solutions feature |

---

## 3. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Electron Main Process                        │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────────────┐ │
│  │ AuthService │  │ DatabaseSvc  │  │ MonitoringController    │ │
│  └─────────────┘  └──────────────┘  └─────────────────────────┘ │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────────────┐ │
│  │ aiService   │  │ CodeExecSvc   │  │ FileService             │ │
│  │ (Groq)     │  │ (Judge0)     │  └─────────────────────────┘ │
│  └─────────────┘  └──────────────┘                              │
└─────────────────────────────────────────────────────────────────┘
                              │ IPC
┌─────────────────────────────────────────────────────────────────┐
│                     React Frontend (Renderer)                    │
│  ProgrammingQuestionsManager | ExamPage | AdminPanel | Login ... │
└─────────────────────────────────────────────────────────────────┘
```

- **Main process**: Runs backend services, handles IPC, never exposes Node.js to renderer
- **Preload script**: Exposes safe API via `contextBridge`
- **Renderer**: React app, no direct Node access (security)

---

## 4. Programming Test Case Generation – Complete Flow

### 4.1 Design Philosophy

We use **execution-based** expected outputs, not AI-predicted ones:

- AI generates a **reference solution** and **test inputs**
- We **run** the reference solution via Judge0 for each input
- The **stdout** of that run becomes the **expected output**
- This guarantees correctness (no AI hallucination of outputs)

### 4.2 Step-by-Step Flow

```
1. Teacher: "Generate Test Cases" (or extract from PDF)
           ↓
2. aiService.generateTestCases(questionText, language)
           ↓
3. AI (Groq, llama-3.1-8b-instant):
   - Generates reference solution (code block)
   - Generates 5–6 test inputs as JSON: [{"input": "...", "description": "..."}]
           ↓
4. parseSolutionAndInputs(): Extract code + inputs from AI response
   - Handles malformed JSON (safeParseJSON, regex fallbacks)
           ↓
5. For each test input:
   - codeExecutionService.runCode(referenceSolution, input, language)
   - POST to Judge0 CE → get stdout
   - expectedOutput = stdout.trim()
   - If failed: retry with normalizeInputForStdin(input) [array → space-separated]
           ↓
6. Return { testCases: [{input, expectedOutput, description}], referenceSolution }
           ↓
7. Frontend saves each test case to DB via addProgrammingTestCase
```

### 4.3 Key Components

| Component | File | Role |
|-----------|------|------|
| **AI Service** | `backend/services/aiService.js` | Groq API, prompts, parsing |
| **Code Execution** | `backend/services/codeExecutionService.js` | Judge0 client |
| **Database** | `backend/services/database.js` | Store questions, test cases |
| **IPC Handler** | `backend/app/main.js` | `ai:generate-test-cases` |
| **UI** | `frontend/.../ProgrammingQuestionsManager.tsx` | Buttons, tables, 3-solutions |

### 4.4 AI Prompts (Summary)

- **Question extraction**: "Extract programming questions. Return JSON array: [{id, text}]"
- **Test case generation**: "Generate solution + TEST_INPUTS. For arrays use space-separated: '0 1 0 2' not '[0,1,0,2]'"
- **3 solutions**: "Generate 3 approaches: efficient, readable, alternative"

### 4.5 Robustness Measures

1. **JSON parsing**: `safeParseJSON()` – fixes trailing commas, unterminated strings (e.g. `"input": "()[]` → `"input": "()[]"`)
2. **Input normalization**: `normalizeInputForStdin()` – converts `[0,1,0,2]` → `0 1 0 2` when Judge0 fails
3. **Retry logic**: Up to 2 retries with different prompts if AI returns invalid format
4. **Execution retry**: If run fails, retry with normalized input before giving up

---

## 5. Code Execution (Judge0)

- **URL**: `https://ce.judge0.com/submissions?base64_encoded=false&wait=true`
- **Method**: POST with `{ source_code, language_id, stdin, cpu_time_limit, memory_limit }`
- **Languages**: Python (71), C (50), C++ (54), Java (62), JavaScript (63)
- **Sandbox**: Code runs in isolated containers; no local execution
- **No API key**: Public instance, rate-limited

---

## 6. Database Schema (Relevant Tables)

```sql
programming_questions (
  question_id, exam_id, title, problem_text,
  sample_input, sample_output, language, time_limit_seconds, ...
)

question_test_cases (
  test_case_id, question_id, input_data, expected_output,
  description, is_sample, sort_order
)

code_submissions (exam_id, question_id, student_id, source_code, ...)
submission_results (submission_id, test_case_id, passed, actual_output, ...)
```

---

## 7. Security

- **Context isolation**: Renderer has no Node.js; only preload-exposed API
- **Role-based access**: Admin, teacher, student – teachers/admins for test case generation
- **Passwords**: bcrypt (12 rounds)
- **Sessions**: JWT
- **Code execution**: Only via Judge0 sandbox, never locally
- **API keys**: Stored in `.env` (gitignored)

---

## 8. Potential Committee Questions & Answers

### Q1: Why Groq instead of OpenAI?

**A:** Groq offers a free tier suitable for development and demos. The system is designed so the AI provider can be swapped (e.g. OpenAI, Gemini) by changing the client in `aiService.js`; the rest of the flow stays the same.

### Q2: Why execution-based expected outputs instead of AI-predicted?

**A:** AI can hallucinate wrong outputs. Running the reference solution in Judge0 guarantees that expected outputs are correct for the given inputs. This is more reliable for grading.

### Q3: What if Judge0 is down or rate-limited?

**A:** Test case generation will fail. Teachers can add test cases manually or use "Fill expected outputs" with a pasted solution. We could add a local fallback (e.g. Docker) in future work.

### Q4: How do you handle different input formats (e.g. arrays)?

**A:** We prompt the AI to use space-separated format. If the AI returns JSON arrays like `[0,1,0,2]`, we have `normalizeInputForStdin()` to convert to `0 1 0 2` and retry execution. We also store the normalized input when it succeeds.

### Q5: What about malicious student code?

**A:** Student code runs only in Judge0’s sandbox, not on the host machine. Judge0 uses isolated containers with time and memory limits.

### Q6: How accurate is the test case generation?

**A:** For well-defined problems (balanced brackets, trapping rain water, etc.), accuracy is high because expected outputs come from execution. Edge cases (complex 2D inputs, unusual formats) may need manual adjustment. We provide "Fill expected outputs" and manual add/edit for that.

### Q7: What languages are supported?

**A:** Python, C, C++, Java, JavaScript. Judge0 supports more; we can extend by adding language IDs in `codeExecutionService.js`.

### Q8: Where is the data stored?

**A:** SQLite at `backend/data/database.sqlite`. All data is local; no cloud storage for exam content.

---

## 9. File Reference (Quick Lookup)

| Feature | Primary Files |
|---------|---------------|
| Test case generation | `backend/services/aiService.js` (generateTestCases, parseSolutionAndInputs) |
| Code execution | `backend/services/codeExecutionService.js` |
| Programming UI | `frontend/src/components/ProgrammingQuestionsManager.tsx` |
| Exam / student code | `frontend/src/components/ExamPage.tsx`, `ProgrammingCodeEditor.tsx` |
| IPC / API | `backend/app/main.js`, `preload.js` |
| Database | `backend/services/database.js` |

---

## 10. Summary

LAB-Guard combines:

- **Electron + React** for a desktop exam app
- **Groq AI** for question extraction and test case generation
- **Judge0** for safe code execution
- **Execution-based** expected outputs for reliable auto-grading
- **Robust parsing** and input normalization for real-world AI output

The test case generation pipeline is designed to be accurate, extensible, and safe for use in an academic setting.
