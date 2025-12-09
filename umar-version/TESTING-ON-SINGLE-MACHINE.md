# Testing LAB-Guard on Single Machine (Before Multi-Laptop Demo)

## 🎯 Goal
Test the complete workflow on your single laptop by running 3 separate instances of the application, simulating:
- **Instance 1:** Teacher (Server)
- **Instance 2:** Student 1 (Client)
- **Instance 3:** Student 2 (Client)

---

## ⚠️ Important Notes

### Current Setup (Local Mode)
Your app is currently in **LOCAL MODE** - perfect for single machine testing!
- Each instance uses the **same database**
- No network configuration needed
- All features work exactly the same
- Perfect for testing before multi-laptop demo

### Why Test on Single Machine First?
✅ Verify all features work  
✅ Practice the demo flow  
✅ No network issues to debug  
✅ Faster iteration  
✅ Build confidence  

---

## 🚀 Step-by-Step Testing Guide

### Prerequisites
- [ ] Application built: `npm run build`
- [ ] All dependencies installed
- [ ] Database initialized

---

## 📝 Test Scenario: Complete Exam Flow

### Step 1: Prepare Test Accounts (5 minutes)

**Terminal 1 - Start First Instance:**
```bash
npm start
```

**In the Application:**
1. Login as **admin** / **admin123**
2. Go to **User Management**
3. Create accounts:
   - **Teacher:** username: `teacher1`, password: `teacher123`, role: Teacher
   - **Student 1:** username: `student1`, password: `student123`, role: Student
   - **Student 2:** username: `student2`, password: `student123`, role: Student
4. **Logout**

✅ **Checkpoint:** You now have 3 test accounts ready

---

### Step 2: Teacher Creates Course & Exam (10 minutes)

**Still in Terminal 1 Instance:**

1. **Login as Teacher:**
   - Username: `teacher1`
   - Password: `teacher123`

2. **Create a Course:**
   - Go to **"My Courses"** tab
   - Click **"Create New Course"**
   - Course Name: `Computer Networks`
   - Course Code: `CS2083`
   - Description: `Midterm Exam Course`
   - Click **"Create Course"**

3. **Enroll Students:**
   - Click on **"Computer Networks"** course card
   - Click **"Enroll Student"** button
   - Enroll **student1**
   - Click **"Enroll Student"** again
   - Enroll **student2**
   - Click **"Close"**

4. **Create an Exam:**
   - Go to **"Create Exam"** tab
   - Fill in details:
     - **Exam Title:** `Computer Networks Midterm`
     - **Course:** Select `CS2083 - Computer Networks`
     - **Start Time:** Set to current time (or 5 minutes from now)
     - **End Time:** Set to 2 hours from start time
     - **Allowed Apps:** Check `Chrome` and `Calculator`
     - **PDF:** (Optional) Upload a sample PDF
   - Click **"Create Exam"**

5. **Verify Exam Created:**
   - Go to **"Manage Exams"** tab
   - You should see: `Computer Networks Midterm`

✅ **Checkpoint:** Exam is created and ready for students

**Keep this window open** (Teacher Dashboard)

---

### Step 3: Start Second Instance - Student 1 (5 minutes)

**Open NEW Terminal (Terminal 2):**
```bash
npm start
```

**A NEW window will open** (this simulates Laptop 2)

**In the NEW Window:**
1. **Login as Student 1:**
   - Username: `student1`
   - Password: `student123`

2. **Verify Exam Appears:**
   - You should see **"Computer Networks Midterm"** in available exams
   - Check exam details:
     - Course: Computer Networks
     - Time window
     - Status: Upcoming or Active

✅ **Checkpoint:** Student 1 can see the exam created by teacher

**Keep this window open** (Student 1 Dashboard)

---

### Step 4: Start Third Instance - Student 2 (5 minutes)

**Open ANOTHER NEW Terminal (Terminal 3):**
```bash
npm start
```

**A THIRD window will open** (this simulates Laptop 3)

**In the THIRD Window:**
1. **Login as Student 2:**
   - Username: `student2`
   - Password: `student123`

2. **Verify Exam Appears:**
   - You should see **"Computer Networks Midterm"** in available exams
   - Same exam as Student 1 sees

✅ **Checkpoint:** Student 2 can also see the exam

**Keep this window open** (Student 2 Dashboard)

---

### Step 5: Student 1 Takes Exam (10 minutes)

**Switch to Terminal 2 Window (Student 1):**

1. **Start the Exam:**
   - Click **"Start Exam"** on "Computer Networks Midterm"
   - Monitoring begins automatically
   - You should see:
     - Exam PDF (if uploaded)
     - Timer counting down
     - Monitoring status: Active

2. **Test Allowed App (No Violation):**
   - Open **Google Chrome** (or any allowed app)
   - Switch to Chrome window
   - Wait 5-10 seconds
   - Switch back to LAB-Guard
   - **Expected:** No violation (Chrome is allowed)

3. **Test Unauthorized App (Violation!):**
   - Open **Notepad** (or any app NOT in allowed list)
   - Switch to Notepad window
   - Wait 5-10 seconds
   - Switch back to LAB-Guard
   - **Expected:** 
     - ⚠️ Warning message appears
     - Violation recorded
     - Screenshot captured (if enabled)

4. **Return to Allowed App:**
   - Switch back to Chrome
   - Wait 5-10 seconds
   - **Expected:** Warning clears

✅ **Checkpoint:** Monitoring is working, violations detected

**Keep exam running** (don't end it yet)

---

### Step 6: Teacher Monitors in Real-Time (5 minutes)

**Switch to Terminal 1 Window (Teacher):**

1. **Go to Monitoring Reports:**
   - Click **"Monitoring Reports"** tab
   - Select exam: **"Computer Networks Midterm"**

2. **View Violations:**
   - You should see violations from Student 1:
     - Student name: student1
     - App used: Notepad (or whatever you opened)
     - Duration
     - Timestamp
     - Screenshot (if captured)

3. **Real-time Updates:**
   - The violations appeared **while the exam was running**
   - This demonstrates real-time monitoring

✅ **Checkpoint:** Teacher can monitor students in real-time

---

### Step 7: Student 2 Takes Exam (5 minutes)

**Switch to Terminal 3 Window (Student 2):**

1. **Start the Exam:**
   - Click **"Start Exam"**
   - Monitoring begins

2. **Trigger Different Violation:**
   - Open **Calculator** (if not allowed) or **Notepad**
   - Switch to that app
   - Wait 5-10 seconds
   - Switch back to LAB-Guard
   - **Expected:** Violation recorded

✅ **Checkpoint:** Multiple students can be monitored simultaneously

---

### Step 8: Teacher Views All Violations (5 minutes)

**Switch to Terminal 1 Window (Teacher):**

1. **Refresh Monitoring Reports:**
   - You should now see violations from **both students**:
     - Student 1: Notepad violation
     - Student 2: Calculator/Notepad violation

2. **View Statistics:**
   - Total violations
   - Violations per student
   - Timeline of violations

3. **Export Report (Optional):**
   - Click **"Export"** button (if available)
   - Download CSV or JSON report

✅ **Checkpoint:** Teacher can see all students' violations

---

### Step 9: End Exam & Cleanup (2 minutes)

**In Student Windows (Terminal 2 & 3):**
- Click **"End Exam"** or let timer expire
- Logout

**In Teacher Window (Terminal 1):**
- Review final reports
- Logout

**Close All Windows:**
- Close all 3 application windows
- Stop all terminals (Ctrl+C)

✅ **Test Complete!**

---

## 📊 What You Just Tested

### ✅ Features Verified:
1. **User Management** - Created teacher and student accounts
2. **Course Management** - Created course and enrolled students
3. **Exam Creation** - Created exam with settings
4. **Exam Distribution** - Students saw exam automatically
5. **Exam Monitoring** - Real-time monitoring worked
6. **Violation Detection** - Unauthorized apps detected
7. **Screenshot Capture** - Evidence collected
8. **Multi-Student Support** - 2 students monitored simultaneously
9. **Real-time Reporting** - Teacher saw violations as they happened
10. **Data Persistence** - All data saved to database

---

## 🎯 Expected Results Summary

| Feature | Expected Behavior | ✅/❌ |
|---------|------------------|-------|
| Login | All 3 accounts work | |
| Course Creation | Course created successfully | |
| Student Enrollment | Both students enrolled | |
| Exam Creation | Exam created with settings | |
| Exam Visibility | Both students see exam | |
| Monitoring Start | Monitoring begins on exam start | |
| Allowed App | No violation for Chrome | |
| Unauthorized App | Violation for Notepad | |
| Real-time Update | Teacher sees violations live | |
| Multi-Student | Both students monitored | |
| Reports | Violations shown in reports | |

---

## 🐛 Troubleshooting

### Problem: Second instance won't start
**Solution:**
```bash
# Make sure first instance is running
# Then open NEW terminal and run:
npm start
```

### Problem: Students don't see exam
**Possible Causes:**
1. Students not enrolled in course
2. Exam time window not active
3. Wrong course selected

**Solution:**
- Check course enrollment
- Verify exam start/end times
- Ensure course matches

### Problem: Violations not appearing
**Possible Causes:**
1. Monitoring not started
2. App is in allowed list
3. Not enough time in unauthorized app

**Solution:**
- Verify monitoring status shows "Active"
- Check allowed apps list
- Stay in unauthorized app for 10+ seconds
- Refresh monitoring reports tab

### Problem: Can't login to second instance
**Solution:**
- Each instance is independent
- Use different accounts (teacher1, student1, student2)
- Don't use same account in multiple instances

---

## 📝 Testing Checklist

### Before Testing:
- [ ] Application built (`npm run build`)
- [ ] Database initialized
- [ ] Test accounts created

### During Testing:
- [ ] 3 instances running simultaneously
- [ ] Teacher creates exam
- [ ] Students see exam
- [ ] Monitoring works
- [ ] Violations detected
- [ ] Teacher sees violations

### After Testing:
- [ ] All features work as expected
- [ ] No errors in console
- [ ] Data persists after restart
- [ ] Ready for multi-laptop testing

---

## 🎓 What This Proves

### For Your Demo:
✅ **All features work** - Verified end-to-end  
✅ **Multi-user support** - 3 users simultaneously  
✅ **Real-time monitoring** - Live violation detection  
✅ **Data synchronization** - All users see same data  
✅ **Evidence collection** - Screenshots captured  

### Confidence Level:
🟢 **HIGH** - If all tests pass, you're ready for multi-laptop demo!

---

## 🚀 Next Steps

### After Single Machine Testing:
1. ✅ **Verify all features work** (this test)
2. 📝 **Document any issues found**
3. 🔧 **Fix any bugs discovered**
4. 🎯 **Practice demo flow**
5. 👥 **Test with teammates on separate laptops**

### Moving to Multi-Laptop:
Once single-machine testing passes:
1. Follow **NETWORK-SETUP-GUIDE.md**
2. Use **DEPLOYMENT-CHECKLIST.md** for demo day
3. Reference **DEPLOYMENT-ARCHITECTURE.md** for technical details

---

## 💡 Pro Tips

### For Smooth Testing:
1. **Arrange Windows:** Tile 3 windows side-by-side
2. **Use Different Browsers:** If testing web version
3. **Take Screenshots:** Document successful tests
4. **Note Timings:** How long each step takes
5. **Practice Transitions:** Switching between windows smoothly

### For Demo Preparation:
1. **Memorize Flow:** Know each step by heart
2. **Prepare Talking Points:** What to say at each step
3. **Anticipate Questions:** Think about what might be asked
4. **Have Backup Plan:** Know what to do if something fails
5. **Stay Calm:** Even if issues arise, explain the concept

---

## ✅ Success Criteria

You're ready for multi-laptop demo when:
- [ ] All 3 instances run without errors
- [ ] Exam creation works smoothly
- [ ] Students see exams instantly
- [ ] Monitoring detects violations
- [ ] Teacher sees real-time updates
- [ ] Reports show all violations
- [ ] You can explain each step confidently

---

## 🎉 You're Ready!

Once this single-machine test passes, you have **proven** that:
- ✅ Your application works end-to-end
- ✅ Multi-user support is functional
- ✅ Real-time monitoring is operational
- ✅ All features are integrated properly

**Next:** Test with teammates on separate laptops using the network deployment feature!

---

## 📞 Need Help?

If you encounter issues:
1. Check console for errors
2. Verify database file exists
3. Ensure all accounts created correctly
4. Try restarting all instances
5. Check TROUBLESHOOTING section in other docs

**Remember:** This is a controlled test environment. Any issues found here are easier to fix than during the actual demo!

