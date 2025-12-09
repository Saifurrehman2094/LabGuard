const FileService = require('./backend/services/files');

const fileService = new FileService();

console.log('Testing FileService.getAllExamSubmissions()');
console.log('='.repeat(60));

const examId = '8167fd9f-3b90-428d-b039-cb5b48faf491';
const submissions = fileService.getAllExamSubmissions(examId);

console.log(`\nExam ID: ${examId}`);
console.log(`Total submissions found: ${submissions.length}`);
console.log('\nSubmissions:');
console.log(JSON.stringify(submissions, null, 2));
