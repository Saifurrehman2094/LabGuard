const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'backend', 'data', 'database.sqlite');
const db = new Database(dbPath);

console.log('\n=== ALL USERS ===\n');
const users = db.prepare('SELECT user_id, username, full_name, role FROM users').all();

users.forEach(user => {
  console.log(`Username: "${user.username}"`);
  console.log(`Full Name: "${user.full_name}"`);
  console.log(`Role: ${user.role}`);
  console.log(`User ID: ${user.user_id}`);
  console.log('---');
});

console.log(`\nTotal users: ${users.length}\n`);

db.close();
