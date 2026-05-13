# Phase 1 Setup & Testing Guide

## Overview

This guide walks you through setting up and testing the **Live Database** infrastructure for LAB-Guard's hybrid cloud-local architecture.

**What's included:**

- PostgreSQL database initialization script
- Database schema with all cloud tables
- Express.js REST API server
- Database migration system
- API testing utilities

---

## Prerequisites

- Node.js 16+ (npm included)
- PostgreSQL 12+ (local or remote)
- Git

---

## Setup Steps

### 1. Install Dependencies

```bash
# Install backend dependencies
npm install

# Backend will include: pg, express, bcryptjs, multer, aws-sdk, jsonwebtoken, dotenv
```

**Dependencies added to `package.json`:**

- `pg` - PostgreSQL client
- `express` - REST API framework
- `bcryptjs` - Password hashing
- `jsonwebtoken` - JWT authentication
- `multer` - File upload handling
- `aws-sdk` - AWS S3 integration
- `dotenv` - Environment configuration

### 2. Configure Environment

```bash
# Copy environment template
cp .env.example .env

# Edit .env with your database credentials
nano .env  # or edit with your editor
```

**Required `.env` variables:**

```
# PostgreSQL
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your_password
DB_NAME=lab_guard_cloud

# Server
PORT=3001
NODE_ENV=development

# JWT
JWT_SECRET=your_secret_key_change_this
JWT_REFRESH_SECRET=your_refresh_secret_change_this
JWT_EXPIRATION=1h
JWT_REFRESH_EXPIRATION=7d

# AWS S3
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
S3_BUCKET=lab-guard-evidence-production

# API
API_RATE_LIMIT=100
API_RATE_WINDOW=15
```

### 3. Initialize PostgreSQL Database

**Option A: Node.js (recommended for Windows)**

```bash
node backend/scripts/init-cloud-db.js
```

This will:

- ✅ Create the `lab_guard_cloud` database
- ✅ Create all required tables (exams, submissions, analytics, etc.)
- ✅ Create indexes for performance
- ✅ Add test data (teacher1/teacher123, student1/student123)

**Option B: Bash script (Linux/Mac)**

```bash
bash setup-database.sh
```

### 4. Verify Database Setup

```bash
# Check migration status
node backend/db/migrate.js status

# Should output:
# Executed Migrations: (none)
# Pending Migrations: (none)
```

---

## Database Schema

The initialization creates these tables on the cloud:

### Core Tables

| Table                      | Purpose                         | Records                  |
| -------------------------- | ------------------------------- | ------------------------ |
| `cloud_users`              | Teachers, students, admins      | ~100s per school         |
| `cloud_exams`              | Exam papers (immutable)         | ~10s per school/semester |
| `cloud_exam_questions`     | Questions per exam              | ~3-5 per exam            |
| `cloud_test_cases`         | Test cases per question         | ~10 per question         |
| `cloud_exam_submissions`   | Student submissions (immutable) | ~100s per exam           |
| `cloud_submission_details` | Detailed results & violations   | 1:1 with submissions     |
| `cloud_class_analytics`    | Aggregated statistics           | 1 per exam               |
| `cloud_teacher_reports`    | Teacher-generated reports       | ~5 per exam              |

### Support Tables

| Table              | Purpose                                |
| ------------------ | -------------------------------------- |
| `cloud_sync_queue` | Offline-first sync queue (retry logic) |
| `cloud_audit_log`  | All changes for compliance audit trail |
| `migrations`       | Schema version tracking                |

---

## Running the API Server

```bash
# Start the Express server
node live-db-server.js

# Output should show:
# ✓ Database connected
# ✓ Server listening on port 3001
# ✓ Ready for requests
```

The server provides these endpoints:

### Authentication

- `POST /api/auth/login` - Login (returns JWT token)
- `POST /api/auth/register` - Register new user
- `POST /api/auth/refresh` - Refresh JWT token
- `POST /api/auth/verify-device` - Device fingerprinting

### Exam Management

- `GET /api/exams/available` - List available exams
- `GET /api/exams/:examId` - Get exam details
- `GET /api/exams/:examId/download` - Download exam PDF + test cases
- `POST /api/exams/upload` - Upload new exam (teacher only)

### Submissions

- `POST /api/submissions/upload` - Upload submission with violations
- `GET /api/submissions/:submissionId` - Get submission details
- `POST /api/submissions/batch` - Batch query submissions

### Analytics

- `GET /api/exams/:examId/analytics` - Class statistics
- `GET /api/exams/:examId/class-report` - Teacher report

### Health

- `GET /api/health` - Server health check
- `GET /api/status` - Database & S3 connectivity status
- `GET /api/test/db` - Database connection test
- `GET /api/test/s3` - S3 connectivity test

---

## Testing API Endpoints

### 1. Run Automated Tests

```bash
node backend/scripts/test-api.js
```

Output example:

```
═══════════════════════════════════════════════════════════════
LAB-Guard Live Database API Test Suite
═══════════════════════════════════════════════════════════════

API URL: http://localhost:3001

→ Test: Health Check
  ✓ Server is healthy (status: ok)

→ Test: User Registration
  ✓ User registered successfully
  Username: testuser_1704067890123

→ Test: User Authentication
  ✓ Login successful
  Token received: eyJhbGciOiJIUzI1NiIsInR...

→ Test: Status Endpoint
  ✓ Status retrieved successfully
  Database connected: true
  S3 configured: true

→ Test: List Exams
  ✓ Exams endpoint accessible (200)
  Found 1 exams

═══════════════════════════════════════════════════════════════
Test Summary
═══════════════════════════════════════════════════════════════
Passed: 5
Failed: 0
Total:  5
═══════════════════════════════════════════════════════════════

✓ All tests passed!
```

### 2. Manual Testing with cURL

**Login:**

```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "teacher1",
    "password": "teacher123",
    "device_id": "device_001"
  }'
```

Response:

```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "user_id": "a0000000-0000-0000-0000-000000000001",
    "username": "teacher1",
    "role": "teacher",
    "full_name": "John Doe"
  }
}
```

**List Available Exams:**

```bash
curl -X GET http://localhost:3001/api/exams/available \
  -H "Authorization: Bearer <TOKEN>"
```

**Health Check:**

```bash
curl http://localhost:3001/api/health
```

### 3. Test Data

After running `init-cloud-db.js`, these test accounts are available:

| User    | Username   | Password     | Role    |
| ------- | ---------- | ------------ | ------- |
| Teacher | `teacher1` | `teacher123` | teacher |
| Student | `student1` | `student123` | student |

Test exam:

- **Title:** Algorithms 101 Midterm
- **Duration:** 120 minutes
- **Questions:** 1 (with 2 test cases)

---

## Database Migrations

The migration system tracks schema changes and allows version control.

### Create a New Migration

```bash
# Name migrations with timestamp: 001_description.js

cat > backend/db/migrations/002_add_new_table.js << 'EOF'
module.exports = {
  async up(pool) {
    await pool.query(`
      CREATE TABLE new_table (
        id UUID PRIMARY KEY,
        data TEXT
      )
    `);
    console.log('[Migration] Created new_table');
  },

  async down(pool) {
    await pool.query('DROP TABLE IF EXISTS new_table');
    console.log('[Migration] Dropped new_table');
  },
};
EOF
```

### Run Migrations

```bash
# Run all pending migrations
node backend/db/migrate.js up

# Check status
node backend/db/migrate.js status

# Rollback last migration
node backend/db/migrate.js down
```

---

## Troubleshooting

### PostgreSQL Connection Error

**Error:**

```
Error: connect ECONNREFUSED 127.0.0.1:5432
```

**Solution:**

```bash
# Check PostgreSQL is running
psql --version

# Start PostgreSQL
# Windows: Services app → PostgreSQL → Start
# Mac: brew services start postgresql
# Linux: sudo systemctl start postgresql
```

### Database Already Exists

**Message:**

```
[WARN] Database 'lab_guard_cloud' already exists, skipping creation
```

**To reset:**

```bash
# Drop existing database
PGPASSWORD=postgres psql -h localhost -U postgres -c "DROP DATABASE lab_guard_cloud;"

# Re-run initialization
node backend/scripts/init-cloud-db.js
```

### Connection Pool Timeout

**Error:**

```
TimeoutError: Timed out acquiring client
```

**Solution:**

- Check database is running
- Verify DB credentials in `.env`
- Increase `max` pool size in `live-db-server.js`

### Test Users Not Found

**After running tests, if you see 401 errors:**

```bash
# Re-run initialization to create test users
node backend/scripts/init-cloud-db.js
```

---

## Performance Optimization

The initialization script creates these indexes for fast queries:

```sql
-- User lookups
CREATE INDEX idx_users_username ON cloud_users(username);
CREATE INDEX idx_users_email ON cloud_users(email);

-- Exam queries
CREATE INDEX idx_exams_teacher ON cloud_exams(teacher_id);
CREATE INDEX idx_exams_published ON cloud_exams(published_at);

-- Submission filtering
CREATE INDEX idx_submissions_exam ON cloud_exam_submissions(exam_id);
CREATE INDEX idx_submissions_student ON cloud_exam_submissions(student_id);
CREATE INDEX idx_submissions_timestamp ON cloud_exam_submissions(submitted_at);
CREATE INDEX idx_submissions_status ON cloud_exam_submissions(status);

-- Analytics
CREATE INDEX idx_analytics_exam ON cloud_class_analytics(exam_id);
CREATE INDEX idx_reports_exam ON cloud_teacher_reports(exam_id);

-- Sync queue
CREATE INDEX idx_sync_queue_device ON cloud_sync_queue(device_id);
CREATE INDEX idx_sync_queue_status ON cloud_sync_queue(status);
```

---

## Next Steps (Phase 2-5)

After Phase 1 setup is validated:

1. **Phase 2:** Teacher exam upload workflow
   - REST endpoint for uploading PDF + test cases
   - S3 storage for evidence files
   - Versioning for exam updates

2. **Phase 3:** Student download and offline caching
   - Download exam to local SQLite
   - Implement sync_queue table
   - Retry logic for unreliable networks

3. **Phase 4:** Submission sync
   - Upload student code evaluations
   - Sync violation reports
   - Handle conflicts (local vs. cloud timestamps)

4. **Phase 5:** Teacher offline grading
   - Keep teacher annotations local (never sync)
   - Optional: sync summary grades only

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────┐
│         LAB-Guard Hybrid Cloud-Local System         │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│          CLOUD (Phase 1 - Now Active)               │
├─────────────────────────────────────────────────────┤
│  Express.js REST API (live-db-server.js)           │
│  │                                                   │
│  ├─ /api/auth/* (login, register, refresh)         │
│  ├─ /api/exams/* (list, upload, download)          │
│  ├─ /api/submissions/* (sync, query)               │
│  ├─ /api/analytics/* (class stats)                 │
│  └─ /api/health, /api/status                       │
│                                                      │
│  PostgreSQL (lab_guard_cloud)                      │
│  ├─ cloud_users (teachers, students)               │
│  ├─ cloud_exams (exam papers - immutable)          │
│  ├─ cloud_exam_submissions (student codes)         │
│  ├─ cloud_class_analytics (aggregated stats)       │
│  └─ cloud_sync_queue (offline retry logic)         │
│                                                      │
│  AWS S3 (Optional)                                  │
│  ├─ Evidence files (screenshots, camera)           │
│  └─ Exam PDFs                                      │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│         LOCAL (Electron + SQLite)                   │
├─────────────────────────────────────────────────────┤
│  Electron Main Process                              │
│  ├─ WindowsMonitorService (1Hz polling)            │
│  ├─ CameraMonitoringService (Python subprocess)    │
│  ├─ CodeEvalService (C++ evaluation)               │
│  └─ MonitoringController (orchestration)           │
│                                                      │
│  React Frontend (React 19)                          │
│  ├─ StudentDashboard (exam view)                   │
│  ├─ TeacherDashboard (grading)                     │
│  └─ ExamPage (live monitoring)                     │
│                                                      │
│  SQLite (local-only data)                           │
│  ├─ exam_submissions (local copies)                │
│  ├─ app_violations (monitoring events)             │
│  ├─ code_evaluations (test results)                │
│  ├─ teacher_annotations (private workspace)        │
│  └─ sync_queue (offline-first retry)               │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│         DATA FLOW (Phase 1)                         │
├─────────────────────────────────────────────────────┤
│                                                      │
│  1. Teacher uploads exam to cloud                   │
│     Teacher [PDF + test cases] → Cloud DB          │
│                                                      │
│  2. Student downloads exam locally                  │
│     Cloud DB [exam paper] → Local SQLite           │
│                                                      │
│  3. Monitoring happens locally (offline-ready)      │
│     Events recorded in local SQLite                │
│                                                      │
│  4. When online, sync occurs (Phase 3)             │
│     sync_queue handles retries & conflicts         │
│                                                      │
│  5. Teacher grades and optional summary sync       │
│     Teacher annotations stay local (Phase 5)       │
│                                                      │
└─────────────────────────────────────────────────────┘
```

---

## Files Created in Phase 1

```
LabGuard/
├── live-db-server.js                    ← Express REST API server
├── .env.example                          ← Environment template
├── setup-database.sh                     ← Bash setup script
│
├── backend/
│   ├── scripts/
│   │   ├── init-cloud-db.js             ← Database initialization (Node.js)
│   │   └── test-api.js                  ← API endpoint testing
│   │
│   └── db/
│       ├── migrate.js                    ← Migration runner
│       └── migrations/
│           └── 001_add_sync_metadata_column.js  ← Example migration
│
└── README.md                             ← You are reading this!
```

---

## Summary

✅ **Phase 1 Complete Setup Includes:**

- PostgreSQL schema with 10 tables
- Express REST API with 15+ endpoints
- Authentication system (JWT tokens)
- Database migration system
- API testing utilities
- Full documentation

✅ **Ready for:**

- Docker containerization
- Load testing
- Integration with Electron CloudSyncService
- Phase 2 exam upload workflows

---

## Support

For issues or questions:

1. Check the Troubleshooting section above
2. Review logs: `tail -f nohup.out`
3. Check database: `psql -U postgres -d lab_guard_cloud`
4. Test API: `node backend/scripts/test-api.js`
