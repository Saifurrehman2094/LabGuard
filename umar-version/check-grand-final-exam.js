const DatabaseService = require('./backend/services/database');

async function checkExam() {
  const dbService = new DatabaseService();
  await dbService.initializeDatabase();
  
  console.log('=== Checking Grand Final Exam ===\n');
  
  // Find the exam
  const allExams = await dbService.allQuery('SELECT * FROM exams WHERE title LIKE "%Grand Final%" ORDER BY created_at DESC LIMIT 1');
  
  if (allExams.length === 0) {
    console.log('❌ No "Grand Final" exam found');
    dbService.close();
    return;
  }
  
  const exam = allExams[0];
  console.log('✅ Found exam:', exam.title);
  console.log('   Exam ID:', exam.exam_id);
  console.log('   Course ID:', exam.course_id);
  console.log('   Created:', exam.created_at);
  console.log('   Start:', exam.start_time);
  console.log('   End:', exam.end_time);
  
  // Get course info
  const course = await dbService.getCourseById(exam.course_id);
  console.log('\n📚 Course:', course?.course_name || 'Unknown');
  
  // Get enrolled students
  const students = await dbService.getEnrolledStudents(exam.course_id);
  console.log('\n👥 Enrolled Students:', students.length);
  students.forEach((s, i) => {
    console.log(`   ${i+1}. ${s.full_name} (${s.username})`);
  });
  
  // Check if students can see the exam
  console.log('\n🔍 Checking if students can see exam...');
  for (const student of students) {
    const availableExams = await dbService.getAvailableExams(student.user_id);
    const canSee = availableExams.some(e => e.exam_id === exam.exam_id);
    console.log(`   ${student.full_name}: ${canSee ? '✅ Can see' : '❌ Cannot see'}`);
  }
  
  // Check audit logs
  console.log('\n📊 Checking audit logs...');
  const logs = await dbService.getAuditLogs({ action: 'EXAM_CREATED', limit: 5 });
  const examLog = logs.find(l => l.details?.examId === exam.exam_id);
  
  if (examLog) {
    console.log('✅ Audit log found:');
    console.log('   Enrolled students notified:', examLog.details?.enrolledStudents || 0);
  } else {
    console.log('❌ No audit log found for this exam');
  }
  
  console.log('\n=== Issue Analysis ===');
  console.log('The notification system works ONLY when:');
  console.log('1. Students are ALREADY logged in when exam is created');
  console.log('2. Students are on the "Available Exams" page');
  console.log('3. The app is running (not closed)');
  console.log('\nIf students login AFTER exam creation:');
  console.log('- They will see the exam in the list ✅');
  console.log('- But they won\'t get the notification popup ❌');
  console.log('\nThis is NORMAL behavior for real-time notifications!');
  
  dbService.close();
}

checkExam();