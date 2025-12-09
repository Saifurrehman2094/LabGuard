# Testing Real-Time Submission Viewer

## 🎯 What You're Testing

1. **Teacher** can see multiple students' submissions in real-time
2. **Admin** can see ALL submissions from ALL exams in real-time
3. Auto-refresh works (5 seconds for teacher, 10 seconds for admin)

---

## 📝 Test Scenario: 3 Students Submit to 1 Exam

### Prerequisites
- 1 Teacher account
- 3 Student accounts (Student_One, Student_Two, Lional Messi)
- 1 Admin account
- 1 Course with all 3 students enrolled
- 1 Exam created for that course

---

## 🧪 Step-by-Step Testing

### STEP 1: Setup (Teacher)

1. **Login as Teacher**
   - Username: `teacher1` (or your teacher account)
   - Password: `password123`

2. **Create Exam**
   - Go to "Create Exam" tab
   - Fill in:
     - Title: `Real-Time Test Exam`
     - Course: Select course with 3 students
     - Start time: NOW (current time)
     - End time: 2 hours from now
     - Upload PDF (optional)
     - Set allowed apps
   - Click "Create Exam"

3. **Open Submission Viewer**
   - Go to "Manage Exams" tab
   - Find "Real-Time Test Exam"
   - Click **"📄 Submissions"** button
   - **KEEP THIS WINDOW OPEN**

4. **What You Should See:**
   ```
   Statistics:
   - 0/3 Students Submitted
   - 0 Total Files
   - 0 B Total Size
   - 3 Pending

   Student List:
   - Student_One: ⏳ Pending (No files uploaded yet)
   - Student_Two: ⏳ Pending (No files uploaded yet)
   - Lional Messi: ⏳ Pending (No files uploaded yet)
   ```

---

### STEP 2: Student 1 Submits

1. **Login as Student_One** (in a different window/browser)
   - Username: `student_one`
   - Password: `password123`

2. **Take Exam**
   - Go to "Available Exams" tab
   - Click on "Real-Time Test Exam"
   - Click "Start Exam"
   - Upload files:
     - `answer1.pdf` (or any PDF)
     - `solution1.docx` (or any document)
   - Click "Submit Exam"

3. **Watch Teacher Window**
   - Within **5 seconds**, you should see:
   ```
   Statistics:
   - 1/3 Students Submitted ← UPDATED!
   - 2 Total Files ← UPDATED!
   - X.X MB Total Size ← UPDATED!
   - 2 Pending ← UPDATED!

   Student List:
   - Student_One: ✅ Submitted ← CHANGED!
     Submitted: [timestamp]
     Uploaded Files (2):
     📎 answer1.pdf    X.X MB    📥 Open
     📎 solution1.docx X.X KB    📥 Open
   - Student_Two: ⏳ Pending
   - Lional Messi: ⏳ Pending
   ```

---

### STEP 3: Student 2 Submits (While Teacher Watches)

1. **Login as Student_Two** (in another window)
   - Username: `student_two`
   - Password: `password123`

2. **Take Exam**
   - Go to "Available Exams"
   - Click "Real-Time Test Exam"
   - Start exam
   - Upload files:
     - `my-answer.pdf`
   - Submit exam

3. **Watch Teacher Window**
   - Within **5 seconds**, you should see:
   ```
   Statistics:
   - 2/3 Students Submitted ← UPDATED!
   - 3 Total Files ← UPDATED!
   - X.X MB Total Size ← UPDATED!
   - 1 Pending ← UPDATED!

   Student List:
   - Student_One: ✅ Submitted
     [files listed]
   - Student_Two: ✅ Submitted ← CHANGED!
     Submitted: [timestamp]
     Uploaded Files (1):
     📎 my-answer.pdf    X.X MB    📥 Open
   - Lional Messi: ⏳ Pending
   ```

---

### STEP 4: Student 3 Submits

1. **Login as Lional Messi** (in another window)
   - Username: `lional_messi`
   - Password: `password123`

2. **Take Exam**
   - Go to "Available Exams"
   - Click "Real-Time Test Exam"
   - Start exam
   - Upload files:
     - `messi-answer.pdf`
     - `extra-work.docx`
     - `diagram.png`
   - Submit exam

3. **Watch Teacher Window**
   - Within **5 seconds**, you should see:
   ```
   Statistics:
   - 3/3 Students Submitted ← UPDATED! (ALL DONE!)
   - 6 Total Files ← UPDATED!
   - X.X MB Total Size ← UPDATED!
   - 0 Pending ← UPDATED!

   Student List:
   - Student_One: ✅ Submitted
     [files listed]
   - Student_Two: ✅ Submitted
     [files listed]
   - Lional Messi: ✅ Submitted ← CHANGED!
     Submitted: [timestamp]
     Uploaded Files (3):
     📎 messi-answer.pdf    X.X MB    📥 Open
     📎 extra-work.docx     X.X KB    📥 Open
     📎 diagram.png         X.X KB    📥 Open
   ```

---

### STEP 5: Test File Access (Teacher)

1. **In Teacher's Submission Viewer**
   - Click **"📥 Open"** next to any file
   - File should open in default application
   - Try opening files from different students
   - All should work (teacher can access all submissions)

---

### STEP 6: Test Admin View

1. **Login as Admin** (in a new window)
   - Username: `admin`
   - Password: `admin123`

2. **Go to Exams Tab**
   - Click **"📚 Exams"** tab in admin dashboard
   - You should see:
   ```
   Statistics:
   - X Total Exams (all exams from all teachers)
   - X Upcoming
   - X Active
   - X Completed
   
   Exam Cards:
   - Real-Time Test Exam
     Teacher: [teacher name]
     Course: [course name]
     Status: 🟢 Active
     [View Submissions] [View PDF]
   - [Other exams from other teachers...]
   ```

3. **View Submissions**
   - Find "Real-Time Test Exam"
   - Click **"📄 View Submissions"**
   - You should see:
   ```
   Statistics:
   - 3/3 Students Submitted
   - 6 Total Files
   - X.X MB Total Size
   - 0 Pending

   All 3 students with their files listed
   ```

4. **Test File Access (Admin)**
   - Click **"📥 Open"** on any file
   - File should open (admin has full access)
   - Try files from different students
   - All should work

---

## ✅ Success Criteria

### Teacher View
- ✅ Sees 0/3 initially
- ✅ Updates to 1/3 within 5 seconds of Student 1 submit
- ✅ Updates to 2/3 within 5 seconds of Student 2 submit
- ✅ Updates to 3/3 within 5 seconds of Student 3 submit
- ✅ Status badges change from ⏳ to ✅
- ✅ Files appear under each student
- ✅ Can open all files
- ✅ Statistics are accurate

### Admin View
- ✅ Sees "📚 Exams" tab
- ✅ Sees ALL exams (from all teachers)
- ✅ Can click "View Submissions" on any exam
- ✅ Sees all students and their submissions
- ✅ Can open all files
- ✅ Statistics are accurate
- ✅ Auto-refresh works (10 seconds)

---

## 🐛 Troubleshooting

### Submissions Not Updating?
1. Check auto-refresh note at bottom (should say "Auto-refreshing every 5 seconds")
2. Click manual refresh button (🔄)
3. Check console for errors (F12)
4. Verify students are enrolled in the course
5. Verify exam end time is in the future

### Files Not Opening?
1. Check file exists on disk
2. Check file permissions
3. Try different file type
4. Check console for errors

### Admin Can't See Exams?
1. Verify logged in as admin
2. Check "📚 Exams" tab exists
3. Click refresh button
4. Check console for errors

---

## 📊 Expected Timeline

```
Time    Action                          Teacher Sees
------  ------------------------------  ---------------------------
00:00   Teacher opens viewer            0/3 submitted, 3 pending
00:30   Student 1 submits               Still 0/3 (waiting...)
00:35   Auto-refresh triggers           1/3 submitted! ✅
01:00   Student 2 submits               Still 1/3 (waiting...)
01:05   Auto-refresh triggers           2/3 submitted! ✅
01:30   Student 3 submits               Still 2/3 (waiting...)
01:35   Auto-refresh triggers           3/3 submitted! ✅ ALL DONE!
```

---

## 🎯 What This Proves

✅ **Real-time updates work** (5-10 second delay)
✅ **Multiple students** can submit simultaneously
✅ **Teacher sees all submissions** for their exam
✅ **Admin sees all submissions** for all exams
✅ **File access works** with RBAC
✅ **Statistics update** correctly
✅ **Auto-refresh works** without manual intervention

---

## 📝 Notes

- Auto-refresh is **5 seconds** for teacher submission viewer
- Auto-refresh is **10 seconds** for admin exam viewer
- You can always click **🔄 Refresh** for instant update
- Students can only see their own submissions
- Teachers can only see submissions for their exams
- Admins can see ALL submissions for ALL exams

---

## 🚀 Ready to Test!

Follow the steps above and verify each checkpoint. Once you confirm it works, you can move on to testing the server deployment!

Good luck! 🎉
