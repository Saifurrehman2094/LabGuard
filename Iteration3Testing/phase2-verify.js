/**
 * Phase 2 verification: PDF text extraction and question splitting.
 * Run from project root: npx electron Iteration3Testing/phase2-verify.js
 *
 * Creates a sample PDF in this folder, runs the extractor, and prints
 * full text, page count, and candidate questions so you can see Phase 2 working.
 */
const { app } = require('electron');
const path = require('path');
const fs = require('fs');

async function run() {
  const projectRoot = path.join(__dirname, '..');
  const backendDir = path.join(projectRoot, 'backend');
  const samplePdfPath = path.join(__dirname, 'sample-questions.pdf');

  console.log('--- Phase 2: PDF text extraction verification ---\n');

  // 1. Create sample PDF in Iteration3Testing (so test material stays here)
  const { PDFDocument } = require('pdf-lib');
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  page.drawText('Q1: Add two numbers. Write a C++ program that reads two integers from stdin and prints their sum.', {
    x: 50,
    y: 720,
    size: 12
  });
  page.drawText('Q2: Print hello. Write a program that prints exactly: Hello World', {
    x: 50,
    y: 680,
    size: 12
  });
  const pdfBytes = await doc.save();
  fs.writeFileSync(samplePdfPath, pdfBytes);
  console.log('1. Created sample PDF:', samplePdfPath);

  // 2. Run extractor (full text + per-page)
  const PDFTextExtractor = require(path.join(backendDir, 'services', 'pdfTextExtractor'));
  const extractor = new PDFTextExtractor();
  const extracted = await extractor.extract(samplePdfPath);

  console.log('\n2. Extracted text:');
  console.log('   Full text length:', extracted.fullText.length, 'characters');
  console.log('   Number of pages:', extracted.numPages);
  console.log('   Full text preview:', extracted.fullText.slice(0, 200) + (extracted.fullText.length > 200 ? '...' : ''));

  // 3. Run heuristic splitter (candidate questions)
  const split = await extractor.extractAndSplit(samplePdfPath);
  console.log('\n3. Candidate questions (heuristic split on Q1:, Q2:, etc.):');
  console.log('   Count:', split.questions.length);
  split.questions.forEach((q, i) => {
    console.log(`   [${i + 1}] title: "${q.title}" | page: ${q.page ?? 'n/a'}`);
    console.log(`       description: ${(q.description || '').slice(0, 80)}${(q.description || '').length > 80 ? '...' : ''}`);
  });

  console.log('\n--- Phase 2 verification done. ---');
}

app.whenReady().then(() => {
  run()
    .then(() => app.exit(0))
    .catch((err) => {
      console.error(err);
      app.exit(1);
    });
});
