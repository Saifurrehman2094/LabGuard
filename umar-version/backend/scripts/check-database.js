const DatabaseService = require('../services/database');

async function checkDatabase() {
    console.log('🔍 Checking Database Contents...\n');

    try {
        const dbService = new DatabaseService();
        await dbService.initializeDatabase();

        // Check users
        const users = dbService.db.prepare('SELECT user_id, username, role, full_name FROM users').all();
        console.log('👥 Users:', users.length);
        users.forEach(u => console.log(`   - ${u.username} (${u.role}): ${u.full_name}`));

        // Check courses
        const courses = dbService.db.prepare('SELECT * FROM courses').all();
        console.log('\n📚 Courses:', courses.length);
        courses.forEach(c => console.log(`   - ${c.course_code}: ${c.course_name}`));

        // Check exams
        const exams = dbService.db.prepare('SELECT exam_id, title, course_id, teacher_id FROM exams').all();
        console.log('\n📝 Exams:', exams.length);
        exams.forEach(e => console.log(`   - ${e.title} (Course: ${e.course_id || 'None - Available to All'})`));

        // Check enrollments
        const enrollments = dbService.db.prepare('SELECT * FROM enrollments').all();
        console.log('\n🎓 Enrollments:', enrollments.length);

        // Check violations
        const violations = dbService.db.prepare('SELECT COUNT(*) as count FROM app_violations').get();
        console.log('\n⚠️  Violations:', violations.count);

        // Check events
        const events = dbService.db.prepare('SELECT COUNT(*) as count FROM events').get();
        console.log('📊 Events:', events.count);

        console.log('\n✅ Database check complete!');
        console.log('\n💡 Note: Existing exams with course_id = NULL are visible to all students');

    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

checkDatabase();
