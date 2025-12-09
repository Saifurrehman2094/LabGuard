const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'backend', 'data', 'database.sqlite');
const db = new sqlite3.Database(dbPath);

console.log('=== Current Users in Database ===');
db.all('SELECT username, role, full_name, created_at FROM users ORDER BY created_at', (err, users) => {
  if (err) {
    console.error('Error:', err);
    return;
  }
  
  console.log('Total users:', users.length);
  console.log('\nUsers:');
  users.forEach((u, i) => {
    console.log(`${i+1}. ${u.username} (${u.role}) - ${u.full_name} - Created: ${u.created_at}`);
  });
  
  // Check which are the original default users
  console.log('\n=== Analysis ===');
  const defaultUsers = ['admin', 'student_one', 'teacher_one'];
  const foundDefaults = users.filter(u => defaultUsers.includes(u.username));
  const customUsers = users.filter(u => !defaultUsers.includes(u.username));
  
  console.log(`Default system users found: ${foundDefaults.length}/3`);
  foundDefaults.forEach(u => console.log(`  - ${u.username} (${u.role})`));
  
  console.log(`\nCustom users created: ${customUsers.length}`);
  customUsers.forEach(u => console.log(`  - ${u.username} (${u.role}) - ${u.full_name}`));
  
  db.close();
});