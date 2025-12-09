const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

/**
 * Script to clear all audit logs from the database
 * This will permanently delete all audit log entries
 */

async function clearAuditLogs() {
    const dbPath = path.join(__dirname, '..', 'data', 'database.sqlite');

    if (!fs.existsSync(dbPath)) {
        console.log('Database file does not exist.');
        return;
    }

    console.log('Clearing audit logs...');

    try {
        const db = new Database(dbPath);

        // Get current count
        const beforeCount = db.prepare('SELECT COUNT(*) as count FROM audit_logs').get().count;
        console.log(`Audit logs before cleanup: ${beforeCount}`);

        // Delete all audit logs
        const deleteAuditLogs = db.prepare('DELETE FROM audit_logs');
        const result = deleteAuditLogs.run();

        console.log(`✅ Deleted ${result.changes} audit log entries`);

        // Close database
        db.close();

        console.log('\n✅ Audit logs cleared successfully!');

    } catch (error) {
        console.error('❌ Error clearing audit logs:', error);
        process.exit(1);
    }
}

// Run if this script is executed directly
if (require.main === module) {
    clearAuditLogs().catch(console.error);
}

module.exports = clearAuditLogs;