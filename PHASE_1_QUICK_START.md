# Phase 1 Quick Start Checklist

## ✅ Phase 1 Implementation Complete

All infrastructure files have been created. Use this checklist to get up and running.

---

## Pre-Setup (Prerequisites)

- [ ] Install Node.js 16+ (includes npm)
- [ ] Install PostgreSQL 12+
- [ ] Clone/have LAB-Guard repository
- [ ] Have a terminal or PowerShell ready

---

## Setup Steps

### 1. Install Dependencies (2 minutes)

```bash
npm install
```

**What it does:**

- Installs 50+ npm packages
- Adds: pg, express, bcryptjs, cors, dotenv, aws-sdk, multer, etc.
- Creates node_modules/

**Status:** ✅ Skip if already done

---

### 2. Configure Environment (3 minutes)

```bash
cp .env.example .env
```

**Edit `.env` file:**

```env
# PostgreSQL Connection
DB_HOST=localhost        # PostgreSQL server
DB_PORT=5432            # PostgreSQL port
DB_USER=postgres        # Your PostgreSQL username
DB_PASSWORD=postgres    # Your PostgreSQL password
DB_NAME=lab_guard_cloud # Database to create

# Server Config
PORT=3001               # Express server port
NODE_ENV=development    # dev or production

# JWT Secrets (CHANGE THESE!)
JWT_SECRET=your_secret_key_here_change_this
JWT_REFRESH_SECRET=your_refresh_secret_change_this
```

**Status:** ✅ Required before db:init

---

### 3. Initialize Database (1 minute)

```bash
npm run db:init
```

**What it does:**

- Creates PostgreSQL database: `lab_guard_cloud`
- Creates 10 tables (exams, submissions, users, etc.)
- Creates 18 indexes for performance
- Adds test data (teacher1, student1)
- Shows colored output with success messages

**Expected Output:**

```
[✓] Database 'lab_guard_cloud' created
[✓] Table 'cloud_users' created/verified
[✓] Table 'cloud_exams' created/verified
...
[✓] Index 'idx_users_username' created
...
[✓] Test teacher created (username: teacher1, password: teacher123)
[✓] Test student created (username: student1, password: student123)
[✓] Test exam created
[✓] Database initialization complete!
```

**Status:** ✅ Run once

---

### 4. Start API Server (instant)

```bash
npm run api:start
```

**What it does:**

- Starts Express server on port 3001
- Connects to PostgreSQL
- Opens API for requests
- Shows "Server listening on port 3001"

**Keep this terminal open** (or run in background)

**Alternative (development):**

```bash
npm run api:dev
```

(Includes debug logging)

**Status:** ✅ Keep running for next step

---

### 5. Test API Endpoints (1 minute)

```bash
# In a NEW terminal (while server is running)
npm run db:test
```

**What it does:**

- Runs 5 automated tests
- Tests health, auth, database, S3, endpoints
- Shows pass/fail results
- Confirms everything is working

**Expected Output:**

```
→ Test: Health Check
  ✓ Server is healthy (status: ok)

→ Test: User Authentication
  ✓ Login successful
  Token received: eyJhbGciOiJIUzI1NiIsInR...

→ Test: Status Endpoint
  ✓ Status retrieved successfully
  Database connected: true

═══════════════════════════════════════════════════════════════
Passed: 5
Failed: 0
Total:  5
═══════════════════════════════════════════════════════════════

✓ All tests passed!
```

**Status:** ✅ Confirms Phase 1 is working

---

## 🎉 Phase 1 is Complete!

At this point you have:

- ✅ Express REST API running on `http://localhost:3001`
- ✅ PostgreSQL database with all tables
- ✅ Test users created (teacher1, student1)
- ✅ 15+ API endpoints ready
- ✅ All tests passing

---

## Manual Testing (Optional)

### Test Login

```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "teacher1",
    "password": "teacher123",
    "device_id": "device_001"
  }'
```

**Expected Response:**

```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR...",
  "user": {
    "user_id": "a0000000-0000-0000-0000-000000000001",
    "username": "teacher1",
    "role": "teacher",
    "full_name": "John Doe"
  }
}
```

### Test Health Check

```bash
curl http://localhost:3001/api/health
```

**Expected Response:**

```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:45.123Z"
}
```

### Test Status

```bash
# Get a token first from login test above
export TOKEN="<token_from_login>"

curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3001/api/status
```

**Expected Response:**

```json
{
  "status": "operational",
  "database": {
    "connected": true,
    "tables": 10
  },
  "s3": {
    "configured": false
  },
  "timestamp": "2024-01-15T10:30:45.123Z"
}
```

---

## Database Management

### Check Migration Status

```bash
npm run db:migrate:status
```

**Output:**

```
Migration Status:

Executed Migrations:
  (none)

Pending Migrations:
  (none)
```

### View Database (psql)

```bash
psql -U postgres -d lab_guard_cloud

# Inside psql:
\dt              # Show all tables
\d+ cloud_exams  # Describe table
SELECT * FROM cloud_users;  # Query data
\q               # Exit
```

### Reset Database (if needed)

```bash
# Drop and recreate
PGPASSWORD=postgres psql -U postgres -c "DROP DATABASE lab_guard_cloud;"
npm run db:init
```

---

## Troubleshooting

### ❌ PostgreSQL Connection Failed

```
Error: connect ECONNREFUSED 127.0.0.1:5432
```

**Fix:**

1. Check PostgreSQL is running
2. Verify DB_HOST and DB_PORT in .env
3. Confirm credentials
4. Try: `psql -U postgres` to verify connection

### ❌ Database Already Exists

```
[WARN] Database 'lab_guard_cloud' already exists
```

**Fix:** This is fine, just means you've run it before.

### ❌ Port 3001 Already in Use

```
Error: listen EADDRINUSE :::3001
```

**Fix:**

1. Change PORT in .env to 3002, 3003, etc.
2. Or kill existing process: `lsof -i :3001` (Mac/Linux)
3. Or use Task Manager (Windows)

### ❌ JWT Token Invalid

```
Error: Invalid token
```

**Fix:**

1. Make sure JWT_SECRET is consistent
2. Token may have expired (default 1 hour)
3. Use refresh token endpoint

### ❌ Test Users Not Found

```
Error: 401 Unauthorized
```

**Fix:** Run database init again to create test data:

```bash
npm run db:init
```

---

## npm Scripts (Handy Reference)

```bash
# Database Management
npm run db:init           # Initialize cloud database
npm run db:migrate:status # Show migration status
npm run db:migrate:up     # Run pending migrations
npm run db:migrate:down   # Rollback last migration

# API Server
npm run api:start         # Start API server (production)
npm run api:dev          # Start API server (development/debug)

# Testing
npm run db:test          # Run automated API tests

# Original LAB-Guard scripts (still available)
npm run dev              # Start Electron + React dev
npm run start:dev        # Start Electron only
npm start                # Production build
```

---

## API Endpoints (Reference)

### Authentication

| Method | Endpoint             | Purpose         |
| ------ | -------------------- | --------------- |
| POST   | `/api/auth/login`    | Login & get JWT |
| POST   | `/api/auth/register` | Register user   |
| POST   | `/api/auth/refresh`  | Refresh token   |

### Exams

| Method | Endpoint               | Purpose          |
| ------ | ---------------------- | ---------------- |
| GET    | `/api/exams/available` | List exams       |
| GET    | `/api/exams/:examId`   | Get exam details |
| POST   | `/api/exams/upload`    | Upload exam      |

### Submissions

| Method | Endpoint                  | Purpose        |
| ------ | ------------------------- | -------------- |
| POST   | `/api/submissions/upload` | Submit exam    |
| GET    | `/api/submissions/:id`    | Get submission |

### Health

| Method | Endpoint      | Purpose        |
| ------ | ------------- | -------------- |
| GET    | `/api/health` | Server status  |
| GET    | `/api/status` | DB + S3 status |

---

## Architecture Diagram

```
┌─────────────────────────────────────────┐
│     Phase 1: Cloud Infrastructure       │
├─────────────────────────────────────────┤
│                                         │
│  Express API (live-db-server.js)        │
│  Port 3001                              │
│                                         │
│  ├─ /api/auth/* (login, register)      │
│  ├─ /api/exams/* (upload, download)    │
│  ├─ /api/submissions/* (sync)          │
│  ├─ /api/analytics/* (stats)           │
│  └─ /api/health (monitoring)           │
│                                         │
└─────────────────────────────────────────┘
    ↓              ↓              ↓
PostgreSQL       JWT            AWS S3
(tables)       (tokens)        (files)
```

---

## File Structure Created

```
LabGuard/
├── live-db-server.js              ← Main API server
├── .env.example                   ← Environment template
├── .env                           ← Your configuration (create from .example)
├── setup-database.sh              ← Bash setup script
│
├── backend/
│   ├── scripts/
│   │   ├── init-cloud-db.js      ← Database init
│   │   └── test-api.js            ← API tests
│   │
│   └── db/
│       ├── migrate.js             ← Migration runner
│       └── migrations/
│           └── 001_*.js           ← Migration files
│
├── package.json                   ← Updated with new scripts
├── PHASE_1_SETUP_GUIDE.md         ← Full documentation (500 lines)
└── PHASE_1_IMPLEMENTATION_SUMMARY.md ← Detailed reference

```

---

## Next Phase (Phase 2)

After Phase 1 is confirmed working:

### Phase 2: Teacher Exam Upload

```bash
# Teachers will be able to:
- Click "Upload Exam"
- Select PDF + test cases
- POST /api/exams/upload
- Exam stored in PostgreSQL + S3
- Students can download it
```

### Phase 3: Student Download

```bash
# Students will be able to:
- See available exams
- Download to local SQLite
- Sync queue handles offline scenarios
- Retry logic on network reconnect
```

### Phase 4: Submission Sync

```bash
# Submissions will:
- Upload code + violations
- Store in PostgreSQL
- Evidence in S3
- Analytics aggregated
```

### Phase 5: Teacher Grading

```bash
# Teachers can:
- Grade submissions
- Keep annotations local (private)
- Optional: sync summary grades
- Generate class reports
```

---

## Performance Notes

✅ **Database Indexes:** 18 indexes created for fast queries
✅ **Connection Pooling:** 20 PostgreSQL connections
✅ **Rate Limiting:** 100 requests per 15 minutes
✅ **JWT Caching:** Tokens in memory (25min TTL)
✅ **S3 Integration:** Ready for evidence storage

---

## Security Notes

✅ **Passwords:** Bcrypt hashed (10 rounds)
✅ **Tokens:** JWT with expiration (1 hour)
✅ **CORS:** Restricted to localhost (development)
✅ **SQL Injection:** Parameterized queries
✅ **Rate Limiting:** Prevents brute force
✅ **Device Fingerprinting:** Detects unauthorized devices

---

## Support

### Check Logs

```bash
# Server logs shown in terminal
# Look for [ERROR] or [WARN] messages

# Database logs
SELECT * FROM cloud_audit_log ORDER BY created_at DESC;
```

### Debug Mode

```bash
NODE_LOG_LEVEL=debug npm run api:dev
```

### Test Data

- Username: `teacher1` | Password: `teacher123`
- Username: `student1` | Password: `student123`
- Test Exam: "Algorithms 101 Midterm"

---

## Summary

🎉 **Phase 1 Complete!**

You now have:

- ✅ Cloud database (PostgreSQL)
- ✅ REST API (Express.js)
- ✅ Authentication (JWT)
- ✅ 10+ tables ready
- ✅ All tests passing
- ✅ Foundation for Phases 2-5

---

## Getting Help

1. **Check PHASE_1_SETUP_GUIDE.md** for detailed documentation
2. **Check PHASE_1_IMPLEMENTATION_SUMMARY.md** for architecture details
3. **Run tests:** `npm run db:test` to confirm everything works
4. **Check database:** `psql -U postgres -d lab_guard_cloud`
5. **Review logs:** Look for errors in terminal output

---

**Next Command to Run:**

```bash
npm run db:init && npm run api:start
```

Then in another terminal:

```bash
npm run db:test
```

All tests pass? ✅ **Phase 1 is ready!**

---

_Last Updated: 2024_
_LAB-Guard Phase 1 Quick Start_
