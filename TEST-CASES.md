# LabGuard Test Cases

Test cases for LabGuard Phase 1 – Exam Monitoring System.  
Use for manual testing and as a basis for automated tests.

---

## Test Case Format

| Field | Description |
|-------|-------------|
| **ID** | Unique identifier (e.g., AUTH-001) |
| **Module** | Feature area |
| **Priority** | P1 (Critical), P2 (High), P3 (Medium) |
| **Req** | Requirement reference from requirements.md |

---

## 1. Authentication (AUTH)

### AUTH-001: Login screen displays correctly
| Field | Value |
|-------|-------|
| **Module** | Authentication |
| **Priority** | P1 |
| **Req** | R1 |
| **Preconditions** | LabGuard running in Electron |
| **Steps** | 1. Open LabGuard<br>2. Observe login screen |
| **Expected** | Login screen shows username and password fields |
| **Status** | ☐ |

### AUTH-002: Admin login with valid credentials
| Field | Value |
|-------|-------|
| **Module** | Authentication |
| **Priority** | P1 |
| **Req** | R1 |
| **Preconditions** | Default admin exists (admin/admin123) |
| **Steps** | 1. Enter username: admin<br>2. Enter password: admin123<br>3. Click Login |
| **Expected** | Redirect to Admin Dashboard |
| **Status** | ☐ |

### AUTH-003: Teacher login with valid credentials
| Field | Value |
|-------|-------|
| **Module** | Authentication |
| **Priority** | P1 |
| **Req** | R1 |
| **Preconditions** | Teacher account exists |
| **Steps** | 1. Enter valid teacher username/password<br>2. Click Login |
| **Expected** | Redirect to Teacher Dashboard |
| **Status** | ☐ |

### AUTH-004: Student login with valid credentials
| Field | Value |
|-------|-------|
| **Module** | Authentication |
| **Priority** | P1 |
| **Req** | R1 |
| **Preconditions** | Student account exists |
| **Steps** | 1. Enter valid student username/password<br>2. Click Login |
| **Expected** | Redirect to Student Dashboard |
| **Status** | ☐ |

### AUTH-005: Login fails with invalid credentials
| Field | Value |
|-------|-------|
| **Module** | Authentication |
| **Priority** | P1 |
| **Req** | R1 |
| **Preconditions** | None |
| **Steps** | 1. Enter invalid username/password<br>2. Click Login |
| **Expected** | Error message displayed; remain on login screen |
| **Status** | ☐ |

### AUTH-006: Logout works
| Field | Value |
|-------|-------|
| **Module** | Authentication |
| **Priority** | P2 |
| **Req** | R1 |
| **Preconditions** | User is logged in |
| **Steps** | 1. Click Logout |
| **Expected** | Return to login screen |
| **Status** | ☐ |

### AUTH-007: Face authentication (2FA) when enabled
| Field | Value |
|-------|-------|
| **Module** | Authentication |
| **Priority** | P2 |
| **Req** | R1 (extended) |
| **Preconditions** | User has registered face; face auth enabled |
| **Steps** | 1. Enter valid credentials<br>2. Complete face verification when prompted |
| **Expected** | Login completes after face verification |
| **Status** | ☐ |

---

## 2. Admin – User Management (ADMIN)

### ADMIN-001: Create student user
| Field | Value |
|-------|-------|
| **Module** | Admin – Users |
| **Priority** | P1 |
| **Req** | R1 |
| **Preconditions** | Logged in as admin |
| **Steps** | 1. Admin Dashboard → Users<br>2. Add User<br>3. Username: student1, Password: test123, Role: Student, Full Name: Test Student<br>4. Save |
| **Expected** | User appears in list |
| **Status** | ☐ |

### ADMIN-002: Create teacher user
| Field | Value |
|-------|-------|
| **Module** | Admin – Users |
| **Priority** | P1 |
| **Req** | R1 |
| **Preconditions** | Logged in as admin |
| **Steps** | 1. Add User<br>2. Username: teacher1, Password: test123, Role: Teacher<br>3. Save |
| **Expected** | User appears in list |
| **Status** | ☐ |

### ADMIN-003: Register face for user
| Field | Value |
|-------|-------|
| **Module** | Admin – Users |
| **Priority** | P2 |
| **Req** | R1 (extended) |
| **Preconditions** | User exists; camera available; face models loaded |
| **Steps** | 1. Users → Register Face for a user<br>2. Allow camera<br>3. Position face; capture 3–5 images<br>4. Register Face |
| **Expected** | Face registered successfully; modal closes |
| **Status** | ☐ |

### ADMIN-004: Update user details
| Field | Value |
|-------|-------|
| **Module** | Admin – Users |
| **Priority** | P2 |
| **Req** | R1 |
| **Preconditions** | User exists |
| **Steps** | 1. Edit user<br>2. Change Full Name<br>3. Save |
| **Expected** | User details updated in list |
| **Status** | ☐ |

### ADMIN-005: Delete user
| Field | Value |
|-------|-------|
| **Module** | Admin – Users |
| **Priority** | P2 |
| **Req** | R1 |
| **Preconditions** | User exists |
| **Steps** | 1. Delete user<br>2. Confirm |
| **Expected** | User removed from list |
| **Status** | ☐ |

### ADMIN-006: Web-only mode shows error message
| Field | Value |
|-------|-------|
| **Module** | Admin – Users |
| **Priority** | P3 |
| **Req** | — |
| **Preconditions** | LabGuard opened in browser (localhost:3001) |
| **Steps** | 1. Log in as admin (web mode)<br>2. Open Admin → Users |
| **Expected** | Message: "Run LabGuard via npm run dev (Electron window) for full functionality" |
| **Status** | ☐ |

---

## 3. Teacher – Exam Management (TEACHER)

### TEACHER-001: Create course
| Field | Value |
|-------|-------|
| **Module** | Teacher – Courses |
| **Priority** | P1 |
| **Req** | R2 |
| **Preconditions** | Logged in as teacher |
| **Steps** | 1. Teacher Dashboard → Create Course<br>2. Enter course name and code<br>3. Save |
| **Expected** | Course created |
| **Status** | ☐ |

### TEACHER-002: Create exam with required fields
| Field | Value |
|-------|-------|
| **Module** | Teacher – Exams |
| **Priority** | P1 |
| **Req** | R2 |
| **Preconditions** | Teacher has at least one course |
| **Steps** | 1. Create Exam<br>2. Title: Test Exam<br>3. Select course<br>4. Start time: now, End time: 1 hour later<br>5. Add allowed app (e.g. Notepad.exe)<br>6. Save |
| **Expected** | Exam created with unique ID; appears in exam list |
| **Status** | ☐ |

### TEACHER-003: Create exam with PDF upload
| Field | Value |
|-------|-------|
| **Module** | Teacher – Exams |
| **Priority** | P2 |
| **Req** | R2 |
| **Preconditions** | Teacher has course; PDF file available |
| **Steps** | 1. Create Exam<br>2. Fill required fields<br>3. Browse and select PDF file<br>4. Save |
| **Expected** | Exam created with PDF attached |
| **Status** | ☐ |

### TEACHER-004: Edit exam
| Field | Value |
|-------|-------|
| **Module** | Teacher – Exams |
| **Priority** | P2 |
| **Req** | R2 |
| **Preconditions** | Exam exists |
| **Steps** | 1. Edit exam<br>2. Change title or times<br>3. Save |
| **Expected** | Exam updated |
| **Status** | ☐ |

### TEACHER-005: Delete exam
| Field | Value |
|-------|-------|
| **Module** | Teacher – Exams |
| **Priority** | P2 |
| **Req** | R2 |
| **Preconditions** | Exam exists |
| **Steps** | 1. Delete exam<br>2. Confirm |
| **Expected** | Exam removed |
| **Status** | ☐ |

### TEACHER-006: View violation report
| Field | Value |
|-------|-------|
| **Module** | Teacher – Violations |
| **Priority** | P2 |
| **Req** | R3, R4 |
| **Preconditions** | Exam exists; at least one violation recorded |
| **Steps** | 1. Open exam<br>2. View violations/report |
| **Expected** | Violations listed with app name, duration, student |
| **Status** | ☐ |

---

## 4. Student – Exam Participation (STUDENT)

### STUDENT-001: Enroll in course
| Field | Value |
|-------|-------|
| **Module** | Student – Courses |
| **Priority** | P1 |
| **Req** | R3 |
| **Preconditions** | Student account; course exists |
| **Steps** | 1. Student Dashboard → Courses<br>2. Enroll in course |
| **Expected** | Enrolled in course; available exams shown |
| **Status** | ☐ |

### STUDENT-002: View available exams
| Field | Value |
|-------|-------|
| **Module** | Student – Exams |
| **Priority** | P1 |
| **Req** | R3 |
| **Preconditions** | Student enrolled in course; exam in time window |
| **Steps** | 1. Student Dashboard → Available Exams |
| **Expected** | List of exams for enrolled courses |
| **Status** | ☐ |

### STUDENT-003: Start exam

| Field | Value |
|-------|-------|
| **Module** | Student – Exams |
| **Priority** | P1 |
| **Req** | R3 |
| **Preconditions** | Exam available; within start/end time |
| **Steps** | 1. Select exam<br>2. Start Exam |
| **Expected** | Exam starts; monitoring active |
| **Status** | ☐ |

### STUDENT-004: View PDF during exam
| Field | Value |
|-------|-------|
| **Module** | Student – Exams |
| **Priority** | P2 |
| **Req** | R2 |
| **Preconditions** | Exam started; exam has PDF |
| **Steps** | 1. Open exam<br>2. View PDF |
| **Expected** | PDF displays in viewer |
| **Status** | ☐ |

### STUDENT-005: Submit exam

| Field | Value |
|-------|-------|
| **Module** | Student – Exams |
| **Priority** | P1 |
| **Req** | R3 |
| **Preconditions** | Exam started |
| **Steps** | 1. Submit Exam<br>2. Attach ZIP (optional)<br>3. Confirm submission |
| **Expected** | Submission recorded; monitoring stops |
| **Status** | ☐ |

### STUDENT-006: View own violations
| Field | Value |
|-------|-------|
| **Module** | Student – Violations |
| **Priority** | P2 |
| **Req** | R3 |
| **Preconditions** | Student has violations |
| **Steps** | 1. Student Dashboard → Violations tab |
| **Expected** | List of student's violations |
| **Status** | ☐ |

### STUDENT-007: Cannot start exam before start time
| Field | Value |
|-------|-------|
| **Module** | Student – Exams |
| **Priority** | P2 |
| **Req** | R3 |
| **Preconditions** | Exam with future start time |
| **Steps** | 1. Try to start exam |
| **Expected** | Error: "Exam has not started yet" |
| **Status** | ☐ |

### STUDENT-008: Cannot start exam after end time
| Field | Value |
|-------|-------|
| **Module** | Student – Exams |
| **Priority** | P2 |
| **Req** | R3 |
| **Preconditions** | Exam past end time |
| **Steps** | 1. Try to start exam |
| **Expected** | Error or exam not available |
| **Status** | ☐ |

---

## 5. Application Monitoring (MONITOR)

### MONITOR-001: Monitoring starts when exam starts
| Field | Value |
|-------|-------|
| **Module** | Monitoring |
| **Priority** | P1 |
| **Req** | R3, R4 |
| **Preconditions** | LabGuard run as Administrator; app running in Electron |
| **Steps** | 1. Student starts exam |
| **Expected** | "Monitoring Active" or similar indicator |
| **Status** | ☐ |

### MONITOR-002: Violation detected when switching to unauthorized app
| Field | Value |
|-------|-------|
| **Module** | Monitoring |
| **Priority** | P1 |
| **Req** | R4 |
| **Preconditions** | Exam running; monitoring active; allowed apps = Notepad only |
| **Steps** | 1. Switch to Chrome/Edge or other app not in allowed list<br>2. Stay for a few seconds<br>3. Switch back to LabGuard |
| **Expected** | Violation recorded; Warning Panel shows violation; count updated |
| **Status** | ☐ |

### MONITOR-003: No violation when using allowed app
| Field | Value |
|-------|-------|
| **Module** | Monitoring |
| **Priority** | P1 |
| **Req** | R4 |
| **Preconditions** | Exam running; Notepad in allowed list |
| **Steps** | 1. Switch to Notepad |
| **Expected** | No violation recorded |
| **Status** | ☐ |

### MONITOR-004: Violation count updates in real time
| Field | Value |
|-------|-------|
| **Module** | Monitoring |
| **Priority** | P2 |
| **Req** | R4 |
| **Preconditions** | Exam running; monitoring active |
| **Steps** | 1. Switch to unauthorized app<br>2. Observe Warning Panel |
| **Expected** | Total count increases immediately |
| **Status** | ☐ |

### MONITOR-005: Violation end when returning to allowed app
| Field | Value |
|-------|-------|
| **Module** | Monitoring |
| **Priority** | P2 |
| **Req** | R4 |
| **Preconditions** | Violation in progress |
| **Steps** | 1. Switch back to LabGuard or allowed app |
| **Expected** | Violation marked as ended; duration recorded |
| **Status** | ☐ |

### MONITOR-006: Monitoring stops when exam ends
| Field | Value |
|-------|-------|
| **Module** | Monitoring |
| **Priority** | P1 |
| **Req** | R3 |
| **Preconditions** | Exam running; monitoring active |
| **Steps** | 1. Submit exam or time expires |
| **Expected** | Monitoring stops |
| **Status** | ☐ |

---

## 6. Database & Storage (DB)

### DB-001: Database initializes on startup
| Field | Value |
|-------|-------|
| **Module** | Database |
| **Priority** | P1 |
| **Req** | R5 |
| **Preconditions** | LabGuard not run before |
| **Steps** | 1. Start LabGuard |
| **Expected** | Database created; tables created; no errors |
| **Status** | ☐ |

### DB-002: Default admin exists
| Field | Value |
|-------|-------|
| **Module** | Database |
| **Priority** | P1 |
| **Req** | R5 |
| **Preconditions** | Fresh install |
| **Steps** | 1. Start LabGuard<br>2. Login with admin/admin123 |
| **Expected** | Login succeeds |
| **Status** | ☐ |

### DB-003: Device ID generated
| Field | Value |
|-------|-------|
| **Module** | Device |
| **Priority** | P2 |
| **Req** | R6 |
| **Preconditions** | First run |
| **Steps** | 1. Start LabGuard<br>2. Login as student |
| **Expected** | Device ID associated with session |
| **Status** | ☐ |

---

## 7. System & Integration (SYS)

### SYS-001: Electron window opens
| Field | Value |
|-------|-------|
| **Module** | System |
| **Priority** | P1 |
| **Req** | — |
| **Preconditions** | Port 3001 free |
| **Steps** | 1. Run `npm run dev` |
| **Expected** | Electron window opens |
| **Status** | ☐ |

### SYS-002: Face models load
| Field | Value |
|-------|-------|
| **Module** | System |
| **Priority** | P2 |
| **Req** | — |
| **Preconditions** | Models downloaded |
| **Steps** | 1. Open Face Registration |
| **Expected** | Video feed appears; no "Loading models" timeout |
| **Status** | ☐ |

### SYS-003: Camera access works
| Field | Value |
|-------|-------|
| **Module** | System |
| **Priority** | P2 |
| **Req** | — |
| **Preconditions** | Camera enabled in Windows |
| **Steps** | 1. Open Face Registration |
| **Expected** | Camera feed shown |
| **Status** | ☐ |

---

## Test Execution Summary

| Module | Total | Passed | Failed | Blocked |
|--------|-------|--------|--------|---------|
| AUTH | 7 | | | |
| ADMIN | 6 | | | |
| TEACHER | 6 | | | |
| STUDENT | 8 | | | |
| MONITOR | 6 | | | |
| DB | 3 | | | |
| SYS | 3 | | | |
| **Total** | **39** | | | |

---

## Next: Automated Test Implementation

To implement automated tests:

1. **Unit tests** (Jest + React Testing Library): Components, services, utilities
2. **Integration tests**: API endpoints, auth flow, IPC
3. **E2E tests** (Playwright/Playwright): Full flows (login → create exam → take exam)

Example structure:

```
frontend/src/
├── __tests__/
│   ├── components/
│   │   ├── Login.test.tsx
│   │   ├── AdminPanel.test.tsx
│   │   └── WarningPanel.test.tsx
│   └── services/
│       └── modelManager.test.ts
```

Run tests: `npm test`
