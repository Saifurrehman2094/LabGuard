# Programming Test Case Generation – Feature Spec

## Overview

Teachers upload exam documents (PDF) containing programming questions. The system extracts questions, generates test cases (input/output pairs), and runs student code in a sandbox against those test cases for auto-grading.

---

## Flow

```
Teacher uploads PDF → Extract programming questions → Generate test cases (API) → Store in DB
                                                                                    ↓
Student takes exam → Writes code → Submits → Run in sandbox (Judge0) → Compare output → Grade
```

---

## 1. PDF Upload & Question Extraction

### Current State
- Teacher already uploads PDF when creating exam (ExamCreationForm)
- PDF stored in `backend/data/uploads/`
- `pdfjs-dist` used for viewing

### Enhancement
- **Extract text** from PDF (pdfjs-dist can do this)
- **Detect programming questions** – look for patterns:
  - "Write a function that..."
  - "Implement..."
  - Code blocks (```)
  - Input/Output examples in text
- **Parse question structure** – problem statement, sample I/O, constraints

### Optional: AI-assisted extraction
- Use free tier of **OpenAI API** or **Hugging Face** to parse questions from raw text
- Or use **regex/heuristics** for structured question formats

---

## 2. Test Case Generation

### Options (Free APIs / Tools)

| Option | Type | Free Tier | Use Case |
|--------|------|-----------|----------|
| **Judge0 CE** | Code execution | Yes (ce.judge0.com) | Run code, get output for given input |
| **OpenAI API** | AI | Limited free credits | Generate test cases from question text |
| **Hugging Face Inference** | AI | Free | Generate test cases |
| **Heuristic rules** | Local | Free | Parse "Input: X, Output: Y" from PDF text |

### Recommended Approach

**Phase A – Heuristic (no API):**
- Parse "Sample Input" / "Sample Output" from PDF text
- Teacher can manually add test cases in UI
- Store as `{ input: string, expectedOutput: string }[]`

**Phase B – AI-assisted (free API):**
- Send question text to **Hugging Face Inference API** (free) or **OpenAI** (free tier)
- Prompt: "Given this programming question, generate 5 test cases as JSON: [{input, expectedOutput}]"
- Validate and store

**Phase C – Execution-based (Judge0):**
- Use **Judge0 CE** (free at ce.judge0.com) to run reference solution
- Generate random inputs, run solution, capture output as expected
- Requires teacher to provide reference solution (optional)

---

## 3. Code Execution Sandbox

### Judge0 CE (Recommended – Free)

- **URL:** https://ce.judge0.com/
- **Docs:** https://ce.judge0.com/
- **Features:**
  - 60+ languages (Python, Java, C++, JavaScript, etc.)
  - Sandboxed execution
  - Custom stdin
  - Time/memory limits
  - Free public API (rate limited)

### Flow
1. Student submits code (e.g. Python)
2. For each test case: send `{ source_code, stdin: testInput }` to Judge0
3. Get `stdout` from response
4. Compare `stdout` with `expectedOutput` (trim, normalize newlines)
5. Pass/Fail per test case → aggregate score

### Sandboxing
- Judge0 runs code in isolated containers
- No need for local sandbox – API handles it
- Rate limits: respect Judge0 CE limits (check their docs)

---

## 4. Database Schema Additions

```sql
-- Programming questions (extracted from exam PDF or added manually)
CREATE TABLE programming_questions (
  question_id TEXT PRIMARY KEY,
  exam_id TEXT NOT NULL,
  title TEXT,
  problem_text TEXT,
  sample_input TEXT,
  sample_output TEXT,
  language TEXT DEFAULT 'python',
  time_limit_seconds INTEGER DEFAULT 2,
  memory_limit_mb INTEGER DEFAULT 256,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (exam_id) REFERENCES exams(exam_id)
);

-- Test cases for each question
CREATE TABLE question_test_cases (
  test_case_id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL,
  input_data TEXT NOT NULL,
  expected_output TEXT NOT NULL,
  is_sample BOOLEAN DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (question_id) REFERENCES programming_questions(question_id)
);

-- Student code submissions
CREATE TABLE code_submissions (
  submission_id TEXT PRIMARY KEY,
  exam_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  source_code TEXT NOT NULL,
  language TEXT NOT NULL,
  passed_count INTEGER DEFAULT 0,
  total_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending',  -- pending, running, completed, failed
  submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (exam_id) REFERENCES exams(exam_id),
  FOREIGN KEY (question_id) REFERENCES programming_questions(question_id),
  FOREIGN KEY (student_id) REFERENCES users(user_id)
);

-- Per-test-case results
CREATE TABLE submission_results (
  result_id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL,
  test_case_id TEXT NOT NULL,
  passed BOOLEAN NOT NULL,
  actual_output TEXT,
  execution_time_ms INTEGER,
  error_message TEXT,
  FOREIGN KEY (submission_id) REFERENCES code_submissions(submission_id),
  FOREIGN KEY (test_case_id) REFERENCES question_test_cases(test_case_id)
);
```

---

## 5. Free APIs Summary

| API | Purpose | Free Tier |
|-----|---------|-----------|
| **Judge0 CE** | Execute code in sandbox | Yes – public API |
| **Hugging Face Inference** | Generate test cases from question text | Free |
| **OpenAI API** | Same as above | Limited free credits |
| **pdfjs-dist** (existing) | Extract text from PDF | N/A (local) |

---

## 6. Implementation Phases

### Phase 1 – Manual Test Cases
- Add UI for teacher to add programming questions to an exam
- Teacher manually enters test cases (input, expected output)
- Student writes code in text area
- Backend calls Judge0 to run code, compare output
- Show pass/fail per test case

### Phase 2 – PDF Extraction
- Extract text from uploaded PDF
- Simple pattern matching for "Input:" / "Output:" blocks
- Auto-create test cases from extracted samples

### Phase 3 – AI Test Case Generation
- Integrate Hugging Face or OpenAI
- Send question text → get JSON test cases
- Teacher can review/edit before saving

### Phase 4 – Full Integration
- Link to monitoring (existing)
- Export results with violations
- Rich code editor (Monaco) for students

---

## 7. Judge0 CE Quick Start

**No API key required** – public instance at `https://ce.judge0.com/` with rate limits.

### Synchronous (wait for result)

```javascript
// Use wait=true to get result immediately (no polling)
const response = await fetch(
  'https://ce.judge0.com/submissions?base64_encoded=false&wait=true',
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      source_code: 'print(input())',
      language_id: 71,  // Python 3
      stdin: 'Hello'
    })
  }
);
const result = await response.json();
// { stdout: 'Hello\n', status: { id: 3 } }  // 3 = Accepted
```

### Languages
- `GET https://ce.judge0.com/languages` – list all supported languages
- Python 3 = 71, JavaScript = 63, Java = 62, C++ = 54, etc.

---

## 8. Security Notes

- **Never execute student code locally** – use Judge0 sandbox
- **Rate limit** – respect Judge0 limits; queue submissions if needed
- **Input validation** – sanitize code before sending (no eval of user input in your backend)
- **Timeouts** – set low time_limit for each run (e.g. 2 seconds)

---

## Next Steps

1. Add `programming_questions` and `question_test_cases` tables
2. Create backend service: `CodeExecutionService` (Judge0 client)
3. Add teacher UI: "Add Programming Question" + "Add Test Case"
4. Add student UI: code editor + Run/Submit
5. Implement Phase 1 (manual test cases) first
6. Add PDF extraction (Phase 2) when ready
