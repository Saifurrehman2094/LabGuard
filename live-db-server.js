/**
 * PHASE 1: LIVE DATABASE API SERVER
 * Node.js/Express backend for cloud exam storage
 *
 * Setup:
 * 1. npm install express pg axios dotenv cors uuid jsonwebtoken bcryptjs
 * 2. Set environment variables (see .env.example)
 * 3. Run: node live-db-server.js
 *
 * Server runs on: http://localhost:5000
 * Database: PostgreSQL (configurable via env)
 */

const express = require("express");
const { Pool } = require("pg");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const cors = require("cors");
const { v4: uuid } = require("uuid");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
require("dotenv").config();

// ============================================================================
// CONFIGURATION
// ============================================================================

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET =
  process.env.JWT_SECRET || "your-secret-key-change-in-production";
const JWT_EXPIRY = "8h";

// PostgreSQL Connection Pool
const pool = new Pool({
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "postgres",
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || "lab_guard_cloud",
  ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
});

// ============================================================================
// FILE UPLOAD CONFIGURATION
// ============================================================================

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, "data", "exam_uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = `exam_${uuid()}${ext}`;
    cb(null, name);
  },
});

// File filter for PDFs only
const fileFilter = (req, file, cb) => {
  if (file.mimetype === "application/pdf") {
    cb(null, true);
  } else {
    cb(new Error("Only PDF files are allowed"), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
});

// ============================================================================
// MIDDLEWARE
// ============================================================================

app.use(express.json({ limit: "100mb" }));
app.use(cors());
app.use((req, res, next) => {
  req.requestId = uuid();
  console.log(
    `[${new Date().toISOString()}] ${req.method} ${req.path} - Request ID: ${req.requestId}`,
  );
  next();
});

// ============================================================================
// DATABASE INITIALIZATION
// ============================================================================

async function initializeDatabase() {
  console.log("[DB] Initializing database...");

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS cloud_users (
        user_id UUID PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL,
        full_name VARCHAR(255),
        email VARCHAR(255),
        school_id UUID,
        created_at TIMESTAMP DEFAULT NOW(),
        last_login TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS cloud_exams (
        exam_id UUID PRIMARY KEY,
        teacher_id UUID NOT NULL,
        course_id UUID,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        pdf_url VARCHAR(500),
        pdf_s3_key VARCHAR(500),
        created_at TIMESTAMP DEFAULT NOW(),
        published_at TIMESTAMP,
        start_time TIMESTAMP,
        end_time TIMESTAMP,
        duration_minutes INT,
        allowed_apps TEXT,
        sync_metadata JSONB,
        created_device_id VARCHAR(255),
        FOREIGN KEY (teacher_id) REFERENCES cloud_users(user_id)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS cloud_exam_questions (
        question_id UUID PRIMARY KEY,
        exam_id UUID NOT NULL,
        question_number INT,
        question_text TEXT NOT NULL,
        constraints_json JSONB,
        metadata JSONB,
        created_at TIMESTAMP DEFAULT NOW(),
        FOREIGN KEY (exam_id) REFERENCES cloud_exams(exam_id)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS cloud_test_cases (
        test_case_id UUID PRIMARY KEY,
        question_id UUID NOT NULL,
        input TEXT NOT NULL,
        expected_output TEXT NOT NULL,
        is_hidden BOOLEAN DEFAULT FALSE,
        is_edge_case BOOLEAN DEFAULT FALSE,
        weight FLOAT DEFAULT 1.0,
        time_limit_ms INT DEFAULT 3000,
        metadata JSONB,
        created_at TIMESTAMP DEFAULT NOW(),
        FOREIGN KEY (question_id) REFERENCES cloud_exam_questions(question_id)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS cloud_exam_submissions (
        submission_id UUID PRIMARY KEY,
        exam_id UUID NOT NULL,
        student_id UUID,
        student_name VARCHAR(255),
        submitted_at TIMESTAMP DEFAULT NOW(),
        status VARCHAR(50) DEFAULT 'received',
        submission_data JSONB,
        violations_summary JSONB,
        evidence_s3_keys TEXT[],
        device_id VARCHAR(255),
        sync_timestamp TIMESTAMP DEFAULT NOW(),
        FOREIGN KEY (exam_id) REFERENCES cloud_exams(exam_id)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS cloud_submission_details (
        detail_id UUID PRIMARY KEY,
        submission_id UUID NOT NULL,
        code_evaluations JSONB,
        test_case_results JSONB,
        app_violations JSONB,
        camera_violations JSONB,
        metadata JSONB,
        created_at TIMESTAMP DEFAULT NOW(),
        FOREIGN KEY (submission_id) REFERENCES cloud_exam_submissions(submission_id)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS cloud_class_analytics (
        analytics_id UUID PRIMARY KEY,
        exam_id UUID NOT NULL,
        total_submissions INT DEFAULT 0,
        average_score FLOAT DEFAULT 0,
        submission_rate FLOAT DEFAULT 0,
        violation_rate FLOAT DEFAULT 0,
        question_stats JSONB,
        temporal_stats JSONB,
        last_updated TIMESTAMP DEFAULT NOW(),
        FOREIGN KEY (exam_id) REFERENCES cloud_exams(exam_id)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS cloud_teacher_reports (
        report_id UUID PRIMARY KEY,
        exam_id UUID NOT NULL,
        teacher_id UUID NOT NULL,
        report_type VARCHAR(100),
        report_data JSONB,
        created_at TIMESTAMP DEFAULT NOW(),
        FOREIGN KEY (exam_id) REFERENCES cloud_exams(exam_id),
        FOREIGN KEY (teacher_id) REFERENCES cloud_users(user_id)
      )
    `);

    // Create indexes for performance
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_exams_teacher ON cloud_exams(teacher_id)`,
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_submissions_exam ON cloud_exam_submissions(exam_id)`,
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_submissions_student ON cloud_exam_submissions(student_id)`,
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_questions_exam ON cloud_exam_questions(exam_id)`,
    );

    console.log("[DB] ✅ Database initialization complete");
  } catch (error) {
    console.error("[DB] ❌ Database initialization failed:", error);
    process.exit(1);
  }
}

// ============================================================================
// AUTHENTICATION MIDDLEWARE
// ============================================================================

function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Access token required" });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      console.error("[AUTH] Token verification failed:", err.message);
      console.error("[AUTH] JWT_SECRET used:", JWT_SECRET);
      return res
        .status(403)
        .json({ error: "Invalid or expired token", details: err.message });
    }
    req.user = user;
    next();
  });
}

// ============================================================================
// AUTH ENDPOINTS
// ============================================================================

/**
 * POST /api/auth/register
 * Register a new user (teacher or admin)
 */
app.post("/api/auth/register", async (req, res) => {
  try {
    const { username, password, role, full_name, email, school_id } = req.body;

    // Validate input
    if (!username || !password || !role) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    if (!["teacher", "admin", "student"].includes(role)) {
      return res.status(400).json({ error: "Invalid role" });
    }

    // Check if user exists
    const existing = await pool.query(
      "SELECT user_id FROM cloud_users WHERE username = $1",
      [username],
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({ error: "User already exists" });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);
    const userId = uuid();

    // Create user
    await pool.query(
      `INSERT INTO cloud_users 
       (user_id, username, password_hash, role, full_name, email, school_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [userId, username, passwordHash, role, full_name, email, school_id],
    );

    console.log(`[AUTH] ✅ User registered: ${username}`);

    res.status(201).json({
      success: true,
      user_id: userId,
      username: username,
      role: role,
    });
  } catch (error) {
    console.error("[AUTH] ❌ Register failed:", error);
    res.status(500).json({ error: "Registration failed" });
  }
});

/**
 * POST /api/auth/login
 * Login user and return JWT token
 */
app.post("/api/auth/login", async (req, res) => {
  try {
    const { username, password, device_id } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: "Username and password required" });
    }

    // Find user
    const result = await pool.query(
      "SELECT user_id, username, password_hash, role, full_name, email FROM cloud_users WHERE username = $1",
      [username],
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const user = result.rows[0];

    // Verify password
    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Update last login
    await pool.query(
      "UPDATE cloud_users SET last_login = NOW() WHERE user_id = $1",
      [user.user_id],
    );

    // Create JWT token
    const token = jwt.sign(
      {
        user_id: user.user_id,
        username: user.username,
        role: user.role,
        device_id: device_id,
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRY },
    );

    console.log(`[AUTH] ✅ Login successful: ${username}`);

    res.json({
      success: true,
      token: token,
      user: {
        user_id: user.user_id,
        username: user.username,
        role: user.role,
        full_name: user.full_name,
        email: user.email,
      },
    });
  } catch (error) {
    console.error("[AUTH] ❌ Login failed:", error);
    res.status(500).json({ error: "Login failed" });
  }
});

/**
 * POST /api/auth/refresh
 * Refresh JWT token
 */
app.post("/api/auth/refresh", authenticateToken, (req, res) => {
  const user = req.user;

  const newToken = jwt.sign(
    {
      user_id: user.user_id,
      username: user.username,
      role: user.role,
      device_id: user.device_id,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRY },
  );

  res.json({
    success: true,
    token: newToken,
  });
});

// ============================================================================
// EXAM ENDPOINTS
// ============================================================================

/**
 * POST /api/exams/upload
 * Teacher uploads exam with PDF, questions and test cases
 */
app.post("/api/exams/upload", upload.single("pdf_file"), async (req, res) => {
  try {
    // Get username from body (for Electron app) or from authenticated token
    let username = req.body.username;

    if (!username && req.user) {
      // If authenticated via token, use token claims
      username = req.user.username;
    }

    if (!username) {
      return res
        .status(401)
        .json({ error: "Username required in request body or valid token" });
    }

    // Look up user to verify they're a teacher/admin
    const userResult = await pool.query(
      "SELECT user_id, role FROM cloud_users WHERE username = $1",
      [username],
    );

    if (userResult.rows.length === 0) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(404).json({ error: "User not found" });
    }

    const user = userResult.rows[0];

    if (user.role !== "teacher" && user.role !== "admin") {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(403).json({ error: "Only teachers can upload exams" });
    }

    // Parse form data
    const exam_data = JSON.parse(req.body.exam_data || "{}");
    const questions = JSON.parse(req.body.questions || "[]");
    const metadata = JSON.parse(req.body.metadata || "{}");

    const examId = uuid();
    const pdfPath = req.file ? req.file.path : null;
    const pdfUrl = req.file ? `/api/exams/files/${req.file.filename}` : null;

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Insert exam
      await client.query(
        `INSERT INTO cloud_exams 
         (exam_id, teacher_id, course_id, title, description, pdf_url, start_time, end_time, 
          duration_minutes, allowed_apps, sync_metadata, created_device_id, published_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::text[], $11, $12, NOW())`,
        [
          examId,
          user.user_id,
          exam_data.course_id || null,
          exam_data.title,
          exam_data.description || null,
          pdfUrl,
          exam_data.start_time || null,
          exam_data.end_time || null,
          exam_data.duration_minutes || 120,
          exam_data.allowed_apps || [],
          JSON.stringify({
            ...metadata,
            pdf_file: req.file?.filename || null,
          }),
          metadata?.uploader_device_id || "unknown",
        ],
      );

      // Insert questions
      for (const q of questions || []) {
        const questionId = uuid();
        await client.query(
          `INSERT INTO cloud_exam_questions 
           (question_id, exam_id, question_number, question_text, constraints_json)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            questionId,
            examId,
            q.question_number,
            q.question_text,
            JSON.stringify(q.constraints_json || {}),
          ],
        );

        // Insert test cases for this question
        for (const tc of q.test_cases || []) {
          await client.query(
            `INSERT INTO cloud_test_cases 
             (test_case_id, question_id, input, expected_output, is_hidden, 
              is_edge_case, weight, time_limit_ms)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
              uuid(),
              questionId,
              tc.input,
              tc.expected_output,
              tc.is_hidden || false,
              tc.is_edge_case || false,
              tc.weight || 1.0,
              tc.time_limit_ms || 3000,
            ],
          );
        }
      }

      // Create analytics record
      await client.query(
        `INSERT INTO cloud_class_analytics 
         (analytics_id, exam_id, total_submissions, average_score, submission_rate)
         VALUES ($1, $2, $3, $4, $5)`,
        [uuid(), examId, 0, 0, 0],
      );

      await client.query("COMMIT");

      console.log(`[EXAMS] ✅ Exam uploaded: ${examId}`);

      res.status(201).json({
        success: true,
        exam_id: examId,
        title: exam_data.title,
        questions_count: questions?.length || 0,
        pdf_file: req.file?.filename || null,
        pdf_url: pdfUrl,
        published_at: new Date().toISOString(),
      });
    } catch (error) {
      await client.query("ROLLBACK");
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("[EXAMS] ❌ Upload failed:", error);
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res
      .status(500)
      .json({ error: "Exam upload failed", details: error.message });
  }
});

/**
 * GET /api/exams/:exam_id/download
 * Student/Teacher downloads full exam (for local caching)
 */
app.get("/api/exams/:exam_id/download", authenticateToken, async (req, res) => {
  try {
    const { exam_id } = req.params;

    // Fetch exam
    const examResult = await pool.query(
      "SELECT * FROM cloud_exams WHERE exam_id = $1",
      [exam_id],
    );

    if (examResult.rows.length === 0) {
      return res.status(404).json({ error: "Exam not found" });
    }

    const exam = examResult.rows[0];

    // Fetch questions
    const questionsResult = await pool.query(
      "SELECT * FROM cloud_exam_questions WHERE exam_id = $1 ORDER BY question_number",
      [exam_id],
    );

    // Fetch test cases for each question
    const questionsWithTests = await Promise.all(
      questionsResult.rows.map(async (q) => {
        const testCasesResult = await pool.query(
          "SELECT * FROM cloud_test_cases WHERE question_id = $1",
          [q.question_id],
        );
        return {
          ...q,
          test_cases: testCasesResult.rows,
        };
      }),
    );

    console.log(`[EXAMS] ✅ Downloaded exam: ${exam_id}`);

    res.json({
      success: true,
      exam: {
        ...exam,
        allowed_apps: Array.isArray(exam.allowed_apps)
          ? exam.allowed_apps
          : typeof exam.allowed_apps === "string"
            ? exam.allowed_apps.split(",").map((app) => app.trim())
            : [],
      },
      questions: questionsWithTests,
    });
  } catch (error) {
    console.error("[EXAMS] ❌ Download failed:", error);
    res.status(500).json({ error: "Exam download failed" });
  }
});

/**
 * GET /api/exams/available
 * List available exams for student
 */
app.get("/api/exams/available", authenticateToken, async (req, res) => {
  try {
    const { student_id } = req.query;

    // TODO: Implement enrollment checking
    // For now, return all published exams
    const result = await pool.query(
      `SELECT exam_id, title, description, start_time, end_time, duration_minutes 
       FROM cloud_exams 
       WHERE published_at IS NOT NULL 
       AND start_time <= NOW() 
       AND end_time > NOW()
       ORDER BY start_time DESC`,
    );

    console.log(`[EXAMS] ✅ Listed ${result.rows.length} available exams`);

    res.json({
      success: true,
      exams: result.rows,
    });
  } catch (error) {
    console.error("[EXAMS] ❌ List failed:", error);
    res.status(500).json({ error: "Failed to list exams" });
  }
});

/**
 * GET /api/exams/teacher/:teacher_id
 * Get all exams for a specific teacher
 */
app.get("/api/exams/teacher/:teacher_id", async (req, res) => {
  try {
    const { teacher_id } = req.params;

    const result = await pool.query(
      `SELECT exam_id, title, description, pdf_url, start_time, end_time, duration_minutes, allowed_apps, created_at
       FROM cloud_exams 
       WHERE teacher_id = $1
       ORDER BY created_at DESC`,
      [teacher_id],
    );

    console.log(
      `[EXAMS] ✅ Listed ${result.rows.length} exams for teacher ${teacher_id}`,
    );

    res.json({
      success: true,
      exams: result.rows,
    });
  } catch (error) {
    console.error("[EXAMS] ❌ List teacher exams failed:", error);
    res.status(500).json({ error: "Failed to list exams" });
  }
});

/**
 * GET /api/exams/:exam_id/questions
 * Get all questions and test cases for an exam (no auth required - for Test Case Studio)
 */
app.get("/api/exams/:exam_id/questions", async (req, res) => {
  try {
    const { exam_id } = req.params;

    // Fetch questions
    const questionsResult = await pool.query(
      `SELECT question_id, exam_id, question_number, question_text, constraints_json, 
              metadata, created_at 
       FROM cloud_exam_questions WHERE exam_id = $1 
       ORDER BY COALESCE(question_number, 999)`,
      [exam_id],
    );

    // Fetch test cases for each question
    const questionsWithTests = await Promise.all(
      questionsResult.rows.map(async (q) => {
        const testCasesResult = await pool.query(
          `SELECT test_case_id, question_id, input, expected_output, 
                  is_hidden, is_edge_case, weight, time_limit_ms, 
                  metadata, created_at
           FROM cloud_test_cases WHERE question_id = $1`,
          [q.question_id],
        );

        return {
          question_id: q.question_id,
          exam_id: q.exam_id,
          question_number: q.question_number,
          question_text: q.question_text,
          constraints_json: q.constraints_json,
          metadata: q.metadata,
          created_at: q.created_at,
          testCases: testCasesResult.rows.map((tc) => ({
            test_case_id: tc.test_case_id,
            question_id: tc.question_id,
            input: tc.input,
            expected_output: tc.expected_output,
            is_hidden: tc.is_hidden,
            is_edge_case: tc.is_edge_case,
            weight: tc.weight,
            time_limit_ms: tc.time_limit_ms,
            metadata: tc.metadata,
            created_at: tc.created_at,
          })),
        };
      }),
    );

    console.log(
      `[EXAMS] ✅ Fetched ${questionsWithTests.length} questions for exam: ${exam_id}`,
    );

    res.json({
      success: true,
      questions: questionsWithTests,
    });
  } catch (error) {
    console.error("[EXAMS] ❌ Get questions failed:", error);
    res.status(500).json({ error: "Failed to get questions" });
  }
});

/**
 * POST /api/exams/:exam_id/extract-questions
 * Extract questions from exam PDF and save to database
 */
app.post("/api/exams/:exam_id/extract-questions", async (req, res) => {
  try {
    const { exam_id } = req.params;

    // Fetch exam to get PDF path
    const examResult = await pool.query(
      "SELECT exam_id, title, pdf_url FROM cloud_exams WHERE exam_id = $1",
      [exam_id],
    );

    if (examResult.rows.length === 0) {
      console.error("[EXAMS] ❌ Exam not found:", exam_id);
      return res.status(404).json({ error: "Exam not found" });
    }

    const exam = examResult.rows[0];

    console.log("[EXAMS] 📋 Exam found:", { exam_id, pdf_url: exam.pdf_url });

    if (!exam.pdf_url) {
      console.error("[EXAMS] ❌ Exam has no PDF:", exam_id);
      return res.status(400).json({ error: "Exam has no PDF attached" });
    }

    // Extract filename from pdf_url (e.g., /api/exams/files/exam_uuid.pdf -> exam_uuid.pdf)
    const filename = exam.pdf_url.split("/").pop();
    const pdfPath = path.join(__dirname, "data", "exam_uploads", filename);

    console.log("[EXAMS] 🔍 Looking for PDF at:", pdfPath);

    // Check if file exists
    if (!fs.existsSync(pdfPath)) {
      console.error("[EXAMS] ❌ PDF file not found:", pdfPath);
      return res
        .status(404)
        .json({ error: "PDF file not found on server", path: pdfPath });
    }

    console.log("[EXAMS] ✅ PDF found, extracting...");

    // Call Python PDF text extractor (same as local Electron API)
    const { exec } = require("child_process");
    const util = require("util");
    const execPromise = util.promisify(exec);

    try {
      const pythonCmd = `python -3.11 -m backend.services.pdfTextExtractor "${pdfPath}"`;
      console.log("[EXAMS] 🔧 Running:", pythonCmd);

      const { stdout, stderr } = await execPromise(pythonCmd);

      if (stderr) {
        console.warn("[EXAMS] ⚠️ Python stderr:", stderr);
      }

      const extractionResult = JSON.parse(stdout);

      if (!extractionResult.success) {
        console.error("[EXAMS] ❌ Extraction failed:", extractionResult.error);
        return res.status(400).json({
          error: extractionResult.error || "Failed to extract text from PDF",
        });
      }

      const questions = extractionResult.pages || [];

      console.log(`[EXAMS] 📄 Extracted ${questions.length} pages from PDF`);

      // Insert extracted questions into database
      const questionIds = [];

      for (let i = 0; i < questions.length; i++) {
        const page = questions[i];
        const questionId = uuid();
        questionIds.push(questionId);

        await pool.query(
          `INSERT INTO cloud_exam_questions 
           (question_id, exam_id, question_number, question_text, constraints_json, metadata)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            questionId,
            exam_id,
            i + 1,
            page.text || page.content || "",
            JSON.stringify({ page_number: page.page_number || i + 1 }),
            JSON.stringify({ source_page: page.page_number || i + 1 }),
          ],
        );
      }

      console.log(
        `[EXAMS] ✅ Extracted ${questions.length} questions from exam PDF: ${exam_id}`,
      );

      res.json({
        success: true,
        questions: questions.map((page, index) => ({
          question_id: questionIds[index],
          title: `Question from Page ${page.page_number || index + 1}`,
          description: page.text || page.content || "",
          source_page: page.page_number || index + 1,
          tempId: questionIds[index],
        })),
      });
    } catch (pythonError) {
      console.error("[EXAMS] ❌ PDF extraction failed:", pythonError);
      return res.status(500).json({
        error: "Failed to extract questions from PDF",
        details: pythonError.message,
      });
    }
  } catch (error) {
    console.error("[EXAMS] ❌ Extract questions failed:", error);
    res
      .status(500)
      .json({ error: "Failed to extract questions", details: error.message });
  }
});

// ============================================================================
// SUBMISSION ENDPOINTS
// ============================================================================

/**
 * POST /api/submissions/upload
 * Student uploads exam submission with all monitoring data
 */
app.post("/api/submissions/upload", authenticateToken, async (req, res) => {
  try {
    const {
      exam_id,
      student_id,
      submission_data,
      violations,
      evaluation,
      device_id,
    } = req.body;

    if (!exam_id || !submission_data) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const submissionId = uuid();
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Insert submission
      await client.query(
        `INSERT INTO cloud_exam_submissions 
         (submission_id, exam_id, student_id, student_name, submission_data, 
          violations_summary, device_id, sync_timestamp, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8)`,
        [
          submissionId,
          exam_id,
          student_id,
          req.user.username,
          JSON.stringify(submission_data),
          JSON.stringify(violations || {}),
          device_id,
          "received",
        ],
      );

      // Insert submission details
      await client.query(
        `INSERT INTO cloud_submission_details 
         (detail_id, submission_id, code_evaluations, test_case_results, 
          app_violations, camera_violations)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          uuid(),
          submissionId,
          JSON.stringify(evaluation || {}),
          JSON.stringify(evaluation?.test_results || []),
          JSON.stringify(violations?.app_violations || []),
          JSON.stringify(violations?.camera_violations || []),
        ],
      );

      // Update analytics
      await pool.query(
        `UPDATE cloud_class_analytics 
         SET total_submissions = total_submissions + 1,
             last_updated = NOW()
         WHERE exam_id = $1`,
        [exam_id],
      );

      await client.query("COMMIT");

      console.log(`[SUBMISSIONS] ✅ Submission received: ${submissionId}`);

      res.status(201).json({
        success: true,
        submission_id: submissionId,
        status: "received",
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("[SUBMISSIONS] ❌ Upload failed:", error);
    res.status(500).json({ error: "Submission upload failed" });
  }
});

/**
 * GET /api/exams/:exam_id/submissions
 * Teacher fetches all submissions for an exam
 */
app.get(
  "/api/exams/:exam_id/submissions",
  authenticateToken,
  async (req, res) => {
    try {
      if (req.user.role !== "teacher" && req.user.role !== "admin") {
        return res
          .status(403)
          .json({ error: "Only teachers can fetch submissions" });
      }

      const { exam_id } = req.params;

      // Verify exam belongs to teacher
      const examResult = await pool.query(
        "SELECT teacher_id FROM cloud_exams WHERE exam_id = $1",
        [exam_id],
      );

      if (examResult.rows.length === 0) {
        return res.status(404).json({ error: "Exam not found" });
      }

      const exam = examResult.rows[0];
      if (exam.teacher_id !== req.user.user_id && req.user.role !== "admin") {
        return res.status(403).json({ error: "Unauthorized" });
      }

      // Fetch all submissions
      const result = await pool.query(
        `SELECT 
        submission_id, 
        student_id, 
        student_name, 
        submitted_at, 
        status,
        violations_summary,
        submission_data
       FROM cloud_exam_submissions 
       WHERE exam_id = $1 
       ORDER BY submitted_at DESC`,
        [exam_id],
      );

      console.log(
        `[SUBMISSIONS] ✅ Fetched ${result.rows.length} submissions for exam ${exam_id}`,
      );

      res.json({
        success: true,
        submissions: result.rows,
      });
    } catch (error) {
      console.error("[SUBMISSIONS] ❌ Fetch failed:", error);
      res.status(500).json({ error: "Failed to fetch submissions" });
    }
  },
);

/**
 * GET /api/exams/:exam_id/analytics
 * Fetch aggregated class analytics for exam
 */
app.get(
  "/api/exams/:exam_id/analytics",
  authenticateToken,
  async (req, res) => {
    try {
      const { exam_id } = req.params;

      const result = await pool.query(
        "SELECT * FROM cloud_class_analytics WHERE exam_id = $1",
        [exam_id],
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Analytics not found" });
      }

      console.log(`[ANALYTICS] ✅ Retrieved analytics for exam ${exam_id}`);

      res.json({
        success: true,
        analytics: result.rows[0],
      });
    } catch (error) {
      console.error("[ANALYTICS] ❌ Fetch failed:", error);
      res.status(500).json({ error: "Failed to fetch analytics" });
    }
  },
);

// ============================================================================
// HEALTH CHECK
// ============================================================================

/**
 * GET /api/health
 * Health check endpoint
 */
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

/**
 * GET /health
 * Simple health check (for sync service monitoring)
 */
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// ============================================================================
// ERROR HANDLING
// ============================================================================

app.use((error, req, res, next) => {
  console.error(`[ERROR] Request ${req.requestId}:`, error);
  res.status(500).json({
    error: "Internal server error",
    requestId: req.requestId,
  });
});

app.use((req, res) => {
  res.status(404).json({
    error: "Endpoint not found",
    path: req.path,
  });
});

// ============================================================================
// FILE SERVING (FOR UPLOADED PDFs)
// ============================================================================

/**
 * GET /api/exams/files/:filename
 * Serve uploaded exam PDF files
 */
app.get("/api/exams/files/:filename", (req, res) => {
  try {
    const filename = req.params.filename;
    // Validate filename to prevent directory traversal
    if (filename.includes("..") || filename.includes("/")) {
      return res.status(400).json({ error: "Invalid filename" });
    }

    const filepath = path.join(uploadsDir, filename);

    // Check if file exists
    if (!fs.existsSync(filepath)) {
      return res.status(404).json({ error: "File not found" });
    }

    // Serve the file
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
    res.sendFile(filepath);
  } catch (error) {
    console.error("[FILES] ❌ File serving failed:", error);
    res.status(500).json({ error: "File serving failed" });
  }
});

// ============================================================================
// SERVER STARTUP
// ============================================================================

async function start() {
  try {
    // Test database connection
    const result = await pool.query("SELECT NOW()");
    console.log("[DB] ✅ Connected to PostgreSQL:", result.rows[0].now);

    // Initialize database schema
    await initializeDatabase();

    // Start server
    app.listen(PORT, () => {
      console.log(
        `[SERVER] ✅ Live Database API running on http://localhost:${PORT}`,
      );
      console.log(
        `[SERVER] Environment: ${process.env.NODE_ENV || "development"}`,
      );
    });
  } catch (error) {
    console.error("[STARTUP] ❌ Failed to start server:", error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("\n[SHUTDOWN] Gracefully shutting down...");
  await pool.end();
  console.log("[SHUTDOWN] ✅ Database connections closed");
  process.exit(0);
});

// Start the server
start();

module.exports = app;
