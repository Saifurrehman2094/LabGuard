// Script to fix all remaining database methods
const fs = require('fs');

// Read the database.js file
let content = fs.readFileSync('backend/services/database.js', 'utf8');

// List of all methods that need to be fixed
const fixes = [
  // getViolationsByExam
  {
    old: `  getViolationsByExam(examId) {
    try {
      const stmt = this.db.prepare(\`
        SELECT e.*, u.full_name as student_name
        FROM events e
        JOIN users u ON e.student_id = u.user_id
        WHERE e.exam_id = ? AND e.is_violation = 1
        ORDER BY e.timestamp ASC
      \`);

      return stmt.all(examId);
    } catch (error) {
      console.error('Error getting violations by exam:', error);
      throw error;
    }
  }`,
    new: `  async getViolationsByExam(examId) {
    try {
      return await this.allQuery(\`
        SELECT e.*, u.full_name as student_name
        FROM events e
        JOIN users u ON e.student_id = u.user_id
        WHERE e.exam_id = ? AND e.is_violation = 1
        ORDER BY e.timestamp ASC
      \`, [examId]);
    } catch (error) {
      console.error('Error getting violations by exam:', error);
      throw error;
    }
  }`
  }
];

// Apply fixes
fixes.forEach(fix => {
  content = content.replace(fix.old, fix.new);
});

// Write back to file
fs.writeFileSync('backend/services/database.js', content);
console.log('Database methods fixed!');