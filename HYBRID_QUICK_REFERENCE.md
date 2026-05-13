# Hybrid Database Architecture - Quick Reference & Comparison

## 📊 Before vs After Comparison

### **CURRENT ARCHITECTURE (All-Local SQLite)**

```
┌──────────────────────────────┐
│   Teacher PC                 │
│   ├─ Exams (SQLite)          │
│   ├─ PDF files               │
│   ├─ Test cases              │
│   └─ Annotations             │
└──────────────────────────────┘
           Manual File Share
┌──────────────────────────────┐
│   Student PC                 │
│   ├─ Exam data (SQLite)      │
│   ├─ Monitoring events       │
│   ├─ Violations              │
│   ├─ Test results            │
│   └─ Annotations             │
└──────────────────────────────┘
```

**Limitations:**

- ❌ No centralized exam repository
- ❌ Teachers manually distribute exams
- ❌ No class-wide analytics
- ❌ Reports stuck on student PCs
- ❌ No offline support for teacher grading
- ❌ Difficult to scale to multiple schools

---

### **NEW ARCHITECTURE (Hybrid Cloud-Local)**

```
┌─────────────────────────────────┐
│   ☁️ LIVE DATABASE (Cloud)       │
│   ├─ Exam Papers (centralized)  │
│   ├─ Student Reports (synced)   │
│   ├─ Class Analytics            │
│   └─ Evidence Storage (S3)       │
└─────────────────────────────────┘
         ↑ SYNC (Upload)
         ↓ SYNC (Download)
┌─────────────────────────────────┐
│   Teacher PC (SQLite)           │
│   ├─ Cached submissions         │
│   ├─ Local annotations (ONLY)   │
│   ├─ Rubrics (customizable)     │
│   ├─ Class reports              │
│   └─ Workspace                  │
└─────────────────────────────────┘

         ↑ SYNC (Upload)
         ↓ SYNC (Download)
┌─────────────────────────────────┐
│   Student PC (SQLite)           │
│   ├─ Exam session (cached)      │
│   ├─ Monitoring events          │
│   ├─ Violations (local)         │
│   ├─ Test results (local)       │
│   └─ Sync queue                 │
└─────────────────────────────────┘
```

**Advantages:**

- ✅ Centralized exam repository
- ✅ Automatic student exam distribution
- ✅ Class-wide analytics
- ✅ Teacher can grade offline
- ✅ Evidence permanently stored
- ✅ Scales to multiple schools
- ✅ Automatic backup & recovery

---

## 🔄 Data Distribution Model

### **What Stays CLOUD (Centralized)**

```
☁️ Live Database (PostgreSQL/MongoDB)
├─ Exam Papers (immutable after publication)
│  └─ Teacher uploads once, students download
├─ Student Submissions (append-only)
│  └─ Once submitted, never modified
├─ Class Analytics (pre-computed)
│  └─ Aggregated from all submissions
├─ Evidence Files (S3)
│  └─ Screenshots, violation evidence
└─ Teacher Class Reports (optional)
   └─ Teacher-generated summaries
```

**Why Cloud?**

- Single source of truth for exams
- Backup & disaster recovery
- Multi-user access (all teachers see same exam)
- Append-only data (no conflicts)

---

### **What Stays LOCAL (Student PC - SQLite)**

```
💾 Student PC Local Database
├─ Active Exam Session
│  └─ Downloaded exam data (cached)
├─ Monitoring Events (all local)
│  ├─ App violations (from WindowsMonitorService)
│  ├─ Camera violations (from Python)
│  └─ Screenshots (local filesystem)
├─ Code Evaluation
│  ├─ Compilation results
│  ├─ Test case results
│  └─ Student score
├─ Sync Queue
│  └─ Pending uploads (if offline)
└─ Previous Exams (archived)
   └─ For student reference
```

**Why Local?**

- Fast exam execution (no network latency)
- Privacy (exam data stays on PC during exam)
- Offline support (internet not required)
- Automatic backup (local copy)
- Performance (no cloud queries during exam)

---

### **What Stays LOCAL (Teacher PC - SQLite)**

```
💾 Teacher PC Local Database
├─ Downloaded Submissions (cached)
│  └─ Batch download from cloud, store locally
├─ Teacher Annotations (LOCAL ONLY ⚠️)
│  ├─ Notes on submissions
│  ├─ Rubric scores
│  ├─ Plagiarism flags
│  └─ **NEVER synced to cloud** (privacy + workspace)
├─ Teacher Rubrics (customizable)
│  └─ Can be local-only or shared
├─ Class Reports (generated locally)
│  ├─ Student performance summary
│  ├─ Violation analysis
│  ├─ Difficulty assessment
│  └─ Optional: upload summary to cloud
└─ Teacher Workspace
   └─ Local work, never synced
```

**Why Local?**

- Teacher workspace (drafts, notes, not ready to share)
- Performance (no cloud queries during grading)
- Privacy (teacher's analysis stays private)
- Offline grading support

---

## 📈 Sync Strategies

### **Student PC Upload (→ Cloud)**

**Trigger:** After exam submission

```javascript
// Automatic sync workflow
if (exam_submitted) {
  ├─ Gather all data (submission, violations, evaluation)
  ├─ Compress evidence files
  ├─ If online:
  │  └─ POST /api/submissions/upload (immediate)
  └─ If offline:
     ├─ Add to sync_queue table
     └─ Retry when online (exponential backoff)
}
```

**Retries:**

- 1st retry: 1 second
- 2nd retry: 2 seconds
- 3rd retry: 4 seconds
- 4th retry: 8 seconds
- Give up after 3 retries (manual intervention needed)

---

### **Teacher PC Download (← Cloud)**

**Trigger:** When teacher clicks "Fetch Reports"

```javascript
// Batch download workflow
if (teacher_clicks_fetch) {
  ├─ GET /api/exams/{exam_id}/submissions
  ├─ If online:
  │  ├─ Download all submissions (batch)
  │  └─ Cache in teacher_submissions table (7-day TTL)
  └─ If offline:
     ├─ Use cached data
     └─ Show "cached" indicator
}
```

**Caching Strategy:**

- Cache downloaded for 7 days
- Invalidate when new submission received
- Allow manual "Refresh" button for immediate update

---

### **Conflict Resolution**

**Rule 1: Immutable Records (No Conflicts)**

```
Submissions, violations, test results
→ Treated as "append-only"
→ Once uploaded, never changed
→ No conflicts possible
```

**Rule 2: Idempotent Uploads**

```
Uploading same submission twice
→ Cloud deduplicates by submission_id
→ No duplicate records
→ Safe to retry without damage
```

**Rule 3: Last-Write-Wins (Metadata)**

```
If timestamp conflict detected:
├─ If local.modified_at > cloud.modified_at
│  └─ Use local version
└─ Else
   └─ Use cloud version + sync local
```

**Rule 4: Teacher Annotations (Local-Only)**

```
Teacher annotations never sync
→ Prevents conflicts entirely
→ Teacher's work stays private
→ Optional manual upload of summary
```

---

## 🔐 Security Considerations

### **Authentication & Authorization**

```
┌─ Device ID (fingerprinting)
│  ├─ Hash: hostname + platform + CPU count
│  └─ Prevents session hijacking
│
├─ JWT Token (8-hour expiration)
│  └─ For each API request
│
├─ API Key (per-school)
│  └─ Backend authentication
│
└─ HTTPS/TLS (in transit)
   └─ All uploads encrypted
```

### **Data Protection**

```
Local SQLite (Student PC):
├─ File system permissions (user-only)
├─ Optional: sqlcipher encryption
└─ Device fingerprint validation

Cloud Storage:
├─ Encrypted database columns
├─ S3 server-side encryption (SSE-S3)
├─ Regular automated backups
└─ Access logs for audit

Evidence Files (S3):
├─ Encrypted at rest
├─ Access control (teacher/admin only)
├─ Retention policy (e.g., 2 years)
└─ Deletion after graduation (GDPR compliance)
```

---

## 📊 Storage Requirements

### **Per Student (per exam)**

```
Exam data:          5-50 MB   (exam + PDF)
Monitoring data:    1-10 MB   (JSON violation logs)
Evidence:          10-50 MB   (screenshots, 100+ items)
Code + results:     1-5 MB    (source + test outputs)
────────────────────────────
Total per exam:    17-115 MB
Recommended:        ~1 GB minimum local storage
```

### **Teacher PC (class of 30 students)**

```
Downloaded cache:   500-3000 MB  (all submissions)
Annotations:           1-10 MB   (local notes)
Rubrics:               1-5 MB    (grading templates)
Class reports:        10-50 MB   (generated reports)
────────────────────────────
Total:              512-3065 MB (~3-5 GB)
Recommended:        5 GB minimum
```

### **Cloud Storage**

```
Per school (100 exams, 3000 students):
├─ Exam papers:         1-10 GB
├─ Student reports:    50-500 GB
├─ Evidence (S3):     100-1000 GB (screenshots)
├─ Analytics:            1-5 GB
└─ Backups:            ~50% of total
────────────────────────────
Total: ~200-1500 GB per school per year
Cost (AWS S3):  $50-500/month per school
```

---

## 🚀 Deployment Sequence

### **Phase 1: Infrastructure Setup (Week 1-2)**

```
□ Choose cloud provider (AWS, Azure, GCP)
□ Set up PostgreSQL database
□ Configure S3 bucket for evidence
□ Create REST API (Node.js/Express)
□ Implement auth (JWT)
□ Secure with HTTPS/TLS
□ Load testing (concurrent uploads)
```

### **Phase 2: Teacher Adoption (Week 3)**

```
□ Teachers upload exams to cloud
□ Verify exam data in cloud DB
□ Test download from student PC
□ Train teachers on cloud sync UI
□ Monitor sync queue for issues
```

### **Phase 3: Student Exams (Week 4)**

```
□ Students download exams from cloud
□ Students take exams locally
□ Submissions auto-sync to cloud
□ Monitor upload queue
□ Test retry logic
```

### **Phase 4: Teacher Grading (Week 5)**

```
□ Teachers download cached submissions
□ Test offline grading
□ Test annotation (local-only)
□ Validate class analytics
□ Train on report generation
```

### **Phase 5: Monitoring & Support (Week 6+)**

```
□ Monitor sync health
□ Handle sync failures
□ Support offline scenarios
□ Performance tuning
□ User feedback collection
```

---

## ✅ Implementation Checklist

### **Backend Changes**

- [ ] Create Live Database (PostgreSQL)
- [ ] Design REST API endpoints (/api/exams/_, /api/submissions/_, etc.)
- [ ] Implement auth middleware (JWT, device fingerprinting)
- [ ] Create CloudSyncService class
- [ ] Create CloudAPIService class
- [ ] Add sync_queue table to local SQLite
- [ ] Add sync_history table
- [ ] Add teacher_annotations table (local-only)
- [ ] Add device_info table
- [ ] Implement retry logic (exponential backoff)
- [ ] Create S3 integration for evidence storage
- [ ] Test all API endpoints
- [ ] Load test (concurrent uploads/downloads)

### **Frontend Changes**

- [ ] Add CloudSync API to preload.js
- [ ] Add IPC handlers in main.js
- [ ] Modify ExamPage.tsx to download exam from cloud
- [ ] Modify submission flow to upload to cloud
- [ ] Create "Fetch Reports" button in TeacherDashboard
- [ ] Show sync status indicator (online/offline/syncing)
- [ ] Add retry UI for failed syncs
- [ ] Test offline scenarios
- [ ] Test poor network scenarios

### **Database Changes**

- [ ] Create cloud_exams table (PostgreSQL)
- [ ] Create cloud_exam_questions table
- [ ] Create cloud_test_cases table
- [ ] Create cloud_exam_submissions table
- [ ] Create cloud_class_analytics table
- [ ] Create cloud_teacher_reports table
- [ ] Create sync_queue table (SQLite)
- [ ] Create sync_history table (SQLite)
- [ ] Create teacher_annotations table (SQLite)
- [ ] Create device_info table (SQLite)
- [ ] Migrate existing exams to cloud

### **Testing**

- [ ] Unit tests for CloudSyncService
- [ ] Integration tests (upload/download)
- [ ] Offline tests (queue + retry)
- [ ] Conflict resolution tests
- [ ] Performance tests (large submissions)
- [ ] Security tests (auth, encryption)
- [ ] User acceptance testing
- [ ] Stress testing (many concurrent uploads)

### **Deployment**

- [ ] Set up production servers
- [ ] Configure HTTPS/TLS
- [ ] Set up monitoring & alerts
- [ ] Create backup strategy
- [ ] Create rollback plan
- [ ] Train support team
- [ ] Document for admins
- [ ] Launch to beta users
- [ ] Monitor production metrics

---

## 🎯 Expected Outcomes

### **Benefits Summary**

| Aspect                 | Before                 | After                   |
| ---------------------- | ---------------------- | ----------------------- |
| **Scalability**        | Single school          | Multi-school            |
| **Exam Distribution**  | Manual copying         | Automatic cloud sync    |
| **Class Analytics**    | None                   | Pre-computed, real-time |
| **Teacher Grading**    | Online only            | Online + offline        |
| **Evidence Storage**   | Local filesystem       | Cloud backup            |
| **Network Resilience** | Exam requires internet | Works offline           |
| **Data Backup**        | Local only             | Cloud + local           |
| **Disaster Recovery**  | Manual                 | Automated               |
| **Collaboration**      | None                   | Multiple teachers       |
| **Audit Trail**        | None                   | Full sync history       |

---

## 📞 Support & Troubleshooting

### **Common Issues & Solutions**

**Issue:** Upload fails due to network timeout

```
Solution:
├─ Check internet connection status
├─ Retry with exponential backoff (automatic)
├─ View sync_queue table for failed items
└─ Manual retry when online
```

**Issue:** Student PC offline during exam

```
Solution:
├─ Exam data cached locally ✅
├─ Monitor locally (no cloud dependency) ✅
├─ Submission queued automatically ✅
└─ Uploads when reconnected ✅
```

**Issue:** Teacher PC offline during grading

```
Solution:
├─ Use cached submissions ✅
├─ Annotations stay local (offline) ✅
├─ Grade offline without internet ✅
└─ Optional: upload summary when online
```

**Issue:** Large submission fails to upload

```
Solution:
├─ Compress files before upload
├─ Split large uploads into chunks
├─ Implement resumable uploads
└─ Show progress bar
```

---

## 📚 Related Documents

1. **HYBRID_DATABASE_ARCHITECTURE.md** - Full technical specification
2. **IMPLEMENTATION_CODE_SAMPLES.js** - Code examples (CloudSyncService, IPC handlers)
3. **PROJECT_DEEP_ANALYSIS.md** - Original LAB-Guard architecture
4. **CODEBASE_OVERVIEW.md** - Existing service architecture

---

## 🎓 Conclusion

The **Hybrid Cloud-Local Architecture** combines:

✅ **Cloud scalability** (exams, reports, analytics)  
✅ **Local performance** (instant exam execution)  
✅ **Offline resilience** (queue-based retries)  
✅ **Privacy** (teacher workspace never synced)  
✅ **Conflict-free sync** (immutable + local-only data)

This design is **ideal for**:

- Multi-school deployments
- Poor/unreliable networks
- Privacy-conscious environments
- Offline-first requirements

---

**Ready to implement?** Start with Phase 1 infrastructure setup.  
**Questions?** Review HYBRID_DATABASE_ARCHITECTURE.md for detailed specs.
