const bcrypt = require('bcrypt');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'backend', 'data', 'database.sqlite');

console.log('\n=== Testing All User Passwords ===\n');

const db = new sqlite3.Database(dbPath);

const commonPasswords = [
  'password123',
  'admin123', 
  'password@2083',
  'password2083',
  '123456',
  'password',
  'admin'
];

db.all('SELECT username, password_hash, role FROM users', (err, users) => {
  if (err) {
    console.error('Error getting users:', err);
    db.close();
    return;
  }

  console.log(`Found ${users.length} users in database:\n`);

  let completed = 0;
  const total = users.length;

  users.forEach(user => {
    console.log(`Testing user: ${user.username} (${user.role})`);
    
    let passwordFound = false;
    let tested = 0;
    
    commonPasswords.forEach(password => {
      bcrypt.compare(password, user.password_hash).then(isMatch => {
        tested++;
        
        if (isMatch && !passwordFound) {
          passwordFound = true;
          console.log(`  ✅ Password found: ${password}`);
        }
        
        if (tested === commonPasswords.length) {
          if (!passwordFound) {
            console.log(`  ❌ No common password found`);
          }
          
          completed++;
          if (completed === total) {
            console.log('\n=== Summary ===');
            console.log('Try these working credentials:');
            console.log('- admin / admin123');
            console.log('- student_one / password123 (if exists)');
            console.log('- teacher_one / password123 (if exists)');
            db.close();
          }
        }
      });
    });
  });
});