# LAB-Guard - Exam Monitoring System

LAB-Guard is a Windows desktop exam proctoring system built with Electron + React, with a Python camera-monitoring pipeline for real-time violation detection.

## Project Structure

```text
LAB-Guard/
├── backend/
│   ├── app/                        # Electron main process
│   ├── services/                   # Node/Electron backend services
│   ├── scripts/                    # Backend utility/setup scripts
│   ├── camera_monitoring/          # Python CV/ML monitoring module
│   └── data/                       # SQLite runtime data
├── frontend/
│   ├── src/                        # React + TypeScript UI
│   ├── public/                     # Static assets + face-api models
│   └── build/                      # React production build output
├── docs/camera-monitoring/         # Camera module documentation
├── scripts/                        # Root helper scripts (dev/start/rebuild/reset)
├── config/                         # App configuration
├── data/                           # App screenshot/output data
├── package.json                    # Root dependencies + scripts
└── python_requirements.txt         # Python dependencies (camera module)
```

## Prerequisites

- Windows 10/11
- Node.js 14+
- Webcam (for camera and face verification flows)
- Python 3.9, 3.10, or 3.11 (camera-monitoring compatibility target)

## Quick Start

```bash
npm install
npm run dev
```

`npm run dev` starts:
- React dev server (port `3001` via `scripts/start-react.js`)
- Electron main process (via `scripts/start-electron.js`)

## Production

```bash
npm run build
npm start
```

## Camera Monitoring Setup

First-time setup:

```bash
npm run setup-camera
```

This script:
- finds Python 3.9-3.11
- installs packages from `python_requirements.txt`
- verifies required Python imports
- ensures YOLOv8n model exists in `backend/camera_monitoring/models/`
- validates camera access

Standalone camera processor test:

```bash
npm run test-camera
```

## Available Root Scripts

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

## Core Features

- JWT-based authentication and role-based access (Admin/Teacher/Student)
- Face-based verification flow
- Desktop monitoring via Windows API integration
- Screenshot capture + violation/event logging
- Real-time camera monitoring with:
  - phone detection (YOLOv8n)
  - person counting
  - face/head-pose analysis
  - gaze estimation
  - blink detection

## Tech Stack

- Frontend: React 19 + TypeScript
- Desktop shell/backend: Electron + Node.js
- Database: SQLite
- Camera module: Python + OpenCV + MediaPipe + Ultralytics YOLOv8

## Documentation

Camera monitoring docs:
- [User Guide](docs/camera-monitoring/USER_GUIDE.md)
- [Configuration](docs/camera-monitoring/CONFIGURATION.md)
- [Testing Guide](docs/camera-monitoring/TESTING_GUIDE.md)
- [Requirements](docs/camera-monitoring/REQUIREMENTS.md)
- [Design](docs/camera-monitoring/DESIGN.md)
- [Tasks](docs/camera-monitoring/TASKS.md)
- [Python Setup](docs/camera-monitoring/PYTHON_SETUP.md)
- [Python 3.11 Setup Notes](docs/camera-monitoring/PYTHON_311_SETUP.md)

Project blogs:
- [Architecture + Problem Framing](blog/Blog_1_Architecture_Problem.md)
- [Production Pitfalls](blog/Blog_2_Production_Pitfalls.md)
- [Ethical Considerations](blog/Blog_3_Ethical_Elephant.md)
- [Real-Time AI Proctoring Build Notes](blog/Building_Real-Time_AI_Proctoring_System.md)

## Data and Security Notes

- Password hashing via `bcrypt`
- Monitoring/audit events stored in SQLite
- Camera snapshots saved under `backend/camera_monitoring/violation_snapshots/`
- App screenshots saved under `data/screenshots/`

## License

MIT (as defined in `package.json`)
