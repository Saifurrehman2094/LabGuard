# Quick Start: Real-Time Submission Viewer

## 🎯 What You Got

A complete real-time submission viewing system where teachers can see student exam submissions as they happen, with auto-refresh every 5 seconds.

---

## 🚀 How to Use (Teacher)

### Step 1: Open Submission Viewer
1. Login as teacher
2. Go to **"Manage Exams"** tab
3. Find any exam card
4. Click **"📄 Submissions"** button (green button)

### Step 2: View Submissions
- **Statistics** at top show:
  - X/Y students submitted
  - Total files uploaded
  - Total storage used
  - Pending count

- **Student list** shows:
  - ✅ Submitted students (green)
  - ⏳ Pending students (orange)
  - Files uploaded by each student
  - Submission timestamp

### Step 3: Access Files
- Click **"📥 Open"** next to any file
- File opens in your default application
- Works for PDF, DOCX, images, etc.

### Step 4: Filter & Search
- **Filter dropdown**: Show All/Submitted/Pending
- **Search box**: Find students by name or username
- **🔄 Refresh**: Manual refresh (auto-refreshes every 5 seconds)

---

## 📝 How to Test (Complete Flow)

### As Teacher:
```bash
1. Login as teacher
2. Create exam "Test Exam" for a course
3. Set time: Start now, End in 2 hours
4. Go to "Manage Exams"
5. Click "📄 Submissions" on "Test Exam"
6. Leave this window open
```

### As Student 1:
```bash
1. Login as student1
2. Go to "Available Exams"
3. Click "Test Exam"
4. Start exam
5. Upload files (answer.pdf, solution.docx)
6. Submit exam
```

### As Student 2:
```bash
1. Login as student2
2. Go to "Available Exams"
3. Click "Test Exam"
4. Start exam
5. Upload files (my-answer.pdf)
6. Submit exam
```

### Back to Teacher:
```bash
Watch the submission viewer:
- Within 5 seconds, Student 1 appears as "✅ Submitted"
- Files show up under Student 1
- Statistics update: 1/2 submitted
- Within 5 seconds, Student 2 appears as "✅ Submitted"
- Statistics update: 2/2 submitted
```

---

## ✨ Key Features

### Real-Time Updates
- ✅ Auto-refreshes every 5 seconds
- ✅ No manual refresh needed
- ✅ See submissions as they happen

### Multiple Students
- ✅ Shows all enrolled students
- ✅ Handles simultaneous submissions
- ✅ Individual file lists per student

### File Access
- ✅ Open files directly
- ✅ RBAC protection (teachers see only their exams)
- ✅ Works with all file types

### UI Features
- ✅ Filter by status
- ✅ Search by name
- ✅ Statistics dashboard
- ✅ Professional design

---

## 🔧 Technical Details

### Files Created
- `ExamSubmissionsViewer.tsx` - Main component
- `ExamSubmissionsViewer.css` - Styles

### Files Modified
- `ExamList.tsx` - Added submissions button
- `ExamList.css` - Button styles
- `main.js` - IPC handlers + real-time events
- `preload.js` - API exposure
- `database.js` - New query method

### IPC Methods Added
```javascript
electronAPI.getAllSubmissionFiles(examId)
electronAPI.getSubmissionStats(examId)
electronAPI.getExamSubmissions(examId)
electronAPI.openFile(filePath)
electronAPI.onNewSubmission(callback)
```

---

## 🎨 UI Preview

### Submission Viewer Layout
```
┌─────────────────────────────────────────────────┐
│  📄 Exam Submissions                         ×  │
│  Test Exam                                      │
├─────────────────────────────────────────────────┤
│  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐       │
│  │ 2/3  │  │  5   │  │1.5MB │  │  1   │       │
│  │Submit│  │Files │  │ Size │  │Pend. │       │
│  └──────┘  └──────┘  └──────┘  └──────┘       │
├─────────────────────────────────────────────────┤
│  Filter: [All ▼]  Search: [________]  🔄       │
├─────────────────────────────────────────────────┤
│  ┌───────────────────────────────────────────┐ │
│  │ John Doe              ✅ Submitted        │ │
│  │ @johndoe                                  │ │
│  │ Submitted: 12/9/2025 2:30 PM             │ │
│  │                                           │ │
│  │ Uploaded Files (2)                        │ │
│  │ 📎 answer.pdf    1.2 MB    📥 Open       │ │
│  │ 📎 solution.docx 300 KB    📥 Open       │ │
│  └───────────────────────────────────────────┘ │
│                                                 │
│  ┌───────────────────────────────────────────┐ │
│  │ Jane Smith            ⏳ Pending          │ │
│  │ @janesmith                                │ │
│  │ No files uploaded yet                     │ │
│  └───────────────────────────────────────────┘ │
├─────────────────────────────────────────────────┤
│  🔄 Auto-refreshing every 5 seconds    [Close] │
└─────────────────────────────────────────────────┘
```

---

## ✅ Success Checklist

After testing, you should see:

- [ ] "📄 Submissions" button on all exam cards
- [ ] Clicking button opens full-screen modal
- [ ] Statistics show correct counts
- [ ] All enrolled students appear in list
- [ ] Submitted students show ✅ badge
- [ ] Pending students show ⏳ badge
- [ ] Files appear under submitted students
- [ ] Clicking "📥 Open" opens files
- [ ] Auto-refresh works (watch for 5 seconds)
- [ ] Filter dropdown works
- [ ] Search box works
- [ ] Manual refresh button works
- [ ] Close button closes modal

---

## 🐛 Troubleshooting

### Submissions not showing?
- Check student is enrolled in course
- Check exam has courseId
- Click manual refresh (🔄)
- Check console for errors

### Files not opening?
- Check file exists on disk
- Check file permissions
- Try different file type
- Check RBAC (teacher must own exam)

### Real-time not working?
- Auto-refresh still works (5 seconds)
- Check both windows are open
- Check console for IPC errors
- Manual refresh always works

---

## 🎉 You're Done!

The submission viewer is ready to use. Teachers can now:
- ✅ Monitor submissions in real-time
- ✅ Access all student files
- ✅ See statistics and status
- ✅ Filter and search students
- ✅ Handle multiple students simultaneously

**Enjoy your new real-time submission system!** 🚀
