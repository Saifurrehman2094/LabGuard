# LAB-Guard - AI-Assisted Exam Monitoring and Code Evaluation

LAB-Guard is a Windows desktop proctoring and assessment system built with Electron and React. It combines desktop monitoring, camera-based violation detection, face verification, and an AI-assisted code-evaluation pipeline for C++ programming exams.

## What the System Includes

- Desktop exam app with role-based login (`Admin`, `Teacher`, `Student`)
- Face-auth flows and model diagnostics in the frontend
- Windows activity monitoring and screenshot evidence capture
- Python camera monitoring pipeline for real-time behavior detection
- Code evaluation module with weighted test cases, static signals, and teacher-facing AI summaries

## Tech Stack

- Frontend: `React 19`, `TypeScript`, `react-scripts`
- Desktop app shell: `Electron 38`
- Backend services: `Node.js` (Electron main-process services)
- Database: `SQLite` via `better-sqlite3`
- Authentication: `JWT` + `bcrypt`
- Native/OS integration: `koffi` (Windows API bridge)
- Camera AI pipeline: `Python 3.9-3.11`, `OpenCV`, `MediaPipe`, `Ultralytics`

## AI/ML Models Used

### Camera and Face Models

- `YOLOv8n` (`backend/camera_monitoring/models/`) for object detection (including phone detection)
- `face-api.js` models (downloaded into `frontend/public/models/`):
  - Tiny Face Detector
  - Face Landmark 68
  - Face Recognition

### LLM Models (Code Evaluation Module)

- Primary provider: `Groq` using model `llama-3.3-70b-versatile`
- Fallback provider: `Gemini` using model `gemini-flash-latest`
- Provider routing supports `auto` (Groq first, Gemini fallback), or forced provider selection

## Main Modules

### `backend/services`

- `auth.js`: authentication and role checks
- `database.js`: SQLite access layer and schema operations
- `monitoringService.js`, `monitoringController.js`, `monitoring.js`: monitoring orchestration
- `windowsMonitorService.js`, `windowsApi.js`, `applicationDetector.js`: desktop activity detection
- `screenshotService.js`: screenshot capture and storage
- `cameraMonitoringService.js`: bridge from Electron/Node to Python camera processor
- `faceRecognition.js`: face verification helpers
- `pdfTextExtractor.js`: exam PDF parsing/extraction
- `llmTestCaseService.js`: AI test-case generation and summary generation
- `codeEvalService.js`, `codeAnalysisService.js`: compile/run/evaluate C++ submissions and analysis

### `backend/camera_monitoring`

- `camera_processor.py`: primary camera monitoring process
- `detectors/object_detector.py`: YOLO-based detection
- `detectors/face_analyzer.py`: face/pose/blink analysis
- `detectors/gaze_estimator.py`: gaze-direction estimation
- `config.py`, `run_processor.py`: runtime configuration and launcher

### `frontend/src/components`

- `TeacherDashboard.tsx`, `StudentDashboard.tsx`, `AdminPanel.tsx`
- `CodeQuestionsTab.tsx`, `CodeEvaluationTab.tsx`
- `FaceAuth.tsx`, `FaceCapture.tsx`, `ModelDiagnostics.tsx`
- `ViolationsTab.tsx`, `CameraLogWindow.tsx`, `ScreenshotViewer.tsx`

## Project Structure

```text
LAB-Guard/
├── backend/
│   ├── app/                        # Electron main/preload
│   ├── services/                   # Node/Electron services
│   ├── scripts/                    # Setup/util scripts
│   ├── camera_monitoring/          # Python AI monitoring module
│   └── data/                       # Runtime DB/config artifacts
├── frontend/
│   ├── src/                        # React + TypeScript UI
│   └── public/models/              # face-api model files
├── Iteration3Testing/              # Code-evaluation validation docs/scripts
├── scripts/                        # Root helper scripts
├── data/                           # App evidence output
├── package.json
└── python_requirements.txt
```

## Prerequisites

- Windows 10/11
- Node.js 18+ (recommended for modern Electron toolchain)
- Python 3.9, 3.10, or 3.11 (camera module compatibility target)
- `g++` available in PATH (required for C++ code evaluation)
- Webcam (for camera and face verification features)

## Setup and Run

Install dependencies:

```bash
npm install
```

Run development mode (Electron + React):

```bash
npm run dev
```

Production run:

```bash
npm run build
npm start
```

## Camera Monitoring Setup

First-time setup:

```bash
npm run setup-camera
```

This setup script:

- Detects compatible Python (3.9-3.11)
- Installs `python_requirements.txt` dependencies
- Verifies required Python imports
- Ensures YOLO model assets are present
- Validates camera access

Standalone camera processor test:

```bash
npm run test-camera
```

## Code Evaluation Module

Implemented flow (see `Iteration3Testing/README.md` for full verification notes):

- Teacher uploads PDF and extracts/refines code questions
- Teacher defines per-question constraints (`required_loop`, `required_recursion`, `max_loop_nesting`, `expected_complexity`)
- AI generates test cases (with robust JSON parsing and input normalization)
- Student submits C++ solution
- System compiles (`g++ -std=c++17`) and runs weighted test cases with timeout controls
- Backend computes correctness, requirement checks, complexity signal, and hardcoding suspicion
- Teacher reviews evidence and can generate AI summary with manual score override as final authority

## NPM Scripts

```bash
npm start
npm run start:dev
npm run start:prod
npm run start:full
npm run dev
npm run dev:electron
npm run dev:react
npm run build
npm run build:electron
npm run dist
npm test
npm run rebuild
npm run reset-db
npm run download-models
npm run setup-camera
npm run test-camera
npm run cleanup-db
npm run clear-audit-logs
npm run electron-rebuild
```

## Security and Data Notes

- Passwords are hashed with `bcrypt`
- JWT is used for authenticated access
- Monitoring and audit events are persisted in SQLite
- Camera violation snapshots are stored under `backend/camera_monitoring/violation_snapshots/`
- Desktop screenshots are stored under `data/screenshots/`
- LLM keys can be provided via environment variables or `backend/data/llm-config.json` (local, gitignored)

## License

MIT (as declared in `package.json`)
