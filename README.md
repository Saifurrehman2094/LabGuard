# LAB-Guard

LAB-Guard is a Windows desktop exam monitoring and code-evaluation platform built with Electron and React. It combines role-based exam workflows, desktop activity monitoring, camera-based violation detection, face verification, and AI-assisted programming assessment.

## Table of Contents

- Overview
- Key Capabilities
- Architecture
- Repository Layout
- Prerequisites
- Quick Start (Fresh Clone)
- Environment Configuration
- Running the Application
- Important Pipelines
- Scripts Reference
- Troubleshooting
- Security and Data Handling
- Known Constraints
- License

## Overview

LAB-Guard is designed for controlled university/computer-lab exams. It provides:

- Admin, teacher, and student role flows
- Exam creation and submission lifecycle
- Desktop and camera proctoring signals
- Face enrollment and verification helpers
- C++ code evaluation with weighted test cases
- LLM-assisted test-case generation and teacher summaries

## Key Capabilities

### Exam and Course Management

- Course creation, enrollment, and roster views
- Exam creation, update, deletion, and publication flows
- PDF upload and question extraction pipeline

### Proctoring and Monitoring

- Active window/application monitoring on Windows
- Violation lifecycle tracking (start, update, end)
- Optional screenshot evidence capture
- Camera monitoring via Python subprocess with live status events

### Programming Evaluation

- C++ compile-and-run sandbox workflow
- Weighted test cases with per-case pass/fail storage
- Timeout handling and partial scoring
- Static requirement checks and hardcoding heuristics
- Teacher-facing analytics and evaluation detail views

### AI-Assisted Workflows

- LLM-based test-case generation from question text
- Requirement analysis (concept detection, pattern detection)
- Provider routing with Groq primary and Gemini fallback

## Architecture

- Desktop shell: Electron 38
- Frontend: React 19 + TypeScript
- Backend logic: Node.js services in Electron main process
- Database: SQLite via better-sqlite3
- Camera AI pipeline: Python (OpenCV, MediaPipe, Ultralytics)
- Face models: face-api model files under frontend public assets

High-level runtime flow:

1. Electron main process boots and initializes services.
2. Preload exposes a typed IPC bridge to the renderer.
3. React renderer drives UI and invokes backend actions over IPC.
4. Backend services persist data/events in SQLite and orchestrate monitoring/evaluation.

## Repository Layout

```text
LabGuard/
|-- backend/
|   |-- app/                    # Electron main + preload
|   |-- services/               # Auth, DB, monitoring, AI, evaluation services
|   |-- scripts/                # Camera/setup helper scripts
|   `-- camera_monitoring/      # Python camera pipeline
|-- frontend/
|   |-- src/                    # React UI components and pages
|   `-- public/models/          # face-api model files
|-- scripts/                    # Startup/rebuild/reset helper scripts
|-- data/                       # Runtime outputs (e.g., screenshots)
|-- python_requirements.txt
`-- package.json
```

## Prerequisites

- Windows 10/11
- Node.js 18+ (Node 20 LTS recommended)
- npm 9+
- Python 3.9, 3.10, or 3.11 (camera module requirement)
- Webcam (for face and camera monitoring features)
- C++ compiler in PATH (g++) for code evaluation module

## Quick Start (Fresh Clone)

1. Clone the repository.

```bash
git clone <repository-url>
cd LabGuard
```

2. Install all Node dependencies (root + frontend).

```bash
npm run install:all
```

3. Rebuild native SQLite binding for Electron.

```bash
npm run electron-rebuild
```

4. Download face-api model assets.

```bash
npm run download-models
```

5. (Optional but recommended for camera features) setup Python camera stack.

```bash
npm run setup-camera
```

6. Start in development mode.

```bash
npm run dev
```

One-command bootstrap (except API key setup):

```bash
npm run setup:quick
```

## Environment Configuration

Create a local .env file in project root when using LLM features.

```env
GROQ_API_KEY=your_groq_api_key
GEMINI_API_KEY=your_gemini_api_key

# Optional camera overrides
CAMERA_PYTHON_PATH=py
CAMERA_PYTHON_ARGS=-3.11 -m camera_monitoring.camera_processor
```

Notes:

- You can also provide keys using backend/data/llm-config.json (ignored by git).
- If no LLM key is configured, LLM test-case generation and AI summary actions will fail gracefully.

## Running the Application

Development mode (React + Electron):

```bash
npm run dev
```

Production build and run:

```bash
npm run build
npm start
```

Standalone camera processor test:

```bash
npm run test-camera
```

## Important Pipelines

### 1) Exam Creation and Question Extraction Pipeline

1. Teacher uploads exam PDF.
2. Backend file service stores file metadata.
3. PDF text extractor reads full text and page text.
4. Heuristics split candidate questions.
5. Questions are persisted and returned for teacher review/edit.

Primary modules involved:

- backend/services/files.js
- backend/services/pdfTextExtractor.js
- backend/app/main.js IPC handlers

### 2) AI Test-Case Generation Pipeline

1. Teacher triggers test-case generation for a question.
2. Requirement analysis determines required concepts/problem type.
3. LLM request is sent (Groq primary, Gemini fallback).
4. Response goes through robust JSON repair/parsing.
5. Test-case inputs are normalized for stdin compatibility.
6. Generated test cases are saved and exposed to teacher UI.

Primary modules involved:

- backend/services/llmTestCaseService.js
- backend/app/main.js exam IPC handlers
- frontend components under code-question management

### 3) C++ Code Evaluation Pipeline

1. Student submission is retrieved.
2. C++ source is materialized into a temp run directory.
3. Code is compiled with g++.
4. Executable runs against weighted test cases with timeout controls.
5. Per-test results are stored.
6. Static analysis and hardcoding checks run.
7. Evaluation summary and scores are persisted.

Primary modules involved:

- backend/services/codeEvalService.js
- backend/services/codeAnalysisService.js
- backend/services/database.js

### 4) Desktop Monitoring Pipeline

1. Exam monitoring starts with allowed application list.
2. Windows monitor polls active process/window state.
3. Unauthorized usage opens/updates violation records.
4. Optional screenshots are captured.
5. Monitoring events are persisted and emitted to UI in real time.

Primary modules involved:

- backend/services/monitoringController.js
- backend/services/windowsMonitorService.js
- backend/services/screenshotService.js
- backend/services/monitoringService.js

### 5) Camera Monitoring Pipeline

1. Electron requests camera test/start through IPC.
2. Node service spawns Python camera processor subprocess.
3. Python detector stack produces structured stdout status updates.
4. Node parses/emits updates to renderer and logs errors/exits.
5. Snapshot events are stored under camera snapshot directory.

Primary modules involved:

- backend/services/cameraMonitoringService.js
- backend/camera_monitoring/camera_processor.py
- backend/camera_monitoring/detectors/*

## Scripts Reference

Common scripts from root package.json:

- npm run dev: start React and Electron together
- npm run dev:react: start React dev server helper
- npm run dev:electron: start Electron after React health check
- npm run install:all: install root + frontend dependencies
- npm run setup:quick: install + rebuild + model download
- npm run electron-rebuild: rebuild better-sqlite3 for Electron
- npm run setup-camera: install/verify Python camera dependencies
- npm run test-camera: run Python camera processor directly
- npm run reset-db: reset local database

## Troubleshooting

### better-sqlite3 ABI mismatch (NODE_MODULE_VERSION error)

```bash
npm run electron-rebuild
```

If issue persists:

```bash
npm run install:all
npm run electron-rebuild
```

### Frontend compile/lint dependency issues after branch switch

```bash
npm run setup:frontend
```

### Camera setup fails

- Ensure Python version is 3.9-3.11
- Run npm run setup-camera and inspect the printed step that failed
- Verify webcam permission and availability

### React starts but Electron cannot connect

- Ensure port 3001 is free
- Retry npm run dev
- If needed, run React and Electron helper scripts separately for diagnostics

## Security and Data Handling

- Passwords are hashed with bcrypt.
- JWT is used for authenticated access flows.
- Runtime SQLite DB and logs are local to machine.
- Screenshot and camera violation artifacts are stored locally.
- API keys should be kept in local environment/config only (never committed).

## Known Constraints

- Windows-first monitoring implementation (Windows API integration)
- Programming evaluation path is currently C++ focused
- Camera pipeline requires supported Python environment and native packages

## License

MIT
