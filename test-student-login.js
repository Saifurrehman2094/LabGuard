const bcrypt = require('bcrypt');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'backend', 'data', 'database.sqlite');

console.log('\n=== Testing Student Login ===\n');

const db = new sqlite3.Database(dbPath);

console.log('Testing student_one login with default credentials...');

db.get('SELECT username, password_hash, role FROM users WHERE username = ?', ['student_one'], (err, user) => {
  if (err) {
    console.error('Error getting student user:', err);
    db.close();
    return;
  }

  if (user) {
    console.log('✅ Student user found!');
    console.log('Username:', user.username);
    console.log('Role:', user.role);
    
    // Test default password
    const testPassword = 'password123';
    console.log('\nTesting password:', testPassword);
    
    bcrypt.compare(testPassword, user.password_hash).then(isMatch => {
      if (isMatch) {
        console.log('✅ Student password is CORRECT!');
        console.log('You can login with: student_one / password123');
      } else {
        console.log('❌ Student password is INCORRECT!');
      }
      db.close();
    });
  } else {
    console.log('❌ Student user NOT found in database');
    
    // Check if Student_One exists (capital S)
    db.get('SELECT username, password_hash, role FROM users WHERE username = ?', ['Student_One'], (err, user2) => {
      if (user2) {
        console.log('✅ Found Student_One instead!');
        console.log('Username:', user2.username);
        console.log('Role:', user2.role);
        
        bcrypt.compare('password123', user2.password_hash).then(isMatch => {
          if (isMatch) {
            console.log('✅ Student_One password is CORRECT!');
            console.log('You can login with: Student_One / password123');
          } else {
            console.log('❌ Student_One password is INCORRECT!');
          }
          db.close();
        });
      } else {
        console.log('❌ Student_One also not found');
        db.close();
      }
    });
  }
});