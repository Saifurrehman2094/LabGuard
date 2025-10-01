# LAB-Guard Phase 1 Design Document

## Overview

LAB-Guard Phase 1 is an Electron-based desktop application that provides exam monitoring capabilities for university computer labs. The system uses a local-first architecture with SQLite for data storage, JWT for authentication, and Node.js APIs for application monitoring.

## Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────┐
│           Electron Application          │
├─────────────────────────────────────────┤
│  Frontend (React)                       │
│  ├── Login Component                    │
│  ├── Teacher Dashboard                  │
│  ├── Student Dashboard                  │
│  └── Exam Management                    │
├─────────────────────────────────────────┤
│  Main Process (Node.js)                 │
│  ├── Authentication Service             │
│  ├── Database Service                   │
│  ├── Monitoring Service                 │
│  └── File Management                    │
├─────────────────────────────────────────┤
│  Local Storage                          │
│  ├── SQLite Database                    │
│  ├── Uploaded PDFs                      │
│  └── Device Configuration               │
└─────────────────────────────────────────┘
```

### Technology Stack

- **Frontend**: React with Electron renderer process
- **Backend**: Node.js with Electron main process
- **Database**: SQLite with better-sqlite3
- **Authentication**: JWT tokens
- **File Storage**: Local filesystem
- **Monitoring**: Node.js native APIs (Windows)

## Components and Interfaces

### 1. Authentication Service

**Purpose**: Handle user login/logout and JWT token management

**Key Methods**:
```javascript
class AuthService {
  async login(username, password) // Returns JWT token and user role
  async logout() // Clears session
  async validateToken(token) // Validates JWT
  generateDeviceId() // Creates unique device identifier
}
```

**Database Integration**: Queries `users` table for credential validation

### 2. Database Service

**Purpose**: Manage all SQLite database operations

**Key Methods**:
```javascript
class DatabaseService {
  async initializeDatabase() // Creates tables if not exist
  async createUser(userData) // Insert new user
  async getUserByCredentials(username, password) // Authentication query
  async createExam(examData) // Insert exam record
  async logEvent(eventData) // Insert monitoring event
  async getExamsByTeacher(teacherId) // Query teacher's exams
  async getAvailableExams(studentId) // Query student's available exams
}
```

### 3. Monitoring Service

**Purpose**: Track active applications and detect violations

**Key Methods**:
```javascript
class MonitoringService {
  startMonitoring(examId, studentId, allowedApps) // Begin monitoring session
  stopMonitoring() // End monitoring session
  getCurrentActiveWindow() // Get active window info
  checkViolation(windowTitle, allowedApps) // Detect unauthorized apps
  logActivity(activityData) // Record monitoring event
}
```

**Monitoring Frequency**: Every 5 seconds during active exam sessions

### 4. File Management Service

**Purpose**: Handle PDF uploads and file storage

**Key Methods**:
```javascript
class FileService {
  async uploadPDF(filePath, examId) // Store exam PDF
  async getPDFPath(examId) // Retrieve PDF location
  ensureDirectoryExists(path) // Create storage directories
}
```

## Data Models

### Database Schema

#### Users Table
```sql
CREATE TABLE users (
  user_id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('teacher', 'student')),
  full_name TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### Devices Table
```sql
CREATE TABLE devices (
  device_id TEXT PRIMARY KEY,
  device_name TEXT,
  registered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_used DATETIME
);
```

#### Exams Table
```sql
CREATE TABLE exams (
  exam_id TEXT PRIMARY KEY,
  teacher_id TEXT NOT NULL,
  title TEXT NOT NULL,
  pdf_path TEXT,
  start_time DATETIME NOT NULL,
  end_time DATETIME NOT NULL,
  allowed_apps TEXT NOT NULL, -- JSON array
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (teacher_id) REFERENCES users(user_id)
);
```

#### Events Table
```sql
CREATE TABLE events (
  event_id TEXT PRIMARY KEY,
  exam_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  event_type TEXT NOT NULL, -- 'window_change', 'violation', 'exam_start', 'exam_end'
  window_title TEXT,
  process_name TEXT,
  is_violation BOOLEAN DEFAULT 0,
  FOREIGN KEY (exam_id) REFERENCES exams(exam_id),
  FOREIGN KEY (student_id) REFERENCES users(user_id),
  FOREIGN KEY (device_id) REFERENCES devices(device_id)
);
```

### JWT Token Structure
```javascript
{
  userId: "user123",
  username: "john.doe",
  role: "student", // or "teacher"
  deviceId: "device456",
  iat: 1634567890,
  exp: 1634654290
}
```

## Error Handling

### Authentication Errors
- Invalid credentials: Return 401 with clear error message
- Expired tokens: Redirect to login screen
- Database connection errors: Show offline mode message

### Monitoring Errors
- Unable to detect active window: Log error but continue monitoring
- Database write failures: Queue events for retry
- Permission denied for process access: Log warning and skip

### File Handling Errors
- PDF upload failures: Show error message and allow retry
- Disk space issues: Alert user and prevent new uploads
- File corruption: Validate file integrity before storage

## Testing Strategy

### Unit Tests
- Authentication service methods
- Database CRUD operations
- Monitoring service window detection
- File upload/retrieval functions

### Integration Tests
- Login flow end-to-end
- Exam creation and student participation
- Monitoring data collection and storage
- PDF upload and retrieval

### Manual Testing Scenarios
1. Teacher creates exam with PDF and allowed apps
2. Student logs in and starts exam
3. Student switches to unauthorized application
4. System detects violation and logs event
5. Teacher views exam results and violations

### Performance Requirements
- Login response time: < 2 seconds
- Monitoring detection interval: 5 seconds ±1 second
- Database query response: < 500ms for typical operations
- PDF upload: Support files up to 50MB

## Security Considerations

### Authentication Security
- Password hashing using bcrypt with salt rounds ≥ 10
- JWT tokens expire after 8 hours (typical exam duration)
- No sensitive data stored in JWT payload

### Data Protection
- SQLite database file permissions restricted to application user
- PDF files stored in protected application directory
- No plaintext password storage

### Monitoring Privacy
- Only window titles and process names collected (no content)
- No keystroke logging or screen capture in Phase 1
- Clear consent message before monitoring begins

## Deployment Architecture

### Development Environment
- Single Electron executable
- SQLite database in user's app data directory
- PDF storage in local documents folder

### Lab PC Deployment
- Electron app installed per machine
- Shared device ID per lab PC
- Local database per installation
- Admin privileges for monitoring APIs

### File Structure
```
LAB-Guard/
├── app/
│   ├── main.js              # Electron main process
│   ├── preload.js           # Secure context bridge
│   └── renderer/            # React frontend
├── services/
│   ├── auth.js              # Authentication service
│   ├── database.js          # Database operations
│   ├── monitoring.js        # App monitoring
│   └── files.js             # File management
├── data/
│   ├── database.sqlite      # Local database
│   └── uploads/             # PDF storage
└── config/
    └── app-config.json      # Application settings
```