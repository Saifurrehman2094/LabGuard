const fs = require('fs');
const path = require('path');

const submissionsDir = path.join(__dirname, 'backend', 'data', 'submissions');

console.log('='.repeat(60));
console.log('CHECKING ALL SUBMISSIONS');
console.log('='.repeat(60));
console.log('Directory:', submissionsDir);
console.log('');

function getAllFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      getAllFiles(filePath, fileList);
    } else {
      fileList.push({
        path: filePath,
        name: file,
        size: stat.size,
        modified: stat.mtime
      });
    }
  });
  
  return fileList;
}

const allFiles = getAllFiles(submissionsDir);
allFiles.sort((a, b) => b.modified - a.modified);

console.log(`Total files found: ${allFiles.length}`);
console.log('');
console.log('Latest 10 files:');
console.log('-'.repeat(60));

allFiles.slice(0, 10).forEach((file, index) => {
  const relativePath = path.relative(submissionsDir, file.path);
  const parts = relativePath.split(path.sep);
  const examId = parts[0];
  const studentId = parts[1];
  
  console.log(`${index + 1}. ${file.name}`);
  console.log(`   Exam: ${examId}`);
  console.log(`   Student: ${studentId}`);
  console.log(`   Size: ${file.size} bytes`);
  console.log(`   Modified: ${file.modified.toLocaleString()}`);
  console.log('');
});
