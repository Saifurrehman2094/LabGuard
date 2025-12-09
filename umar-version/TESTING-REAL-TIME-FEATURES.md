# Testing Real-Time Notifications & Audit Logging

## Quick Test Guide

### Prerequisites
- Application built and running (`npm start`)
- Three user accounts:
  - Admin: `admin` / `admin123`
  - Teacher: `teacher` / `password`
  - Student: `Student_one` / `password`

---

## Test 1: Real-Time Enrollment Notifications

### Step 1: Teacher Creates a Course
1. Login as **Teacher** (teacher/password)
2. Navigate to "My Courses"
3. Click "Create New Course"
4. Fill in:
   - Course Name: "Introduction to Programming"
   - Course Code: "CS101"
   - Description: "Learn the basics of programming"
5. Click "Create Course"

**Expected Result:**
- ✅ Green success notification appears: "Course Created - Introduction to Programming (CS101) has been created successfully!"
- ✅ Course appears in the courses grid
- ✅ Notification auto-dismisses after 5 seconds

### Step 2: Student Enrolls in Course
1. Open a **new browser window** (or incognito mode)
2. Login as **Student_one** (Student_one/password)
3. Navigate to "Available Courses" tab
4. Find "Introduction to Programming"
5. Click "Enroll Now"

**Expected Result:**
- ✅ Green success notification appears: "Enrollment Successful - You have been enrolled in Introduction to Programming!"
- ✅ Course moves to "Enrolled Courses" tab
- ✅ Notification auto-dismisses after 5 seconds

### Step 3: Teacher Sees Real-Time Update
1. Go back to **Teacher's window**
2. Wait up to 5 seconds (auto-refresh interval)

**Expected Result:**
- ✅ Course card updates automatically
- ✅ Student count changes from "0 students" to "1 student"
- ✅ No manual refresh needed!

### Step 4: Teacher Views Enrolled Students
1. Click on the "Introduction to Programming" course card
2. View enrolled students list

**Expected Result:**
- ✅ Student_one appears in the enrolled students list
- ✅ Shows full name and username
- ✅ "Unenroll" button available

---

## Test 2: Audit Logging

### Step 1: Admin Views Audit Logs
1. Open a **third browser window**
2. Login as **Admin** (admin/admin123)
3. Navigate to "Audit Logs" tab

**Expected Result:**
- ✅ Table shows all recent system activities
- ✅ Enrollment event is visible with special formatting:
  - **Student_one** enrolled in **Introduction to Programming** (CS101)
- ✅ Timestamp shows when enrollment occurred
- ✅ Color-coded action badges (blue for STUDENT ENROLLED)

### Step 2: Verify Enrollment Details
1. Look at the "Details" column for the enrollment event

**Expected Result:**
- ✅ Shows: "Student_one enrolled in Introduction to Programming (CS101)"
- ✅ Formatted nicely (not raw JSON)
- ✅ Student name is highlighted in teal/blue

### Step 3: Refresh Audit Logs
1. Click the "Refresh" button

**Expected Result:**
- ✅ Logs reload immediately
- ✅ Any new activities appear at the top
- ✅ No page reload required

---

## Test 3: Multiple Enrollments

### Step 1: Create Second Student
1. As **Admin**, go to "Users" tab
2. Click "Add User"
3. Create:
   - Username: `Student_two`
   - Password: `password`
   - Role: Student
   - Full Name: "Student Two"
4. Click "Create User"

**Expected Result:**
- ✅ Success notification appears
- ✅ Student_two appears in users table

### Step 2: Second Student Enrolls
1. Open **fourth browser window**
2. Login as **Student_two** (Student_two/password)
3. Navigate to "Available Courses"
4. Enroll in "Introduction to Programming"

**Expected Result:**
- ✅ Success notification for Student_two
- ✅ Course moves to enrolled tab

### Step 3: Teacher Sees Both Students
1. Go back to **Teacher's window**
2. Wait up to 5 seconds

**Expected Result:**
- ✅ Course card shows "2 students"
- ✅ Click on course to see both students listed
- ✅ Both Student_one and Student_two appear

### Step 4: Admin Sees Both Enrollments
1. Go back to **Admin's window**
2. Click "Refresh" in Audit Logs tab

**Expected Result:**
- ✅ Two enrollment events visible
- ✅ Each shows different student name
- ✅ Both show same course
- ✅ Different timestamps

---

## Test 4: Unenrollment

### Step 1: Teacher Unenrolls Student
1. As **Teacher**, click on "Introduction to Programming" course
2. Click "Unenroll" button next to Student_two
3. Confirm the action

**Expected Result:**
- ℹ️ Blue info notification: "Student Unenrolled - Student Two has been removed from Introduction to Programming"
- ✅ Student_two disappears from enrolled list
- ✅ Student count updates to "1 student"

### Step 2: Student Sees Update
1. Go to **Student_two's window**
2. Wait up to 5 seconds

**Expected Result:**
- ✅ Course automatically moves back to "Available Courses" tab
- ✅ No longer in "Enrolled Courses"
- ✅ Can enroll again if desired

---

## Test 5: Dark Mode with Notifications

### Step 1: Enable Dark Mode
1. In any window, click the **moon icon** (top-right)

**Expected Result:**
- ✅ Interface switches to dark theme
- ✅ Smooth transition animation

### Step 2: Trigger Notification in Dark Mode
1. Perform any action (enroll, create course, etc.)

**Expected Result:**
- ✅ Notification appears with dark theme styling
- ✅ Glass morphism effect visible
- ✅ Text is readable with good contrast
- ✅ Icons are properly colored

---

## Test 6: Error Handling

### Step 1: Try to Enroll Twice
1. As **Student_one**, try to enroll in a course you're already enrolled in

**Expected Result:**
- ❌ Red error notification: "Enrollment Failed - Already enrolled in this course"
- ✅ Notification auto-dismisses after 5 seconds

### Step 2: Try Invalid Course Creation
1. As **Teacher**, try to create a course with duplicate course code

**Expected Result:**
- ❌ Red error notification with appropriate error message
- ✅ Form remains open for correction

---

## Test 7: Auto-Refresh Performance

### Step 1: Monitor Network Activity
1. Open browser DevTools (F12)
2. Go to Network tab
3. Watch for API calls

**Expected Result:**
- ✅ API calls every 5 seconds
- ✅ Minimal data transfer
- ✅ No memory leaks
- ✅ Smooth performance

### Step 2: Leave Page and Return
1. Navigate away from courses page
2. Wait 10 seconds
3. Navigate back

**Expected Result:**
- ✅ Auto-refresh resumes immediately
- ✅ No duplicate intervals
- ✅ Data is current

---

## Test 8: Notification Queue

### Step 1: Trigger Multiple Notifications
1. As **Teacher**, quickly:
   - Create a course
   - Enroll a student (from another window)
   - Unenroll a student

**Expected Result:**
- ✅ All notifications appear
- ✅ Stack vertically (not overlapping)
- ✅ Each dismisses independently
- ✅ Smooth animations

---

## Visual Indicators to Look For

### Notifications
- **Position:** Top-right corner
- **Animation:** Slide in from right
- **Icons:** 
  - ✓ Checkmark (Success - Green)
  - ℹ Info circle (Info - Blue)
  - ⚠ Triangle (Warning - Yellow)
  - ✗ X mark (Error - Red)
- **Duration:** 5 seconds before auto-dismiss
- **Close button:** X in top-right of notification

### Audit Logs
- **Table Layout:** Clean, professional
- **Action Badges:** Colored pills with action names
- **Enrollment Details:** Formatted text (not JSON)
- **Hover Effect:** Row highlights on hover
- **Dark Mode:** Glass morphism with blur effect

### Auto-Refresh
- **No visual indicator** (happens silently)
- **Data updates** without page reload
- **Smooth transitions** when data changes

---

## Troubleshooting

### Notifications Not Appearing
1. Check browser console for errors
2. Verify you're logged in
3. Try refreshing the page
4. Check if notifications are blocked by browser

### Auto-Refresh Not Working
1. Check browser console for errors
2. Verify network connection
3. Check if you're on the correct page
4. Try logging out and back in

### Audit Logs Empty
1. Perform some actions (enroll, create course)
2. Click "Refresh" button
3. Check if you're logged in as admin
4. Run `node test-audit-logs.js` to verify database

---

## Success Criteria

✅ **All tests pass** if:
1. Notifications appear for all actions
2. Teacher sees enrollments within 5 seconds
3. Admin can view all audit logs with timestamps
4. Dark mode works with notifications
5. Error notifications appear for invalid actions
6. Multiple notifications stack properly
7. Auto-refresh works without manual intervention
8. Audit logs show formatted enrollment details

---

## Performance Benchmarks

- **Notification display:** < 100ms
- **Auto-refresh interval:** 5 seconds
- **Audit log load:** < 500ms
- **Notification dismiss:** 5 seconds (auto)
- **API response time:** < 200ms

---

## Next Steps After Testing

1. ✅ Verify all features work as expected
2. ✅ Test on different browsers (Chrome, Firefox, Edge)
3. ✅ Test on different screen sizes (desktop, tablet, mobile)
4. ✅ Test with multiple concurrent users
5. ✅ Monitor performance over extended use
6. ✅ Gather user feedback
7. ✅ Document any issues found
8. ✅ Plan future enhancements

---

## Support

If you encounter any issues during testing:
1. Check browser console for errors
2. Review `REAL-TIME-NOTIFICATIONS-SUMMARY.md` for implementation details
3. Run `node test-audit-logs.js` to verify database
4. Check that all dependencies are installed
5. Verify Node.js version is 20.19.6
6. Ensure Electron version is 25.9.8

---

**Happy Testing! 🚀**
