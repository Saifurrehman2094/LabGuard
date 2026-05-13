/**
 * ============================================================================
 * Cloud Database Initialization Script
 * Sets up PostgreSQL database and schema for LAB-Guard Live Database
 *
 * Usage:
 *   node backend/scripts/init-cloud-db.js
 * ============================================================================
 */

require("dotenv").config();
const { Pool } = require("pg");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");

const DB_CONFIG = {
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "postgres",
  database: "postgres",
  ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
};
const TARGET_DB = process.env.DB_NAME || "lab_guard_cloud";

// Color codes for terminal output
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
};

const log = {
  info: (msg) => console.log(`${colors.cyan}[INFO]${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}[✓]${colors.reset} ${msg}`),
  warn: (msg) => console.log(`${colors.yellow}[WARN]${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}[✗]${colors.reset} ${msg}`),
  header: (msg) =>
    console.log(`\n${colors.bright}${colors.cyan}${msg}${colors.reset}\n`),
};

/**
 * Generates a UUID v4
 */
function generateUUID() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Main initialization script
 */
async function initializeDatabase() {
  const adminPool = new Pool(DB_CONFIG);
  let targetPool;

  try {
    log.header("═══════════════════════════════════════");
    log.header("LAB-Guard Live Database Initialization");
    log.header("═══════════════════════════════════════");

    log.info(`Database Host: ${DB_CONFIG.host}`);
    log.info(`Database Port: ${DB_CONFIG.port}`);
    log.info(`Target Database: ${TARGET_DB}`);
    log.info(`Admin User: ${DB_CONFIG.user}`);

    // Step 1: Create database if it doesn't exist
    log.header("Step 1: Creating Database...");
    try {
      await adminPool.query(`CREATE DATABASE ${TARGET_DB}`);
      log.success(`Database '${TARGET_DB}' created`);
    } catch (err) {
      if (err.code === "42P04") {
        // Database already exists
        log.warn(`Database '${TARGET_DB}' already exists, skipping creation`);
      } else {
        throw err;
      }
    }

    // Close admin connection and create target database connection
    await adminPool.end();

    // Connect to the newly created database
    targetPool = new Pool({
      ...DB_CONFIG,
      database: TARGET_DB,
    });

    // Step 2: Create tables
    log.header("Step 2: Creating Tables...");
    await createTables(targetPool);

    // Step 3: Create indexes
    log.header("Step 3: Creating Indexes...");
    await createIndexes(targetPool);

    // Step 4: Add test data (optional)
    log.header("Step 4: Adding Test Data...");
    await addTestData(targetPool);

    log.header("═══════════════════════════════════════");
    log.success("Database initialization complete!");
    log.header("═══════════════════════════════════════");

    log.info("\nNext steps:");
    log.info("1. Create .env file from .env.example");
    log.info("2. Update database credentials in .env");
    log.info("3. Run: npm install");
    log.info("4. Run: node live-db-server.js");
  } catch (err) {
    log.error(`Initialization failed: ${err.message}`);
    console.error(err);
    process.exit(1);
  } finally {
    if (targetPool) {
      await targetPool.end();
    }
  }
}

/**
 * Create all database tables
 */
async function createTables(pool) {
  const tables = [
    // Cloud Users
    `
    CREATE TABLE IF NOT EXISTS cloud_users (
      user_id UUID PRIMARY KEY,
      username VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      role VARCHAR(50) NOT NULL CHECK (role IN ('admin', 'teacher', 'student')),
      full_name VARCHAR(255),
      email VARCHAR(255),
      school_id UUID,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      last_login TIMESTAMP
    )
    `,

    // Cloud Exams
    `
    CREATE TABLE IF NOT EXISTS cloud_exams (
      exam_id UUID PRIMARY KEY,
      teacher_id UUID NOT NULL,
      course_id UUID,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      pdf_url VARCHAR(500),
      pdf_s3_key VARCHAR(500),
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      published_at TIMESTAMP,
      start_time TIMESTAMP,
      end_time TIMESTAMP,
      duration_minutes INT,
      allowed_apps TEXT[],
      sync_metadata JSONB DEFAULT '{}',
      created_device_id VARCHAR(255),
      FOREIGN KEY (teacher_id) REFERENCES cloud_users(user_id) ON DELETE CASCADE
    )
    `,

    // Cloud Exam Questions
    `
    CREATE TABLE IF NOT EXISTS cloud_exam_questions (
      question_id UUID PRIMARY KEY,
      exam_id UUID NOT NULL,
      question_number INT NOT NULL,
      question_text TEXT NOT NULL,
      constraints_json JSONB DEFAULT '{}',
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      FOREIGN KEY (exam_id) REFERENCES cloud_exams(exam_id) ON DELETE CASCADE,
      UNIQUE(exam_id, question_number)
    )
    `,

    // Cloud Test Cases
    `
    CREATE TABLE IF NOT EXISTS cloud_test_cases (
      test_case_id UUID PRIMARY KEY,
      question_id UUID NOT NULL,
      input TEXT NOT NULL,
      expected_output TEXT NOT NULL,
      is_hidden BOOLEAN DEFAULT FALSE,
      is_edge_case BOOLEAN DEFAULT FALSE,
      weight FLOAT DEFAULT 1.0,
      time_limit_ms INT DEFAULT 3000,
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      FOREIGN KEY (question_id) REFERENCES cloud_exam_questions(question_id) ON DELETE CASCADE
    )
    `,

    // Cloud Exam Submissions
    `
    CREATE TABLE IF NOT EXISTS cloud_exam_submissions (
      submission_id UUID PRIMARY KEY,
      exam_id UUID NOT NULL,
      student_id UUID,
      student_name VARCHAR(255),
      submitted_at TIMESTAMP DEFAULT NOW(),
      status VARCHAR(50) DEFAULT 'received' CHECK (status IN ('draft', 'submitted', 'received', 'grading', 'graded', 'archived')),
      submission_data JSONB DEFAULT '{}',
      violations_summary JSONB DEFAULT '{}',
      evidence_s3_keys TEXT[] DEFAULT '{}',
      device_id VARCHAR(255),
      device_fingerprint VARCHAR(255),
      sync_timestamp TIMESTAMP DEFAULT NOW(),
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      FOREIGN KEY (exam_id) REFERENCES cloud_exams(exam_id) ON DELETE CASCADE
    )
    `,

    // Cloud Submission Details
    `
    CREATE TABLE IF NOT EXISTS cloud_submission_details (
      detail_id UUID PRIMARY KEY,
      submission_id UUID NOT NULL UNIQUE,
      code_evaluations JSONB DEFAULT '{}',
      test_case_results JSONB DEFAULT '{}',
      app_violations JSONB DEFAULT '{}',
      camera_violations JSONB DEFAULT '{}',
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      FOREIGN KEY (submission_id) REFERENCES cloud_exam_submissions(submission_id) ON DELETE CASCADE
    )
    `,

    // Cloud Class Analytics
    `
    CREATE TABLE IF NOT EXISTS cloud_class_analytics (
      analytics_id UUID PRIMARY KEY,
      exam_id UUID NOT NULL UNIQUE,
      total_submissions INT DEFAULT 0,
      average_score FLOAT DEFAULT 0,
      median_score FLOAT DEFAULT 0,
      submission_rate FLOAT DEFAULT 0,
      violation_rate FLOAT DEFAULT 0,
      question_stats JSONB DEFAULT '{}',
      temporal_stats JSONB DEFAULT '{}',
      last_updated TIMESTAMP DEFAULT NOW(),
      FOREIGN KEY (exam_id) REFERENCES cloud_exams(exam_id) ON DELETE CASCADE
    )
    `,

    // Cloud Teacher Reports
    `
    CREATE TABLE IF NOT EXISTS cloud_teacher_reports (
      report_id UUID PRIMARY KEY,
      exam_id UUID NOT NULL,
      teacher_id UUID NOT NULL,
      report_type VARCHAR(100) NOT NULL,
      report_data JSONB DEFAULT '{}',
      is_shared BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      FOREIGN KEY (exam_id) REFERENCES cloud_exams(exam_id) ON DELETE CASCADE,
      FOREIGN KEY (teacher_id) REFERENCES cloud_users(user_id) ON DELETE CASCADE
    )
    `,

    // Cloud Sync Queue (for offline-first sync)
    `
    CREATE TABLE IF NOT EXISTS cloud_sync_queue (
      sync_id UUID PRIMARY KEY,
      device_id VARCHAR(255) NOT NULL,
      sync_type VARCHAR(50) NOT NULL CHECK (sync_type IN ('upload', 'download', 'delete', 'update')),
      resource_type VARCHAR(100) NOT NULL,
      resource_id UUID NOT NULL,
      payload JSONB DEFAULT '{}',
      status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'failed')),
      retry_count INT DEFAULT 0,
      max_retries INT DEFAULT 3,
      last_error TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      attempted_at TIMESTAMP,
      completed_at TIMESTAMP
    )
    `,

    // Cloud Audit Log
    `
    CREATE TABLE IF NOT EXISTS cloud_audit_log (
      log_id UUID PRIMARY KEY,
      user_id UUID,
      action VARCHAR(100) NOT NULL,
      resource_type VARCHAR(100),
      resource_id UUID,
      changes JSONB DEFAULT '{}',
      ip_address VARCHAR(45),
      user_agent TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      FOREIGN KEY (user_id) REFERENCES cloud_users(user_id) ON DELETE SET NULL
    )
    `,
  ];

  for (const sql of tables) {
    try {
      await pool.query(sql);
      const tableName = sql.match(/CREATE TABLE IF NOT EXISTS (\w+)/i)[1];
      log.success(`Table '${tableName}' created/verified`);
    } catch (err) {
      log.error(`Failed to create table: ${err.message}`);
      throw err;
    }
  }
}

/**
 * Create database indexes
 */
async function createIndexes(pool) {
  const indexes = [
    "CREATE INDEX IF NOT EXISTS idx_exams_teacher ON cloud_exams(teacher_id)",
    "CREATE INDEX IF NOT EXISTS idx_exams_published ON cloud_exams(published_at)",
    "CREATE INDEX IF NOT EXISTS idx_exams_created ON cloud_exams(created_at)",
    "CREATE INDEX IF NOT EXISTS idx_submissions_exam ON cloud_exam_submissions(exam_id)",
    "CREATE INDEX IF NOT EXISTS idx_submissions_student ON cloud_exam_submissions(student_id)",
    "CREATE INDEX IF NOT EXISTS idx_submissions_timestamp ON cloud_exam_submissions(submitted_at)",
    "CREATE INDEX IF NOT EXISTS idx_submissions_status ON cloud_exam_submissions(status)",
    "CREATE INDEX IF NOT EXISTS idx_questions_exam ON cloud_exam_questions(exam_id)",
    "CREATE INDEX IF NOT EXISTS idx_testcases_question ON cloud_test_cases(question_id)",
    "CREATE INDEX IF NOT EXISTS idx_users_username ON cloud_users(username)",
    "CREATE INDEX IF NOT EXISTS idx_users_email ON cloud_users(email)",
    "CREATE INDEX IF NOT EXISTS idx_analytics_exam ON cloud_class_analytics(exam_id)",
    "CREATE INDEX IF NOT EXISTS idx_reports_exam ON cloud_teacher_reports(exam_id)",
    "CREATE INDEX IF NOT EXISTS idx_reports_teacher ON cloud_teacher_reports(teacher_id)",
    "CREATE INDEX IF NOT EXISTS idx_sync_queue_device ON cloud_sync_queue(device_id)",
    "CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON cloud_sync_queue(status)",
    "CREATE INDEX IF NOT EXISTS idx_audit_log_user ON cloud_audit_log(user_id)",
    "CREATE INDEX IF NOT EXISTS idx_audit_log_resource ON cloud_audit_log(resource_type, resource_id)",
  ];

  for (const sql of indexes) {
    try {
      await pool.query(sql);
      const indexName = sql.match(/idx_\w+/)[0];
      log.success(`Index '${indexName}' created`);
    } catch (err) {
      log.error(`Failed to create index: ${err.message}`);
      throw err;
    }
  }
}

/**
 * Add test data to database
 */
async function addTestData(pool) {
  try {
    // Create test teacher
    const teacherId = generateUUID();
    const teacherPasswordHash = await bcrypt.hash("teacher123", 10);

    await pool.query(
      `
      INSERT INTO cloud_users (user_id, username, password_hash, role, full_name, email)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (username) DO NOTHING
      `,
      [
        teacherId,
        "teacher1",
        teacherPasswordHash,
        "teacher",
        "John Doe",
        "john@school.edu",
      ],
    );
    log.success(
      "Test teacher created (username: teacher1, password: teacher123)",
    );

    // Create test student
    const studentId = generateUUID();
    const studentPasswordHash = await bcrypt.hash("student123", 10);

    await pool.query(
      `
      INSERT INTO cloud_users (user_id, username, password_hash, role, full_name, email)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (username) DO NOTHING
      `,
      [
        studentId,
        "student1",
        studentPasswordHash,
        "student",
        "Jane Smith",
        "jane@school.edu",
      ],
    );
    log.success(
      "Test student created (username: student1, password: student123)",
    );

    // Create test exam
    const examId = generateUUID();
    await pool.query(
      `
      INSERT INTO cloud_exams (exam_id, teacher_id, title, description, duration_minutes, created_device_id)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT DO NOTHING
      `,
      [
        examId,
        teacherId,
        "Algorithms 101 Midterm",
        "Midterm exam for Algorithms course",
        120,
        "device-001",
      ],
    );
    log.success("Test exam created");

    // Create test question
    const questionId = generateUUID();
    await pool.query(
      `
      INSERT INTO cloud_exam_questions (question_id, exam_id, question_number, question_text)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT DO NOTHING
      `,
      [
        questionId,
        examId,
        1,
        "Write a function to find the sum of array elements",
      ],
    );
    log.success("Test question created");

    // Create test cases
    const testCase1Id = generateUUID();
    const testCase2Id = generateUUID();

    await pool.query(
      `
      INSERT INTO cloud_test_cases (test_case_id, question_id, input, expected_output, is_hidden)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT DO NOTHING
      `,
      [testCase1Id, questionId, "[1,2,3,4,5]", "15", false],
    );

    await pool.query(
      `
      INSERT INTO cloud_test_cases (test_case_id, question_id, input, expected_output, is_hidden)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT DO NOTHING
      `,
      [testCase2Id, questionId, "[]", "0", false],
    );
    log.success("Test cases created");
  } catch (err) {
    log.warn(`Could not add test data: ${err.message}`);
  }
}

// Run initialization
initializeDatabase();
