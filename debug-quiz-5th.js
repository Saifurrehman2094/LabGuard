const DatabaseService = require('./backend/services/database');

async function debugQuiz5th() {
  const dbService = new DatabaseService();
  await dbService.initializeDatabase();
  
  console.log('=== Debugging Quiz 5th Visibility ===\n');
  
  // Find the exam
  const exam = await dbService.getQuery(
    'SELECT * FROM exams WHERE title LIKE ?', 
    ['%Quiz 5th%']
  );
  
  if (!exam) {
    console.log('❌ Exam "Quiz 5th" not found in database!');
    console.log('\nAll exams in database:');
    const allExams = await dbService.allQuery('SELECT exam_id, title, course_id FROM exams');
    allExams.forEach(e => console.log(`  - ${e.title} (Course: ${e.course_id})`));
    dbService.close();
    return;
  }
  
  console.log('✅ Found Exam:');
  console.log('   Title:', exam.title);
  console.log('   Exam ID:', exam.exam_id);
  console.log('   Course ID:', exam.course_id);
  console.log('   Teacher ID:', exam.teacher_id);
  console.log('   Start Time:', exam.start_time);
  console.log('   End Time:', exam.end_time);
  console.log('   Created:', exam.created_at);
  
  // Check time validity
  const now = new Date();
  const endTime = new Date(exam.end_time);
  console.log('\n⏰ Time Check:');
  console.log('   Current Time:', now.toISOString());
  console.log('   Exam End Time:', endTime.toISOString());
  console.log('   Has Ended?', now > endTime ? '❌ YES (This is why students cannot see it!)' : '✅ NO');
  
  if (now > endTime) {
    console.log('\n🔴 PROBLEM FOUND:');
    console.log('   The exam has already ended!');
    console.log('   Students can only see exams where end_time > current_time');
    console.log('\n💡 SOLUTION:');
    console.log('   1. Edit the exam and set end time to future');
    console.log('   2. Or create a new exam with end time in the future');
    return;
  }
  
  // Check course
  if (!exam.course_id) {
    console.log('\n❌ PROBLEM: Exam has no course_id!');
    console.log('   Exams must be associated with a course for students to see them.');
    dbService.close();
    return;
  }
  
  const course = await dbService.getQuery(
    'SELECT * FROM courses WHERE course_id = ?',
    [exam.course_id]
  );
  
  if (!course) {
    console.log('\n❌ PROBLEM: Course not found!');
    dbService.close();
    return;
  }
  
  console.log('\n📚 Course Details:');
  console.log('   Name:', course.course_name);
  console.log('   Code:', course.course_code);
  console.log('   Teacher ID:', course.teacher_id);
  
  // Check enrollments
  const enrollments = await dbService.allQuery(
    'SELECT * FROM enrollments WHERE course_id = ? AND status = ?',
    [exam.course_id, 'active']
  );
  
  console.log('\n👥 Enrolled Students:', enrollments.length);
  
  if (enrollments.length === 0) {
    console.log('   ❌ No students enrolled in this course!');
    dbService.close();
    return;
  }
  
  // Check each student
  for (const enrollment of enrollments) {
    const student = await dbService.getUserById(enrollment.student_id);
    console.log(`\n🔍 Checking Student: ${student.full_name} (${student.username})`);
    
    // Check if student can see the exam
    const availableExams = await dbService.getAvailableExams(enrollment.student_id);
    const canSee = availableExams.find(e => e.exam_id === exam.exam_id);
    
    console.log('   Enrollment:', enrollment.status === 'active' ? '✅ Active' : '❌ Not active');
    console.log('   Can see exam:', canSee ? '✅ YES' : '❌ NO');
    
    if (!canSee) {
      // Debug why
      console.log('   \n   Debugging why student cannot see exam:');
      
      // Check submission
      const submission = await dbService.getQuery(
        'SELECT * FROM exam_submissions WHERE exam_id = ? AND student_id = ?',
        [exam.exam_id, enrollment.student_id]
      );
      console.log('   - Already submitted?', submission ? '❌ YES (filtered out)' : '✅ NO');
      
      // Check time
      console.log('   - End time in future?', now < endTime ? '✅ YES' : '❌ NO');
      
      // Check enrollment
      console.log('   - Enrolled in course?', enrollment ? '✅ YES' : '❌ NO');
    }
  }
  
  console.log('\n=== Summary ===');
  if (now > endTime) {
    console.log('❌ Exam has ended - students cannot see it');
    console.log('   Solution: Update end time to future');
  } else if (enrollments.length === 0) {
    console.log('❌ No students enrolled in course');
    console.log('   Solution: Enroll students in the course');
  } else {
    console.log('✅ Exam should be visible to enrolled students');
    console.log('   If students still cannot see it:');
    console.log('   1. Make sure students are logged in');
    console.log('   2. Refresh the student dashboard');
    console.log('   3. Check student is viewing "Available Exams" tab');
  }
  
  dbService.close();
}

debugQuiz5th().catch(console.error);
