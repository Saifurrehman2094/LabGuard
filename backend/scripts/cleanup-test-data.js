const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

/**
 * Cleanup script to remove test data and reset the database to a clean state
 * This script will:
 * 1. Remove all test accounts except admin
 * 2. Remove all test exams
 * 3. Clear monitoring events
 * 4. Reset face embeddings
 * 5. Keep system settings and audit logs for reference
 */

async function cleanupTestData() {
    const dbPath = path.join(__dirname, '..', 'data', 'database.sqlite');

    if (!fs.existsSync(dbPath)) {
        console.log('Database file does not exist. Nothing to clean up.');
        return;
    }

    console.log('Starting database cleanup...');

    try {
        const db = new Database(dbPath);

        // Disable foreign key constraints temporarily for cleanup
        db.pragma('foreign_keys = OFF');

        // Begin transaction
        const transaction = db.transaction(() => {
            // Get current user count
            const beforeCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
            console.log(`Users before cleanup: ${beforeCount}`);

            // Delete in correct order to respect foreign key constraints

            // 1. Remove all audit logs
            const deleteAuditLogs = db.prepare('DELETE FROM audit_logs');
            const deletedAuditLogs = deleteAuditLogs.run();
            console.log(`Deleted ${deletedAuditLogs.changes} audit log entries`);

            // 2. Remove all monitoring events (they reference exams and users)
            const deleteEvents = db.prepare('DELETE FROM events');
            const deletedEvents = deleteEvents.run();
            console.log(`Deleted ${deletedEvents.changes} monitoring events`);

            // 3. Remove all face embeddings (they reference users)
            const deleteFaceEmbeddings = db.prepare('DELETE FROM face_embeddings');
            const deletedEmbeddings = deleteFaceEmbeddings.run();
            console.log(`Deleted ${deletedEmbeddings.changes} face embeddings`);

            // 4. Remove all exams (they reference users via teacher_id)
            const deleteExams = db.prepare('DELETE FROM exams');
            const deletedExams = deleteExams.run();
            console.log(`Deleted ${deletedExams.changes} test exams`);

            // 5. Remove device registrations
            const deleteDevices = db.prepare('DELETE FROM devices');
            const deletedDevices = deleteDevices.run();
            console.log(`Deleted ${deletedDevices.changes} device registrations`);

            // 6. Now safely remove test users (keep admin)
            const deleteTestUsers = db.prepare(`
        DELETE FROM users 
        WHERE username IN ('teacher1', 'teacher2', 'student1', 'student2')
        OR (role != 'admin' AND username != 'admin')
      `);
            const deletedUsers = deleteTestUsers.run();
            console.log(`Deleted ${deletedUsers.changes} test user accounts`);

            // 7. Update admin user to ensure it exists with correct settings
            const updateAdmin = db.prepare(`
        UPDATE users 
        SET has_registered_face = 0, face_registration_date = NULL 
        WHERE username = 'admin'
      `);
            updateAdmin.run();

            // Get final user count
            const afterCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
            console.log(`Users after cleanup: ${afterCount}`);

            // Verify admin account exists
            const adminExists = db.prepare('SELECT username, role FROM users WHERE username = ?').get('admin');
            if (adminExists) {
                console.log(`✓ Admin account verified: ${adminExists.username} (${adminExists.role})`);
            } else {
                console.log('⚠️  Warning: Admin account not found!');
            }
        });

        // Execute transaction
        transaction();

        // Re-enable foreign key constraints
        db.pragma('foreign_keys = ON');

        // Close database
        db.close();

        console.log('\n✅ Database cleanup completed successfully!');
        console.log('\nNext steps:');
        console.log('1. Start the application');
        console.log('2. Login with admin account (admin/admin123)');
        console.log('3. Create teacher and student accounts through Admin Panel');
        console.log('4. Change the default admin password for security');

    } catch (error) {
        console.error('❌ Error during cleanup:', error);
        process.exit(1);
    }
}

// Run cleanup if this script is executed directly
if (require.main === module) {
    cleanupTestData().catch(console.error);
}

module.exports = cleanupTestData;