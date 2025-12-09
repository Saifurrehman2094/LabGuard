const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'backend', 'data', 'database.sqlite');
const db = new Database(dbPath);

console.log('\n=== Checking User: Sir ===\n');

try {
  const user = db.prepare('SELECT username, role, full_name, created_at FROM users WHERE username = ?').get('Sir');
  
  if (user) {
    console.log('✅ User found in database:');
    console.log('Username:', user.username);
    console.log('Role:', user.role);
    console.log('Full Name:', user.full_name);
    console.log('Created At:', user.created_at);
  } else {
    console.log('❌ User "Sir" not found in database');
    console.log('\nAll users in database:');
    const allUsers = db.prepare('SELECT username, role, full_name FROM users').all();
    allUsers.forEach(u => {
      console.log(`  - ${u.username} (${u.role}) - ${u.full_name}`);
    });
  }
} catch (error) {
  console.error('Error:', error.message);
}

db.close();
