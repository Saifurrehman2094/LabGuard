const bcrypt = require('bcrypt');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'backend', 'data', 'database.sqlite');

console.log('\n=== Testing Login for User: Sir ===\n');

// Test with sqlite3
const db = new sqlite3.Database(dbPath);

console.log('\n=== All Users in Database ===');
db.all('SELECT username, role, full_name FROM users', (err, allUsers) => {
  if (err) {
    console.error('Error getting users:', err);
    return;
  }
  
  allUsers.forEach(u => {
    console.log(`  - Username: "${u.username}" | Role: ${u.role} | Name: ${u.full_name}`);
  });

  console.log('\n=== Testing User "Sir" ===');
  db.get('SELECT username, password_hash, role FROM users WHERE username = ?', ['Sir'], (err, user) => {
    if (err) {
      console.error('Error getting user:', err);
      db.close();
      return;
    }

    if (user) {
      console.log('✅ User found!');
      console.log('Username:', user.username);
      console.log('Role:', user.role);
      
      // Test password
      const testPassword = 'password@2083';
      console.log('\nTesting password:', testPassword);
      
      bcrypt.compare(testPassword, user.password_hash).then(isMatch => {
        if (isMatch) {
          console.log('✅ Password is CORRECT!');
        } else {
          console.log('❌ Password is INCORRECT!');
          console.log('\nTrying common variations:');
          
          // Try without special char
          bcrypt.compare('password2083', user.password_hash).then(m => {
            console.log('  password2083:', m ? '✅ MATCH' : '❌ No match');
            db.close();
          });
        }
      });
    } else {
      console.log('❌ User "Sir" NOT found in database');
      console.log('\nTrying case variations:');
      
      const variations = ['sir', 'SIR', 'Sir'];
      let completed = 0;
      
      variations.forEach(v => {
        db.get('SELECT username FROM users WHERE username = ?', [v], (err, u) => {
          console.log(`  "${v}": ${u ? '✅ Found' : '❌ Not found'}`);
          completed++;
          if (completed === variations.length) {
            db.close();
          }
        });
      });
    }
  });
});


