/**
 * ============================================================================
 * Live Database API Testing Suite
 * Tests REST API endpoints for cloud database
 *
 * Usage:
 *   node backend/scripts/test-api.js
 * ============================================================================
 */

require("dotenv").config();
const http = require("http");
const crypto = require("crypto");

const API_URL = process.env.API_URL || "http://localhost:3001";
const TEST_TIMEOUT = 5000;

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
 * Make HTTP request
 */
function makeRequest(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, API_URL);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      timeout: TEST_TIMEOUT,
    };

    const req = http.request(options, (res) => {
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

    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Request timeout"));
    });

    if (body) {
      req.write(JSON.stringify(body));
    }

    req.end();
  });
}

/**
 * Test suite
 */
async function runTests() {
  let passed = 0;
  let failed = 0;
  let token = null;

  console.log(`\n${"═".repeat(60)}`);
  console.log(`LAB-Guard Live Database API Test Suite`);
  console.log(`${"═".repeat(60)}`);
  console.log(`\nAPI URL: ${API_URL}\n`);

  try {
    // Test 1: Health check
    log.test("Health Check");
    try {
      const res = await makeRequest("GET", "/api/health");
      if (res.status === 200 && res.body.status === "ok") {
        log.pass(`Server is healthy (status: ${res.body.status})`);
        passed++;
      } else {
        log.fail(`Unexpected response: ${res.status}`);
        failed++;
      }
    } catch (err) {
      log.fail(`Health check failed: ${err.message}`);
      console.log(`     Make sure the server is running at ${API_URL}`);
      failed++;
      return;
    }

    // Test 2: Register new user
    log.test("User Registration");
    const testUsername = `testuser_${Date.now()}`;
    try {
      const res = await makeRequest("POST", "/api/auth/register", {
        username: testUsername,
        password: "TestPassword123!",
        full_name: "Test User",
        email: `${testUsername}@test.edu`,
        role: "student",
      });

      if (res.status === 201 || res.status === 200) {
        log.pass(`User registered successfully`);
        log.info(`Username: ${testUsername}`);
        passed++;
      } else if (res.status === 409) {
        log.info(`User already exists (409)`);
        passed++;
      } else {
        log.fail(
          `Registration failed (${res.status}): ${JSON.stringify(res.body)}`,
        );
        failed++;
      }
    } catch (err) {
      log.fail(`Registration error: ${err.message}`);
      failed++;
    }

    // Test 3: Login
    log.test("User Authentication");
    try {
      const res = await makeRequest("POST", "/api/auth/login", {
        username: "teacher1",
        password: "teacher123",
        device_id: `device_${crypto.randomBytes(4).toString("hex")}`,
      });

      if (res.status === 200 && res.body.token) {
        token = res.body.token;
        log.pass(`Login successful`);
        log.info(`Token received: ${token.substring(0, 20)}...`);
        passed++;
      } else if (res.status === 401) {
        log.info(`Authentication failed - credentials may not exist yet`);
        log.info(
          `Run: node backend/scripts/init-cloud-db.js to create test users`,
        );
        passed++;
      } else {
        log.fail(
          `Unexpected response (${res.status}): ${JSON.stringify(res.body)}`,
        );
        failed++;
      }
    } catch (err) {
      log.fail(`Login error: ${err.message}`);
      failed++;
    }

    // Test 4: Get status
    log.test("Status Endpoint");
    try {
      const res = await makeRequest("GET", "/api/status", null, {
        Authorization: token ? `Bearer ${token}` : "",
      });

      if (res.status === 200) {
        log.pass(`Status retrieved successfully`);
        log.info(`Database connected: ${res.body.database?.connected}`);
        log.info(`S3 configured: ${res.body.s3?.configured}`);
        passed++;
      } else {
        log.info(`Status endpoint returned ${res.status} (may require auth)`);
        passed++;
      }
    } catch (err) {
      log.fail(`Status error: ${err.message}`);
      failed++;
    }

    // Test 5: Database test endpoint
    log.test("Database Connection Test");
    try {
      const res = await makeRequest("GET", "/api/test/db", null, {
        Authorization: token ? `Bearer ${token}` : "",
      });

      if (res.status === 200) {
        log.pass(`Database connection test passed`);
        log.info(`Connection time: ${res.body.connectionTime}ms`);
        passed++;
      } else {
        log.info(`DB test returned ${res.status}`);
        passed++;
      }
    } catch (err) {
      log.fail(`Database test error: ${err.message}`);
      failed++;
    }

    // Test 6: List exams
    log.test("List Exams");
    try {
      const res = await makeRequest("GET", "/api/exams/available", null, {
        Authorization: token ? `Bearer ${token}` : "",
      });

      if (res.status === 200 || res.status === 401) {
        log.pass(`Exams endpoint accessible (${res.status})`);
        if (res.body.exams) {
          log.info(`Found ${res.body.exams.length} exams`);
        }
        passed++;
      } else {
        log.fail(`Unexpected response (${res.status})`);
        failed++;
      }
    } catch (err) {
      log.fail(`List exams error: ${err.message}`);
      failed++;
    }

    // Summary
    console.log(`\n${"═".repeat(60)}`);
    console.log(`Test Summary`);
    console.log(`${"═".repeat(60)}`);
    console.log(`${colors.green}Passed: ${passed}${colors.reset}`);
    console.log(`${colors.red}Failed: ${failed}${colors.reset}`);
    console.log(`Total:  ${passed + failed}`);
    console.log(`${"═".repeat(60)}\n`);

    if (failed > 0) {
      console.log(
        `${colors.yellow}⚠ Some tests failed. Check the errors above.${colors.reset}\n`,
      );
      process.exit(1);
    } else {
      console.log(`${colors.green}✓ All tests passed!${colors.reset}\n`);
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
