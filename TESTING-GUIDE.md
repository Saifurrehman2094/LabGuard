# LabGuard Testing Guide

Use this guide to test camera, face recognition, and core features before moving to test case generation.

---

## Prerequisites

1. **LabGuard running in Electron**
   ```powershell
   npm run dev
   ```
2. **Webcam** connected and allowed in Windows Privacy Settings
3. **Good lighting** for face recognition

---

## 1. Camera & Face Models Check

### Step 1.1: Verify face models are loaded

1. Log in as **admin** / **admin123**
2. Go to **Admin Dashboard** → **Users** tab
3. Click **Add User** to create a test student
4. Fill in: Username `student1`, Password `test123`, Role **Student**, Full Name `Test Student`
5. Click **Save**
6. In the user list, find `student1` and click **Register Face**
7. The FaceCapture modal opens – this loads the face models

**Expected:** Video feed appears. If you see "Loading models..." for more than 10 seconds, run:
```powershell
npm run download-models
```

**If models fail:** Click **Run Diagnostics** in the FaceCapture modal to see which models failed.

---

## 2. Face Registration Test

### Step 2.1: Register a face for a student

1. With FaceCapture open for `student1`:
2. **Allow camera** when the browser prompts
3. Position your face in the frame – green outline when detected
4. Hold still – it captures 3–5 images automatically
5. Click **Register Face** when enough captures are done

**Expected:** "Face registered successfully" and modal closes.

**Common issues:**
- **"Camera not found"** → Check Windows Settings → Privacy → Camera → Allow desktop apps
- **"No face detected"** → Improve lighting, face the camera directly
- **Models not loading** → Run `npm run download-models`

---

## 3. Face Authentication (2FA) Test

### Step 3.1: Enable face auth for admin (optional)

Face auth is optional per user. By default, admin can log in with password only.

To test face auth:
1. Create a student with face registered (Step 2)
2. Log out
3. Log in as `student1` / `test123`
4. If face auth is enabled for that user, you’ll see the face verification step
5. Look at the camera – it should verify and complete login

**Note:** Face auth is configured per user. Check backend/auth logic for how `requiresFaceAuth` is set.

---

## 4. User Management Test

| Action | Steps | Expected |
|--------|-------|----------|
| Create student | Add User → student1, test123, Student | User appears in list |
| Create teacher | Add User → teacher1, test123, Teacher | User appears in list |
| Register face | Users → Register Face | Video feed, capture, success |
| Update user | Edit icon → change name → Save | Name updated |
| Delete user | Delete icon → confirm | User removed |

---

## 5. Surveillance / Monitoring Test (Application Switching Detection)

The monitoring system tracks which app is in the foreground. If a student switches to an app **not** in the allowed list during an exam, it records a violation and shows a warning.

### Step 5.1: Run as Administrator (Recommended)

The Windows API needs elevated access to detect other applications. **Right‑click PowerShell** → **Run as administrator** → then:

```powershell
cd C:\Users\Umari\LabGuard
npm run dev
```

### Step 5.2: Setup (Teacher + Course + Exam)

1. **Create a teacher** (if needed): Admin → Add User → `teacher1` / `test123` / **Teacher**
2. **Create a course**: Log in as `teacher1` → Teacher Dashboard → Courses → Create Course (e.g. "Test Course")
3. **Create an exam**:
   - Teacher Dashboard → Create Exam
   - Title: "Monitoring Test Exam"
   - Course: Select your course
   - Start time: **Now** (or a few minutes ago)
   - End time: **1 hour from now**
   - **Allowed apps**: Add `Notepad.exe` only (so switching to Chrome/Edge will trigger a violation)
   - Save

### Step 5.3: Enroll Student & Start Exam

1. **Enroll student in course**: Log in as `student1` → Courses tab → Enroll in the course
2. **Start exam**: Student Dashboard → Available Exams → Select the exam → **Start Exam**
3. Confirm you see **"Monitoring Active"** or similar in the UI

### Step 5.4: Trigger a Violation (Test the Detection)

1. With the exam running and monitoring active, **switch to another app**:
   - Open **Chrome**, **Edge**, or **File Explorer** (these are not in the allowed list)
2. Keep that app in focus for a few seconds
3. **Switch back** to the LabGuard window

**Expected:**
- A **Warning Panel** appears (often at the bottom) showing the violation
- Violation details: app name, window title, duration
- A screenshot may be captured as evidence

### Step 5.5: Verify Violations Are Recorded

1. **Student view**: Student Dashboard → Violations tab → your violations should appear
2. **Teacher view**: Log in as teacher → Exam → View Violations/Report

### Monitoring Troubleshooting

| Issue | Solution |
|-------|----------|
| "Monitoring failed to start" | Run PowerShell **as Administrator**, then `npm run dev` |
| "Cannot access foreground window" | Run LabGuard as Administrator |
| No violations when switching apps | Ensure the app you switch to is **not** in the allowed list |
| Warning panel not visible | Check bottom of exam page; it may be collapsible |

---

## 6. Quick Checklist Before Test Case Generation

| # | Feature | Status |
|---|---------|--------|
| 1 | Electron window opens | ☐ |
| 2 | Admin login works | ☐ |
| 3 | Create student works | ☐ |
| 4 | Face models load | ☐ |
| 5 | Camera shows video feed | ☐ |
| 6 | Face registration works | ☐ |
| 7 | Face auth (if enabled) works | ☐ |
| 8 | Create teacher works | ☐ |
| 9 | Create exam works | ☐ |
| 10 | Student can take exam | ☐ |
| 11 | Monitoring starts when exam starts | ☐ |
| 12 | Violation detected when switching to unauthorized app | ☐ |

---

## Troubleshooting

### Camera not detected
- Windows Settings → Privacy → Camera → Allow desktop apps
- Restart LabGuard

### Face models not loading
```powershell
npm run download-models
```

### "Run LabGuard via npm run dev" message
- Use the **Electron window**, not the browser
- Close any browser tabs with localhost:3001

### better-sqlite3 error on startup
```powershell
$env:npm_config_target=(node -p "require('electron/package.json').version")
$env:npm_config_arch="x64"
$env:npm_config_disturl="https://electronjs.org/headers"
$env:npm_config_runtime="electron"
$env:npm_config_build_from_source="true"
npm rebuild better-sqlite3
```

---

## Next: Test Case Generation

After completing this checklist, you can move to:

1. **Test case design** – scenarios for each feature
2. **Automated tests** – Jest/React Testing Library
3. **E2E tests** – Playwright or similar for full flows
