const DatabaseService = require('./backend/services/database');

async function extendQuiz5th() {
  const dbService = new DatabaseService();
  await dbService.initializeDatabase();
  
  console.log('=== Extending Quiz 5th Time ===\n');
  
  // Find the exam
  const exam = await dbService.getQuery(
    'SELECT * FROM exams WHERE title LIKE ?', 
    ['%Quiz 5th%']
  );
  
  if (!exam) {
    console.log('❌ Exam not found!');
    dbService.close();
    return;
  }
  
  console.log('Current exam times:');
  console.log('  Start:', exam.start_time);
  console.log('  End:', exam.end_time);
  
  // Set new end time to 2 hours from now
  const now = new Date();
  const newEndTime = new Date(now.getTime() + (2 * 60 * 60 * 1000)); // 2 hours from now
  
  // Format for SQLite
  const newEndTimeStr = newEndTime.toISOString().slice(0, 16).replace('T', ' ');
  
  console.log('\nUpdating to:');
  console.log('  New End:', newEndTimeStr);
  
  await dbService.runQuery(
    'UPDATE exams SET end_time = ? WHERE exam_id = ?',
    [newEndTimeStr, exam.exam_id]
  );
  
  console.log('\n✅ Exam time extended successfully!');
  console.log('Students will now be able to see and take the exam.');
  
  dbService.close();
}

extendQuiz5th().catch(console.error);
