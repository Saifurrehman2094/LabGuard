# LAB-Guard Codebase Architecture Overview

## Executive Summary

LAB-Guard is a **Windows-based Electron desktop application** for exam administration, student monitoring, and C++ code evaluation. It uses a three-tier architecture:

- **Frontend**: React 19 + TypeScript
- **Backend**: Node.js services in Electron main process
- **Database**: SQLite via better-sqlite3
- **Python pipeline**: Camera monitoring via OpenCV, MediaPipe, YOLOv8

---

## 1. Electron Main Process Architecture

### Entry Point: `backend/app/main.js`

**Initialization Sequence:**

1. Determine environment (dev vs production)
2. Load all backend services
3. Create Electron window with security settings
4. Setup IPC handlers
5. Emit dashboard update events

**Key Functions:**

- `createWindow()` – Creates BrowserWindow with preload script, security constraints
- `initializeServices()` – Initializes DB, Auth, Monitoring, Camera services in order
- `isElevatedUser(user)` – Checks if user is admin
- `requireExamAccess(currentUser, examId)` – Authorization check for exam access

**Security Configuration:**

```js
webPreferences: {
  nodeIntegration: false,      // Disabled
  contextIsolation: true,      // Enabled
  enableRemoteModule: false,   // Disabled
  preload: preloadPath,        // IPC bridge
  webSecurity: true            // Enabled
}
```

### IPC Bridge: `backend/app/preload.js`

Exposes safe methods to React frontend via `window.electronAPI`:

**Authentication:**

- `login(credentials)` → `auth:login`
- `logout()` → `auth:logout`
- `getCurrentUser()` → `auth:getCurrentUser`
- `verifyFace(sessionId, faceEmbedding)` → `auth:verify-face`

**Face Registration:**

- `storeFaceEmbedding(userId, embedding, confidenceScore)`
- `verifyFaceEmbedding(userId, embedding)`
- `hasRegisteredFace(userId)` → `face:has-registered`
- `setFaceThreshold(threshold)` → `face:set-threshold`

**Course & Exam Management:**

- `createCourse(courseData)` → `course:create`
- `enrollStudent(courseId, studentId)` → `course:enroll`
- `createExam(examData)` → `exam:create`
- `submitExam(examId, filesData)` → `exam:submit`
- `getAvailableExams(studentId)` → `db:getAvailableExams`

**Monitoring (Real-time):**

- `startMonitoring(examId, studentId, allowedApps)` → `monitoring:start`
- `stopMonitoring()` → `monitoring:stop`
- `getMonitoringStatus()` → `monitoring:get-status`
- `getViolations(examId)` → `monitoring:get-violations`

**Camera (Python subprocess):**

- `camera.startTest(options)` → `camera:start-test`
- `camera.stopTest()` → `camera:stop-test`
- `camera.getStatus()` → `camera:get-status`
- `camera.onStatusUpdate(callback)` – Listen for `camera:status-update` events
- `camera.onError(callback)` – Listen for `camera:error` / `camera:stderr`

**Event Listeners (Server → Client):**

```js
ipcRenderer.on("monitoring:violation-started", handler);
ipcRenderer.on("monitoring:violation-ended", handler);
ipcRenderer.on("monitoring:application-changed", handler);
ipcRenderer.on("camera:status-update", handler);
ipcRenderer.on("dashboard:updated", handler);
```

---

## 2. Backend Services Architecture

### Service Initialization Order

```
DatabaseService
    ↓ (depends on DB)
AuthService
    ↓ (depends on DB)
FileService
CodeEvalService
    ↓ (depends on DB)
MonitoringController
    ├── WindowsMonitorService
    └── ScreenshotService
CameraMonitoringService (Python subprocess)
```

### Database Service: `backend/services/database.js`

**Database Path:** `backend/data/database.sqlite`

**Core Tables:**

| Table                    | Purpose                                       | Key Fields                                                                                                        |
| ------------------------ | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `users`                  | All users (admin, teacher, student)           | user_id, username, password_hash, role, full_name, email, has_registered_face, last_login                         |
| `courses`                | Course instances                              | course_id, course_name, course_code, teacher_id, description                                                      |
| `enrollments`            | Student course enrollment                     | enrollment_id, course_id, student_id, status (active\|dropped\|completed)                                         |
| `exams`                  | Exam sessions                                 | exam_id, teacher_id, course_id, title, pdf_path, start_time, end_time, allowed_apps                               |
| `exam_submissions`       | Student code submissions                      | submission_id, exam_id, student_id, submitted_at, status, files_data (JSON)                                       |
| `exam_questions`         | Questions extracted from PDF                  | question_id, exam_id, question_number, question_text, constraints_json                                            |
| `test_cases`             | Test cases per question                       | test_case_id, question_id, input, expected_output, is_hidden, is_edge_case, metadata                              |
| `code_evaluations`       | Evaluation results per submission/question    | evaluation_id, submission_id, question_id, score, max_score, status (pending\|compiled\|executed\|failed_compile) |
| `test_case_results`      | Individual test case pass/fail                | result_id, evaluation_id, test_case_id, status (passed\|failed\|timeout), stdout, stderr                          |
| `events`                 | Monitoring events (app focus, focus time)     | event_id, exam_id, student_id, device_id, timestamp, event_type, is_violation                                     |
| `app_violations`         | Unauthorized app usage during exam            | violation_id, exam_id, student_id, device_id, app_name, window_title, focus_duration_seconds, screenshot_path     |
| `integrity_case_reviews` | Teacher review status for violation incidents | review_id, exam_id, student_id, teacher_id, is_reviewed, is_suspicious, notes                                     |
| `face_embeddings`        | Stored face recognition data                  | embedding_id, user_id, embedding (JSON), confidence_score, created_at                                             |

**Key Methods:**

- `initializeDatabase()` – Create tables and perform migrations
- `getUserByCredentials(username, password)` – Verify login
- `submitExam(examId, userId, filesData)` – Create submission record
- `getExamSubmissionById(submissionId)` – Retrieve submission
- `insertCodeEvaluation(...)` – Create evaluation record
- `updateCodeEvaluation(evaluationId, updates)` – Update evaluation status
- `logAuditEvent(userId, eventType, details)` – Track user actions

### Authentication Service: `backend/services/auth.js`

**Roles:**

- `admin` – System administrator
- `teacher` – Course/exam creator and grader
- `student` – Exam taker

**Authentication Flow:**

```
1. login(username, password)
   ↓
2. Verify credentials against DB (bcrypt hash check)
   ↓
3. If student with registered face:
   ├─ Return requiresFaceAuth: true, sessionId
   └─ Store in pendingAuth Map
   ↓
4. completeFaceAuth(sessionId, faceEmbedding)
   ├─ Verify embedding vs stored face data
   └─ Complete login if match
   ↓
5. Create JWT token (8-hour expiration)
6. Store currentSession with user + deviceId
```

**Key Methods:**

- `login(username, password)` – First factor authentication
- `completeFaceAuth(sessionId, faceEmbedding)` – Second factor (optional for students)
- `completeLogin(user, deviceId, faceVerified)` – Create session + JWT
- `logout()` – Clear session
- `getCurrentUser()` – Return current session user
- `getCurrentDeviceId()` – Return machine device ID
- `generateDeviceId()` – Create machine hash (hostname + platform + arch + CPU count)

**Face Integration:**

- Uses `FaceRecognitionService` for face embedding storage/verification
- Students with registered faces **must** pass 2FA to login
- Threshold-based matching (cosine distance)

### Monitoring Controller: `backend/services/monitoringController.js`

**Purpose:** Orchestrates exam monitoring workflow

**State Management:**

```
isMonitoring: boolean
currentExamId: string
currentStudentId: string
currentDeviceId: string
monitoringStartTime: Date
activeViolations: Map<violationId, violationData>
```

**Workflow:**

```
startExamMonitoring(examId, studentId, deviceId, allowedApps)
├─ Initialize WindowsMonitorService
├─ Setup event handlers (applicationChanged, error)
├─ Start polling (1000ms interval)
└─ Emit 'monitoringStarted' event → React UI

During monitoring:
├─ Monitor window focus events
├─ Check app names vs allowedApps whitelist
├─ On unauthorized app: Create violation (start time)
├─ Capture screenshot if enabled (7s cooldown per app)
├─ Store violation record in DB
├─ Emit 'violationStarted' → React UI (real-time warning)
│
└─ When app returns to allowed:
   ├─ End violation (end time, duration)
   └─ Emit 'violationEnded' → React UI

stopExamMonitoring()
├─ Finalize all active violations
├─ Calculate total monitoring duration
├─ Emit 'monitoringStopped' event
└─ Log monitoring summary
```

**Key Violations Tracked:**

- Unauthorized application focus
- Application focus duration
- Focus change events

**Screenshot Capture:**

- Triggered on violation start
- Cooldown: 7 seconds per application
- Stored at: `backend/data/uploads/screenshots/`

### Windows Monitor Service: `backend/services/windowsMonitorService.js`

**Purpose:** Detect active window changes on Windows

**Integration:**

- Uses `ApplicationDetector` (native Node addon or module)
- Polls current focused window name
- Compares against allowed apps whitelist
- Emits 'applicationChanged' events

**Automatic Allowed Apps:**

```js
systemAllowedApps = [
  "lab-guard",
  "electron",
  "labguard",
  "lab guard",
  "kiro",
  "vscode",
  "code",
];
```

**Event Emission:**

```js
on("applicationChanged", (changeData) => {
  // changeData = { oldApp, newApp, changeTime, isViolation }
});
on("error", (error) => {
  /* ... */
});
```

### Code Evaluation Service: `backend/services/codeEvalService.js`

**Purpose:** Compile, run, and test C++ code submissions

**Compilation Pipeline:**

```
runEvaluation(examId, submissionId, questionId)
├─ Extract C++ file from submission
├─ Write source to temp directory
├─ Compile with g++ → executable
│  ├─ Capture compile_stdout / compile_stderr
│  └─ If error: Mark status='failed_compile', return
│
├─ Load test cases for question
├─ Run executable against each test case:
│  ├─ Spawn process with timeout (per-test: 200-15000ms)
│  ├─ Pipe stdin (test input)
│  ├─ Capture stdout (output)
│  ├─ Compare with expected_output
│  ├─ Record test_case_result: passed|failed|timeout
│  └─ Calculate partial score
│
├─ Insert code_evaluations row
├─ Insert test_case_results rows (one per test)
├─ Update evaluation with final score + status
└─ Return { evaluation, results }
```

**Key Configuration:**

- `defaultTimeoutMs: 3000` (per submission)
- `maxTestcaseTimeoutMs: 15000` (per test)
- `minTestcaseTimeoutMs: 200`
- `defaultMemoryMb: 256` (sandbox limit)
- `maxOutputBytes: 256KB` (per execution)

**Supporting Services:**

- `CodeAnalysisService` – Static analysis (requirements detection, hardcoding heuristics)
- `SandboxRunner` – Safe process execution with resource limits

### Code Analysis Service: `backend/services/codeAnalysisService.js`

**Purpose:** Static code analysis for requirement checking

**Capabilities:**

- Detects language constructs (loops, recursion, arrays, pointers, etc.)
- Identifies hardcoding patterns
- Extracts requirement usage frequency
- Supports pattern-based question detection

### LLM Test Case Service: `backend/services/llmTestCaseService.js`

**Purpose:** AI-generated test cases and requirement analysis

**LLM Configuration:**

- **Primary Provider:** Groq (`llama-3.3-70b-versatile`)
- **Fallback Provider:** Google Gemini (`gemini-flash-latest`)
- **API Keys:** From env vars or `backend/data/llm-config.json` (gitignored)

**Workflow:**

```
generateTestCases(questionText, constraints)
├─ Call Groq API with structured prompt
├─ Parse JSON response (robust with fallback repair)
├─ Normalize array inputs (e.g., [1,2,3] → "3\n1 2 3")
├─ Validate against TEST_CASE_SCHEMA
└─ Return array of { name, input, expectedOutput, isEdgeCase, ... }

analyzeRequirements(problemText)
├─ Extract required programming concepts
├─ Detect problem type (basic_programming, pattern, etc.)
└─ Return { required_concepts[], problem_type, difficulty }
```

**Test Case Schema:**

```json
{
  "name": "string",
  "description": "string",
  "input": "string",
  "expectedOutput": "string",
  "isHidden": "boolean",
  "isEdgeCase": "boolean",
  "timeLimitMs": "number",
  "notes": "string"
}
```

### Camera Monitoring Service: `backend/services/cameraMonitoringService.js`

**Purpose:** Manage Python subprocess for camera-based monitoring

**Subprocess Command:**

```
py -3.11 -m camera_monitoring.camera_processor
  [--camera INDEX]
  [--display]
  [--transmit-frames]
  [--debug]
  [--snapshot-violations VIOLATIONS]
  [--snapshot-cooldown SECONDS]
  [--student-name NAME]
```

**Process Lifecycle:**

```
startMonitoring(options)
├─ Spawn Python process with args
├─ Setup stdout/stderr listeners
├─ Monitor for JSON status updates
└─ Emit 'status' events to React UI

Python process output:
├─ Logs to stderr (left untouched)
└─ JSON status to stdout (parsed line-by-line)
   ├─ { violations: { phone_violation: true, ... } }
   ├─ { frame: "base64..." }  (if transmit-frames enabled)
   ├─ { snapshot: { paths: [...], violations: [...] } }
   └─ { fps: 30.2, frame_count: 1502 }

Error Handling:
├─ If process exits: Emit 'process-exit' event
├─ JSON parse errors: Skip malformed lines
└─ Restart attempts: Up to maxRestarts

stopMonitoring()
├─ SIGTERM the process
├─ Wait for graceful shutdown (5s timeout)
├─ If hangs: SIGKILL
└─ Clear buffer and reset state
```

**Event Forwarding to React:**

```js
cameraMonitoringService.on("status", (status) => {
  mainWindow.webContents.send("camera:status-update", status);
});
```

### Screenshot Service: `backend/services/screenshotService.js`

**Purpose:** Capture desktop screenshots for violation evidence

**Configuration:**

- Triggered by app violation start
- Cooldown: 7 seconds per application
- Format: PNG
- Storage: `backend/data/uploads/screenshots/{examId}/{violationId}.png`

### File Service: `backend/services/files.js`

**Purpose:** Handle student file submission uploads

**Key Methods:**

- `saveSubmissionFiles(examId, studentId, filesArray)`
- `retrieveSubmissionFiles(submissionId)`
- `cleanupOldFiles(olderThanDays)` (optional maintenance)

---

## 3. Frontend Component Structure

### Top-Level App Flow: `frontend/src/App.tsx`

```
App (Main Router)
├─ SetupWizard (if no users exist)
├─ Login (if not authenticated)
└─ Role-based Dashboard:
   ├─ AdminPanel (if role='admin')
   ├─ TeacherDashboard (if role='teacher')
   └─ StudentDashboard (if role='student')
```

### Admin Components: `frontend/src/components/AdminPanel.tsx`

**Features:**

- User management (CRUD)
- System configuration
- Database maintenance
- Audit logs review

### Teacher Components

**Main Dashboard:** `frontend/src/components/TeacherDashboard.tsx`

- Overview metrics (pending evaluations, flagged integrity cases)
- Tab navigation:
  - **Overview** – Dashboard stats, recent submissions, flagged events
  - **Exams** – Exam list, create/edit/delete
  - **Test Case Studio** → `CodeQuestionsTab.tsx`
  - **Submissions** → `CodeEvaluationTab.tsx`
  - **Integrity Review** → `ViolationReport.tsx`

**Exam Management:**

- `ExamCreationForm.tsx` – Create new exam (title, dates, allowed apps, PDF upload)
- `ExamList.tsx` – List teacher's exams with quick actions
- `ExamEditModal.tsx` – Edit exam details
- `CourseManagement.tsx` – Associate exams with courses

**Code Evaluation:**

- `CodeEvaluationTab.tsx` – View submissions, evaluation status, scores
- `CodeQuestionsTab.tsx` – Manage questions, upload PDFs, extract questions via LLM
- `EvaluationDetailModal.tsx` – Deep dive into test results
- `PDFViewer.tsx` – Display exam PDF with question highlighting

**Violation & Integrity:**

- `ViolationReport.tsx` – List app violations per student
- `ViolationsTab.tsx` – Detailed violation timeline
- `ViolationList.tsx` – Sortable violation table
- `ViolationSummary.tsx` – Aggregate violation stats

### Student Components

**Main Dashboard:** `frontend/src/components/StudentDashboard.tsx`

- Tab navigation:
  - **Available Exams** – List exams (upcoming, active, ended)
  - **Violations** – View own violations
  - **Exam** (when selected) → `ExamPage.tsx`

**Exam Participation:** `frontend/src/components/ExamPage.tsx`

**Workflow:**

```
1. Display exam details + start/end times
2. Load PDF (if available) via pdfjs-dist
3. Monitor time remaining (updates every second)
4. Show "Start Exam" button (if within time window)
5. On Start:
   ├─ Launch app monitoring (allowed apps + screenshots)
   ├─ Launch camera monitoring (if enabled)
   └─ Display warning: "Activity is being monitored"
6. Student uploads solution (ZIP or individual files)
7. On Submit:
   ├─ Stop monitoring services
   ├─ Disable further edits
   └─ Show confirmation
```

**File Management:**

- Accept ZIP files (auto-extracted to review)
- Accept individual C++ files
- Show file list before submit
- Prevent re-submission if already submitted

**Monitoring Displays:**

- `CameraTestModule.tsx` – Camera setup (test focus, frame display, face detection)
- `CameraLogWindow.tsx` – Camera status updates + error logs
- `WarningPanel.tsx` – Real-time violation warnings
- `WarningLogCard.tsx` – Log of recent violations

### Authentication Components

**Login:** `frontend/src/components/Login.tsx`

- Username/password form
- Error handling
- Loading state

**Face Authentication:** `frontend/src/components/FaceAuth.tsx`

- Capture face video stream
- Send embedding to backend
- 2FA flow for students

**Face Capture:** `frontend/src/components/FaceCapture.tsx`

- Webcam initialization
- Landmark detection display
- Quality feedback
- Submit for enrollment

### Dashboard Sub-Components: `frontend/src/components/dashboard/`

- `ConceptBar.tsx` – Programming concept usage bar chart
- `EventLog.tsx` – Timeline of monitored events
- `MetricCard.tsx` – Reusable metric card (score, evaluations, etc.)
- `PipelinePanel.tsx` – Exam lifecycle stage display
- `PlatformCard.tsx` – Platform/device info
- `QuestionAccuracy.tsx` – Per-question accuracy rates

### Utility Components

**Shared:**

- `Notification.tsx` – Toast notifications (success, error, warning)
- `ScreenshotViewer.tsx` – Display violation evidence (screenshot)

---

## 4. Data Flow Architecture

### Student Exam Submission Workflow

```
1. STUDENT DASHBOARD
   └─ Click "Start Exam" on available exam

2. EXAM PAGE (ExamPage.tsx)
   ├─ Load PDF via pdfjs-dist
   ├─ Display timer (countdown to exam end)
   └─ Show "Submit" button

3. ON START BUTTON CLICK
   ├─ Frontend calls: electronAPI.startMonitoring(examId, studentId, allowedApps)
   │  └─ Backend IPC 'monitoring:start' → MonitoringController
   │      ├─ Initialize WindowsMonitorService
   │      ├─ Begin app focus polling
   │      └─ Emit 'monitoring:started' event → React UI
   │
   ├─ Frontend calls: electronAPI.camera.startTest(options)
   │  └─ Backend IPC 'camera:start-test' → CameraMonitoringService
   │      ├─ Spawn Python subprocess (camera_processor.py)
   │      ├─ Forward stdout JSON → 'camera:status-update' events
   │      └─ Listen for violations (phone, faces, gaze)
   │
   └─ Frontend listens:
      ├─ on 'monitoring:violation-started' → Show warning card
      ├─ on 'monitoring:violation-ended' → Dismiss warning
      ├─ on 'camera:status-update' → Update camera status panel
      └─ on 'camera:error' → Log error

4. STUDENT UPLOADS FILES
   ├─ Frontend accepts .zip or .cpp files
   ├─ Show file preview (ZIP extraction)
   └─ Student clicks "Submit"

5. ON SUBMIT
   ├─ Frontend calls: electronAPI.submitExam(examId, filesData)
   │  └─ Backend IPC 'exam:submit' Handler:
   │      ├─ Verify: student auth + enrollment + time window
   │      ├─ Check: file size (max 10MB)
   │      ├─ DB: Insert exam_submissions row
   │      ├─ Storage: Save files to disk
   │      ├─ Emit: 'dashboard:updated' → Teacher view refresh
   │      └─ Return: { success: true, submission }
   │
   ├─ Frontend calls: electronAPI.stopMonitoring()
   │  └─ Backend: MonitoringController.stopExamMonitoring()
   │      ├─ Finalize all active violations
   │      ├─ DB: Insert final app_violations records
   │      └─ Emit: 'monitoring:stopped' event
   │
   ├─ Frontend calls: electronAPI.camera.stopTest()
   │  └─ Backend: CameraMonitoringService.stopMonitoring()
   │      ├─ SIGTERM Python process
   │      └─ Clear monitoring state
   │
   └─ UI: Disable further actions, show "Submitted"

6. TEACHER EVALUATION (async)
   └─ See "Code Evaluation" section below
```

### Code Evaluation Workflow

```
TEACHER VIEW → CodeEvaluationTab.tsx

1. View submissions for exam
   └─ Backend: electronAPI.getEvaluationsByExam(examId)
      └─ DB Query: SELECT * FROM code_evaluations
         JOIN exam_submissions ON (...)
         WHERE exam_id = ?

2. SELECT submission to evaluate
   └─ Show files, current score, test results

3. CLICK "Evaluate" on submission
   └─ Backend: electronAPI.runCodeEvaluation(submissionId, questionId)
      └─ Backend IPC: CodeEvalService.runEvaluation()
         ├─ Extract C++ source from submission
         ├─ Compile: g++ main.cpp -o main
         │  ├─ If error: return { status: 'failed_compile', stderr: ... }
         │  └─ Save compile_stdout, compile_stderr to DB
         │
         ├─ Load test cases for question
         │  └─ DB: SELECT * FROM test_cases WHERE question_id = ?
         │
         ├─ FOR EACH test_case:
         │  ├─ Run: ./main < input
         │  ├─ Capture stdout
         │  ├─ Compare with expected_output
         │  ├─ Store: test_case_results (passed|failed|timeout)
         │  ├─ Calculate partial score (weight * pass%)
         │  └─ Insert result row
         │
         ├─ Calculate final score = sum(partial scores)
         ├─ Update code_evaluations with final status + score
         └─ Return all results to UI

4. UI displays:
   ├─ Compile status (success / stderr)
   ├─ Test case results table
   │  ├─ Test name, status, input, expected, actual
   │  ├─ Pass/Fail indicator
   │  └─ Timing info
   └─ Overall score (X/Y)

5. OPTIONAL: Run AI Summary
   └─ Backend: electronAPI.generateAISummary(evaluationId)
      └─ Call LLMTestCaseService
         ├─ Analyze code + test results
         ├─ Identify patterns (hardcoding, incomplete logic)
         ├─ Generate teacher summary
         └─ Store in code_evaluations.ai_summary_text
```

### Monitoring Data Persistence & Integrity Review

```
DURING EXAM (Real-time DB updates):

1. WindowsMonitorService → MonitoringController
   ├─ App focus changes detected
   ├─ Check: app in allowedApps?
   └─ If NO: Create app_violations record
      ├─ violation_id (UUID)
      ├─ app_name (detected app)
      ├─ focus_start_time (when user switched away)
      ├─ screenshot_path (if captured)
      └─ DB insert

2. CameraMonitoringService → Python output
   ├─ Camera processor detects violations
   │  ├─ phone_violation: Phone in view
   │  ├─ multiple_persons: Multiple faces detected
   │  ├─ no_face_detected: Face not visible
   │  ├─ not_facing_screen: Head turned away
   │  └─ not_looking_at_screen: Gaze not on screen
   │
   ├─ Violations persist to DB via mainWindow.webContents.send()
   └─ Frontend displays real-time warning
```

**AFTER EXAM (Teacher Integrity Review):**

```
1. Teacher navigates to Violations tab
   └─ View ViolationReport.tsx

2. QUERY: DB violations + camera flags
   ├─ SELECT * FROM app_violations WHERE exam_id = ?
   ├─ SELECT * FROM events WHERE exam_id = ? AND is_violation = 1
   └─ SELECT * FROM integrity_case_reviews WHERE exam_id = ?

3. Review UI shows:
   ├─ Violation timeline (app switches, camera events)
   ├─ Evidence (screenshots)
   ├─ Duration metrics (total time in unauthorized app)
   └─ Teacher marks: is_reviewed, is_suspicious, notes

4. Mark as reviewed:
   └─ Backend: electronAPI.markIntegrityReviewComplete(...)
      └─ Update integrity_case_reviews (is_reviewed = 1)
```

---

## 5. Python Camera Monitoring Pipeline

### Entry Point: `backend/camera_monitoring/camera_processor.py`

**Process Startup:**

```bash
# Via Node.js subprocess
py -3.11 -m camera_monitoring.camera_processor \
  --camera 0 \
  --display \
  --snapshot-violations phone_violation,multiple_persons \
  --snapshot-cooldown 5 \
  --student-name "John Doe"
```

**Main Loop:**

```python
def main():
    processor = CameraProcessor(...)
    processor.initialize()

    while processor.running:
        frame = camera.read()

        # Run detection pipeline
        frame_data = {
            'frame_number': processor.frame_count,
            'timestamp': datetime.now().isoformat(),
            'violations': {},
            'detections': {},
            'fps': processor.fps
        }

        # 1. Object Detection
        # 2. Face Analysis
        # 3. Gaze Estimation

        # Output JSON to stdout
        print(json.dumps(frame_data))

        processor.frame_count += 1
```

**Output Format (JSON):**

```json
{
  "frame_number": 1502,
  "timestamp": "2024-05-09T14:23:45.123Z",
  "violations": {
    "phone_violation": false,
    "multiple_persons": false,
    "no_face_detected": false,
    "not_facing_screen": false,
    "not_looking_at_screen": false
  },
  "detections": {
    "faces": 1,
    "objects": [{ "class": "phone", "confidence": 0.92 }],
    "gaze": { "looking_at_screen": true, "gaze_direction": "center" },
    "landmarks": { "left_eye": [...], "right_eye": [...] }
  },
  "snapshot": {
    "snapshot_paths": ["/path/to/violation_snapshot_1.png"],
    "snapshot_violations": ["phone_violation"]
  },
  "fps": 30.2
}
```

### Object Detection: `backend/camera_monitoring/detectors/object_detector.py`

**Framework:** YOLOv8 (Ultralytics)
**Model:** `yolov8n.pt` (nano, lightweight)

**Detections:**

- `phone` – Mobile device in frame
- Persons – Count for multiple_persons violation

**Method:**

```python
def detect(frame):
    results = model(frame)
    detections = [
        { 'class': 'phone', 'confidence': 0.95, 'bbox': [...] },
        { 'class': 'person', 'confidence': 0.98, 'bbox': [...] }
    ]
    return detections
```

### Face Analysis: `backend/camera_monitoring/detectors/face_analyzer.py`

**Framework:** MediaPipe Face Mesh
**Features:**

- 468 facial landmarks per face
- Head pose estimation (yaw, pitch, roll)
- Iris position extraction

**Key Landmarks:**

- Nose tip (landmark 4)
- Left/right eye (33, 133, 263, 362)
- Mouth corners (61, 291)
- Chin (152)
- Iris (468-472 left, 473-477 right)

**Head Pose Calculation:**

```python
# Use solvePnP with 3D face model + 2D landmarks
# Output: (yaw, pitch, roll) in degrees
# Violation: |yaw| > 45° OR |pitch| > 30° → not_facing_screen
```

### Gaze Estimation: `backend/camera_monitoring/detectors/gaze_estimator.py`

**Purpose:** Estimate where student is looking

**Method:**

- Extract eye region around detected iris
- Estimate gaze direction (center, left, right, up, down)
- Detect blink events (eyes closed for >3 frames)

**Violation:** `not_looking_at_screen` if gaze off-center for >2 seconds

### Configuration: `backend/camera_monitoring/config.py`

```python
# Camera settings
CAMERA_INDEX = 0
CAMERA_WIDTH = 640
CAMERA_HEIGHT = 480
CAMERA_FPS = 30

# Processing
ENABLE_FRAME_TRANSMISSION = False  # Send base64 frames to Node?
ENABLE_DISPLAY = False             # Show OpenCV window?
LOG_LEVEL = 'INFO'

# Violation detection
VIOLATION_THRESHOLDS = {
    'phone_confidence': 0.7,
    'multiple_person_threshold': 2,
    'head_pose_yaw_threshold': 45,
    'head_pose_pitch_threshold': 30,
    'gaze_off_screen_duration_seconds': 2.0,
    'blink_threshold_frames': 3
}
```

---

## 6. Key Integration Points & Event Flow

### Real-time Monitoring During Exam

```
┌─────────────────────────────────────────────────────────────┐
│                    React UI (Frontend)                       │
│  ExamPage.tsx → WarningPanel, CameraLogWindow               │
└────────────────────┬────────────────────────────────────────┘
                     │ IPC (two-way)
                     ▼
┌─────────────────────────────────────────────────────────────┐
│          Electron Main Process (Backend)                    │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │        MonitoringController                          │   │
│  │  ├─ startMonitoring(examId, studentId, allowedApps) │   │
│  │  │  ├─ Init WindowsMonitorService                   │   │
│  │  │  └─ Poll app focus every 1000ms                  │   │
│  │  │                                                   │   │
│  │  └─ Event: "violationStarted"                       │   │
│  │     ├─ DB: Insert app_violations                    │   │
│  │     ├─ Screenshot capture (if enabled)              │   │
│  │     └─ IPC emit: monitoring:violation-started       │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  CameraMonitoringService                             │   │
│  │  ├─ startMonitoring() → spawn Python subprocess      │   │
│  │  └─ Listen stdout for JSON updates                   │   │
│  │     ├─ Parse violations                              │   │
│  │     ├─ DB: Insert camera violation records           │   │
│  │     └─ IPC emit: camera:status-update                │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  DatabaseService                                     │   │
│  │  └─ Persist violations to SQLite                     │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                     │ IPC (event channel)
                     ▼
┌─────────────────────────────────────────────────────────────┐
│         React UI Updates (Real-time)                        │
│  - WarningPanel shows violation card                        │
│  - CameraLogWindow displays camera status                   │
│  - Timer counts down to exam end                            │
└─────────────────────────────────────────────────────────────┘
```

### Code Evaluation & Teacher Dashboard Update

```
React UI (Teacher)
  ├─ CodeEvaluationTab: View pending submissions
  └─ Click "Evaluate" button
       │
       ▼
  IPC: electronAPI.runCodeEvaluation(submissionId, questionId)
       │
       ▼
  Backend: CodeEvalService.runEvaluation()
  ├─ Extract C++ from exam_submissions
  ├─ Compile: g++ → executable
  ├─ Load test_cases from DB
  ├─ Run tests (stdin → stdout comparison)
  ├─ Calculate score
  ├─ DB: Insert code_evaluations + test_case_results
  ├─ IPC emit: dashboard:updated
  └─ Return evaluation to React
       │
       ▼
  React UI (Teacher):
  ├─ CodeEvaluationTab updates
  ├─ TeacherDashboard.tsx re-renders
  │  └─ pendingEvaluations count decreases
  └─ Display test results + score
```

### Student Login & Face 2FA Flow

```
Login.tsx (username, password)
  │
  ▼
IPC: electronAPI.login(credentials)
  │
  ▼
AuthService.login()
├─ DB: Verify username/password (bcrypt)
├─ Check: is_student AND has_registered_face?
│
├─ YES → Return { requiresFaceAuth: true, sessionId }
│        └─ Frontend navigates to FaceAuth.tsx
│           └─ Capture face → get embedding
│              └─ IPC: electronAPI.verifyFace(sessionId, embedding)
│                 └─ AuthService.completeFaceAuth()
│                    ├─ FaceRecognitionService.verifyFace()
│                    ├─ Compare embedding distance
│                    └─ If match: Create session + JWT
│                       └─ Redirect to StudentDashboard
│
└─ NO → Immediate login
        └─ Create session + JWT
           └─ Redirect to TeacherDashboard or AdminPanel
```

---

## 7. Key Files Summary

| File                                                     | Purpose                                                     | Key Exports               |
| -------------------------------------------------------- | ----------------------------------------------------------- | ------------------------- |
| `backend/app/main.js`                                    | Electron main process, IPC handlers, service initialization | N/A (top-level)           |
| `backend/app/preload.js`                                 | Secure IPC bridge to React                                  | `window.electronAPI`      |
| `backend/services/database.js`                           | SQLite database layer                                       | `DatabaseService`         |
| `backend/services/auth.js`                               | Authentication + 2FA                                        | `AuthService`             |
| `backend/services/monitoringController.js`               | Exam monitoring orchestration                               | `MonitoringController`    |
| `backend/services/windowsMonitorService.js`              | Windows app focus detection                                 | `WindowsMonitorService`   |
| `backend/services/codeEvalService.js`                    | C++ compilation + test execution                            | `CodeEvalService`         |
| `backend/services/codeAnalysisService.js`                | Static code analysis                                        | `CodeAnalysisService`     |
| `backend/services/llmTestCaseService.js`                 | LLM-powered test case generation                            | `LLMTestCaseService`      |
| `backend/services/cameraMonitoringService.js`            | Python subprocess management                                | `CameraMonitoringService` |
| `backend/services/faceRecognition.js`                    | Face embedding storage/verification                         | `FaceRecognitionService`  |
| `backend/services/screenshotService.js`                  | Screenshot capture                                          | `ScreenshotService`       |
| `backend/camera_monitoring/camera_processor.py`          | Main camera processing loop                                 | `CameraProcessor`         |
| `backend/camera_monitoring/detectors/object_detector.py` | YOLOv8 phone/person detection                               | `ObjectDetector`          |
| `backend/camera_monitoring/detectors/face_analyzer.py`   | MediaPipe face analysis                                     | `FaceAnalyzer`            |
| `backend/camera_monitoring/detectors/gaze_estimator.py`  | Gaze direction estimation                                   | `GazeEstimator`           |
| `frontend/src/App.tsx`                                   | Top-level router                                            | N/A                       |
| `frontend/src/components/StudentDashboard.tsx`           | Student exam/violation view                                 | N/A                       |
| `frontend/src/components/TeacherDashboard.tsx`           | Teacher admin/grading view                                  | N/A                       |
| `frontend/src/components/AdminPanel.tsx`                 | System admin controls                                       | N/A                       |
| `frontend/src/components/ExamPage.tsx`                   | Exam participation UI                                       | N/A                       |
| `frontend/src/components/CodeEvaluationTab.tsx`          | Code submission evaluation                                  | N/A                       |
| `frontend/src/components/ViolationReport.tsx`            | Integrity case review                                       | N/A                       |

---

## 8. Security & Design Considerations

### Security Measures

- **Context Isolation:** Preload script separates main & renderer process
- **No Node Integration:** Renderer cannot require modules directly
- **Signed IPC:** All backend actions validated (user role checks)
- **Password Hashing:** bcrypt 12 rounds
- **JWT Tokens:** 8-hour expiration
- **Device ID:** Machine fingerprint to prevent session hijacking
- **Face 2FA:** Optional second factor for students

### Design Principles

- **Separation of Concerns:** Services are independent modules
- **Event-Driven:** Monitoring emits events rather than polling frontend
- **Audit Trail:** Key actions logged to database
- **Graceful Degradation:** Monitoring stops cleanly on logout/exam end
- **Scalable Grading:** Asynchronous code evaluation, no blocking calls
- **Role-Based Access:** Admin > Teacher > Student (hierarchical permissions)

---

## 9. Common Workflows

### Admin: Create First Teacher Account

```
1. Launch app → SetupWizard (no users exist)
2. Create admin user
3. Create teacher user
4. Setup complete → Login
```

### Teacher: Setup & Administer Exam

```
1. Login as teacher
2. TeacherDashboard → Create Course → Add students
3. Create Exam (title, PDF, dates, allowed apps)
4. Extract Questions from PDF (LLM-assisted)
5. Upload/Generate Test Cases per question
6. Publish exam (students can now see it)
7. After exam ends:
   ├─ View submissions
   ├─ Run code evaluations
   └─ Review violations (integrity)
```

### Student: Take Exam

```
1. Login as student
2. StudentDashboard → Available Exams
3. Click exam (if within time window)
4. ExamPage → View PDF questions
5. Click "Start Exam"
   ├─ App monitoring + camera start
   └─ UI shows monitoring warnings
6. Upload solution (ZIP or .cpp)
7. Click "Submit"
   ├─ Monitoring stops
   ├─ Submission saved
   └─ UI shows confirmation
8. View violations (if any)
```

---

## 10. Known Limitations & TODOs

- **Windows-Only:** App monitor and screenshot capture only work on Windows
- **Python 3.11:** Camera pipeline requires specific Python version
- **Single Exam Per Session:** Student cannot take multiple exams simultaneously
- **No Live Chat:** No real-time teacher-student communication during exam
- **Limited File Types:** Only .cpp/.cc and .zip submissions supported
- **API Keys:** LLM features require valid Groq/Gemini API keys (not included in repo)

---

**Document Generated:** May 9, 2026  
**Codebase Version:** Latest main branch  
**Last Updated:** [Auto-update on architecture changes]
