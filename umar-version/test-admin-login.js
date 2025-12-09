const bcrypt = require('bcrypt');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'backend', 'data', 'database.sqlite');

console.log('\n=== Testing Admin Login ===\n');

const db = new sqlite3.Database(dbPath);

console.log('Testing admin login with default credentials...');

db.get('SELECT username, password_hash, role FROM users WHERE username = ?', ['admin'], (err, user) => {
  if (err) {
    console.error('Error getting admin user:', err);
    db.close();
    return;
  }

  if (user) {
    console.log('✅ Admin user found!');
    console.log('Username:', user.username);
    console.log('Role:', user.role);
    
    // Test default password
    const testPassword = 'admin123';
    console.log('\nTesting password:', testPassword);
    
    bcrypt.compare(testPassword, user.password_hash).then(isMatch => {
      if (isMatch) {
        console.log('✅ Admin password is CORRECT!');
        console.log('You can login with: admin / admin123');
      } else {
        console.log('❌ Admin password is INCORRECT!');
      }
      db.close();
    });
  } else {
    console.log('❌ Admin user NOT found in database');
    db.close();
  }
});