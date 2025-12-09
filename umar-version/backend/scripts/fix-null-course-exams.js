const DatabaseService = require('../services/database');

async function fixExams() {
    const db = new DatabaseService();
    await db.initializeDatabase();

    console.log('\n=== FIXING NULL COURSE EXAMS ===\n');

    // Get exams with null course_id
    const nullExams = db.db.prepare('SELECT exam_id, title FROM exams WHERE course_id IS NULL').all();

    if (nullExams.length === 0) {
        console.log('✅ No exams with NULL course_id found');
        db.close();
        return;
    }

    console.log(`Found ${nullExams.length} exam(s) with NULL course_id:`);
    nullExams.forEach(e => console.log(`  - ${e.title} (${e.exam_id})`));

    // Get first available course
    const courses = db.db.prepare('SELECT course_id, course_code, course_name FROM courses LIMIT 1').all();

    if (courses.length === 0) {
        console.log('\n❌ No courses found! Create a course first.');
        db.close();
        return;
    }

    const course = courses[0];
    console.log(`\nAssigning to course: ${course.course_code} - ${course.course_name}`);

    // Update exams
    const updateStmt = db.db.prepare('UPDATE exams SET course_id = ? WHERE course_id IS NULL');
    const result = updateStmt.run(course.course_id);

    console.log(`\n✅ Updated ${result.changes} exam(s)`);
    console.log('\nNow students enrolled in this course will see the exam!');

    db.close();
}

fixExams().catch(console.error);
