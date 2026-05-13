/**
 * ============================================================================
 * Phase 2 API Testing Suite
 * Tests: Teacher Exam Upload with PDF files
 *
 * Usage:
 *   node backend/scripts/test-api-phase2.js
 * ============================================================================
 */

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const FormData = require("form-data");
const http = require("http");
const https = require("https");
const crypto = require("crypto");

const API_URL = process.env.API_URL || "http://localhost:5000";
const TEST_TIMEOUT = 30000;

// Color codes
const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  dim: "\x1b[2m",
};

const log = {
  test: (name) => console.log(`\n${colors.cyan}→ Test: ${name}${colors.reset}`),
  pass: (msg) => console.log(`  ${colors.green}✓${colors.reset} ${msg}`),
  fail: (msg) => console.log(`  ${colors.red}✗${colors.reset} ${msg}`),
  info: (msg) => console.log(`  ${colors.dim}${msg}${colors.reset}`),
};

/**
 * Make HTTP request with support for multipart/form-data
 */
function makeRequest(
  method,
  urlPath,
  body = null,
  headers = {},
  isFormData = false,
) {
  return new Promise((resolve, reject) => {
    try {
      const url = new URL(urlPath, API_URL);
      const isHttps = url.protocol === "https:";
      const httpLib = isHttps ? https : http;

      const requestOptions = {
        method,
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        headers: {
          Connection: "close",
          ...headers,
        },
        timeout: TEST_TIMEOUT,
      };

      // Add Content-Type for JSON if not FormData
      if (body && !isFormData && !requestOptions.headers["Content-Type"]) {
        requestOptions.headers["Content-Type"] = "application/json";
      }

      const req = httpLib.request(requestOptions, (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          try {
            resolve({
              status: res.statusCode,
              headers: res.headers,
              body: data ? JSON.parse(data) : null,
            });
          } catch (err) {
            resolve({
              status: res.statusCode,
              headers: res.headers,
              body: data,
            });
          }
        });
      });

      req.on("error", (err) => {
        reject(err);
      });

      req.on("timeout", () => {
        req.destroy();
        reject(new Error("Request timeout"));
      });

      if (body) {
        if (isFormData) {
          body.pipe(req);
        } else {
          req.write(JSON.stringify(body));
          req.end();
        }
      } else {
        req.end();
      }
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Create test PDF file
 */
function createTestPdf() {
  const testDir = path.join(__dirname, "../..", "test_uploads");
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }

  // Simple PDF header + minimal content
  const pdfContent = Buffer.from(`%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>
endobj
4 0 obj
<< >>
stream
BT
/F1 12 Tf
100 700 Td
(Test Exam Document) Tj
ET
endstream
endobj
xref
0 5
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000203 00000 n 
trailer
<< /Size 5 /Root 1 0 R >>
startxref
300
%%EOF`);

  const filename = `test_exam_${Date.now()}.pdf`;
  const filepath = path.join(testDir, filename);
  fs.writeFileSync(filepath, pdfContent);

  return filepath;
}

/**
 * Test suite
 */
async function runTests() {
  let passed = 0;
  let failed = 0;
  let token = null;

  console.log(`\n${"═".repeat(70)}`);
  console.log(`LAB-Guard Phase 2: Exam Upload API Test Suite`);
  console.log(`${"═".repeat(70)}`);
  console.log(`\nAPI URL: ${API_URL}\n`);

  try {
    // Test 1: Health check
    log.test("Health Check (Phase 2 Ready)");
    try {
      const res = await makeRequest("GET", "/api/health");
      if (res.status === 200) {
        log.pass("API server is running");
        passed++;
      } else {
        log.fail(`Unexpected response: ${res.status}`);
        failed++;
        return;
      }
    } catch (err) {
      log.fail(`Health check failed: ${err.message}`);
      console.log(`     Make sure the server is running at ${API_URL}`);
      failed++;
      return;
    }

    // Test 2: Login to get token
    log.test("User Authentication (Get JWT Token)");
    try {
      const res = await makeRequest("POST", "/api/auth/login", {
        username: "teacher1",
        password: "teacher123",
        device_id: `device_${crypto.randomBytes(4).toString("hex")}`,
      });

      if (res.status === 200 && res.body.token) {
        token = res.body.token;
        log.pass("Login successful");
        log.info(`Token: ${token.substring(0, 20)}...`);
        passed++;
      } else if (res.status === 401) {
        log.fail("Authentication failed - invalid credentials");
        log.info("Run: npm run db:init to create test users");
        failed++;
        return;
      } else {
        log.fail(`Unexpected response (${res.status})`);
        failed++;
        return;
      }
    } catch (err) {
      log.fail(`Login error: ${err.message}`);
      failed++;
      return;
    }

    // Test 3: Upload exam with PDF
    log.test("Upload Exam with PDF File");
    try {
      const pdfPath = createTestPdf();
      log.info(`Created test PDF: ${path.basename(pdfPath)}`);

      const form = new FormData();
      form.append(
        "exam_data",
        JSON.stringify({
          title: "Test Exam - Phase 2",
          description: "Testing Phase 2 file upload functionality",
          duration_minutes: 120,
          allowed_apps: ["VS Code", "Terminal"],
        }),
      );

      form.append(
        "questions",
        JSON.stringify([
          {
            question_number: 1,
            question_text: "What is 2 + 2?",
            constraints_json: { input_format: "integer" },
            test_cases: [
              {
                input: "2 2",
                expected_output: "4",
                is_hidden: false,
              },
              {
                input: "5 3",
                expected_output: "8",
                is_hidden: true,
              },
            ],
          },
        ]),
      );

      form.append(
        "metadata",
        JSON.stringify({
          uploader_device_id: "test_device_001",
          upload_date: new Date().toISOString(),
        }),
      );

      form.append("pdf_file", fs.createReadStream(pdfPath));

      const res = await makeRequest(
        "POST",
        "/api/exams/upload",
        form,
        {
          Authorization: `Bearer ${token}`,
          ...form.getHeaders(),
        },
        true,
      );

      if (res.status === 201 && res.body.exam_id) {
        log.pass("Exam uploaded successfully");
        log.info(`Exam ID: ${res.body.exam_id}`);
        log.info(`PDF URL: ${res.body.pdf_url}`);
        log.info(`Questions: ${res.body.questions_count}`);
        passed++;

        // Store exam_id for next test
        global.testExamId = res.body.exam_id;
      } else {
        log.fail(`Upload failed (${res.status}): ${JSON.stringify(res.body)}`);
        failed++;
      }

      // Clean up test PDF
      fs.unlinkSync(pdfPath);
    } catch (err) {
      log.fail(`Upload error: ${err.message}`);
      failed++;
    }

    // Test 4: Download uploaded exam
    if (global.testExamId) {
      log.test("Download Uploaded Exam");
      try {
        const res = await makeRequest(
          "GET",
          `/api/exams/${global.testExamId}/download`,
          null,
          {
            Authorization: `Bearer ${token}`,
          },
        );

        if (res.status === 200 && res.body.exam) {
          log.pass("Exam downloaded successfully");
          log.info(`Title: ${res.body.exam.title}`);
          log.info(`Questions: ${res.body.questions?.length || 0}`);
          log.info(`PDF URL: ${res.body.exam.pdf_url}`);
          passed++;
        } else {
          log.fail(`Download failed (${res.status})`);
          failed++;
        }
      } catch (err) {
        log.fail(`Download error: ${err.message}`);
        failed++;
      }
    }

    // Test 5: List exams
    log.test("List Available Exams");
    try {
      const res = await makeRequest("GET", "/api/exams/available", null, {
        Authorization: `Bearer ${token}`,
      });

      if (res.status === 200 && res.body.exams) {
        log.pass(`Exams list retrieved`);
        log.info(`Total exams: ${res.body.exams.length}`);
        const uploadedExams = res.body.exams.filter((e) => e.pdf_url);
        log.info(`Exams with PDFs: ${uploadedExams.length}`);
        passed++;
      } else {
        log.fail(`List failed (${res.status})`);
        failed++;
      }
    } catch (err) {
      log.fail(`List error: ${err.message}`);
      failed++;
    }

    // Summary
    console.log(`\n${"═".repeat(70)}`);
    console.log(`Test Summary`);
    console.log(`${"═".repeat(70)}`);
    console.log(`${colors.green}Passed: ${passed}${colors.reset}`);
    console.log(`${colors.red}Failed: ${failed}${colors.reset}`);
    console.log(`Total:  ${passed + failed}`);
    console.log(`${"═".repeat(70)}\n`);

    if (failed > 0) {
      console.log(
        `${colors.yellow}⚠ Some tests failed. Check the errors above.${colors.reset}\n`,
      );
      process.exit(1);
    } else {
      console.log(
        `${colors.green}✓ All Phase 2 tests passed!${colors.reset}\n`,
      );
      process.exit(0);
    }
  } catch (err) {
    log.fail(`Test suite error: ${err.message}`);
    console.error(err);
    process.exit(1);
  }
}

// Run tests
runTests();
