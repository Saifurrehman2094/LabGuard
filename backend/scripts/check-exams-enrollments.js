const DatabaseService = require('../services/database');

async function checkData() {
    const db = new DatabaseService();
    await db.initializeDatabase();

    console.log('\n=== CHECKING EXAMS AND ENROLLMENTS ===\n');

    // Check exams
    const exams = db.db.prepare('SELECT exam_id, title, course_id, start_time, end_time FROM exams').all();
    console.log('📝 EXAMS:');
    if (exams.length === 0) {
        console.log('  No exams found');
    } else {
        exams.forEach(exam => {
            console.log(`  - ${exam.title}`);
            console.log(`    Exam ID: ${exam.exam_id}`);
            console.log(`    Course ID: ${exam.course_id || 'NULL'}`);
            console.log(`    Start: ${exam.start_time}`);
            console.log(`    End: ${exam.end_time}`);
            console.log('');
        });
    }

    // Check courses
    const courses = db.db.prepare('SELECT course_id, course_code, course_name, teacher_id FROM courses').all();
    console.log('\n📚 COURSES:');
    if (courses.length === 0) {
        console.log('  No courses found');
    } else {
        courses.forEach(course => {
            console.log(`  - ${course.course_code}: ${course.course_name}`);
            console.log(`    Course ID: ${course.course_id}`);
            console.log(`    Teacher ID: ${course.teacher_id}`);
            console.log('');
        });
    }

    // Check enrollments
    const enrollments = db.db.prepare(`
    SELECT e.enrollment_id, e.student_id, e.course_id, e.status,
           u.full_name as student_name,
           c.course_code, c.course_name
    FROM enrollments e
    JOIN users u ON e.student_id = u.user_id
    JOIN courses c ON e.course_id = c.course_id
  `).all();

    console.log('\n👥 ENROLLMENTS:');
    if (enrollments.length === 0) {
        console.log('  No enrollments found - STUDENTS NEED TO ENROLL!');
    } else {
        enrollments.forEach(enr => {
            console.log(`  - ${enr.student_name} enrolled in ${enr.course_code}`);
            console.log(`    Status: ${enr.status}`);
            console.log(`    Course ID: ${enr.course_id}`);
            console.log('');
        });
    }

    // Check students
    const students = db.db.prepare("SELECT user_id, username, full_name FROM users WHERE role = 'student'").all();
    console.log('\n🎓 STUDENTS:');
    students.forEach(student => {
        console.log(`  - ${student.full_name} (${student.username})`);
        console.log(`    User ID: ${student.user_id}`);
        console.log('');
    });

    console.log('\n=== SUMMARY ===');
    console.log(`Total Exams: ${exams.length}`);
    console.log(`Total Courses: ${courses.length}`);
    console.log(`Total Enrollments: ${enrollments.length}`);
    console.log(`Total Students: ${students.length}`);

    if (exams.length > 0 && enrollments.length === 0) {
        console.log('\n⚠️  WARNING: Exams exist but no enrollments!');
        console.log('   Students need to enroll in courses to see exams.');
        console.log('   Go to "My Courses" tab and enroll in a course.');
    }

    db.close();
}

checkData().catch(console.error);
