# LAB-Guard: Deep Architecture & Functionality Analysis

**Last Updated:** May 9, 2026  
**Project Type:** Windows Electron Desktop Application  
**Purpose:** Exam Proctoring & Code Evaluation Platform for University Labs

---

## 📋 Executive Summary

LAB-Guard is a comprehensive exam management and proctoring platform designed to ensure fairness and integrity in university lab coding exams. It combines:

1. **Role-based exam workflows** (admin, teacher, student)
2. **Desktop activity monitoring** (unauthorized app detection)
3. **AI-powered camera proctoring** (phone detection, face verification, gaze tracking)
4. **Automated code evaluation** (C++ compilation + test execution in sandbox)
5. **LLM-assisted features** (test case generation, requirement analysis)

---

## 🎯 Core Objectives

### Primary Goals

- **Maintain exam integrity** through proctoring and violation detection
- **Enable fair assessment** with automated code evaluation
- **Provide evidence** for integrity reviews (screenshots, violation logs)
- **Streamline grading** for teachers (test results, analytics)
- **Support student authentication** with 2FA (face recognition)

### Secondary Goals

- **Generate test cases** automatically via LLM
- **Analyze code statically** for requirement checking
- **Provide teacher analytics** (student performance, violation patterns)
- **Maintain audit logs** for all critical actions

---

## 🏗️ System Architecture

### Technology Stack

| Layer                | Technology                         | Version            |
| -------------------- | ---------------------------------- | ------------------ |
| **Desktop Shell**    | Electron                           | 38.x               |
| **Frontend**         | React + TypeScript                 | 19.x + 5.x         |
| **Backend Logic**    | Node.js                            | 18+                |
| **Database**         | SQLite 3                           | -                  |
| **Database Driver**  | better-sqlite3                     | -                  |
| **Vision/AI**        | Python                             | 3.9-3.11           |
| **Object Detection** | YOLOv8 (Ultralytics)               | nano (lightweight) |
| **Face Recognition** | MediaPipe Face Mesh                | -                  |
| **Camera**           | OpenCV                             | 4.x                |
| **Code Compilation** | g++ (GCC)                          | -                  |
| **LLM Integration**  | Groq (primary) / Gemini (fallback) | -                  |

### Architecture Layers

```
┌─────────────────────────────────────────────────────┐
│          React Frontend (Light Mode UI)              │
│  Role-based dashboards (Admin/Teacher/Student)       │
├─────────────────────────────────────────────────────┤
│         Electron IPC Bridge (Preload.js)             │
│    Secure channel with context isolation             │
├─────────────────────────────────────────────────────┤
│       Node.js Backend (Main Process)                 │
│  Auth, Monitoring, Evaluation, Camera Services       │
├─────────────────────────────────────────────────────┤
│         SQLite Database                              │
│  Users, Exams, Submissions, Violations, Results      │
├─────────────────────────────────────────────────────┤
│    Python Camera Pipeline (Subprocess)               │
│  YOLOv8, MediaPipe, OpenCV detections                │
└─────────────────────────────────────────────────────┘
```

### Key Design Principles

1. **Security First** - Context isolation, no direct Node access from React
2. **Real-time Communication** - IPC events for live monitoring updates
3. **Modular Services** - Each backend service has single responsibility
4. **Event-Driven** - Pub/sub pattern for monitoring violations
5. **Evidence Collection** - Screenshots and logs for integrity review
6. **Graceful Degradation** - LLM failures don't block exam submission

---

## 🔐 Core Functionalities

### 1. Authentication & Authorization

**Authentication Flow:**

```
1. User enters username + password
2. Backend verifies against bcrypt-hashed credentials
3. If student with registered face:
   ├─ Prompt for face verification (2FA)
   ├─ Capture face embedding from webcam
   └─ Validate against stored embedding
4. Create JWT token (8-hour expiration)
5. Store session with device fingerprint
```

**Roles & Permissions:**

- **Admin** - System configuration, user management, audit logs
- **Teacher** - Course/exam creation, grading, violation review
- **Student** - Submit exams, view violations, take tests

**Security Features:**

- Device fingerprinting (prevent session hijacking)
- Automatic device ID generation (hostname + CPU count + platform)
- Bcrypt password hashing
- Optional 2FA with face recognition

### 2. Exam Lifecycle Management

**Teacher Workflow:**

```
1. Create course → Register students
2. Create exam (title, duration, allowed apps, PDF upload)
3. Extract questions from PDF (manual or auto)
4. Define test cases (manual or LLM-generated)
5. Publish exam
6. Review submissions after deadline
7. Grade code, mark violations as reviewed
```

**Student Workflow:**

```
1. Enroll in course
2. View available exams (upcoming, active, ended)
3. Click "Start Exam"
   ├─ Monitoring starts (app focus + camera)
   ├─ Timer counts down
   ├─ PDF visible for reference
   └─ Real-time violation warnings
4. Upload solution files (ZIP or individual CPP)
5. Click "Submit"
   ├─ Monitoring stops
   ├─ Files persisted
   └─ Redirect to student dashboard
```

**Admin Workflow:**

```
1. Manage users (create, edit, delete)
2. View system configuration
3. Access audit logs
4. Perform database maintenance
```

### 3. Desktop Monitoring (App Activity)

**Objective:** Detect unauthorized application usage during exams

**How It Works:**

```
┌─ Poll every 1000ms
│  └─ Query Windows API for active window
│     ├─ Compare app name vs allowedApps whitelist
│     ├─ If unauthorized:
│     │  ├─ Record violation start time
│     │  ├─ Capture screenshot (with 7s cooldown)
│     │  ├─ Emit real-time warning to student UI
│     │  └─ Store in DB (app_violations table)
│     │
│     └─ If back to allowed app:
│        ├─ Record violation end time
│        ├─ Calculate violation duration
│        └─ Finalize violation record
│
└─ Continue until exam ends
```

**Violations Tracked:**

- `app_name` - Name of unauthorized application
- `window_title` - Window title when detected
- `focus_duration_seconds` - How long app was in focus
- `screenshot_path` - Evidence image
- `start_time` / `end_time` - Violation timespan

**Automatic Allowed Apps:**

```
['lab-guard', 'electron', 'labguard', 'lab guard',
 'kiro', 'vscode', 'code']
```

### 4. Camera-Based Monitoring (AI Vision)

**Objective:** Ensure fair exam environment via video surveillance

**Real-time Detections:**

| Violation                 | Detector               | Method                    | Threshold                        |
| ------------------------- | ---------------------- | ------------------------- | -------------------------------- |
| **phone_violation**       | YOLOv8 Object Detector | Detect phone objects      | confidence > 0.7                 |
| **multiple_persons**      | YOLOv8 Object Detector | Count person detections   | count > 1                        |
| **no_face_detected**      | MediaPipe Face Mesh    | Face landmarks visibility | 0 faces for 5s                   |
| **not_facing_screen**     | MediaPipe Head Pose    | Head yaw/pitch angles     | \|yaw\| > 45° OR \|pitch\| > 30° |
| **not_looking_at_screen** | Gaze Estimator         | Eye gaze direction        | off-center for > 2 seconds       |

**Python Pipeline:**

```
camera_processor.py (Main Loop)
├─ Capture frame from webcam (30 FPS)
├─ Run YOLOv8n detection (phones, persons)
├─ Run MediaPipe face detection (468 landmarks)
├─ Run gaze estimation (eye tracking)
├─ Check all violation thresholds
├─ Output JSON to stdout (1 line per frame)
└─ Forward to Node.js via subprocess stdout listener
```

**Output Format (JSON per frame):**

```json
{
  "frame_number": 1502,
  "timestamp": "2024-05-09T14:23:45.123Z",
  "violations": {
    "phone_violation": false,
    "multiple_persons": false,
    "no_face_detected": false,
    "not_facing_screen": false,
    "not_looking_at_screen": true
  },
  "detections": {
    "faces": 1,
    "objects": [{"class": "phone", "confidence": 0.92}],
    "gaze": {"looking_at_screen": false, "direction": "left"},
    "landmarks": {"left_eye": [x, y], "right_eye": [x, y]}
  },
  "fps": 30.2
}
```

**Data Flow to Frontend:**

```
Python camera_processor.py (subprocess)
├─ Outputs JSON to stdout
│
CameraMonitoringService (Node.js)
├─ Parses each line as JSON
├─ Extracts violations
├─ Persists to DB if violation state changes
│
Electron IPC
├─ Emits 'camera:status-update' event
│
React UI
├─ Receives event in ExamPage.tsx
├─ Updates CameraLogWindow component
├─ Real-time display of camera status
└─ Shows violation type + frame count
```

### 5. Code Evaluation Engine

**Objective:** Automatically test and score C++ submissions

**Evaluation Pipeline:**

```
1. EXTRACTION
   ├─ Retrieve exam_submissions record
   ├─ Extract C++ file(s) from ZIP or direct submission
   └─ Write to temporary directory

2. COMPILATION
   ├─ Invoke: g++ /tmp/code.cpp -o /tmp/code
   ├─ Capture stdout/stderr
   ├─ If compilation fails:
   │  ├─ Store status = 'failed_compile'
   │  ├─ Save error messages
   │  └─ Return evaluation with 0 score
   │
   └─ If successful: status = 'compiled'

3. TEST EXECUTION
   ├─ Load all test_cases for this question
   ├─ FOR EACH test_case:
   │  ├─ Spawn process: ./code
   │  ├─ Pipe stdin: test_case.input
   │  ├─ Set timeout: (default 3s, per-test: 200-15000ms)
   │  ├─ Capture stdout: actual_output
   │  ├─ String comparison: actual_output == expected_output?
   │  ├─ Store result: passed|failed|timeout
   │  ├─ Calculate partial_score = weight * (passed ? 1 : 0)
   │  └─ DB insert: test_case_results row
   │
   └─ Accumulate scores

4. ANALYSIS
   ├─ Run CodeAnalysisService
   ├─ Detect hardcoding patterns
   ├─ Identify requirement usage
   └─ Optional: Generate LLM summary

5. PERSISTENCE
   ├─ Calculate total_score = sum(partial_scores)
   ├─ Calculate max_score = sum(test_case weights)
   ├─ Percentage = (total_score / max_score) * 100
   ├─ DB update: code_evaluations row
   ├─ Store status = 'executed'
   └─ Emit 'dashboard:updated' event

6. RETURN
   └─ Send results to teacher UI
      ├─ Compilation status
      ├─ Per-test results (input, expected, actual, status)
      ├─ Total score + percentage
      └─ Optional: AI summary
```

**Configuration:**

- **Default timeout:** 3 seconds per submission
- **Per-test timeout range:** 200ms - 15000ms
- **Memory limit:** 256MB (sandbox)
- **Max output:** 256KB per execution
- **Supported languages:** C++ (g++)

**Test Case Schema:**

```json
{
  "test_case_id": "uuid",
  "question_id": "uuid",
  "name": "Basic Case",
  "description": "Test basic functionality",
  "input": "5\n1 2 3 4 5",
  "expected_output": "15",
  "is_hidden": false,
  "is_edge_case": false,
  "weight": 1.0,
  "time_limit_ms": 3000
}
```

### 6. LLM-Assisted Workflows

**Primary Provider:** Groq (llama-3.3-70b-versatile)  
**Fallback Provider:** Google Gemini (gemini-flash-latest)

**Capability 1: Test Case Generation**

```
Input: Question text + constraints
│
▼ LLM API (Groq)
├─ Analyze problem requirements
├─ Generate diverse test cases
│  ├─ Basic cases (simple inputs)
│  ├─ Edge cases (boundary conditions)
│  ├─ Large cases (performance)
│  └─ Invalid cases (error handling)
│
Output: [
  { name, input, expectedOutput, isEdgeCase, weight, ... },
  { name, input, expectedOutput, isEdgeCase, weight, ... }
]
```

**Capability 2: Requirement Analysis**

```
Input: Problem text
│
▼ LLM API (Groq)
├─ Extract required concepts (loops, recursion, arrays, etc.)
├─ Identify problem type (sorting, searching, DP, etc.)
├─ Estimate difficulty level
│
Output: {
  required_concepts: ["arrays", "loops", "sorting"],
  problem_type: "sorting_algorithm",
  difficulty: "medium"
}
```

**Capability 3: Teacher Summary**

```
Input: Code + test results
│
▼ LLM API (Groq)
├─ Analyze solution approach
├─ Identify patterns (hardcoding, incomplete logic)
├─ Provide pedagogical feedback
│
Output: "Student solution uses correct bubble sort algorithm
         but has optimization issues with large inputs..."
```

---

## 🗄️ Database Schema (SQLite)

### Table Structure

**Users & Access:**

```sql
users
├─ user_id (PRIMARY KEY)
├─ username (UNIQUE)
├─ password_hash (bcrypt)
├─ role (admin|teacher|student)
├─ full_name
├─ email
├─ has_registered_face (boolean)
├─ last_login (timestamp)
└─ device_id (for current session)
```

**Courses & Enrollment:**

```sql
courses
├─ course_id
├─ course_name
├─ course_code
├─ teacher_id (FK → users)
└─ description

enrollments
├─ enrollment_id
├─ course_id (FK)
├─ student_id (FK)
└─ status (active|dropped|completed)
```

**Exams & Questions:**

```sql
exams
├─ exam_id
├─ teacher_id (FK)
├─ course_id (FK)
├─ title
├─ pdf_path
├─ start_time (timestamp)
├─ end_time (timestamp)
├─ allowed_apps (JSON list)
├─ duration_minutes
└─ instructions_text

exam_questions
├─ question_id
├─ exam_id (FK)
├─ question_number
├─ question_text
├─ constraints_json
├─ solution_description
└─ max_score

test_cases
├─ test_case_id
├─ question_id (FK)
├─ input
├─ expected_output
├─ is_hidden (boolean)
├─ is_edge_case (boolean)
├─ weight (float)
└─ time_limit_ms
```

**Submissions & Evaluation:**

```sql
exam_submissions
├─ submission_id
├─ exam_id (FK)
├─ student_id (FK)
├─ submitted_at (timestamp)
├─ status (submitted|evaluated)
└─ files_data (JSON)

code_evaluations
├─ evaluation_id
├─ submission_id (FK)
├─ question_id (FK)
├─ score (float)
├─ max_score (float)
├─ status (pending|compiled|executed|failed_compile)
├─ compile_stdout
├─ compile_stderr
├─ ai_summary_text
└─ evaluated_at (timestamp)

test_case_results
├─ result_id
├─ evaluation_id (FK)
├─ test_case_id (FK)
├─ status (passed|failed|timeout)
├─ stdout
├─ stderr
├─ execution_time_ms
└─ timestamp
```

**Monitoring & Violations:**

```sql
events
├─ event_id
├─ exam_id (FK)
├─ student_id (FK)
├─ device_id
├─ timestamp
├─ event_type (app_change|camera_update|submission)
└─ is_violation (boolean)

app_violations
├─ violation_id
├─ exam_id (FK)
├─ student_id (FK)
├─ device_id
├─ app_name
├─ window_title
├─ focus_duration_seconds
├─ screenshot_path
├─ start_time (timestamp)
├─ end_time (timestamp)
└─ is_reviewed (boolean)

integrity_case_reviews
├─ review_id
├─ exam_id (FK)
├─ student_id (FK)
├─ teacher_id (FK)
├─ is_reviewed (boolean)
├─ is_suspicious (boolean)
├─ notes
└─ reviewed_at (timestamp)
```

**Authentication:**

```sql
face_embeddings
├─ embedding_id
├─ user_id (FK)
├─ embedding (JSON array - float[])
├─ confidence_score (float)
└─ created_at (timestamp)
```

**Total: 13 tables** for comprehensive exam management

---

## 🔌 Frontend Component Architecture

### Route Structure

```
App.tsx (Top-level router)
├─ SetupWizard (if no users exist)
├─ Login (if not authenticated)
└─ Dashboard (role-based)
   ├─ AdminPanel.tsx
   │  ├─ UserManagement
   │  ├─ SystemConfig
   │  └─ AuditLogs
   │
   ├─ TeacherDashboard.tsx
   │  ├─ Overview (tab)
   │  │  └─ DashboardMetrics, RecentSubmissions
   │  ├─ Exams (tab)
   │  │  └─ ExamList, ExamCreationForm, ExamEditModal
   │  ├─ Test Cases (tab)
   │  │  └─ CodeQuestionsTab, PDFViewer, LLMTestCaseGenerator
   │  ├─ Submissions (tab)
   │  │  └─ CodeEvaluationTab, EvaluationDetailModal
   │  └─ Violations (tab)
   │     └─ ViolationReport, ViolationList, ScreenshotViewer
   │
   └─ StudentDashboard.tsx
      ├─ Available Exams (tab)
      │  └─ ExamCardList, ExamFilters
      ├─ Violations (tab)
      │  └─ MyViolationsList
      └─ Exam (tab)
         └─ ExamPage.tsx ⭐ (MAIN)
            ├─ PDFViewer
            ├─ Timer
            ├─ FileUploadZone
            ├─ WarningPanel
            ├─ CameraTestModule
            └─ CameraLogWindow
```

### Key Components

**Student Exam Page:** `ExamPage.tsx`

```
Features:
├─ PDF viewer with question highlighting
├─ Countdown timer (seconds remaining)
├─ File upload for code submission
├─ Real-time violation warnings
├─ Camera status display
├─ Active monitoring indicator
└─ Submit button (disabled until monitoring ready)

Lifecycle:
1. Mount → Load exam details, PDF
2. Start button → Begin monitoring
3. During exam → Update timer, listen for violations
4. Submit → Stop monitoring, disable UI
5. Unmount → Cleanup IPC listeners
```

**Code Evaluation Tab:** `CodeEvaluationTab.tsx`

```
Features:
├─ List of submissions for exam
├─ Evaluation status (pending, evaluated, failed)
├─ Score display
├─ "Evaluate" button for pending submissions
├─ Test results modal
└─ Sort/filter by student, status

Workflow:
1. Load submissions from DB
2. Display in table
3. Click "Evaluate" → Run CodeEvalService
4. Show results: compile status, per-test pass/fail
5. Display total score + percentage
```

**Violation Report:** `ViolationReport.tsx`

```
Features:
├─ Violation timeline (app switches, camera events)
├─ Screenshot evidence viewer
├─ Duration metrics (total time in unauthorized app)
├─ Teacher review checkbox
├─ Suspicious flag
├─ Notes field
└─ Save review

Data:
├─ Query app_violations + camera events
├─ Group by timestamp
├─ Display in chronological order
└─ Show screenshot on hover
```

### Styling & Theme

**Design Direction:**

- Light mode only (for focus + reduced strain)
- Calm, institutional aesthetic
- Playful elements (thoughtful animations, engaging spacing)
- Strong visual hierarchy
- Type-forward design

**Component Libraries:**

- **Icons:** Lucide React
- **Charts:** Recharts (for analytics)
- **PDF:** pdfjs-dist + react-pdf
- **Face Detection:** @vladmandic/face-api
- **UI Utilities:** Custom CSS modules

---

## 🔄 Core Data Flows

### Flow 1: Student Exam Submission

```
START EXAM
├─ ExamPage.tsx → Click "Start Exam"
├─ Frontend calls: electronAPI.startMonitoring()
│  └─ Backend: MonitoringController.startExamMonitoring()
│     ├─ Initialize WindowsMonitorService
│     ├─ Begin 1s polling interval
│     └─ Emit 'monitoring:started'
│
├─ Frontend calls: electronAPI.camera.startTest()
│  └─ Backend: CameraMonitoringService.startMonitoring()
│     ├─ Spawn Python subprocess
│     ├─ Listen for JSON violations
│     └─ Forward to React via IPC
│
STUDENT WORKS
├─ Timer counts down
├─ Real-time violation warnings appear
│  └─ On app switch: WarningPanel shows (red card)
│  └─ On camera violation: CameraLogWindow updates
│
SUBMIT
├─ Frontend calls: electronAPI.submitExam(examId, files)
│  └─ Backend: Create exam_submissions record, save files
│
├─ Frontend calls: electronAPI.stopMonitoring()
│  └─ Backend: MonitoringController.stopExamMonitoring()
│     ├─ Finalize active violations
│     ├─ DB: Insert final app_violations records
│     └─ Emit 'monitoring:stopped'
│
├─ Frontend calls: electronAPI.camera.stopTest()
│  └─ Backend: SIGTERM Python subprocess, cleanup
│
└─ UI: Show "Submitted" confirmation
```

### Flow 2: Code Evaluation

```
TEACHER INITIATES
├─ CodeEvaluationTab.tsx → Click "Evaluate" on submission
├─ Frontend calls: electronAPI.runCodeEvaluation(submissionId, questionId)
│
BACKEND EVALUATION
├─ CodeEvalService.runEvaluation()
│  ├─ Extract C++ from exam_submissions
│  ├─ Write to temp directory
│  ├─ g++ compile (capture errors if any)
│  ├─ Load test_cases from DB
│  │
│  ├─ FOR EACH test_case:
│  │  ├─ Spawn ./executable
│  │  ├─ Pipe stdin: test input
│  │  ├─ Capture stdout: actual output
│  │  ├─ Compare: actual == expected?
│  │  ├─ Store test_case_results (passed|failed|timeout)
│  │  └─ Accumulate score
│  │
│  ├─ DB: Insert code_evaluations
│  ├─ DB: Insert test_case_results (one per test)
│  └─ Emit 'dashboard:updated'
│
TEACHER VIEWS RESULTS
├─ CodeEvaluationTab updates
├─ Display:
│  ├─ Compile status (success/stderr)
│  ├─ Test results table
│  │  └─ Test name, status, input, expected, actual
│  ├─ Total score (X/Y)
│  └─ Percentage
│
└─ Optional: Generate LLM summary
   └─ Analyze code + results
   └─ Display pedagogical feedback
```

### Flow 3: 2FA Student Login

```
LOGIN PAGE
├─ Student enters username + password
├─ Frontend calls: electronAPI.login(credentials)
│
BACKEND AUTH
├─ AuthService.login()
│  ├─ DB: Find user by username
│  ├─ Verify password (bcrypt)
│  ├─ Check: is_student AND has_registered_face?
│  │
│  ├─ YES:
│  │  ├─ Create temporary session
│  │  ├─ Return { requiresFaceAuth: true, sessionId }
│  │
│  └─ NO:
│     ├─ Create JWT + session
│     └─ Return { success: true, user }
│
FACE VERIFICATION (if required)
├─ Frontend navigates to FaceAuth.tsx
├─ Capture face video → Extract embedding
├─ Frontend calls: electronAPI.verifyFace(sessionId, embedding)
│
├─ Backend: AuthService.completeFaceAuth()
│  ├─ FaceRecognitionService.verifyFace()
│  │  ├─ Load stored face_embeddings for user
│  │  ├─ Calculate cosine distance
│  │  ├─ Check threshold (e.g., distance < 0.6)
│  │  └─ Return match: true|false
│  │
│  └─ If match: Create JWT + session
│
REDIRECT
└─ Frontend: Navigate to StudentDashboard
```

### Flow 4: Integrity Review

```
TEACHER REVIEW
├─ TeacherDashboard → Violations tab
├─ ViolationReport.tsx loads
│  └─ Query DB:
│     ├─ SELECT * FROM app_violations WHERE exam_id = ?
│     ├─ SELECT * FROM events WHERE exam_id = ? AND is_violation
│     └─ SELECT screenshot_path FROM app_violations
│
TIMELINE DISPLAY
├─ Sort violations by timestamp
├─ Show:
│  ├─ App switches (unauthorized app detection)
│  ├─ Camera violations (phone, multiple faces, gaze)
│  ├─ Evidence (screenshots)
│  └─ Duration metrics
│
MARK REVIEW
├─ Teacher clicks: "Mark as Reviewed"
├─ Teacher flags: "Is Suspicious" (optional)
├─ Teacher adds: Notes
├─ Frontend calls: electronAPI.markIntegrityReviewComplete(data)
│
└─ Backend: Update integrity_case_reviews row
   ├─ is_reviewed = true
   ├─ is_suspicious = boolean
   ├─ notes = string
   └─ Emit 'dashboard:updated'
```

---

## 🔐 Security Architecture

### Context Isolation

```
┌────────────────────────────────────────────┐
│   React Frontend (Renderer Process)         │
│   - Can't access Node APIs directly        │
│   - Can only call window.electronAPI       │
└────────────────────────────────────────────┘
           ↓ IPC Bridge (restricted)
┌────────────────────────────────────────────┐
│   Preload Script (Isolated Context)         │
│   - Whitelist safe functions               │
│   - Validate args before forwarding        │
└────────────────────────────────────────────┘
           ↓ IPC Message
┌────────────────────────────────────────────┐
│   Main Process (Backend Logic)              │
│   - Full Node.js access                    │
│   - Filesystem, Database, Process spawn    │
└────────────────────────────────────────────┘
```

### Password Security

- **Storage:** bcrypt hashing (cost factor: 10+)
- **Transmission:** HTTPS (in production)
- **Validation:** Requires 8+ characters (configured)

### Device Fingerprinting

```javascript
// Prevents session hijacking
deviceId = hash(
  hostname + platform + architecture + cpuCount + timestamp_of_creation,
);
```

### Face Recognition Security

- **Storage:** Face embeddings (float arrays) stored encrypted in DB
- **Verification:** Cosine distance < threshold (e.g., 0.6)
- **Enrollment:** Only via manual face capture (not auto)

### Audit Logging

- **Key actions logged:** Login, logout, exam start, exam submit, code evaluation
- **Data tracked:** User ID, timestamp, action type, IP (if applicable)
- **Retention:** Configurable (default: 90 days)

---

## 🚀 Use Cases

### Use Case 1: Teacher Creating & Publishing Exam

```
Actor: Teacher
Precondition: Teacher is logged in, course exists

Scenario:
1. Navigate to Exams tab
2. Click "Create New Exam"
3. Enter exam details:
   ├─ Title: "Midterm Sorting Algorithms"
   ├─ Start: May 15, 10:00 AM
   ├─ Duration: 2 hours
   ├─ Upload PDF: exam_questions.pdf
   └─ Set allowed apps: [lab-guard, vscode, gcc]
4. Submit exam creation
5. PDF auto-extracts questions (via pdfTextExtractor)
6. Review extracted questions, edit if needed
7. For each question:
   ├─ Click "Generate Test Cases"
   ├─ LLM generates diverse test cases
   ├─ Teacher reviews + approves
   └─ Save to exam_questions table
8. Click "Publish Exam"
9. Students can now enroll and see exam in available list

Postcondition: Exam published, students can start at designated time
```

### Use Case 2: Student Taking Exam (with Violations)

```
Actor: Student
Precondition: Exam is active, student is enrolled

Scenario:
1. Student logs in (passes 2FA if registered face)
2. View "Available Exams"
3. Find "Midterm Sorting Algorithms", click "Start Exam"
4. PDF loads, timer starts (120 minutes), app monitoring + camera start
5. Student reads PDF, sees 3 questions about sorting
6. Student codes solution in VSCode → uploads solution.cpp
7. At 50 minutes:
   ├─ Student checks email (Gmail opens)
   └─ App monitoring detects unauthorized app
      ├─ WarningPanel appears: "Unauthorized app: Gmail"
      ├─ Screenshot captured: /data/uploads/screenshots/exam123/viol456.png
      ├─ Violation stored: app_violations table
      └─ (Student sees red warning card)
8. Student closes email, returns to VSCode (violation ends)
9. At 100 minutes:
   ├─ Camera detects phone in frame (phone_violation)
   ├─ CameraLogWindow shows: "Phone detected (confidence 0.92)"
   ├─ Violation persisted
   └─ (Student sees warning)
10. Student removes phone from desk (violation ends)
11. Timer reaches 0, exam auto-submits
12. UI shows "Submitted" confirmation

Postcondition:
├─ exam_submissions record created
├─ app_violations recorded (Gmail usage, duration)
├─ camera violations recorded (phone detection)
└─ Teacher can review violations + decide fairness
```

### Use Case 3: Teacher Evaluating Submission

```
Actor: Teacher
Precondition: Exam is submitted, deadline passed

Scenario:
1. Navigate to "Submissions" tab in TeacherDashboard
2. See list of submissions for exam
   ├─ Student: John Doe, Status: Pending, Questions: 3
   ├─ Student: Jane Smith, Status: Evaluated, Score: 85%
   └─ ...
3. Click "Evaluate" on John's submission
4. CodeEvalService executes:
   ├─ Compile solution.cpp → success
   ├─ Load 15 test cases for questions
   ├─ Run each test case:
   │  ├─ Test 1: PASSED (output matches)
   │  ├─ Test 2: FAILED (timeout)
   │  ├─ Test 3: PASSED
   │  └─ ...
   └─ Score: 12/15 tests pass = 80%
5. Results display:
   ├─ Compile status: ✓ Success
   ├─ Test results table
   │  ├─ Test 1: Sorting basic array → PASSED
   │  ├─ Test 2: Sorting large array → FAILED (>3s timeout)
   │  ├─ Test 3: Sorting reverse array → PASSED
   │  └─ ... (15 total)
   ├─ Score: 80% (12/15)
   └─ AI Summary: "Student implements correct bubble sort but...
      lacks optimization for large inputs. Consider teaching...
      merge sort for better performance."
6. Teacher saves evaluation
7. Score persisted to code_evaluations table

Postcondition:
├─ Score stored (80%)
├─ Teacher can review violations separately
└─ Student can see final score
```

### Use Case 4: Teacher Reviewing Integrity

```
Actor: Teacher
Precondition: Exam grading complete, violations recorded

Scenario:
1. Navigate to "Violations" tab
2. Select exam, see list of students with violations
   ├─ John Doe: 2 violations (Gmail, phone)
   ├─ Jane Smith: 0 violations
   ├─ Bob Johnson: 1 violation (Chrome)
   └─ ...
3. Click "John Doe" to review his violations
4. Timeline displays:
   ├─ 10:50 AM - Gmail opened (35 seconds) [SCREENSHOT]
   ├─ 11:00 AM - Camera: Phone detected (2 seconds) [FRAME]
   ├─ 11:02 AM - Camera: Multiple faces detected (1 second)
   └─ ...
5. Hover over screenshot → See evidence image
6. Teacher marks:
   ├─ Checkbox: "Is Reviewed" ✓
   ├─ Checkbox: "Is Suspicious" (?)
   ├─ Notes: "Student checked email briefly, seems honest mistake.
      Phone may have been on desk, not actively using."
7. Click "Save Review"
8. integrity_case_reviews table updated
   ├─ is_reviewed = true
   ├─ is_suspicious = false
   ├─ notes = "..."
   └─ Teacher can reference this later if appeal occurs

Postcondition:
├─ Review marked complete
├─ Decision documented
└─ Audit trail recorded
```

---

## 📊 Key Metrics & Analytics

### Teacher Dashboard Displays

**Overview Metrics:**

- Exams created (this semester)
- Submissions pending evaluation
- Flagged integrity cases (suspicious violations)
- Average student score
- Common violations (app-based, camera-based)

**Per-Exam Analytics:**

```
Exam: Midterm Sorting Algorithms
├─ Enrolled: 28 students
├─ Submitted: 27 (96%)
├─ Avg Score: 78.3%
├─ High Score: 95%, Low: 45%
├─ Violations:
│  ├─ App violations: 8 (28.6%)
│  ├─ Camera violations: 5 (17.9%)
│  └─ Flagged suspicious: 2 (7.1%)
└─ Test Analysis:
   ├─ Question 1 (Basic sorting):
   │  └─ 92% pass rate (25/27)
   ├─ Question 2 (Optimized sorting):
   │  └─ 67% pass rate (18/27)
   └─ Question 3 (Edge cases):
      └─ 59% pass rate (16/27)
```

**Student Analytics:**

- Submission time (how long to complete)
- Violations during exam
- Score by question
- Compilation attempts
- Time spent per question (estimated)

---

## 🔧 Configuration & Customization

### Environment Variables

```bash
# .env file (root directory)
GROQ_API_KEY=sk-proj-...
GEMINI_API_KEY=AIzaSyD...
CAMERA_PYTHON_PATH=py
CAMERA_PYTHON_ARGS=-3.11 -m camera_monitoring.camera_processor
```

### Backend Configuration Files

**`backend/data/llm-config.json` (alternative to env vars):**

```json
{
  "groqApiKey": "sk-proj-...",
  "geminiApiKey": "AIzaSyD...",
  "primaryProvider": "groq",
  "fallbackProvider": "gemini"
}
```

### Camera Monitoring Settings

**`backend/camera_monitoring/config.py`:**

```python
CAMERA_INDEX = 0
CAMERA_WIDTH = 640
CAMERA_HEIGHT = 480
CAMERA_FPS = 30

VIOLATION_THRESHOLDS = {
    'phone_confidence': 0.7,
    'head_pose_yaw_threshold': 45,
    'gaze_off_screen_duration_seconds': 2.0
}
```

### Exam Configuration (Per-Exam)

Teachers can customize:

- **Allowed apps:** `[lab-guard, vscode, gcc, notepad]`
- **Duration:** 60-180 minutes
- **Enabled features:**
  - ✓ App monitoring (always on)
  - ✓ Camera monitoring (optional)
  - ✓ Screenshots on violation (yes/no)
  - ✓ AI test case generation (yes/no)

---

## 🎓 Pedagogical Benefits

### For Teachers

- **Objective grading:** Automated code evaluation removes bias
- **Evidence-based fairness:** Violation logs + screenshots
- **Time savings:** Auto-extract questions, generate test cases
- **Analytics:** Identify weak areas, student performance patterns
- **LLM summaries:** Pedagogical feedback for students

### For Students

- **Fair evaluation:** Same test cases for all students
- **Clear rules:** Visible warnings during exam
- **Transparent assessment:** See test results + scoring
- **Technology support:** Optional face 2FA, camera test before exam
- **Integrity:** Assurance that proctoring is fair

### For Admins

- **System oversight:** User management, audit logs
- **Database health:** Maintenance scripts, backup procedures
- **Configuration control:** Allowed apps, monitoring settings

---

## 🚨 Limitations & Future Enhancements

### Current Limitations

1. **Windows-only:** App focus detection specific to Windows
2. **Single language:** C++ only (not Java, Python, etc.)
3. **Manual test case upload:** LLM-generated cases need review
4. **No live proctoring chat:** Can't communicate with student during exam
5. **Static code analysis:** Limited to basic pattern detection

### Potential Future Enhancements

1. **Cross-platform support:** macOS, Linux
2. **Multi-language support:** Java, Python, JavaScript, C#
3. **Live teacher dashboard:** Monitor active exams in real-time
4. **Plagiarism detection:** MOSS integration for code comparison
5. **Mobile client:** Take exams on iPad with monitored camera
6. **Advanced analytics:** ML-based cheating detection
7. **API for external LMS:** Blackboard, Canvas integration

---

## 📚 Key Files Reference

| Component              | File Path                                                | Responsibility                     |
| ---------------------- | -------------------------------------------------------- | ---------------------------------- |
| **Entry Point**        | `backend/app/main.js`                                    | Electron initialization, IPC setup |
| **IPC Bridge**         | `backend/app/preload.js`                                 | Secure API exposure to React       |
| **Database**           | `backend/services/database.js`                           | SQLite operations, schema          |
| **Authentication**     | `backend/services/auth.js`                               | Login, 2FA, session management     |
| **Monitoring**         | `backend/services/monitoringController.js`               | Exam monitoring orchestration      |
| **App Detection**      | `backend/services/windowsMonitorService.js`              | Windows focus polling              |
| **Code Evaluation**    | `backend/services/codeEvalService.js`                    | Compile + test execution           |
| **Camera**             | `backend/services/cameraMonitoringService.js`            | Python subprocess management       |
| **LLM**                | `backend/services/llmTestCaseService.js`                 | Groq/Gemini integration            |
| **Face Recognition**   | `backend/services/faceRecognition.js`                    | Face embeddings                    |
| **Frontend Router**    | `frontend/src/App.tsx`                                   | Role-based routing                 |
| **Student Exam**       | `frontend/src/components/ExamPage.tsx`                   | Exam participation UI              |
| **Teacher Dashboard**  | `frontend/src/components/TeacherDashboard.tsx`           | Teacher admin view                 |
| **Code Evaluation UI** | `frontend/src/components/CodeEvaluationTab.tsx`          | Test results display               |
| **Violations UI**      | `frontend/src/components/ViolationReport.tsx`            | Integrity review                   |
| **Python Main**        | `backend/camera_monitoring/camera_processor.py`          | Camera AI loop                     |
| **Object Detection**   | `backend/camera_monitoring/detectors/object_detector.py` | YOLOv8                             |
| **Face Analysis**      | `backend/camera_monitoring/detectors/face_analyzer.py`   | MediaPipe                          |
| **Gaze Estimation**    | `backend/camera_monitoring/detectors/gaze_estimator.py`  | Eye tracking                       |

---

## 🎯 Conclusion

LAB-Guard is a **comprehensive, production-grade exam proctoring platform** that balances security, fairness, and usability. Its modular architecture enables:

- **Extensibility:** Easy to add new detectors, evaluators, or exam types
- **Reliability:** Real-time monitoring with offline fallbacks
- **Transparency:** Clear evidence collection for integrity reviews
- **Scalability:** SQLite suitable for university lab scale

The project demonstrates **best practices in** security, user authentication, asynchronous communication, database design, and educational technology.
