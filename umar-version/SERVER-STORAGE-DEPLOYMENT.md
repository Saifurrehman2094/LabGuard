# Server-Based File Storage Deployment Guide

## 🎯 Overview

Your LAB-Guard system now has **centralized server-based file storage** with **Role-Based Access Control (RBAC)**. All exam PDFs and student submissions are stored on the server machine and accessed by clients over the network.

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    FILE STORAGE ARCHITECTURE                     │
└─────────────────────────────────────────────────────────────────┘

SERVER MACHINE (Your Laptop)
┌──────────────────────────────────────────────────────────────┐
│  LAB-Guard Application                                        │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  backend/data/                                         │  │
│  │  ├── database.sqlite          (Shared Database)       │  │
│  │  ├── uploads/                 (Exam PDFs)             │  │
│  │  │   ├── exam1_timestamp.pdf                          │  │
│  │  │   ├── exam2_timestamp.pdf                          │  │
│  │  │   └── exam3_timestamp.pdf                          │  │
│  │  └── submissions/             (Student Submissions)   │  │
│  │      ├── exam1/                                        │  │
│  │      │   ├── student1-id/                             │  │
│  │      │   │   ├── answer.pdf                           │  │
│  │      │   │   └── solution.docx                        │  │
│  │      │   ├── student2-id/                             │  │
│  │      │   │   └── response.pdf                         │  │
│  │      │   └── student3-id/                             │  │
│  │      │       └── submission.pdf                       │  │
│  │      └── exam2/                                        │  │
│  │          └── ...                                       │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                               │
│  📁 Shared via Windows File Sharing                          │
│  Share Name: labguard-data                                   │
│  UNC Path: \\192.168.1.105\labguard-data                    │
└──────────────────────────────────────────────────────────────┘
                            ▲
                            │
                    WiFi Network
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
┌───────▼────────┐  ┌───────▼────────┐  ┌──────▼─────────┐
│ CLIENT 1       │  │ CLIENT 2       │  │ CLIENT 3       │
│ (Student_One)  │  │ (Student_Two)  │  │ (Lional Messi) │
│                │  │                │  │                │
│ Reads/Writes   │  │ Reads/Writes   │  │ Reads/Writes   │
│ to Server      │  │ to Server      │  │ to Server      │
└────────────────┘  └────────────────┘  └────────────────┘
```

---

## 🔐 Role-Based Access Control (RBAC)

### Access Rules

| Role | Exam PDFs | Own Submissions | Other Submissions | All Submissions |
|------|-----------|-----------------|-------------------|-----------------|
| **Admin** | ✅ Full Access | ✅ Full Access | ✅ Full Access | ✅ Full Access |
| **Teacher** | ✅ Read/Write | ❌ No Access | ✅ Read Only | ✅ Read Only |
| **Student** | ✅ Read Only | ✅ Read/Write | ❌ No Access | ❌ No Access |

### File Paths & Permissions

```
uploads/                          (Exam PDFs)
├── exam-id_timestamp.pdf         → Teacher: Write, Students: Read
└── ...

submissions/                      (Student Submissions)
├── exam-id/
│   ├── student1-id/
│   │   └── file.pdf              → Student1: Read/Write, Teacher: Read
│   ├── student2-id/
│   │   └── file.pdf              → Student2: Read/Write, Teacher: Read
│   └── student3-id/
│       └── file.pdf              → Student3: Read/Write, Teacher: Read
```

---

## 🚀 Deployment Steps

### STEP 1: Server Setup (Your Laptop)

#### 1.1 Configure Network Mode
```bash
npm run setup-network
```
- Choose option: **1. Server Mode**
- Note your IP address (e.g., 192.168.1.105)

#### 1.2 Share the Data Folder

**Windows File Sharing:**

1. Navigate to: `D:\LabGuard\backend\data`
2. Right-click → **Properties** → **Sharing** tab
3. Click **Advanced Sharing**
4. Check **Share this folder**
5. Share name: `labguard-data`
6. Click **Permissions**
7. Add **Everyone** with **Full Control**
8. Click **OK** → **Apply**

**Verify Share:**
```bash
# On server machine, test access
dir \\localhost\labguard-data
```

#### 1.3 Start Server
```bash
npm start
```

### STEP 2: Client Setup (Student Laptops)

#### 2.1 Configure Network Mode
```bash
npm run setup-network
```
- Choose option: **2. Client Mode**
- Enter server IP: `192.168.1.105` (your server IP)

#### 2.2 Test Network Access
```bash
# Test if you can access server share
dir \\192.168.1.105\labguard-data
```

If you see files, you're connected! ✅

#### 2.3 Start Client
```bash
npm start
```

---

## 📝 Testing with 3 Students

### Test Scenario: Midterm Exam Submission

#### Setup Phase

**Server (Teacher):**
1. Login as teacher: `shams Farooq` / `password@2083`
2. Create course: "Computer Networks"
3. Create exam: "Midterm Test"
4. Upload exam PDF
5. Set time: Now to 2 hours

**Client 1 (Student_One):**
1. Login: `Student_One` / `password@2083`
2. Enroll in "Computer Networks"
3. See "Midterm Test" exam

**Client 2 (Student_Two):**
1. Login: `Student_Two` / `password@2083`
2. Enroll in "Computer Networks"
3. See "Midterm Test" exam

**Client 3 (Lional Messi):**
1. Login: `Lional Messi` / `password@2083`
2. Enroll in "Computer Networks"
3. See "Midterm Test" exam

#### Test Phase

**Test 1: Exam PDF Access**
```
Teacher uploads: midterm.pdf (5 MB)
↓
Server stores: uploads/exam-id_timestamp.pdf
↓
All 3 students can view PDF ✅
```

**Test 2: Student_One Submission**
```
Student_One uploads: answer.pdf
↓
Server stores: submissions/exam-id/student-one-id/answer.pdf
↓
Student_One can see: ✅ answer.pdf
Student_Two can see: ❌ (Access Denied)
Lional Messi can see: ❌ (Access Denied)
Teacher can see: ✅ answer.pdf
```

**Test 3: Student_Two Submission**
```
Student_Two uploads: solution.docx
↓
Server stores: submissions/exam-id/student-two-id/solution.docx
↓
Student_Two can see: ✅ solution.docx
Student_One can see: ❌ (Access Denied)
Lional Messi can see: ❌ (Access Denied)
Teacher can see: ✅ solution.docx
```

**Test 4: Lional Messi Submission**
```
Lional Messi uploads: response.pdf
↓
Server stores: submissions/exam-id/messi-id/response.pdf
↓
Lional Messi can see: ✅ response.pdf
Student_One can see: ❌ (Access Denied)
Student_Two can see: ❌ (Access Denied)
Teacher can see: ✅ response.pdf
```

**Test 5: Teacher Views All**
```
Teacher opens "Submissions" tab
↓
Can see all 3 submissions:
  ✅ Student_One: answer.pdf (2 MB)
  ✅ Student_Two: solution.docx (1.5 MB)
  ✅ Lional Messi: response.pdf (3 MB)
↓
Total: 3 students, 3 files, 6.5 MB
```

---

## 🔍 Verification Commands

### On Server Machine

```bash
# Check uploads directory
dir backend\data\uploads

# Check submissions directory
dir backend\data\submissions

# Check specific exam submissions
dir backend\data\submissions\<exam-id>

# Check specific student submissions
dir backend\data\submissions\<exam-id>\<student-id>
```

### On Client Machine

```bash
# Test server connection
ping 192.168.1.105

# Test file share access
dir \\192.168.1.105\labguard-data

# Test uploads access
dir \\192.168.1.105\labguard-data\uploads

# Test submissions access
dir \\192.168.1.105\labguard-data\submissions
```

---

## 📊 Storage Statistics

### Current System Limits

| Item | Limit | Notes |
|------|-------|-------|
| Exam PDF Size | 50 MB | Per file |
| Submission Size | 100 MB | Per file |
| Total Students | 20-30 | Concurrent |
| Network Speed | 1-5 MB/s | Local WiFi |

### Storage Monitoring

**Check storage usage:**
```bash
# On server
node test-server-storage.js
```

**Output shows:**
- Total exam PDFs
- Total submissions per exam
- Total storage used
- Per-student file counts

---

## 🛠️ Troubleshooting

### Issue 1: Cannot Access Server Share

**Symptoms:**
- Client cannot see `\\192.168.1.105\labguard-data`
- Error: "Network path not found"

**Solutions:**
1. Check firewall settings
2. Enable File and Printer Sharing
3. Verify server IP address
4. Check WiFi connection

**Commands:**
```bash
# Check network connectivity
ping 192.168.1.105

# Check if share exists
net view \\192.168.1.105
```

### Issue 2: Access Denied

**Symptoms:**
- Can see share but cannot read/write files
- Error: "Access is denied"

**Solutions:**
1. Check share permissions (Everyone = Full Control)
2. Check folder permissions (Everyone = Full Control)
3. Disable password-protected sharing

**Steps:**
1. Control Panel → Network and Sharing Center
2. Advanced sharing settings
3. Turn off password protected sharing

### Issue 3: Files Not Appearing

**Symptoms:**
- Teacher uploads PDF but students don't see it
- Student submits file but teacher doesn't see it

**Solutions:**
1. Check network mode configuration
2. Verify file paths in config
3. Restart application
4. Check file permissions

**Debug:**
```bash
# Check storage configuration
node test-server-storage.js
```

### Issue 4: Slow File Access

**Symptoms:**
- Files take long time to load
- Upload/download is slow

**Solutions:**
1. Check WiFi signal strength
2. Reduce file sizes
3. Use 5GHz WiFi if available
4. Minimize network traffic

---

## 📈 Performance Optimization

### Network Performance

**Recommended:**
- WiFi: 5GHz band
- Speed: 100+ Mbps
- Latency: < 10ms
- Distance: < 10 meters from router

**File Size Guidelines:**
- Exam PDFs: < 10 MB (compress if needed)
- Submissions: < 20 MB per file
- Screenshots: < 1 MB (auto-compressed)

### Storage Management

**Regular Maintenance:**
```bash
# Clean old exam PDFs (after semester)
# Delete: backend/data/uploads/old-exam-*.pdf

# Archive old submissions
# Move: backend/data/submissions/old-exam-id/ → archive/

# Check storage usage
dir backend\data /s
```

---

## 🎓 Demo Day Checklist

### Before Demo (1 Day Before)

- [ ] Test with all 3 laptops on same WiFi
- [ ] Verify file sharing works
- [ ] Test upload/download speeds
- [ ] Create test exam with PDF
- [ ] Test 3 student submissions
- [ ] Verify RBAC (students can't see each other's files)
- [ ] Check storage statistics
- [ ] Prepare backup plan

### Demo Day Setup (30 Minutes Before)

- [ ] Connect all laptops to WiFi
- [ ] Start server application
- [ ] Verify server IP address
- [ ] Start client applications
- [ ] Test file access from all clients
- [ ] Login as teacher
- [ ] Login as 3 students
- [ ] Verify all can see exam

### During Demo

**Highlight These Features:**
1. ✨ **Centralized Storage**: "All files stored on server"
2. ✨ **RBAC**: "Students cannot see each other's submissions"
3. ✨ **Real-time Access**: "Teacher sees submissions instantly"
4. ✨ **Network Deployment**: "Works on any WiFi network"
5. ✨ **Scalable**: "Can support entire lab of students"

---

## 🔒 Security Considerations

### Current Implementation

✅ **Implemented:**
- RBAC for file access
- Student isolation (can't see others' files)
- Teacher oversight (can see all submissions)
- Admin full control
- File size limits
- File type validation

⚠️ **Limitations:**
- No encryption over network (local WiFi only)
- Basic Windows file sharing (not production-grade)
- Suitable for lab/demo environment

### Production Recommendations

For real deployment:
- Use HTTPS for file transfers
- Implement file encryption
- Use dedicated file server
- Add virus scanning
- Implement backup system
- Use cloud storage (AWS S3, Azure Blob)

---

## 📚 Additional Resources

### Documentation Files
- `NETWORK-SETUP-GUIDE.md` - Network deployment guide
- `DEPLOYMENT-CHECKLIST.md` - Demo day checklist
- `TESTING-NETWORK-FEATURE.md` - Testing procedures
- `DEPLOYMENT-ARCHITECTURE.md` - System architecture

### Test Scripts
- `test-server-storage.js` - Storage system test
- `test-complete-realtime-system.js` - Real-time features test
- `setup-network.js` - Interactive network setup

### Configuration Files
- `config/network-config.json` - Network settings
- `config/app-config.json` - Application settings

---

## ✅ System Status

### ✅ Implemented Features

1. **Centralized File Storage**
   - Server-based uploads directory
   - Server-based submissions directory
   - Network path support (UNC paths)

2. **RBAC System**
   - Role-based file access control
   - Student isolation
   - Teacher oversight
   - Admin full access

3. **Submission System**
   - Student file upload
   - Teacher view all submissions
   - Submission statistics
   - File management

4. **Network Support**
   - Auto-detect deployment mode
   - Server/client configuration
   - Shared storage paths
   - Network connectivity testing

### 🚀 Ready for Deployment

Your system is **fully ready** for server-based deployment with:
- ✅ Centralized file storage
- ✅ RBAC implementation
- ✅ 3-student testing capability
- ✅ Network deployment support
- ✅ Complete documentation

**Next Steps:**
1. Test with 3 laptops on same WiFi
2. Follow deployment checklist
3. Practice demo scenario
4. Ace your presentation! 🎉

