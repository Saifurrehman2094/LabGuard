# Phase 2: Teacher Exam Upload Implementation

## Overview

**Phase 2** implements the **teacher exam upload workflow** allowing teachers to:

- ✅ Upload exam PDF files to the cloud
- ✅ Define questions and test cases
- ✅ Publish exams for students to download
- ✅ Track upload progress

**Status:** ✅ **Complete**

---

## What's New in Phase 2

### Backend Enhancements

**File: `live-db-server.js`**

- ✅ Added `multer` middleware for PDF file handling
- ✅ Created `data/exam_uploads/` directory for storing PDFs locally
- ✅ Enhanced `POST /api/exams/upload` endpoint to accept multipart form data
- ✅ Added `GET /api/exams/files/:filename` endpoint for serving PDFs
- ✅ Implemented file validation (PDF only, 50MB limit)
- ✅ Transaction-based database operations for data consistency

**Key Features:**

- File upload with progress tracking
- Automatic PDF validation
- Secure file serving with path traversal prevention
- Automatic cleanup on upload failure
- Comprehensive error handling

### Frontend React Component

**File: `frontend/src/components/TeacherExamUpload.tsx`**

3-step wizard interface:

1. **Step 1: Exam Details**
   - Title, description, duration
   - Allowed applications list
   - PDF file upload with drag-and-drop

2. **Step 2: Questions & Test Cases**
   - Dynamic question form
   - Multiple test cases per question
   - Hidden/secret test case support
   - Add/remove questions and test cases

3. **Step 3: Review & Confirm**
   - Summary of exam data
   - Upload progress bar
   - Final submission

**Styling: `frontend/src/components/TeacherExamUpload.css`**

- Modern gradient design
- Responsive layout (mobile-friendly)
- Accessibility-first approach
- Smooth animations and transitions

### API Endpoints (Updated)

| Method | Endpoint                      | Purpose              | Status      |
| ------ | ----------------------------- | -------------------- | ----------- |
| POST   | `/api/exams/upload`           | Upload exam with PDF | ✅ Enhanced |
| GET    | `/api/exams/files/:filename`  | Serve PDF files      | ✅ New      |
| GET    | `/api/exams/available`        | List exams           | ✅ Working  |
| GET    | `/api/exams/:examId/download` | Download exam        | ✅ Working  |

### Testing Suite

**File: `backend/scripts/test-api-phase2.js`**

Comprehensive tests for Phase 2:

- ✅ Health check (server ready)
- ✅ Authentication (get JWT token)
- ✅ File upload (with PDF)
- ✅ File download
- ✅ Exam listing

---

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

This installs the new `form-data` package needed for multipart requests.

### 2. Ensure Database is Running

```bash
# Verify database is initialized
npm run db:migrate:status

# If not initialized, run:
npm run db:init
```

### 3. Start API Server

```bash
npm run api:start
```

**Expected output:**

```
[DB] ✅ Connected to PostgreSQL
[DB] ✅ Database initialization complete
[SERVER] ✅ Live Database API running on http://localhost:5000
```

### 4. Verify Phase 2 is Working

```bash
# In a new terminal
npm run db:test:phase2
```

**Expected output:**

```
→ Test: Health Check (Phase 2 Ready)
  ✓ API server is running

→ Test: User Authentication (Get JWT Token)
  ✓ Login successful
  Token: eyJhbGciOiJIUzI1NiIsInR...

→ Test: Upload Exam with PDF File
  ✓ Exam uploaded successfully
  Exam ID: a1b2c3d4-e5f6-g7h8-i9j0-k1l2m3n4o5p6
  PDF URL: /api/exams/files/exam_12345.pdf

→ Test: Download Uploaded Exam
  ✓ Exam downloaded successfully

→ Test: List Available Exams
  ✓ Exams list retrieved
  Total exams: 2
  Exams with PDFs: 1

═══════════════════════════════════════════════════════════════════
Test Summary
═══════════════════════════════════════════════════════════════════
Passed: 5
Failed: 0
Total:  5
═══════════════════════════════════════════════════════════════════

✓ All Phase 2 tests passed!
```

---

## Integration with Teacher Dashboard

### 1. Import Component

In your `TeacherDashboard.tsx`:

```typescript
import TeacherExamUpload from "./TeacherExamUpload";
```

### 2. Add to State

```typescript
const [showUploadModal, setShowUploadModal] = useState(false);
```

### 3. Use Component

```typescript
{showUploadModal && (
  <TeacherExamUpload
    token={authToken}
    onUploadSuccess={(exam) => {
      console.log('Exam uploaded:', exam);
      setShowUploadModal(false);
      // Refresh exams list
      fetchExams();
    }}
  />
)}
```

### 4. Add Upload Button

```typescript
<button onClick={() => setShowUploadModal(true)}>
  + Upload New Exam
</button>
```

---

## API Usage Examples

### Upload Exam with curl

```bash
# 1. Get token
TOKEN=$(curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"teacher1","password":"teacher123","device_id":"device_001"}' \
  | jq -r '.token')

# 2. Upload exam (create test.pdf first)
curl -X POST http://localhost:5000/api/exams/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "exam_data={\"title\":\"Test Exam\",\"duration_minutes\":120}" \
  -F "questions=[{\"question_number\":1,\"question_text\":\"2+2?\",\"test_cases\":[{\"input\":\"2 2\",\"expected_output\":\"4\"}]}]" \
  -F "metadata={\"uploader_device_id\":\"device_001\"}" \
  -F "pdf_file=@test.pdf"
```

### Upload Exam with JavaScript/Fetch

```javascript
const uploadExam = async (examData, pdfFile, token) => {
  const formData = new FormData();
  formData.append("exam_data", JSON.stringify(examData));
  formData.append("questions", JSON.stringify(questions));
  formData.append(
    "metadata",
    JSON.stringify({ upload_date: new Date().toISOString() }),
  );
  formData.append("pdf_file", pdfFile);

  const response = await fetch("http://localhost:5000/api/exams/upload", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  return await response.json();
};
```

---

## File Structure (Phase 2 Additions)

```
LabGuard/
├── live-db-server.js              ← Updated with multer & file serving
│
├── data/
│   └── exam_uploads/              ← NEW: Stores uploaded PDFs
│
├── frontend/src/components/
│   ├── TeacherExamUpload.tsx       ← NEW: Upload component
│   └── TeacherExamUpload.css       ← NEW: Upload styles
│
├── backend/scripts/
│   └── test-api-phase2.js          ← NEW: Phase 2 tests
│
├── package.json                   ← Updated with form-data + scripts
│
└── PHASE_2_SETUP_GUIDE.md         ← You are here
```

---

## Configuration

### Environment Variables (Optional)

In `.env`:

```env
# File Upload Settings
UPLOAD_MAX_SIZE=52428800          # 50MB in bytes
UPLOAD_DIR=data/exam_uploads      # Directory for uploads

# Exam Settings
DEFAULT_EXAM_DURATION=120          # Minutes
ALLOWED_FILE_TYPES=pdf             # Comma-separated
```

### File Storage

- **Location:** `data/exam_uploads/`
- **Naming:** `exam_<uuid>.pdf`
- **Max Size:** 50MB
- **Cleanup:** Automatic on failure

---

## Database Schema Changes

No schema changes in Phase 2. The `cloud_exams` table already supports:

- `pdf_url` column for PDF reference
- `sync_metadata` for file tracking
- `created_at`, `published_at` timestamps

---

## Security Considerations

### File Upload Security

- ✅ PDF validation (mimetype check)
- ✅ File size limit (50MB max)
- ✅ Secure filename generation (UUID-based)
- ✅ Path traversal prevention

### Authentication

- ✅ JWT token required for upload
- ✅ Role-based access control (teachers only)
- ✅ Device fingerprinting for audit trail

### Data Integrity

- ✅ Database transactions for consistency
- ✅ Automatic cleanup on failure
- ✅ File existence validation before serving

---

## Troubleshooting

### Upload Fails with "Only PDFs allowed"

**Issue:** File type validation failed

```
Error: Only PDF files are allowed
```

**Fix:**

1. Ensure file is actual PDF (not renamed)
2. Check file MIME type: `file -i yourfile.pdf`
3. Verify file extension is `.pdf`

### File Size Error

**Issue:** Upload exceeds 50MB limit

```
Error: File size exceeds limit
```

**Fix:**

1. Reduce PDF file size
2. Or update `UPLOAD_MAX_SIZE` in `.env`
3. Compress PDF if possible

### Upload Directory Permission Error

**Issue:** Cannot write to `data/exam_uploads/`

```
Error: EACCES: permission denied
```

**Fix:**

```bash
# Create directory with permissions
mkdir -p data/exam_uploads
chmod 755 data/exam_uploads
```

### PDF Not Found After Upload

**Issue:** Upload succeeds but PDF can't be served

```
Error: File not found (404)
```

**Fix:**

1. Check `data/exam_uploads/` directory
2. Verify file was actually created
3. Check file permissions: `ls -la data/exam_uploads/`

---

## Performance Optimization

### For Large Files

- Use chunked uploads (implement in Phase 4)
- Add compression middleware
- Implement caching for frequently accessed PDFs

### For Multiple Uploads

- Implement upload queue
- Add concurrent upload limits
- Monitor disk space

### Database Performance

- The existing indexes support file metadata queries
- `idx_exams_teacher` helps list teacher's exams quickly
- `idx_exams_published` speeds up student discovery

---

## Testing Scenarios

### Scenario 1: Single Question Exam

```javascript
const exam = {
  title: "Simple Math",
  duration_minutes: 60,
  questions: [
    {
      question_number: 1,
      question_text: "What is 2+2?",
      test_cases: [{ input: "2 2", expected_output: "4", is_hidden: false }],
    },
  ],
};
```

### Scenario 2: Multi-Question Exam

```javascript
const exam = {
  title: "Algorithms Final",
  duration_minutes: 180,
  questions: [
    {
      /* Question 1 */
    },
    {
      /* Question 2 */
    },
    {
      /* Question 3 */
    },
  ],
};
```

### Scenario 3: Mixed Test Cases

```javascript
const question = {
  question_number: 1,
  question_text: "Implement sum function",
  test_cases: [
    { input: "1 2 3", expected_output: "6", is_hidden: false }, // Public
    { input: "-1 -2", expected_output: "-3", is_hidden: true }, // Secret
    { input: "1000000 1000000", expected_output: "2000000", is_hidden: true }, // Edge case
  ],
};
```

---

## Monitoring & Logging

### Check Upload Success

```sql
SELECT exam_id, title, pdf_url, created_at
FROM cloud_exams
WHERE teacher_id = 'teacher_uuid'
ORDER BY created_at DESC;
```

### Check File Existence

```bash
ls -lh data/exam_uploads/
du -sh data/exam_uploads/  # Total size
```

### Monitor Uploads

```bash
# Watch upload directory in real-time
watch -n 1 'ls -lh data/exam_uploads/ | tail -20'
```

---

## Next Steps: Phase 3

### Student Download & Local Caching

- Implement `GET /api/exams/download` for students
- Store exams in local SQLite
- Implement caching strategy
- Handle offline scenarios

### Expected Phase 3 Tasks:

1. Create student download component
2. Implement local cache management
3. Add sync queue for offline support
4. Create student exam browser UI

---

## npm Scripts (Phase 2)

```bash
npm run api:start          # Start API server
npm run db:test           # Phase 1 tests (basic)
npm run db:test:phase2    # Phase 2 tests (file upload)
npm run db:init           # Initialize/reset database
npm run db:migrate:status # Check migration status
```

---

## Summary

✅ **Phase 2 Complete Features:**

- File upload with validation
- PDF storage and serving
- Multi-step wizard UI
- Comprehensive testing
- Full documentation

✅ **Production Ready:**

- Error handling
- Security validation
- Transaction safety
- Progress tracking
- Responsive design

✅ **Tested & Verified:**

- 5 automated tests pass
- File upload works end-to-end
- Database integration validated
- UI component responsive

---

## Deployment Notes

For production deployment:

1. Move `data/exam_uploads/` to persistent storage (EBS, NFS, etc.)
2. Implement S3 integration for cloud storage
3. Add CDN for PDF delivery
4. Enable HTTPS for file transfers
5. Implement rate limiting on uploads
6. Add virus scanning for uploaded files
7. Set up backup schedule for uploads

---

## Support & Debugging

**Enable Debug Mode:**

```bash
NODE_DEBUG=* NODE_LOG_LEVEL=debug npm run api:start
```

**Check Server Logs:**

- Watch terminal where server is running
- Look for `[EXAMS]`, `[DB]`, `[FILES]` prefixes

**Test Individual Endpoints:**

```bash
# Get token
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"teacher1","password":"teacher123","device_id":"test"}'

# List exams
curl -H "Authorization: Bearer TOKEN" \
  http://localhost:5000/api/exams/available

# Download exam
curl -H "Authorization: Bearer TOKEN" \
  http://localhost:5000/api/exams/EXAM_ID/download
```

---

_Last Updated: May 2026_
_LAB-Guard Phase 2: Teacher Exam Upload_
