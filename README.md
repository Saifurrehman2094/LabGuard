# LabGuard — AI-Powered Exam Monitoring System

> **Electron + React + Node.js** desktop application for university computer lab exam management, featuring **AI-powered programming test case generation** and automated student code evaluation.

---

## Table of Contents

- [Overview](#overview)
- [My Contribution — AI Test Case Generation](#my-contribution--ai-test-case-generation)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Setup & Installation](#setup--installation)
- [Environment Variables](#environment-variables)
- [Running the App](#running-the-app)
- [How It Works](#how-it-works)
- [Supported Problem Types](#supported-problem-types)
- [Screenshots](#screenshots)

---

## Overview

LabGuard is a desktop exam platform built for university computer labs. Teachers create exams, upload question papers (PDF/Word), and the system handles everything from student authentication (face recognition + password) to live monitoring, violation detection, and automated grading of programming submissions.

---

## My Contribution — AI Test Case Generation

This branch contains my contribution to the LabGuard project:

**AI-powered automatic test case generation and evaluation for programming questions.**

When a teacher uploads an exam PDF containing programming questions, the system:

1. **Extracts** all programming questions from the PDF using AI (Groq/Gemini)
2. **Generates** a correct reference solution for each question
3. **Generates** 5–7 diverse test cases (edge, boundary, normal cases)
4. **Executes** the reference solution via Judge0 sandbox to compute verified expected outputs
5. **Stores** test cases in the database for grading student submissions
6. **Evaluates** student submissions automatically — running their code against all test cases and scoring them

### Key files I worked on

| File | What I did |
|------|-----------|
| `backend/services/aiService.js` | Core AI logic — solution generation, test case generation, pattern subtype detection, sanity checks, retry logic |
| `backend/services/conceptDetectionService.js` | Detects programming concepts in student code (loops, recursion, arrays, pointers, patterns) and flags hardcoding |
| `backend/services/codeAnalysisService.js` | Three-check hardcoding detector (string literal, print-count, magic number) |
| `backend/services/codeExecutionService.js` | Judge0 CE integration — runs code, compares output, computes partial credit scores |
| `backend/app/main.js` | IPC handlers — wires all services into Electron's main process |
| `backend/app/preload.js` | Exposes all APIs to the React frontend |
| `frontend/src/components/ProgrammingCodeEditor.tsx` | Student-facing code editor with tabs per question, score display, progress ring, cooldown |
| `frontend/src/components/ProgrammingQuestionsManager.tsx` | Teacher UI for viewing/editing questions and test cases |
| `docs/PROBLEM-TYPES-FOR-TEST-CASE-GENERATION.md` | Documentation on which problem types work with AI generation |

---

## Features

### Teacher Side
- Upload exam PDF → questions extracted automatically
- AI generates reference solution + 5–7 test cases per question
- Test cases executed via Judge0 to get verified expected outputs
- View test cases in Table or Cards view (multi-line output displayed correctly)
- Manually add/edit/delete test cases
- **Fix Pattern Outputs** button to correct any collapsed single-line outputs
- See student submissions with scores, concept compliance, and hardcoding flags

### Student Side
- Question tabs (Q1, Q2, Q3 …) with per-question code editor
- Language selector (Python, C++, C, Java, JavaScript)
- **Run** — tests code against test cases, shows score % bar (no test case details leaked)
- **Submit** — full evaluation with score, per-question breakdown, 30s cooldown
- Animated progress ring showing total score percentage
- Concept missing / hardcoding rejection messages (intentionally vague)

### AI Evaluation Pipeline
- **20 pattern subtypes** detected and prompted individually (star triangles, diamonds, Pascal's triangle, binary patterns, etc.)
- **Concept enforcement** — solution must use the required concept (loops, recursion, 2D arrays, etc.)
- **Hardcoding detection** — 3 independent checks catch students who hardcode expected outputs
- **Partial credit** — AI logic analysis for solutions that are conceptually correct but fail edge cases
- **Retry logic** — if generated solution fails structural validation, automatically retries with a stronger prompt

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop shell | Electron 38 |
| Frontend | React 19 + TypeScript |
| Backend | Node.js (Electron main process) |
| Database | SQLite via better-sqlite3 |
| AI (primary) | Groq API — `llama-3.3-70b-versatile` |
| AI (fallback) | Google Gemini — `gemini-2.0-flash` |
| Code execution | Judge0 CE (free, no API key needed) |
| Face auth | `@vladmandic/face-api` |
| Auth | JWT + bcrypt |

---

## Project Structure

```
LabGuard/
├── backend/
│   ├── app/
│   │   ├── main.js          # Electron main process + all IPC handlers
│   │   └── preload.js       # Exposes APIs to renderer
│   ├── services/
│   │   ├── aiService.js              # AI generation + test case pipeline
│   │   ├── codeExecutionService.js   # Judge0 integration + scoring
│   │   ├── conceptDetectionService.js # Concept + hardcoding detection
│   │   ├── codeAnalysisService.js    # Hardcoding checks
│   │   └── database.js               # SQLite queries
│   └── data/
│       └── database.sqlite   # Local SQLite DB (not committed)
├── frontend/
│   └── src/
│       ├── components/
│       │   ├── ProgrammingCodeEditor.tsx      # Student code editor
│       │   ├── ProgrammingQuestionsManager.tsx # Teacher test case UI
│       │   └── ExamPage.tsx                   # Student exam page
│       └── types/
│           └── electron.d.ts   # TypeScript types for IPC APIs
├── docs/
│   └── PROBLEM-TYPES-FOR-TEST-CASE-GENERATION.md
├── .env.example              # Required environment variables
└── package.json
```

---

## Setup & Installation

### Prerequisites

- Node.js 18+ and npm
- Git

### Install

```bash
git clone https://github.com/Saifurrehman2094/LabGuard.git
cd LabGuard
git checkout programming-test-case-generation

# Install all dependencies (root + frontend)
npm run install:all
```

---

## Environment Variables

Copy `.env.example` to `.env` and fill in your keys:

```env
# Groq API (FREE) — https://console.groq.com
GROQ_API_KEY=your_groq_api_key_here

# Gemini API (FREE) — https://aistudio.google.com
GEMINI_API_KEY=your_gemini_api_key_here
```

Both APIs are **free tier** — no credit card required.  
Judge0 CE is used for code execution and requires **no API key**.

---

## Running the App

```bash
# Development mode (React dev server + Electron)
npm run dev

# Production mode
npm start
```

---

## How It Works

### Test Case Generation Pipeline

```
PDF Upload
    │
    ▼
AI extracts questions (Groq/Gemini)
    │
    ▼
For each question:
  detectProblemType()  →  e.g. 'patterns', 'recursion', 'arrays_1d'
  detectPatternSubtype() → e.g. 'star_diamond', 'number_pascal'
    │
    ▼
  generateReferenceSolutionAndInputs()
  (AI generates solution + test inputs with concept-specific prompt)
    │
    ▼
  Structural validation (≥2 loops, no hardcoded strings, no list-collect-then-join)
  → Auto-fix suppressed newlines
  → Retry with stronger prompt if validation fails
    │
    ▼
  Judge0 executes reference solution for each input
  → stdout becomes expected_output (newlines preserved exactly)
  → Failed executions: AI predicts output + sanity check → NEEDS_REVIEW if uncertain
    │
    ▼
  Saved to question_test_cases table
```

### Student Submission Pipeline

```
Student submits code
    │
    ▼
Judge0 runs code against all test cases
    │
    ▼
detectHardcoding()  →  3 checks (literal, print-count, magic number)
    │                   → Score = 0 if detected
    ▼
analyzeConcepts()   →  Checks loops, recursion, arrays, patterns, pointers
checkConceptCompliance()  →  Penalise if required concept missing
    │
    ▼
analyzeSolutionForPartialCredit()  →  AI partial credit if score < 100%
    │
    ▼
Final score = (rawScore / 100) × maxMarks
Saved to code_submissions + submission_results
Returned to student UI
```

---

## Supported Problem Types

| Category | Types |
|----------|-------|
| **Loops** | for/while loops, do-while, nested loops |
| **Conditionals** | if/else, switch/case |
| **Recursion** | factorial, Fibonacci, power, Hanoi |
| **Arrays** | 1D arrays, 2D matrices, 3D arrays |
| **Pointers** | C/C++ pointer operations |
| **Patterns** | 20 subtypes — star triangles, diamonds, butterflies, hourglasses, number triangles, Pascal's triangle, binary patterns, zero-one triangles, and more |

> See [`docs/PROBLEM-TYPES-FOR-TEST-CASE-GENERATION.md`](docs/PROBLEM-TYPES-FOR-TEST-CASE-GENERATION.md) for full details.

---

## Notes

- `backend/data/database.sqlite` is excluded from git (local data only)
- `backend/data/uploads/` is excluded from git (uploaded exam PDFs)
- The `.env` file with real API keys is excluded — use `.env.example` as template
