#!/usr/bin/env node
/**
 * Debug why a student doesn't see exams on their dashboard.
 * Usage: node backend/scripts/debug-student-exams.js [username]
 * Example: node backend/scripts/debug-student-exams.js umar
 */
const path = require('path');
const DatabaseService = require('../services/database');

async function debug() {
  const db = new DatabaseService();
  await db.initializeDatabase();

  const searchName = (process.argv[2] || 'umar').toLowerCase();
  console.log(`\n=== DEBUG: Why doesn't "${searchName}" see exams? ===\n`);

  // 1. Find Umar (or matching student)
  const students = db.db.prepare(`
    SELECT user_id, username, full_name FROM users 
    WHERE role = 'student' 
    AND (LOWER(username) LIKE ? OR LOWER(full_name) LIKE ?)
  `).all(`%${searchName}%`, `%${searchName}%`);

  if (students.length === 0) {
    console.log(`❌ No student found matching "${searchName}"`);
    const allStudents = db.db.prepare("SELECT user_id, username, full_name FROM users WHERE role = 'student'").all();
    console.log('\nAvailable students:', allStudents.map(s => `${s.full_name} (${s.username})`).join(', '));
    db.close();
    return;
  }

  const student = students[0];
  const studentId = student.user_id;
  console.log(`✅ Found student: ${student.full_name} (${student.username})`);
  console.log(`   User ID: ${studentId}\n`);

  // 2. List all exams (especially blockchain)
  const exams = db.db.prepare(`
    SELECT exam_id, title, course_id, start_time, end_time 
    FROM exams 
    ORDER BY created_at DESC
  `).all();

  console.log('📝 EXAMS:');
  if (exams.length === 0) {
    console.log('   No exams in database.');
    db.close();
    return;
  }

  exams.forEach(e => {
    const hasCourse = e.course_id ? '✅' : '❌ NULL';
    console.log(`   - ${e.title}`);
    console.log(`     Exam ID: ${e.exam_id}`);
    console.log(`     Course ID: ${e.course_id || 'NULL'} ${hasCourse}`);
    console.log(`     End time: ${e.end_time}`);
    console.log('');
  });

  // 3. Umar's enrollments
  const enrollments = db.db.prepare(`
    SELECT e.course_id, e.status, c.course_name, c.course_code
    FROM enrollments e
    JOIN courses c ON e.course_id = c.course_id
    WHERE e.student_id = ?
  `).all(studentId);

  console.log(`👥 ${student.full_name}'s enrollments:`);
  if (enrollments.length === 0) {
    console.log('   ❌ NONE - Student must enroll in a course!');
    console.log('   Fix: Teacher adds student via Course Management, or student self-enrolls in "My Courses"');
  } else {
    enrollments.forEach(en => {
      const statusOk = en.status === 'active' ? '✅' : `⚠️ ${en.status}`;
      console.log(`   - ${en.course_code}: ${en.course_name} (${statusOk})`);
    });
  }
  console.log('');

  // 4. Check course_id match
  const examCourseIds = [...new Set(exams.map(e => e.course_id).filter(Boolean))];
  const enrolledCourseIds = enrollments.filter(e => e.status === 'active').map(e => e.course_id);

  const mismatches = examCourseIds.filter(cid => !enrolledCourseIds.includes(cid));
  const nullCourseExams = exams.filter(e => !e.course_id);

  if (nullCourseExams.length > 0) {
    console.log('⚠️  EXAMS WITH NULL COURSE:');
    nullCourseExams.forEach(e => console.log(`   - ${e.title}`));
    console.log('   Fix: Run "node backend/scripts/fix-null-course-exams.js"');
    console.log('');
  }

  if (mismatches.length > 0 && enrolledCourseIds.length > 0) {
    console.log('⚠️  EXAMS LINKED TO COURSES Umar is NOT enrolled in:');
    mismatches.forEach(cid => {
      const exam = exams.find(e => e.course_id === cid);
      const course = db.db.prepare('SELECT course_code, course_name FROM courses WHERE course_id = ?').get(cid);
      console.log(`   - ${exam?.title} → ${course?.course_code || cid}`);
    });
    console.log('');
  }

  // 5. Run the exact getAvailableExams query
  const availableExams = db.db.prepare(`
    SELECT e.exam_id, e.title, e.course_id, e.end_time
    FROM exams e
    JOIN users u ON e.teacher_id = u.user_id
    JOIN courses c ON e.course_id = c.course_id
    JOIN enrollments en ON e.course_id = en.course_id AND en.student_id = ? AND en.status = 'active'
    LEFT JOIN exam_submissions es ON e.exam_id = es.exam_id AND es.student_id = ?
    WHERE datetime(e.end_time) > datetime('now', 'localtime')
      AND es.submission_id IS NULL
  `).all(studentId, studentId);

  console.log('📋 Available exams for', student.full_name, '(from getAvailableExams query):');
  if (availableExams.length === 0) {
    console.log('   ❌ NONE');
    console.log('\n   Possible causes:');
    if (enrollments.length === 0) console.log('   1. Student not enrolled in any course');
    if (nullCourseExams.length > 0) console.log('   2. Exam has NULL course_id');
    if (mismatches.length > 0) console.log('   3. Exam linked to different course than student is enrolled in');
    console.log('   4. Exam has already ended (check end_time)');
    console.log('   5. Student already submitted this exam');
  } else {
    availableExams.forEach(e => console.log(`   ✅ ${e.title}`));
  }

  console.log('\n=== END ===\n');
  db.close();
}

debug().catch(console.error);
