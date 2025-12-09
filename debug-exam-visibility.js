const DatabaseService = require('./backend/services/database');

async function debugExam() {
  const dbService = new DatabaseService();
  await dbService.initializeDatabase();
  
  console.log('=== Debugging Grand Final Exam Visibility ===\n');
  
  // Get the exam
  const exam = await dbService.getQuery('SELECT * FROM exams WHERE title = ?', ['Grand Final']);
  
  if (!exam) {
    console.log('❌ Exam not found');
    dbService.close();
    return;
  }
  
  console.log('📄 Exam Details:');
  console.log('   Title:', exam.title);
  console.log('   Course ID:', exam.course_id);
  console.log('   Start:', exam.start_time);
  console.log('   End:', exam.end_time);
  console.log('   Created:', exam.created_at);
  
  // Check current time vs exam time
  const now = new Date();
  const endTime = new Date(exam.end_time);
  console.log('\n⏰ Time Check:');
  console.log('   Current time:', now.toISOString());
  console.log('   Exam end time:', endTime.toISOString());
  console.log('   Has exam ended?', now > endTime ? 'YES ❌ (This is why students cannot see it!)' : 'NO ✅');
  
  if (now > endTime) {
    console.log('\n🔴 PROBLEM FOUND:');
    console.log('   The exam has already ended!');
    console.log('   Students can only see exams that have NOT ended yet.');
    console.log('\n💡 SOLUTION:');
    console.log('   Update the exam end time to be in the future:');
    console.log('   1. Login as teacher');
    console.log('   2. Edit the "Grand Final" exam');
    console.log('   3. Set end time to at least 1 hour from now');
    console.log('   4. Save the exam');
    console.log('   5. Students will see it immediately!');
  }
  
  // Get enrolled students
  const students = await dbService.getEnrolledStudents(exam.course_id);
  console.log('\n👥 Enrolled Students:', students.length);
  
  // Check each student
  for (const student of students) {
    console.log(`\n🔍 Checking: ${student.full_name}`);
    
    // Check enrollment
    const enrollment = await dbService.getQuery(
      'SELECT * FROM enrollments WHERE course_id = ? AND student_id = ? AND status = ?',
      [exam.course_id, student.user_id, 'active']
    );
    console.log('   Enrollment:', enrollment ? '✅ Active' : '❌ Not found');
    
    // Check submission
    const submission = await dbService.getQuery(
      'SELECT * FROM exam_submissions WHERE exam_id = ? AND student_id = ?',
      [exam.exam_id, student.user_id]
    );
    console.log('   Submission:', submission ? '❌ Already submitted' : '✅ Not submitted');
    
    // Try to get available exams
    const available = await dbService.getAvailableExams(student.user_id);
    const canSee = available.find(e => e.exam_id === exam.exam_id);
    console.log('   Can see exam:', canSee ? '✅ YES' : '❌ NO');
    
    if (!canSee && now <= endTime) {
      console.log('   ⚠️ ISSUE: Student cannot see exam even though it hasnt ended!');
    }
  }
  
  dbService.close();
}

debugExam();