# LAB-Guard: Hybrid Cloud-Local Database Architecture

**Status:** Proposed Architecture Enhancement  
**Date:** May 9, 2026  
**Objective:** Separate exam data (cloud) from local operations (SQLite) with sync mechanism

---

## 📌 Overview: Dual-Database Strategy

### Current Architecture

```
Local SQLite DB (all data)
│
└─ Everything stored locally
   ├─ Exams, papers, questions
   ├─ Student submissions
   ├─ Teacher reports
   └─ Analytics
```

### Proposed Hybrid Architecture

```
┌─────────────────────────────────────────────────────────────┐
│              LIVE DATABASE (Cloud)                          │
│  ├─ Exam Papers (uploaded by teacher)                      │
│  ├─ Student Reports (uploaded after exam)                  │
│  ├─ Class Analytics (aggregated)                           │
│  └─ Shared Resources (accessible by teacher/admin)         │
└─────────────────────────────────────────────────────────────┘
              ↑                           ↑
         [SYNC UP]                  [SYNC DOWN]
              │                           │
┌──────────────┴─────────────────────────┴──────────────────┐
│         LOCAL SQLite Database (Student PC)                │
│  ├─ Exam session data (active exam only)                 │
│  ├─ Monitoring events (app violations, camera)           │
│  ├─ Code compilation + test results                      │
│  ├─ Temporary submission files                           │
│  └─ Sync queue (pending uploads)                         │
└──────────────────────────────────────────────────────────┘
              ↑                           ↑
         [SYNC UP]                  [SYNC DOWN]
              │                           │
┌──────────────┴─────────────────────────┴──────────────────┐
│      LOCAL SQLite Database (Teacher PC)                   │
│  ├─ Downloaded reports (cached)                          │
│  ├─ Local annotations + notes                            │
│  ├─ Grading rubrics (local customization)                │
│  ├─ Teacher workspace (class reports, analytics)         │
│  └─ Offline grading (sync when online)                   │
└──────────────────────────────────────────────────────────┘
```

---

## 🔄 Data Flow Architecture

### **Scenario 1: Teacher Uploads Exam**

```
TEACHER PC (Local SQLite)
├─ Create exam (title, dates, allowed_apps)
├─ Upload PDF paper
└─ Store locally in exams table

SYNC PROCESS
├─ Detect exam is ready for upload
├─ Compress files (exam, PDF, test cases)
├─ POST to Live DB API: /api/exams/upload
│  └─ Payload: { exam_data, pdf_file, test_cases, metadata }
│
LIVE DATABASE
├─ Receive upload
├─ Verify teacher credentials
├─ Store exam record in cloud_exams table
├─ Store PDF file (cloud storage)
├─ Generate exam_id (UUID)
└─ Return confirmation

SYNC CONFIRMATION
├─ Receive exam_id from Live DB
├─ Store exam_id in local exams table (sync_status = 'uploaded')
├─ Mark exam as "Published to Cloud"
└─ Make available to students
```

### **Scenario 2: Student Downloads & Takes Exam**

```
STUDENT PC (Initial State)
├─ Local SQLite: Empty or only previous exam data
└─ Student logs in with credentials

LIVE DATABASE CHECK
├─ Student requests: /api/exams/available?student_id=X
├─ Live DB checks course enrollment
└─ Returns available exams list

EXAM DOWNLOAD
├─ Student selects exam → "Start Exam"
├─ Download from Live DB: /api/exams/{exam_id}/download
│  └─ Payload: { exam_details, pdf, test_cases, allowed_apps }
│
STUDENT PC (Local SQLite)
├─ Create exam_session table entry
├─ Store exam data locally (sync_status = 'local')
├─ Store PDF file locally (/data/uploads/exams/exam_id/)
├─ Store allowed_apps list
└─ Begin monitoring:
   ├─ App focus polling
   ├─ Camera monitoring (Python subprocess)
   └─ Record all events to local app_violations table

DURING EXAM
├─ All operations stored LOCALLY ONLY
│  ├─ Student codes in IDE
│  ├─ Violations recorded locally
│  ├─ Code compiled locally (g++)
│  ├─ Tests run against local test cases
│  └─ Scores calculated locally
│
└─ Local SQLite grows (monitoring events, test results)

SUBMISSION
├─ Student clicks "Submit"
├─ Prepare upload packet:
│  ├─ exam_submissions record
│  ├─ code_evaluations
│  ├─ test_case_results
│  ├─ app_violations (all events)
│  ├─ camera_violations
│  ├─ screenshots (if enabled)
│  └─ metadata (submission_time, device_id)
│
├─ Add to sync_queue table (pending_uploads)
└─ Upload to Live DB: /api/submissions/upload
   └─ Payload: { submission_data, violations, evidence_files }
```

### **Scenario 3: Teacher Fetches & Analyzes Reports**

```
TEACHER PC
├─ Navigate to "Fetch Reports" button
├─ Select exam (from synced list)
└─ Request: /api/exams/{exam_id}/submissions

LIVE DATABASE
├─ Query cloud_exam_submissions table
├─ Verify teacher authorization (owns exam)
├─ Return all submissions metadata
│  └─ { submission_id, student_name, timestamp, status }

TEACHER PC (Download & Cache)
├─ Download submissions batch
│  ├─ exam_submissions records
│  ├─ code_evaluations
│  ├─ app_violations summary
│  └─ camera_violations summary
│
├─ Store in local teacher_submissions table
├─ Cache reports (last_synced_at = NOW())
└─ Load dashboard:
   ├─ Show all submissions
   ├─ Sort by student, status, violations
   └─ Click submission → View details

TEACHER LOCAL ANALYSIS
├─ Add local annotations:
│  ├─ Grading rubric score
│  ├─ Notes: "Good approach but needs optimization"
│  ├─ Flagged: "Suspected plagiarism"
│  └─ Store in teacher_annotations table (LOCAL ONLY)
│
├─ Generate reports:
│  ├─ Individual student report (with violations)
│  ├─ Class report (aggregate stats)
│  └─ Violation analysis (top violators, patterns)
│
└─ Optional: Upload summary back to Live DB
   └─ /api/exams/{exam_id}/teacher-report
      └─ { class_stats, flagged_students, recommendations }
```

### **Scenario 4: Class-Wide Analytics**

```
LIVE DATABASE
├─ Aggregate data from all student submissions
├─ Calculate class statistics:
│  ├─ Average score
│  ├─ Submission rate (% completed)
│  ├─ Violation rate
│  ├─ Question difficulty
│  └─ Time-to-submission distribution
│
└─ Generate class analytics:
   ├─ Top performers
   ├─ Struggling students
   ├─ Common violations
   └─ Exam difficulty assessment

TEACHER PC (Optional Download)
├─ Fetch class analytics: /api/exams/{exam_id}/analytics
├─ Cache locally
└─ Use for:
   ├─ Parent-teacher conferences
   ├─ Curriculum adjustments
   ├─ Identify intervention needed
   └─ Grade distribution analysis
```

---

## 🗄️ Database Schema Changes

### Live Database (Cloud) - PostgreSQL/MongoDB

```sql
/* Cloud Exam Management */
TABLE cloud_exams (
  exam_id UUID PRIMARY KEY,
  teacher_id UUID NOT NULL,
  course_id UUID,
  title VARCHAR NOT NULL,
  pdf_url VARCHAR,  -- Cloud storage URL
  created_at TIMESTAMP,
  published_at TIMESTAMP,
  start_time TIMESTAMP,
  end_time TIMESTAMP,
  allowed_apps JSON,
  sync_metadata JSON,  -- { uploader_device_id, version, checksum }
  FOREIGN KEY (teacher_id) REFERENCES users(user_id)
)

/* Cloud Questions */
TABLE cloud_exam_questions (
  question_id UUID PRIMARY KEY,
  exam_id UUID NOT NULL,
  question_text TEXT,
  constraints JSON,
  metadata JSON,
  FOREIGN KEY (exam_id) REFERENCES cloud_exams(exam_id)
)

/* Cloud Test Cases */
TABLE cloud_test_cases (
  test_case_id UUID PRIMARY KEY,
  question_id UUID NOT NULL,
  input TEXT,
  expected_output TEXT,
  is_hidden BOOLEAN,
  metadata JSON,
  FOREIGN KEY (question_id) REFERENCES cloud_exam_questions(question_id)
)

/* Cloud Submissions */
TABLE cloud_exam_submissions (
  submission_id UUID PRIMARY KEY,
  exam_id UUID NOT NULL,
  student_id UUID,
  student_name VARCHAR,
  submitted_at TIMESTAMP,
  status VARCHAR,  -- pending, received, processed
  submission_data JSONB,  -- Full submission details
  violations_summary JSONB,  -- Aggregate violations
  evidence_s3_keys JSON,  -- Screenshot/evidence locations
  sync_timestamp TIMESTAMP,
  FOREIGN KEY (exam_id) REFERENCES cloud_exams(exam_id)
)

/* Cloud Submissions Detail */
TABLE cloud_submission_details (
  detail_id UUID PRIMARY KEY,
  submission_id UUID NOT NULL,
  code_evaluations JSONB,
  test_case_results JSONB,
  app_violations JSONB,
  camera_violations JSONB,
  metadata JSONB,
  FOREIGN KEY (submission_id) REFERENCES cloud_exam_submissions(submission_id)
)

/* Class Analytics (Pre-computed) */
TABLE cloud_class_analytics (
  analytics_id UUID PRIMARY KEY,
  exam_id UUID NOT NULL,
  total_submissions INT,
  average_score FLOAT,
  submission_rate FLOAT,
  violation_rate FLOAT,
  question_stats JSONB,  -- Per-question difficulty, pass rate
  temporal_stats JSONB,  -- Submission time distribution
  last_updated TIMESTAMP,
  FOREIGN KEY (exam_id) REFERENCES cloud_exams(exam_id)
)

/* Teacher Reports (Optional) */
TABLE cloud_teacher_reports (
  report_id UUID PRIMARY KEY,
  exam_id UUID NOT NULL,
  teacher_id UUID,
  report_type VARCHAR,  -- class_summary, flagged_students, etc.
  report_data JSONB,
  created_at TIMESTAMP,
  FOREIGN KEY (exam_id) REFERENCES cloud_exams(exam_id)
)
```

### Local Student Database (SQLite - Student PC)

```sql
/* Exam Session (Active) */
TABLE exam_sessions (
  session_id TEXT PRIMARY KEY,
  exam_id TEXT,
  exam_data BLOB,  -- Full exam details (JSON)
  pdf_data BLOB,  -- PDF file content (binary)
  start_time TIMESTAMP,
  end_time TIMESTAMP,
  status TEXT,  -- active, completed, submitted
  sync_status TEXT,  -- local, pending_upload, uploaded
  local_only INTEGER  -- 1 = not yet synced
)

/* Local Submission */
TABLE exam_submissions (
  submission_id TEXT PRIMARY KEY,
  exam_id TEXT,
  student_id TEXT,
  submitted_at TIMESTAMP,
  status TEXT,
  files_data BLOB,  -- Compressed code files
  sync_status TEXT
)

/* Monitoring Events (All local) */
TABLE app_violations (
  violation_id TEXT PRIMARY KEY,
  exam_id TEXT,
  app_name TEXT,
  focus_duration_seconds REAL,
  screenshot_path TEXT,
  timestamp TIMESTAMP,
  sync_status TEXT  -- pending_upload, uploaded
)

TABLE camera_violations (
  violation_id TEXT PRIMARY KEY,
  exam_id TEXT,
  violation_type TEXT,  -- phone, multiple_faces, gaze, etc.
  timestamp TIMESTAMP,
  evidence_path TEXT,  -- frame snapshot
  sync_status TEXT
)

/* Code Evaluation (Local) */
TABLE code_evaluations (
  evaluation_id TEXT PRIMARY KEY,
  submission_id TEXT,
  score REAL,
  max_score REAL,
  test_results BLOB,  -- JSON of all test results
  sync_status TEXT
)

/* Sync Queue */
TABLE sync_queue (
  queue_id TEXT PRIMARY KEY,
  table_name TEXT,
  record_id TEXT,
  operation TEXT,  -- upload, download
  priority INT,
  created_at TIMESTAMP,
  attempted_count INT,
  last_error TEXT,
  status TEXT  -- pending, in_progress, completed, failed
)

/* Sync History */
TABLE sync_history (
  sync_id TEXT PRIMARY KEY,
  exam_id TEXT,
  sync_type TEXT,  -- upload, download
  record_count INT,
  bytes_transferred INT,
  timestamp TIMESTAMP,
  status TEXT,  -- success, partial, failed
  error_log TEXT
)

/* Device Info */
TABLE device_info (
  device_id TEXT PRIMARY KEY,
  device_fingerprint TEXT,
  last_sync TIMESTAMP,
  last_exam TIMESTAMP,
  total_exams INT,
  storage_used_mb REAL
)
```

### Local Teacher Database (SQLite - Teacher PC)

```sql
/* Downloaded Submissions (Cache) */
TABLE teacher_submissions (
  submission_id TEXT PRIMARY KEY,
  exam_id TEXT,
  student_name TEXT,
  student_id TEXT,
  downloaded_at TIMESTAMP,
  cached_until TIMESTAMP,
  submission_data BLOB,  -- Full submission details
  sync_status TEXT  -- cached, local_modified, ready_to_upload
)

/* Teacher Annotations (LOCAL ONLY) */
TABLE teacher_annotations (
  annotation_id TEXT PRIMARY KEY,
  submission_id TEXT,
  annotation_type TEXT,  -- note, rubric_score, flag, comment
  content TEXT,
  created_at TIMESTAMP,
  sync_status TEXT  -- local_only (never synced)
)

/* Teacher Rubrics (Customizable) */
TABLE teacher_rubrics (
  rubric_id TEXT PRIMARY KEY,
  exam_id TEXT,
  rubric_name TEXT,
  criteria JSON,  -- [{ criterion, max_points, description }]
  created_at TIMESTAMP,
  is_local_custom INTEGER  -- 1 = local only
)

/* Class Reports (Generated Locally) */
TABLE class_reports (
  report_id TEXT PRIMARY KEY,
  exam_id TEXT,
  report_type TEXT,  -- performance_summary, violation_analysis, etc.
  report_data BLOB,  -- JSON report
  generated_at TIMESTAMP,
  is_saved_locally INTEGER
)

/* Flagged Students (Local Workspace) */
TABLE flagged_students (
  flag_id TEXT PRIMARY KEY,
  submission_id TEXT,
  exam_id TEXT,
  student_name TEXT,
  flag_reason TEXT,  -- suspected_plagiarism, violation_heavy, etc.
  flagged_at TIMESTAMP,
  resolution_status TEXT,  -- pending, resolved, false_alarm
  teacher_notes TEXT
)

/* Sync Metadata */
TABLE sync_metadata (
  metadata_id TEXT PRIMARY KEY,
  last_cloud_sync TIMESTAMP,
  last_exam_cached TEXT,
  cached_exams INT,
  total_cached_mb REAL,
  pending_uploads INT,
  connection_status TEXT  -- online, offline, slow
)
```

---

## 🔌 New Backend Services Required

### 1. **CloudSyncService** (Manages cloud-local sync)

```javascript
class CloudSyncService {
  // Upload operations
  async uploadExamSubmission(examId, submissionId) {
    // 1. Gather from local SQLite
    const submission = await localDB.getSubmission(submissionId);
    const violations = await localDB.getViolations(submissionId);
    const evaluation = await localDB.getEvaluation(submissionId);

    // 2. Compress & prepare payload
    const payload = {
      exam_id: examId,
      submission_data: submission,
      violations: violations,
      evaluation: evaluation,
      evidence_files: [], // Screenshots, etc.
      device_id: getDeviceId(),
    };

    // 3. Upload to Live DB
    try {
      const response = await this.cloudAPI.post("/submissions/upload", payload);

      // 4. Update local sync status
      await localDB.updateSyncStatus(submissionId, "uploaded");
      await this.addToSyncHistory("upload", "success", 1);

      return response;
    } catch (error) {
      await localDB.addToSyncQueue(
        "exam_submissions",
        submissionId,
        "upload",
        "high",
        error,
      );
      throw error;
    }
  }

  // Download operations
  async downloadExam(examId) {
    // 1. Request from Live DB
    const examData = await this.cloudAPI.get(`/exams/${examId}/full`);

    // 2. Store in local SQLite
    await localDB.storeExamSession({
      exam_id: examId,
      exam_data: examData,
      pdf_data: examData.pdf_binary,
      start_time: examData.start_time,
      sync_status: "local",
    });

    return examData;
  }

  // Batch download (teacher)
  async downloadSubmissions(examId, options = {}) {
    const submissions = await this.cloudAPI.get(
      `/exams/${examId}/submissions`,
      options,
    );

    for (const sub of submissions) {
      await teacherDB.cacheSubmission(sub);
    }

    return submissions.length;
  }

  // Conflict resolution
  async resolveConflict(recordType, localRecord, remoteRecord) {
    if (localRecord.modified_at > remoteRecord.modified_at) {
      return "use_local";
    } else {
      return "use_remote";
    }
  }

  // Retry failed syncs
  async retrySyncQueue() {
    const pending = await localDB.getSyncQueuePending();

    for (const item of pending) {
      if (item.attempted_count < 3) {
        try {
          await this.performSync(item);
        } catch (error) {
          await localDB.updateSyncQueue(item.id, {
            attempted_count: item.attempted_count + 1,
            last_error: error.message,
          });
        }
      }
    }
  }

  // Monitor connection status
  async checkConnection() {
    try {
      await this.cloudAPI.get("/health");
      return "online";
    } catch {
      return "offline";
    }
  }
}
```

### 2. **CloudAPIService** (HTTP client for Live DB)

```javascript
class CloudAPIService {
  constructor(baseUrl, apiKey) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
    this.timeout = 30000;
  }

  async get(endpoint, params = {}) {
    return this.request("GET", endpoint, null, params);
  }

  async post(endpoint, data) {
    return this.request("POST", endpoint, data);
  }

  async request(method, endpoint, body, params) {
    const url = new URL(endpoint, this.baseUrl);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

    const headers = {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
      "Device-ID": getDeviceId(),
    };

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : null,
        timeout: this.timeout,
      });

      if (!response.ok) {
        throw new CloudSyncError(response.status, response.statusText);
      }

      return response.json();
    } catch (error) {
      if (error instanceof CloudSyncError) throw error;
      throw new CloudSyncError("NETWORK_ERROR", error.message);
    }
  }
}
```

### 3. **LocalDatabaseService** (Enhanced for sync)

```javascript
class LocalDatabaseService {
  // Existing methods + new sync methods

  async updateSyncStatus(recordId, status) {
    const db = this.getDB();
    db.prepare(
      "UPDATE exam_submissions SET sync_status = ? WHERE submission_id = ?",
    ).run(status, recordId);
  }

  async addToSyncQueue(table, recordId, operation, priority, error = null) {
    const db = this.getDB();
    db.prepare(
      `INSERT INTO sync_queue 
       (queue_id, table_name, record_id, operation, priority, status, last_error, created_at)
       VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`,
    ).run(
      uuid(),
      table,
      recordId,
      operation,
      priority,
      error?.message || null,
      new Date(),
    );
  }

  async getSyncQueuePending() {
    const db = this.getDB();
    return db
      .prepare(
        "SELECT * FROM sync_queue WHERE status = ? ORDER BY priority DESC",
      )
      .all("pending");
  }

  async addToSyncHistory(syncType, status, recordCount, bytesTransferred = 0) {
    const db = this.getDB();
    db.prepare(
      `INSERT INTO sync_history 
       (sync_id, sync_type, status, record_count, bytes_transferred, timestamp)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(uuid(), syncType, status, recordCount, bytesTransferred, new Date());
  }

  async getDeviceInfo() {
    const db = this.getDB();
    return db.prepare("SELECT * FROM device_info LIMIT 1").get();
  }
}
```

---

## 🔐 API Endpoints (Live Database)

### Authentication & Setup

```
POST   /api/auth/register          → Create user account
POST   /api/auth/login             → Login, get JWT + device_id
POST   /api/auth/refresh           → Refresh token
POST   /api/devices/register       → Register student/teacher device
```

### Exam Management (Teacher → Cloud)

```
POST   /api/exams/upload           → Teacher uploads exam + PDF + test cases
GET    /api/exams/{exam_id}        → Fetch exam details
PUT    /api/exams/{exam_id}        → Update exam
DELETE /api/exams/{exam_id}        → Delete exam (if no submissions)
GET    /api/exams/{exam_id}/full   → Download full exam (for student)
```

### Student Exam Access (Student ← Cloud)

```
GET    /api/exams/available        → List available exams for student
GET    /api/exams/{exam_id}/download → Download exam details + PDF + test cases
```

### Submissions (Student → Cloud)

```
POST   /api/submissions/upload     → Student uploads submission + violations
GET    /api/submissions/{submission_id} → Get submission details
```

### Teacher Reports (Teacher ← Cloud)

```
GET    /api/exams/{exam_id}/submissions       → Fetch all submissions
GET    /api/exams/{exam_id}/submissions/{sid} → Fetch single submission
GET    /api/exams/{exam_id}/analytics        → Get class analytics
POST   /api/exams/{exam_id}/teacher-report   → Teacher posts class summary
```

### Sync & Status

```
GET    /api/health                  → Check Live DB connectivity
GET    /api/sync/status             → Get sync queue status
POST   /api/sync/retry              → Manual retry failed syncs
GET    /api/sync/history            → Sync operation history
```

---

## 🔄 Sync Strategy & Conflict Resolution

### **Automatic Sync Triggers**

```javascript
// Triggers for upload (Student PC)
1. On exam submission → Queue upload immediately
2. After exam ends → Mark for sync
3. On Wi-Fi connect → Retry pending uploads
4. Periodically (15 min) → Check for pending items

// Triggers for download (Teacher PC)
1. On "Fetch Reports" button → Download fresh
2. On app startup → Sync if online
3. Periodically (1 hour) → Cache refresh
4. On demand → Manual refresh
```

### **Offline Support**

```javascript
// Student PC (during exam)
- No internet required (exam data cached locally)
- All operations on local SQLite
- Submission queued for upload when online

// Teacher PC (grading)
- Can grade offline (downloaded reports cached)
- Local annotations NOT synced (local workspace only)
- When online: Can refresh reports, upload summaries
```

### **Conflict Resolution**

```
RULE 1: Immutable Records (no conflicts)
├─ exam_submissions (once submitted, never changed)
├─ app_violations (historical, immutable)
└─ camera_violations (historical, immutable)

RULE 2: Last-Write-Wins (for metadata)
├─ If local modified_at > remote modified_at → use local
├─ Else → use remote
└─ Log conflict for review

RULE 3: Teacher Annotations (local-only, never conflict)
├─ Stored only on teacher PC
├─ NOT synced to cloud
├─ User controls upload of summaries manually
└─ Prevents conflicts entirely
```

---

## 📊 Implementation Roadmap

### Phase 1: Infrastructure (Weeks 1-2)

- [ ] Set up Live Database (PostgreSQL or MongoDB)
- [ ] Create CloudSyncService
- [ ] Create CloudAPIService
- [ ] Design API endpoints
- [ ] Implement auth/JWT on Live DB

### Phase 2: Data Migration (Week 3)

- [ ] Migrate exam papers to Live DB (teacher data)
- [ ] Create cloud_exams, cloud_questions, cloud_test_cases tables
- [ ] Add sync_queue, sync_history to local SQLite
- [ ] Create device registration flow

### Phase 3: Sync Engine (Weeks 4-5)

- [ ] Implement upload mechanism (student submissions)
- [ ] Implement download mechanism (teacher reports)
- [ ] Add retry logic & offline queue
- [ ] Add conflict resolution
- [ ] Test sync edge cases

### Phase 4: Teacher Workspace (Week 6)

- [ ] Create teacher_annotations table (local-only)
- [ ] Build report download interface
- [ ] Add local caching strategy
- [ ] Create class analytics dashboard

### Phase 5: Testing & Deployment (Week 7-8)

- [ ] Integration testing (sync scenarios)
- [ ] Stress testing (large submissions)
- [ ] User acceptance testing
- [ ] Production deployment

---

## 🎯 Benefits of Hybrid Architecture

### **For Students**

✅ **Offline Exam Support** - Can take exam without internet (all data cached locally)  
✅ **Fast Performance** - Local SQLite queries are instant  
✅ **Privacy** - Exam data stays on PC until submission  
✅ **Automatic Backup** - Sync queue ensures no data loss

### **For Teachers**

✅ **Scalability** - Cloud DB handles many submissions  
✅ **Flexible Grading** - Download reports, grade offline, upload summaries  
✅ **Local Workspace** - Annotations stay private on teacher PC  
✅ **Class Analytics** - Cloud aggregates data from all students

### **For Admins**

✅ **Centralized Storage** - All exam papers & reports in one cloud location  
✅ **Data Integrity** - Cloud DB ensures consistency  
✅ **Audit Trail** - Track all syncs, uploads, downloads  
✅ **Disaster Recovery** - Cloud backup, local fallback

### **System-Wide**

✅ **Reduced Bandwidth** - Only syncs diffs, not full datasets  
✅ **Offline-First** - App works without internet  
✅ **Scalable** - Cloud can handle unlimited schools  
✅ **Secure** - Encryption in transit + device fingerprinting

---

## 🚨 Implementation Considerations

### **1. Network Resilience**

```javascript
// Detect poor/no connectivity
if (connection === 'offline') {
  // Queue syncs, continue local operations
  await syncService.queueUpload(submission)
  console.log('Queued for sync when online')
}

// Retry exponential backoff
backoff = 1s → 2s → 4s → 8s → 16s → 32s (max)
```

### **2. Storage Management**

```javascript
// Student PC local storage
- Exam data: ~5-50MB per exam
- Monitoring data: ~1-10MB (JSON logs)
- Evidence (screenshots): ~10-50MB per exam
- Total per student per exam: ~100-150MB
- Recommendation: 1GB free space

// Teacher PC local cache
- Downloaded submissions: ~10-500MB (depends on class size)
- Local annotations: ~1-10MB
- Recommendation: 5GB free space
```

### **3. Security**

```javascript
// Data in transit
- HTTPS only (TLS 1.3)
- JWT token auth
- Device fingerprint validation

// Data at rest (Local)
- SQLite encryption (optional: sqlcipher)
- File permissions (user-only read/write)

// Data at rest (Cloud)
- Encrypted DB columns
- S3 bucket encryption for evidence files
- Regular backups with encryption
```

### **4. Conflict Resolution Examples**

```
Case 1: Student submits, internet fails
├─ Local: submission_id = pending_upload
├─ Retry queue active
└─ On reconnect: Auto-sync to cloud

Case 2: Teacher downloads reports, modifies locally
├─ Local annotations table (never synced)
├─ If cloud has new submissions: Next fetch gets fresh
└─ Local changes stay local (optional manual upload)

Case 3: Multiple devices (teacher at home + school)
├─ Device-specific cache
├─ Latest fetched time per device
└─ Merge strategy: Teacher chooses which device's annotations to keep
```

---

## 📋 Migration Strategy

### **Step 1: Parallel Operation**

```
Phase 1: Run both systems
├─ Existing: All-local SQLite
├─ New: Live DB + sync
└─ Feature flag: `USE_HYBRID_SYNC = true/false`
```

### **Step 2: Gradual Rollout**

```
Week 1: Teachers → Upload exams to cloud
Week 2: Students → Download from cloud, take exam locally
Week 3: Students → Auto-sync submissions to cloud
Week 4: Teachers → Download reports, grade locally
Week 5: Disable local-only mode (go full hybrid)
```

### **Step 3: Data Migration**

```
Old Exams: Copy from local to cloud
├─ Export: exam data, PDFs, test cases
├─ Import: Into cloud_exams tables
└─ Verify: Checksums match

Old Reports: Archive locally or upload summaries
├─ Keep student submissions on local (compliance)
├─ Upload class summaries to cloud (optional)
└─ Maintain audit trail
```

---

## 🔗 Modified Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                   LIVE DATABASE (Cloud)                         │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ PostgreSQL / MongoDB                                      │  │
│  │ ├─ cloud_exams (exam papers)                             │  │
│  │ ├─ cloud_exam_questions                                  │  │
│  │ ├─ cloud_test_cases                                      │  │
│  │ ├─ cloud_exam_submissions (student reports)              │  │
│  │ ├─ cloud_class_analytics                                 │  │
│  │ └─ cloud_teacher_reports                                 │  │
│  └───────────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ S3 Storage (Evidence Files)                               │  │
│  │ ├─ /exams/{exam_id}/pdf/                                 │  │
│  │ ├─ /submissions/{submission_id}/screenshots/             │  │
│  │ └─ /submissions/{submission_id}/code/                    │  │
│  └───────────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ REST API (Node.js / Express)                              │  │
│  │ ├─ /api/exams/*                                          │  │
│  │ ├─ /api/submissions/*                                    │  │
│  │ ├─ /api/analytics/*                                      │  │
│  │ └─ /api/sync/*                                           │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
         ↑                                       ↑
    [HTTPS/TLS]                             [HTTPS/TLS]
         ↓                                       ↓
┌──────────────────────────────────────────────────────────────────┐
│              STUDENT PC (Electron App)                           │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ SQLite Local Database                                    │   │
│  │ ├─ exam_sessions (current exam, synced from cloud)      │   │
│  │ ├─ exam_submissions (locally graded)                    │   │
│  │ ├─ app_violations (monitoring events)                   │   │
│  │ ├─ code_evaluations (test results)                      │   │
│  │ ├─ sync_queue (pending uploads)                         │   │
│  │ └─ sync_history (upload timestamps)                     │   │
│  └──────────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ Services                                                 │   │
│  │ ├─ CloudSyncService (upload submissions)                │   │
│  │ ├─ ExamService (local exam mgmt)                        │   │
│  │ ├─ MonitoringController (app + camera)                  │   │
│  │ └─ CodeEvalService (compile + test)                     │   │
│  └──────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│              TEACHER PC (Electron App)                           │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ SQLite Local Database                                    │   │
│  │ ├─ teacher_submissions (downloaded/cached)              │   │
│  │ ├─ teacher_annotations (local-only, never synced)       │   │
│  │ ├─ teacher_rubrics (customizable grading)               │   │
│  │ ├─ class_reports (generated locally)                    │   │
│  │ └─ flagged_students (local workspace)                   │   │
│  └──────────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ Services                                                 │   │
│  │ ├─ CloudSyncService (download submissions)              │   │
│  │ ├─ TeacherReportService (fetch analytics)               │   │
│  │ ├─ AnalyticsService (class reports)                     │   │
│  │ └─ GradingService (manage rubrics)                      │   │
│  └──────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

---

## ✅ Summary: What Changes?

| Component            | Before                         | After                              |
| -------------------- | ------------------------------ | ---------------------------------- |
| **Exam Papers**      | Local SQLite (each teacher PC) | Live DB (centralized)              |
| **Student Exams**    | Teacher distributes manually   | Download from Live DB              |
| **Student Reports**  | Local SQLite only              | Sync to Live DB                    |
| **Teacher Grading**  | Local SQLite only              | Download from cloud, grade locally |
| **Class Analytics**  | Manual calculation             | Pre-computed in Live DB            |
| **Evidence Storage** | Local filesystem               | Cloud S3 storage                   |
| **Sync**             | None (all local)               | Automatic (upload/download)        |
| **Offline Support**  | No                             | Yes (exam data cached)             |
| **Scalability**      | Single school                  | Multi-school/multi-teacher         |

---

## 🎯 Next Steps

1. **Architecture Review** - Validate this approach with your team
2. **Live DB Selection** - Choose PostgreSQL (SQL) or MongoDB (NoSQL)
3. **Cloud Provider** - AWS, Azure, GCP for hosting
4. **Security Audit** - Review encryption, auth, device fingerprinting
5. **Prototype Phase 1** - Set up Live DB + basic sync
6. **Testing** - Test all sync scenarios, offline behavior, conflicts
7. **Deployment** - Staged rollout (teachers → students)

Would you like me to proceed with implementing any specific phase?
