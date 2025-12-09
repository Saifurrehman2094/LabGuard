const DatabaseService = require('./backend/services/database');

async function fixExamTime() {
  const dbService = new DatabaseService();
  await dbService.initializeDatabase();
  
  console.log('=== Fixing Grand Final Exam Time ===\n');
  
  // Get the exam
  const exam = await dbService.getQuery('SELECT * FROM exams WHERE title = ?', ['Grand Final']);
  
  if (!exam) {
    console.log('❌ Exam not found');
    dbService.close();
    return;
  }
  
  console.log('📄 Current Exam:');
  console.log('   Title:', exam.title);
  console.log('   Start:', exam.start_time);
  console.log('   End:', exam.end_time);
  
  // Set new times
  const now = new Date();
  const newStart = new Date(now.getTime() + 5 * 60 * 1000); // 5 minutes from now
  const newEnd = new Date(now.getTime() + 2 * 60 * 60 * 1000); // 2 hours from now
  
  console.log('\n🔧 Updating to:');
  console.log('   New Start:', newStart.toISOString());
  console.log('   New End:', newEnd.toISOString());
  
  // Update the exam
  await dbService.updateExam(exam.exam_id, {
    startTime: newStart.toISOString(),
    endTime: newEnd.toISOString()
  });
  
  console.log('\n✅ Exam updated successfully!');
  console.log('\n📋 Next steps:');
  console.log('1. Students should now see the exam in "Available Exams"');
  console.log('2. Exam will show as 🔒 Locked for 5 minutes');
  console.log('3. Then it will auto-unlock and show as 🟢 Active');
  console.log('4. Students can take the exam for 2 hours');
  
  // Verify students can see it
  console.log('\n🔍 Verifying visibility...');
  const students = await dbService.getEnrolledStudents(exam.course_id);
  
  for (const student of students) {
    const available = await dbService.getAvailableExams(student.user_id);
    const canSee = available.find(e => e.exam_id === exam.exam_id);
    console.log(`   ${student.full_name}: ${canSee ? '✅ Can see' : '❌ Cannot see'}`);
  }
  
  dbService.close();
}

fixExamTime();