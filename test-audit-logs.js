const DatabaseService = require('./backend/services/database');

async function testAuditLogs() {
  console.log('Testing Audit Logs...\n');

  const dbService = new DatabaseService();
  await dbService.initializeDatabase();

  // Get all audit logs
  console.log('Fetching all audit logs...');
  const allLogs = dbService.getAuditLogs({ limit: 50 });
  
  console.log(`\nTotal audit logs: ${allLogs.length}\n`);

  // Display enrollment logs
  const enrollmentLogs = allLogs.filter(log => log.action === 'STUDENT_ENROLLED');
  console.log(`Enrollment logs: ${enrollmentLogs.length}\n`);

  enrollmentLogs.forEach((log, index) => {
    console.log(`${index + 1}. ${log.action}`);
    console.log(`   Timestamp: ${new Date(log.timestamp).toLocaleString()}`);
    console.log(`   User: ${log.full_name || log.username || 'Unknown'}`);
    if (log.details) {
      console.log(`   Details:`);
      console.log(`     - Student: ${log.details.studentName} (@${log.details.studentUsername})`);
      console.log(`     - Course: ${log.details.courseName} (${log.details.courseCode})`);
      console.log(`     - Enrollment ID: ${log.details.enrollmentId}`);
    }
    console.log('');
  });

  // Display recent logs
  console.log('\n=== Recent Audit Logs (Last 10) ===\n');
  allLogs.slice(0, 10).forEach((log, index) => {
    console.log(`${index + 1}. ${log.action} - ${log.full_name || log.username || 'System'}`);
    console.log(`   Time: ${new Date(log.timestamp).toLocaleString()}`);
    if (log.details) {
      console.log(`   Details: ${JSON.stringify(log.details, null, 2)}`);
    }
    console.log('');
  });

  dbService.close();
}

testAuditLogs().catch(console.error);
