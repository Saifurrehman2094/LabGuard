const Database = require('better-sqlite3');
const bcrypt = require('bcrypt');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Generate UUID v4 using crypto module
function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

class DatabaseService {
  constructor(dbPath = null) {
    this.dbPath = dbPath || path.join(__dirname, '..', 'data', 'database.sqlite');
    this.db = null;
    this.saltRounds = 12;
  }

  /**
   * Initialize database connection and create tables if they don't exist
   */
  async initializeDatabase() {
    try {
      // Ensure data directory exists
      const dataDir = path.dirname(this.dbPath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      // Initialize SQLite database
      this.db = new Database(this.dbPath);
      this.db.pragma('journal_mode = WAL');

      // Create tables
      this.createTables();

      console.log('Database service initialized with SQLite at:', this.dbPath);
      return true;
    } catch (error) {
      console.error('Database initialization failed:', error);
      throw error;
    }
  }

  /**
   * Check and perform database migrations
   */
  performMigrations() {
    try {
      // Check if we need to migrate the users table
      const tableInfo = this.db.prepare("PRAGMA table_info(users)").all();
      const columnNames = tableInfo.map(col => col.name);

      // Add missing columns to users table
      if (!columnNames.includes('email')) {
        this.db.exec('ALTER TABLE users ADD COLUMN email TEXT');
        console.log('Added email column to users table');
      }

      if (!columnNames.includes('has_registered_face')) {
        this.db.exec('ALTER TABLE users ADD COLUMN has_registered_face INTEGER DEFAULT 0');
        console.log('Added has_registered_face column to users table');
      }

      if (!columnNames.includes('face_registration_date')) {
        this.db.exec('ALTER TABLE users ADD COLUMN face_registration_date DATETIME');
        console.log('Added face_registration_date column to users table');
      }

      if (!columnNames.includes('created_by')) {
        this.db.exec('ALTER TABLE users ADD COLUMN created_by TEXT');
        console.log('Added created_by column to users table');
      }

      if (!columnNames.includes('last_login')) {
        this.db.exec('ALTER TABLE users ADD COLUMN last_login DATETIME');
        console.log('Added last_login column to users table');
      }

      // Update role constraint to include admin
      const userSchema = this.db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'").get();
      if (userSchema && !userSchema.sql.includes("'admin'")) {
        // We need to recreate the table with the new constraint
        this.db.exec(`
          CREATE TABLE users_new (
            user_id TEXT PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL CHECK (role IN ('admin', 'teacher', 'student')),
            full_name TEXT NOT NULL,
            email TEXT,
            has_registered_face INTEGER DEFAULT 0,
            face_registration_date DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            created_by TEXT,
            last_login DATETIME
          )
        `);

        this.db.exec(`
          INSERT INTO users_new SELECT 
            user_id, username, password_hash, role, full_name, 
            email, has_registered_face, face_registration_date, 
            created_at, created_by, last_login 
          FROM users
        `);

        this.db.exec('DROP TABLE users');
        this.db.exec('ALTER TABLE users_new RENAME TO users');
        console.log('Updated users table with admin role constraint');
      }

      // Check if app_violations table exists, create if not
      const appViolationsExists = this.db.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name='app_violations'
      `).get();

      if (!appViolationsExists) {
        this.db.exec(`
          CREATE TABLE app_violations (
            violation_id TEXT PRIMARY KEY,
            exam_id TEXT NOT NULL,
            student_id TEXT NOT NULL,
            device_id TEXT NOT NULL,
            app_name TEXT NOT NULL,
            window_title TEXT,
            focus_start_time DATETIME NOT NULL,
            focus_end_time DATETIME,
            duration_seconds INTEGER,
            screenshot_path TEXT,
            screenshot_captured INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (exam_id) REFERENCES exams (exam_id),
            FOREIGN KEY (student_id) REFERENCES users (user_id)
          )
        `);
        console.log('Created app_violations table for monitoring system');
      }

      const integrityCaseReviewsExists = this.db.prepare(`
        SELECT name FROM sqlite_master
        WHERE type='table' AND name='integrity_case_reviews'
      `).get();

      if (!integrityCaseReviewsExists) {
        this.db.exec(`
          CREATE TABLE integrity_case_reviews (
            review_id TEXT PRIMARY KEY,
            exam_id TEXT NOT NULL,
            student_id TEXT NOT NULL,
            teacher_id TEXT NOT NULL,
            is_reviewed INTEGER DEFAULT 0,
            is_suspicious INTEGER DEFAULT 0,
            reviewed_at DATETIME,
            notes TEXT,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(exam_id, student_id),
            FOREIGN KEY (exam_id) REFERENCES exams (exam_id),
            FOREIGN KEY (student_id) REFERENCES users (user_id),
            FOREIGN KEY (teacher_id) REFERENCES users (user_id)
          )
        `);
        console.log('Created integrity_case_reviews table');
      }

      // Add missing code evaluation analysis columns (idempotent)
      const codeEvalInfo = this.db.prepare("PRAGMA table_info(code_evaluations)").all();
      if (Array.isArray(codeEvalInfo) && codeEvalInfo.length > 0) {
        const codeEvalColumns = codeEvalInfo.map((col) => col.name);
        const codeEvalAlters = [
          ['analysis_breakdown_json', 'TEXT'],
          ['requirement_checks_json', 'TEXT'],
          ['hardcoding_flags_json', 'TEXT'],
          ['ai_summary_text', 'TEXT'],
          ['ai_summary_confidence', 'TEXT'],
          ['ai_summary_updated_at', 'DATETIME']
        ];
        for (const [columnName, columnType] of codeEvalAlters) {
          if (!codeEvalColumns.includes(columnName)) {
            this.db.exec(`ALTER TABLE code_evaluations ADD COLUMN ${columnName} ${columnType}`);
            console.log(`Added ${columnName} column to code_evaluations table`);
          }
        }
      }

      // Add missing exam_questions constraints column (idempotent)
      const examQuestionsInfo = this.db.prepare("PRAGMA table_info(exam_questions)").all();
      if (Array.isArray(examQuestionsInfo) && examQuestionsInfo.length > 0) {
        const examQuestionColumns = examQuestionsInfo.map((col) => col.name);
        if (!examQuestionColumns.includes('constraints_json')) {
          this.db.exec('ALTER TABLE exam_questions ADD COLUMN constraints_json TEXT');
          console.log('Added constraints_json column to exam_questions table');
        }
      }

    } catch (error) {
      console.error('Error performing migrations:', error);
      // Don't throw error, continue with table creation
    }
  }

  /**
   * Create all required database tables (in-memory version)
   */
  createTables() {
    // Perform migrations first
    this.performMigrations();
    // Create users table (enhanced for face recognition)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        user_id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('admin', 'teacher', 'student')),
        full_name TEXT NOT NULL,
        email TEXT,
        has_registered_face INTEGER DEFAULT 0,
        face_registration_date DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_by TEXT,
        last_login DATETIME
      )
    `);

    // Create courses table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS courses (
        course_id TEXT PRIMARY KEY,
        course_name TEXT NOT NULL,
        course_code TEXT NOT NULL UNIQUE,
        teacher_id TEXT NOT NULL,
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (teacher_id) REFERENCES users (user_id)
      )
    `);

    // Create enrollments table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS enrollments (
        enrollment_id TEXT PRIMARY KEY,
        course_id TEXT NOT NULL,
        student_id TEXT NOT NULL,
        enrolled_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        status TEXT DEFAULT 'active' CHECK (status IN ('active', 'dropped', 'completed')),
        UNIQUE(course_id, student_id),
        FOREIGN KEY (course_id) REFERENCES courses (course_id),
        FOREIGN KEY (student_id) REFERENCES users (user_id)
      )
    `);

    // Create exams table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS exams (
        exam_id TEXT PRIMARY KEY,
        teacher_id TEXT NOT NULL,
        course_id TEXT,
        title TEXT NOT NULL,
        pdf_path TEXT,
        start_time DATETIME NOT NULL,
        end_time DATETIME NOT NULL,
        allowed_apps TEXT NOT NULL DEFAULT '[]',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (teacher_id) REFERENCES users (user_id),
        FOREIGN KEY (course_id) REFERENCES courses (course_id)
      )
    `);

    // Create exam submissions table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS exam_submissions (
        submission_id TEXT PRIMARY KEY,
        exam_id TEXT NOT NULL,
        student_id TEXT NOT NULL,
        submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        status TEXT DEFAULT 'submitted',
        files_data TEXT,
        FOREIGN KEY (exam_id) REFERENCES exams (exam_id),
        FOREIGN KEY (student_id) REFERENCES users (user_id)
      )
    `);

    // Create events table for monitoring
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS events (
        event_id TEXT PRIMARY KEY,
        exam_id TEXT NOT NULL,
        student_id TEXT NOT NULL,
        device_id TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        event_type TEXT NOT NULL,
        window_title TEXT,
        process_name TEXT,
        is_violation INTEGER DEFAULT 0,
        FOREIGN KEY (exam_id) REFERENCES exams (exam_id),
        FOREIGN KEY (student_id) REFERENCES users (user_id)
      )
    `);

    // Create devices table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS devices (
        device_id TEXT PRIMARY KEY,
        device_name TEXT,
        registered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_used DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create face_embeddings table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS face_embeddings (
        embedding_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        embedding_data BLOB NOT NULL,
        embedding_version TEXT DEFAULT '1.0',
        confidence_score REAL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE
      )
    `);

    // Create system_settings table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS system_settings (
        setting_key TEXT PRIMARY KEY,
        setting_value TEXT NOT NULL,
        setting_type TEXT DEFAULT 'string',
        description TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_by TEXT
      )
    `);

    // Create audit_logs table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        log_id TEXT PRIMARY KEY,
        user_id TEXT,
        action TEXT NOT NULL,
        details TEXT,
        ip_address TEXT,
        user_agent TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (user_id)
      )
    `);

    // --- Code Evaluation Module: exam questions, test cases, evaluations, results ---
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS exam_questions (
        question_id TEXT PRIMARY KEY,
        exam_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        source_page INTEGER,
        max_score REAL DEFAULT 100,
        constraints_json TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (exam_id) REFERENCES exams (exam_id)
      )
    `);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS question_test_cases (
        test_case_id TEXT PRIMARY KEY,
        question_id TEXT NOT NULL,
        name TEXT NOT NULL,
        input TEXT,
        expected_output TEXT,
        is_hidden INTEGER DEFAULT 0,
        is_edge_case INTEGER DEFAULT 0,
        is_generated INTEGER DEFAULT 0,
        time_limit_ms INTEGER,
        memory_limit_kb INTEGER,
        weight REAL DEFAULT 1.0,
        metadata TEXT,
        FOREIGN KEY (question_id) REFERENCES exam_questions (question_id)
      )
    `);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS code_evaluations (
        evaluation_id TEXT PRIMARY KEY,
        submission_id TEXT NOT NULL,
        question_id TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        score REAL DEFAULT 0,
        max_score REAL DEFAULT 0,
        status TEXT DEFAULT 'pending',
        compile_exit_code INTEGER,
        compile_stdout TEXT,
        compile_stderr TEXT,
        error_summary TEXT,
        manual_score REAL,
        final_score REAL DEFAULT 0,
        analysis_breakdown_json TEXT,
        requirement_checks_json TEXT,
        hardcoding_flags_json TEXT,
        ai_summary_text TEXT,
        ai_summary_confidence TEXT,
        ai_summary_updated_at DATETIME,
        FOREIGN KEY (submission_id) REFERENCES exam_submissions (submission_id),
        FOREIGN KEY (question_id) REFERENCES exam_questions (question_id)
      )
    `);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS test_case_results (
        result_id TEXT PRIMARY KEY,
        evaluation_id TEXT NOT NULL,
        test_case_id TEXT NOT NULL,
        passed INTEGER DEFAULT 0,
        execution_time_ms INTEGER,
        memory_kb INTEGER,
        exit_code INTEGER,
        stdout TEXT,
        stderr TEXT,
        FOREIGN KEY (evaluation_id) REFERENCES code_evaluations (evaluation_id),
        FOREIGN KEY (test_case_id) REFERENCES question_test_cases (test_case_id)
      )
    `);

    // Indexes for code evaluation tables
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_exam_questions_exam ON exam_questions (exam_id)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_test_cases_question ON question_test_cases (question_id)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_code_evaluations_submission ON code_evaluations (submission_id)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_code_evaluations_question ON code_evaluations (question_id)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_results_eval ON test_case_results (evaluation_id)`);

    console.log('Database tables created successfully');
  }

  // USER CRUD OPERATIONS

  /**
   * Create a new user with hashed password
   */
  async createUser(userData) {
    try {
      const { username, password, role, fullName, email, createdBy } = userData;
      const userId = uuidv4();
      const passwordHash = await bcrypt.hash(password, this.saltRounds);

      const stmt = this.db.prepare(`
        INSERT INTO users (user_id, username, password_hash, role, full_name, email, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      const result = stmt.run(userId, username, passwordHash, role, fullName, email || null, createdBy || null);

      return {
        userId,
        username,
        role,
        fullName,
        createdAt: new Date().toISOString()
      };
    } catch (error) {
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        throw new Error('Username already exists');
      }
      throw error;
    }
  }

  /**
   * Get user by credentials for authentication
   */
  async getUserByCredentials(username, password) {
    try {
      const stmt = this.db.prepare(`
        SELECT user_id, username, password_hash, role, full_name, created_at
        FROM users 
        WHERE username = ?
      `);

      const user = stmt.get(username);

      if (!user) {
        return null;
      }

      const isValidPassword = await bcrypt.compare(password, user.password_hash);

      if (!isValidPassword) {
        return null;
      }

      // Return user without password hash
      const { password_hash, ...userWithoutPassword } = user;
      return userWithoutPassword;
    } catch (error) {
      console.error('Error getting user by credentials:', error);
      throw error;
    }
  }

  /**
   * Get user by ID
   */
  getUserById(userId) {
    try {
      const stmt = this.db.prepare(`
        SELECT user_id, username, role, full_name, email, has_registered_face, face_registration_date, created_at
        FROM users 
        WHERE user_id = ?
      `);

      return stmt.get(userId);
    } catch (error) {
      console.error('Error getting user by ID:', error);
      throw error;
    }
  }

  /**
   * Update user information
   */
  async updateUser(userId, updateData) {
    try {
      const { fullName, password } = updateData;
      let query = 'UPDATE users SET ';
      const params = [];
      const updates = [];

      if (fullName) {
        updates.push('full_name = ?');
        params.push(fullName);
      }

      if (password) {
        const passwordHash = await bcrypt.hash(password, this.saltRounds);
        updates.push('password_hash = ?');
        params.push(passwordHash);
      }

      if (updates.length === 0) {
        throw new Error('No valid update fields provided');
      }

      query += updates.join(', ') + ' WHERE user_id = ?';
      params.push(userId);

      const stmt = this.db.prepare(query);
      const result = stmt.run(...params);

      return result.changes > 0;
    } catch (error) {
      console.error('Error updating user:', error);
      throw error;
    }
  }

  /**
   * Delete user
   */
  deleteUser(userId) {
    try {
      const stmt = this.db.prepare('DELETE FROM users WHERE user_id = ?');
      const result = stmt.run(userId);
      return result.changes > 0;
    } catch (error) {
      console.error('Error deleting user:', error);
      throw error;
    }
  }

  // COURSE MANAGEMENT METHODS

  /**
   * Create a new course
   */
  createCourse(courseData) {
    try {
      const { courseName, courseCode, teacherId, description } = courseData;
      const courseId = uuidv4();

      const stmt = this.db.prepare(`
        INSERT INTO courses (course_id, course_name, course_code, teacher_id, description)
        VALUES (?, ?, ?, ?, ?)
      `);

      stmt.run(courseId, courseName, courseCode, teacherId, description || null);

      return {
        courseId,
        courseName,
        courseCode,
        teacherId,
        description
      };
    } catch (error) {
      console.error('Error creating course:', error);
      throw error;
    }
  }

  /**
   * Get courses by teacher
   */
  getCoursesByTeacher(teacherId) {
    try {
      const stmt = this.db.prepare(`
        SELECT c.*, 
               (SELECT COUNT(*) FROM enrollments WHERE course_id = c.course_id AND status = 'active') as student_count
        FROM courses c
        WHERE c.teacher_id = ?
        ORDER BY c.created_at DESC
      `);

      return stmt.all(teacherId);
    } catch (error) {
      console.error('Error getting courses:', error);
      return [];
    }
  }

  /**
   * Get course by ID
   */
  getCourseById(courseId) {
    try {
      const stmt = this.db.prepare('SELECT * FROM courses WHERE course_id = ?');
      return stmt.get(courseId);
    } catch (error) {
      console.error('Error getting course:', error);
      return null;
    }
  }

  /**
   * Enroll student in course
   */
  enrollStudent(courseId, studentId) {
    try {
      const enrollmentId = uuidv4();

      const stmt = this.db.prepare(`
        INSERT INTO enrollments (enrollment_id, course_id, student_id)
        VALUES (?, ?, ?)
      `);

      stmt.run(enrollmentId, courseId, studentId);

      return { enrollmentId, courseId, studentId, status: 'active' };
    } catch (error) {
      console.error('Error enrolling student:', error);
      throw error;
    }
  }

  /**
   * Get enrolled students for a course
   */
  getEnrolledStudents(courseId) {
    try {
      const stmt = this.db.prepare(`
        SELECT u.user_id, u.username, u.full_name, u.email, e.enrolled_at, e.status
        FROM enrollments e
        JOIN users u ON e.student_id = u.user_id
        WHERE e.course_id = ? AND e.status = 'active'
        ORDER BY u.full_name
      `);

      return stmt.all(courseId);
    } catch (error) {
      console.error('Error getting enrolled students:', error);
      return [];
    }
  }

  /**
   * Get courses for a student
   */
  getStudentCourses(studentId) {
    try {
      const stmt = this.db.prepare(`
        SELECT c.*, u.full_name as teacher_name, e.enrolled_at
        FROM enrollments e
        JOIN courses c ON e.course_id = c.course_id
        JOIN users u ON c.teacher_id = u.user_id
        WHERE e.student_id = ? AND e.status = 'active'
        ORDER BY c.course_name
      `);

      return stmt.all(studentId);
    } catch (error) {
      console.error('Error getting student courses:', error);
      return [];
    }
  }

  /**
   * Unenroll student from course
   */
  unenrollStudent(courseId, studentId) {
    try {
      const stmt = this.db.prepare(`
        UPDATE enrollments 
        SET status = 'dropped'
        WHERE course_id = ? AND student_id = ?
      `);

      stmt.run(courseId, studentId);
      return true;
    } catch (error) {
      console.error('Error unenrolling student:', error);
      return false;
    }
  }

  // EXAM MANAGEMENT METHODS

  /**
   * Create a new exam
   */
  createExam(examData) {
    try {
      const { teacherId, courseId, title, pdfPath, startTime, endTime, allowedApps } = examData;
      const examId = uuidv4();

      const stmt = this.db.prepare(`
        INSERT INTO exams (exam_id, teacher_id, course_id, title, pdf_path, start_time, end_time, allowed_apps)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const allowedAppsJson = JSON.stringify(allowedApps);
      const result = stmt.run(examId, teacherId, courseId || null, title, pdfPath, startTime, endTime, allowedAppsJson);

      return {
        examId,
        teacherId,
        title,
        pdfPath,
        startTime,
        endTime,
        allowedApps,
        createdAt: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error creating exam:', error);
      throw error;
    }
  }

  /**
   * Get exams by teacher ID
   */
  getExamsByTeacher(teacherId) {
    try {
      const stmt = this.db.prepare(`
        SELECT exam_id, teacher_id, title, pdf_path, start_time, end_time, allowed_apps, created_at
        FROM exams 
        WHERE teacher_id = ?
        ORDER BY created_at DESC
      `);

      const exams = stmt.all(teacherId);

      // Convert to camelCase and parse allowed_apps JSON for each exam
      return exams.map(exam => ({
        examId: exam.exam_id,
        teacherId: exam.teacher_id,
        title: exam.title,
        pdfPath: exam.pdf_path,
        startTime: exam.start_time,
        endTime: exam.end_time,
        allowedApps: JSON.parse(exam.allowed_apps),
        createdAt: exam.created_at
      }));
    } catch (error) {
      console.error('Error getting exams by teacher:', error);
      throw error;
    }
  }

  /**
   * Get available exams for students (current and future exams only - not ended)
   */
  getAvailableExams(studentId) {
    try {
      console.log('Getting available exams for student:', studentId);

      const stmt = this.db.prepare(`
        SELECT e.exam_id, e.teacher_id, e.course_id, e.title, e.pdf_path, e.start_time, e.end_time, e.allowed_apps, e.created_at,
               u.full_name as teacher_name,
               c.course_name, c.course_code
        FROM exams e
        JOIN users u ON e.teacher_id = u.user_id
        JOIN courses c ON e.course_id = c.course_id
        JOIN enrollments en ON e.course_id = en.course_id AND en.student_id = ? AND en.status = 'active'
        LEFT JOIN exam_submissions es ON e.exam_id = es.exam_id AND es.student_id = ?
        WHERE datetime(e.end_time) > datetime('now', 'localtime')
          AND es.submission_id IS NULL
        ORDER BY e.start_time ASC
      `);

      const exams = stmt.all(studentId, studentId);
      console.log('Found exams:', exams.length);

      if (exams.length === 0) {
        // Debug: Check what's in the database
        const allExams = this.db.prepare('SELECT exam_id, title, course_id, end_time FROM exams').all();
        console.log('Total exams in DB:', allExams.length);

        const enrollments = this.db.prepare('SELECT course_id, status FROM enrollments WHERE student_id = ?').all(studentId);
        console.log('Student enrollments:', enrollments.length);

        const submissions = this.db.prepare('SELECT exam_id FROM exam_submissions WHERE student_id = ?').all(studentId);
        console.log('Student submissions:', submissions.length);

        console.log('Current time:', new Date().toISOString());
        allExams.forEach(e => {
          console.log(`  Exam: ${e.title}, Course: ${e.course_id}, End: ${e.end_time}`);
        });
      }

      // Parse allowed_apps JSON for each exam
      return exams.map(exam => ({
        ...exam,
        allowed_apps: JSON.parse(exam.allowed_apps),
        allowedApps: JSON.parse(exam.allowed_apps)
      }));
    } catch (error) {
      console.error('Error getting available exams:', error);
      throw error;
    }
  }

  /**
   * Get exam by ID
   */
  getExamById(examId) {
    try {
      const stmt = this.db.prepare(`
        SELECT exam_id, teacher_id, title, pdf_path, start_time, end_time, allowed_apps, created_at
        FROM exams 
        WHERE exam_id = ?
      `);

      const exam = stmt.get(examId);

      if (exam) {
        // Convert to camelCase for consistency
        return {
          examId: exam.exam_id,
          teacherId: exam.teacher_id,
          title: exam.title,
          pdfPath: exam.pdf_path,
          startTime: exam.start_time,
          endTime: exam.end_time,
          allowedApps: JSON.parse(exam.allowed_apps),
          createdAt: exam.created_at
        };
      }

      return null;
    } catch (error) {
      console.error('Error getting exam by ID:', error);
      throw error;
    }
  }

  /**
   * Update exam
   */
  updateExam(examId, updateData) {
    try {
      const { title, pdfPath, startTime, endTime, allowedApps } = updateData;
      let query = 'UPDATE exams SET ';
      const params = [];
      const updates = [];

      if (title !== undefined) {
        updates.push('title = ?');
        params.push(title);
      }

      if (pdfPath !== undefined) {
        updates.push('pdf_path = ?');
        params.push(pdfPath);
      }

      if (startTime !== undefined) {
        updates.push('start_time = ?');
        params.push(startTime);
      }

      if (endTime !== undefined) {
        updates.push('end_time = ?');
        params.push(endTime);
      }

      if (allowedApps !== undefined) {
        updates.push('allowed_apps = ?');
        params.push(JSON.stringify(allowedApps));
      }

      if (updates.length === 0) {
        throw new Error('No valid update fields provided');
      }

      query += updates.join(', ') + ' WHERE exam_id = ?';
      params.push(examId);

      const stmt = this.db.prepare(query);
      const result = stmt.run(...params);

      return result.changes > 0;
    } catch (error) {
      console.error('Error updating exam:', error);
      throw error;
    }
  }

  /**
   * Delete exam
   */
  deleteExam(examId) {
    try {
      // Start a transaction to ensure all deletions succeed or fail together
      const transaction = this.db.transaction(() => {
        // Code eval: delete test_case_results for evaluations of this exam's submissions, then code_evaluations
        const submissionIds = this.db.prepare('SELECT submission_id FROM exam_submissions WHERE exam_id = ?').all(examId).map(r => r.submission_id);
        for (const sid of submissionIds) {
          const evalIds = this.db.prepare('SELECT evaluation_id FROM code_evaluations WHERE submission_id = ?').all(sid).map(r => r.evaluation_id);
          for (const eid of evalIds) {
            this.db.prepare('DELETE FROM test_case_results WHERE evaluation_id = ?').run(eid);
          }
          this.db.prepare('DELETE FROM code_evaluations WHERE submission_id = ?').run(sid);
        }
        // Code eval: delete question_test_cases for exam's questions, then exam_questions
        const questionIds = this.db.prepare('SELECT question_id FROM exam_questions WHERE exam_id = ?').all(examId).map(r => r.question_id);
        for (const qid of questionIds) {
          this.db.prepare('DELETE FROM question_test_cases WHERE question_id = ?').run(qid);
        }
        this.db.prepare('DELETE FROM exam_questions WHERE exam_id = ?').run(examId);

        // Delete related exam_submissions
        const deleteSubmissionsStmt = this.db.prepare('DELETE FROM exam_submissions WHERE exam_id = ?');
        deleteSubmissionsStmt.run(examId);

        // Delete related app_violations
        const deleteViolationsStmt = this.db.prepare('DELETE FROM app_violations WHERE exam_id = ?');
        deleteViolationsStmt.run(examId);

        // Delete related integrity review decisions
        const deleteIntegrityReviewsStmt = this.db.prepare('DELETE FROM integrity_case_reviews WHERE exam_id = ?');
        deleteIntegrityReviewsStmt.run(examId);

        // Delete related events
        const deleteEventsStmt = this.db.prepare('DELETE FROM events WHERE exam_id = ?');
        deleteEventsStmt.run(examId);

        // Finally delete the exam itself
        const deleteExamStmt = this.db.prepare('DELETE FROM exams WHERE exam_id = ?');
        const result = deleteExamStmt.run(examId);

        return result.changes > 0;
      });

      return transaction();
    } catch (error) {
      console.error('Error deleting exam:', error);
      throw error;
    }
  }

  // EVENT LOGGING METHODS

  /**
   * Log monitoring event
   */
  logEvent(eventData) {
    try {
      const { examId, studentId, deviceId, eventType, windowTitle, processName, isViolation } = eventData;
      const eventId = uuidv4();

      const stmt = this.db.prepare(`
        INSERT INTO events (event_id, exam_id, student_id, device_id, event_type, window_title, process_name, is_violation)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const result = stmt.run(
        eventId,
        examId,
        studentId,
        deviceId,
        eventType,
        windowTitle || null,
        processName || null,
        isViolation ? 1 : 0
      );

      return {
        eventId,
        examId,
        studentId,
        deviceId,
        eventType,
        windowTitle,
        processName,
        isViolation,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error logging event:', error);
      throw error;
    }
  }

  // APP VIOLATION LOGGING METHODS

  /**
   * Log application violation when unauthorized app gains focus
   */
  logAppViolation(violationData) {
    try {
      const {
        examId,
        studentId,
        deviceId,
        appName,
        windowTitle,
        focusStartTime,
        screenshotPath
      } = violationData;

      const violationId = uuidv4();
      const startTime = focusStartTime || new Date().toISOString();

      const stmt = this.db.prepare(`
        INSERT INTO app_violations (
          violation_id, exam_id, student_id, device_id, app_name, 
          window_title, focus_start_time, screenshot_path, screenshot_captured
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const result = stmt.run(
        violationId,
        examId,
        studentId,
        deviceId,
        appName,
        windowTitle || null,
        startTime,
        screenshotPath || null,
        screenshotPath ? 1 : 0
      );

      return {
        violationId,
        examId,
        studentId,
        deviceId,
        appName,
        windowTitle,
        focusStartTime: startTime,
        screenshotPath,
        screenshotCaptured: screenshotPath ? true : false,
        createdAt: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error logging app violation:', error);
      throw error;
    }
  }

  /**
   * Update violation end time and calculate duration when app loses focus
   */
  updateViolationEndTime(violationId, endTime) {
    try {
      const endTimeISO = endTime || new Date().toISOString();

      // Get the start time to calculate duration
      const getStartStmt = this.db.prepare(`
        SELECT focus_start_time FROM app_violations WHERE violation_id = ?
      `);
      const violation = getStartStmt.get(violationId);

      if (!violation) {
        throw new Error(`Violation with ID ${violationId} not found`);
      }

      // Calculate duration in seconds
      const startTime = new Date(violation.focus_start_time);
      const endTimeDate = new Date(endTimeISO);
      const durationSeconds = Math.floor((endTimeDate - startTime) / 1000);

      const updateStmt = this.db.prepare(`
        UPDATE app_violations 
        SET focus_end_time = ?, duration_seconds = ?
        WHERE violation_id = ?
      `);

      const result = updateStmt.run(endTimeISO, durationSeconds, violationId);

      return {
        violationId,
        focusEndTime: endTimeISO,
        durationSeconds,
        updated: result.changes > 0
      };
    } catch (error) {
      console.error('Error updating violation end time:', error);
      throw error;
    }
  }

  /**
   * Get events by exam ID
   */
  getEventsByExam(examId) {
    try {
      const stmt = this.db.prepare(`
        SELECT e.*, u.full_name as student_name
        FROM events e
        JOIN users u ON e.student_id = u.user_id
        WHERE e.exam_id = ?
        ORDER BY e.timestamp ASC
      `);

      return stmt.all(examId);
    } catch (error) {
      console.error('Error getting events by exam:', error);
      throw error;
    }
  }

  /**
   * Get violation events by exam ID
   */
  getViolationsByExam(examId) {
    try {
      const stmt = this.db.prepare(`
        SELECT e.*, u.full_name as student_name
        FROM events e
        JOIN users u ON e.student_id = u.user_id
        WHERE e.exam_id = ? AND e.is_violation = 1
        ORDER BY e.timestamp ASC
      `);

      return stmt.all(examId);
    } catch (error) {
      console.error('Error getting violations by exam:', error);
      throw error;
    }
  }

  /**
   * Get app violations by exam ID with student details
   */
  getAppViolationsByExam(examId) {
    try {
      const stmt = this.db.prepare(`
        SELECT av.*, u.full_name as student_name, u.username
        FROM app_violations av
        JOIN users u ON av.student_id = u.user_id
        WHERE av.exam_id = ?
        ORDER BY av.focus_start_time ASC
      `);

      const violations = stmt.all(examId);

      // Convert database format to camelCase for consistency
      return violations.map(violation => ({
        violationId: violation.violation_id,
        examId: violation.exam_id,
        studentId: violation.student_id,
        studentName: violation.student_name,
        username: violation.username,
        deviceId: violation.device_id,
        appName: violation.app_name,
        windowTitle: violation.window_title,
        focusStartTime: violation.focus_start_time,
        focusEndTime: violation.focus_end_time,
        durationSeconds: violation.duration_seconds,
        screenshotPath: violation.screenshot_path,
        screenshotCaptured: violation.screenshot_captured === 1,
        createdAt: violation.created_at
      }));
    } catch (error) {
      console.error('Error getting app violations by exam:', error);
      throw error;
    }
  }

  /**
   * Get all violations by student (all exams)
   */
  getAllViolationsByStudent(studentId) {
    try {
      const stmt = this.db.prepare(`
        SELECT av.*, e.title as exam_title
        FROM app_violations av
        JOIN exams e ON av.exam_id = e.exam_id
        WHERE av.student_id = ?
        ORDER BY av.focus_start_time DESC
      `);

      const violations = stmt.all(studentId);

      // Convert to format expected by frontend
      return violations.map(violation => ({
        violation_id: violation.violation_id,
        exam_id: violation.exam_id,
        exam_title: violation.exam_title,
        violation_type: 'UNAUTHORIZED_APP',
        application_name: violation.app_name,
        start_time: violation.focus_start_time,
        end_time: violation.focus_end_time,
        duration: violation.duration_seconds,
        screenshot_path: violation.screenshot_path
      }));
    } catch (error) {
      console.error('Error getting all violations by student:', error);
      throw error;
    }
  }

  /**
   * Get student-facing integrity incidents (app + camera), optionally scoped to one exam.
   * This view intentionally avoids screenshot payloads/raw logs and returns clean fields only.
   */
  getStudentIntegrityIncidents(studentId, examId = null) {
    try {
      const appRows = examId
        ? this.db.prepare(`
            SELECT
              av.violation_id,
              av.exam_id,
              e.title AS exam_title,
              av.app_name,
              av.focus_start_time,
              av.focus_end_time,
              av.duration_seconds
            FROM app_violations av
            JOIN exams e ON e.exam_id = av.exam_id
            WHERE av.student_id = ? AND av.exam_id = ?
            ORDER BY av.focus_start_time DESC
          `).all(studentId, examId)
        : this.db.prepare(`
            SELECT
              av.violation_id,
              av.exam_id,
              e.title AS exam_title,
              av.app_name,
              av.focus_start_time,
              av.focus_end_time,
              av.duration_seconds
            FROM app_violations av
            JOIN exams e ON e.exam_id = av.exam_id
            WHERE av.student_id = ?
            ORDER BY av.focus_start_time DESC
          `).all(studentId);

      const appIncidents = appRows.map((row) => ({
        incident_id: row.violation_id,
        exam_id: row.exam_id,
        exam_title: row.exam_title,
        source: 'app',
        violation_type: 'UNAUTHORIZED_APP',
        display_type: 'Unauthorized App',
        application_name: row.app_name || '',
        started_at: row.focus_start_time,
        ended_at: row.focus_end_time || null,
        duration_seconds: Number(row.duration_seconds || 0)
      }));

      const cameraRows = examId
        ? this.db.prepare(`
            SELECT
              ev.event_id,
              ev.exam_id,
              e.title AS exam_title,
              ev.timestamp,
              ev.event_type,
              ev.window_title
            FROM events ev
            JOIN exams e ON e.exam_id = ev.exam_id
            WHERE ev.student_id = ?
              AND ev.exam_id = ?
              AND (
                ev.event_type IN ('phone_violation', 'multiple_persons', 'phone_violation_ended', 'multiple_persons_ended')
              )
            ORDER BY ev.timestamp ASC
          `).all(studentId, examId)
        : this.db.prepare(`
            SELECT
              ev.event_id,
              ev.exam_id,
              e.title AS exam_title,
              ev.timestamp,
              ev.event_type,
              ev.window_title
            FROM events ev
            JOIN exams e ON e.exam_id = ev.exam_id
            WHERE ev.student_id = ?
              AND (
                ev.event_type IN ('phone_violation', 'multiple_persons', 'phone_violation_ended', 'multiple_persons_ended')
              )
            ORDER BY ev.timestamp ASC
          `).all(studentId);

      const parseJsonFromText = (value) => {
        if (typeof value !== 'string') return null;
        const text = value.trim();
        if (!text) return null;
        if (!((text.startsWith('{') && text.endsWith('}')) || (text.startsWith('[') && text.endsWith(']')))) return null;
        try {
          return JSON.parse(text);
        } catch (_error) {
          return null;
        }
      };

      const openByKey = new Map();
      const cameraIncidents = [];
      for (const row of cameraRows) {
        const normalizedType = String(row.event_type || '').replace(/_ended$/, '');
        const key = `${row.exam_id}|${normalizedType}`;
        const parsed = parseJsonFromText(row.window_title);
        const durationFromEnded =
          parsed && typeof parsed === 'object' && Number.isFinite(parsed.durationSeconds)
            ? Number(parsed.durationSeconds)
            : null;

        if (String(row.event_type || '').endsWith('_ended')) {
          const started = openByKey.get(key);
          if (started) {
            started.ended_at = row.timestamp;
            if (durationFromEnded != null) started.duration_seconds = durationFromEnded;
            cameraIncidents.push(started);
            openByKey.delete(key);
          }
          continue;
        }

        openByKey.set(key, {
          incident_id: row.event_id,
          exam_id: row.exam_id,
          exam_title: row.exam_title,
          source: 'camera',
          violation_type: normalizedType,
          display_type: normalizedType === 'phone_violation' ? 'Phone' : 'Multiple Faces',
          application_name: null,
          started_at: row.timestamp,
          ended_at: null,
          duration_seconds: 0
        });
      }

      for (const pending of openByKey.values()) {
        cameraIncidents.push(pending);
      }

      return [...appIncidents, ...cameraIncidents].sort(
        (a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime()
      );
    } catch (error) {
      console.error('Error getting student integrity incidents:', error);
      throw error;
    }
  }

  /**
   * Get app violations by student and exam
   */
  getAppViolationsByStudent(studentId, examId) {
    try {
      const stmt = this.db.prepare(`
        SELECT av.*, e.title as exam_title
        FROM app_violations av
        JOIN exams e ON av.exam_id = e.exam_id
        WHERE av.student_id = ? AND av.exam_id = ?
        ORDER BY av.focus_start_time ASC
      `);

      const violations = stmt.all(studentId, examId);

      // Convert database format to camelCase for consistency
      return violations.map(violation => ({
        violationId: violation.violation_id,
        examId: violation.exam_id,
        examTitle: violation.exam_title,
        studentId: violation.student_id,
        deviceId: violation.device_id,
        appName: violation.app_name,
        windowTitle: violation.window_title,
        focusStartTime: violation.focus_start_time,
        focusEndTime: violation.focus_end_time,
        durationSeconds: violation.duration_seconds,
        screenshotPath: violation.screenshot_path,
        screenshotCaptured: violation.screenshot_captured === 1,
        createdAt: violation.created_at
      }));
    } catch (error) {
      console.error('Error getting app violations by student:', error);
      throw error;
    }
  }

  /**
   * Get all app violations for a student across all exams
   */
  getAllAppViolationsByStudent(studentId) {
    try {
      const stmt = this.db.prepare(`
        SELECT av.*, e.title as exam_title, e.start_time as exam_start_time
        FROM app_violations av
        JOIN exams e ON av.exam_id = e.exam_id
        WHERE av.student_id = ?
        ORDER BY av.focus_start_time DESC
      `);

      const violations = stmt.all(studentId);

      // Convert database format to camelCase for consistency
      return violations.map(violation => ({
        violationId: violation.violation_id,
        examId: violation.exam_id,
        examTitle: violation.exam_title,
        examStartTime: violation.exam_start_time,
        studentId: violation.student_id,
        deviceId: violation.device_id,
        appName: violation.app_name,
        windowTitle: violation.window_title,
        focusStartTime: violation.focus_start_time,
        focusEndTime: violation.focus_end_time,
        durationSeconds: violation.duration_seconds,
        screenshotPath: violation.screenshot_path,
        screenshotCaptured: violation.screenshot_captured === 1,
        createdAt: violation.created_at
      }));
    } catch (error) {
      console.error('Error getting all app violations by student:', error);
      throw error;
    }
  }

  /**
   * Get violation statistics for an exam
   */
  getViolationStatsByExam(examId) {
    try {
      const stmt = this.db.prepare(`
        SELECT 
          COUNT(*) as total_violations,
          COUNT(DISTINCT student_id) as students_with_violations,
          COUNT(DISTINCT app_name) as unique_apps,
          SUM(duration_seconds) as total_duration_seconds,
          AVG(duration_seconds) as avg_duration_seconds,
          app_name,
          COUNT(*) as app_violation_count
        FROM app_violations 
        WHERE exam_id = ?
        GROUP BY app_name
        ORDER BY app_violation_count DESC
      `);

      const appStats = stmt.all(examId);

      // Get overall stats
      const overallStmt = this.db.prepare(`
        SELECT 
          COUNT(*) as total_violations,
          COUNT(DISTINCT student_id) as students_with_violations,
          COUNT(DISTINCT app_name) as unique_apps,
          SUM(duration_seconds) as total_duration_seconds,
          AVG(duration_seconds) as avg_duration_seconds
        FROM app_violations 
        WHERE exam_id = ?
      `);

      const overall = overallStmt.get(examId);

      return {
        overall: {
          totalViolations: overall.total_violations || 0,
          studentsWithViolations: overall.students_with_violations || 0,
          uniqueApps: overall.unique_apps || 0,
          totalDurationSeconds: overall.total_duration_seconds || 0,
          avgDurationSeconds: overall.avg_duration_seconds || 0
        },
        byApp: appStats.map(stat => ({
          appName: stat.app_name,
          violationCount: stat.app_violation_count,
          totalDurationSeconds: stat.total_duration_seconds || 0
        }))
      };
    } catch (error) {
      console.error('Error getting violation stats by exam:', error);
      throw error;
    }
  }

  /**
   * Get teacher-facing integrity review data by exam.
   * Combines app-level violations and camera-oriented violations inferred from events.
   */
  getIntegrityReviewByExam(examId) {
    try {
      const appViolations = this.getAppViolationsByExam(examId);
      const snapshotEnabled = this.getSystemSetting('snapshot_enabled_violations');
      const enabledCameraTypesRaw = Array.isArray(snapshotEnabled) && snapshotEnabled.length > 0
        ? snapshotEnabled
        : ['phone_violation', 'multiple_persons'];
      const enabledCameraTypes = new Set(
        enabledCameraTypesRaw
          .map((t) => (typeof t === 'string' ? t.trim() : ''))
          .filter(Boolean)
      );
      const snapshotCooldownSecondsRaw = this.getSystemSetting('snapshot_cooldown_seconds');
      const snapshotCooldownSeconds =
        typeof snapshotCooldownSecondsRaw === 'number' && Number.isFinite(snapshotCooldownSecondsRaw) && snapshotCooldownSecondsRaw > 0
          ? snapshotCooldownSecondsRaw
          : 7;

      const cameraEventRows = this.db.prepare(`
        SELECT
          e.event_id,
          e.exam_id,
          e.student_id,
          u.full_name AS student_name,
          u.username,
          e.timestamp,
          e.event_type,
          e.window_title,
          e.process_name
        FROM events e
        JOIN users u ON u.user_id = e.student_id
        WHERE e.exam_id = ?
          AND (
            e.event_type IN ('phone_violation', 'multiple_persons', 'no_face_detected', 'not_facing_screen', 'not_looking_at_screen')
            OR e.event_type IN ('phone_violation_ended', 'multiple_persons_ended', 'no_face_detected_ended', 'not_facing_screen_ended', 'not_looking_at_screen_ended')
            OR e.event_type LIKE 'camera_%'
          )
        ORDER BY e.timestamp ASC
      `).all(examId);

      const extractScreenshotPath = (rawWindowTitle, rawProcessName) => {
        const candidates = [rawWindowTitle, rawProcessName].filter((v) => typeof v === 'string' && v.trim());
        for (const candidate of candidates) {
          try {
            if ((candidate.startsWith('{') && candidate.endsWith('}')) || (candidate.startsWith('[') && candidate.endsWith(']'))) {
              const parsed = JSON.parse(candidate);
              if (parsed && typeof parsed === 'object') {
                const keys = ['screenshotPath', 'snapshotPath', 'path'];
                for (const key of keys) {
                  if (typeof parsed[key] === 'string' && parsed[key]) return parsed[key];
                }
              }
            }
          } catch (_parseError) {
            // Fall through to regex parsing
          }

          const pathMatch = candidate.match(/[A-Za-z]:\\[^\s"']+\.(png|jpg|jpeg|webp)/i) || candidate.match(/\/[^\s"']+\.(png|jpg|jpeg|webp)/i);
          if (pathMatch && pathMatch[0]) {
            return pathMatch[0];
          }
        }
        return null;
      };

      const parseJsonFromText = (value) => {
        if (typeof value !== 'string') return null;
        const text = value.trim();
        if (!text) return null;
        if (!((text.startsWith('{') && text.endsWith('}')) || (text.startsWith('[') && text.endsWith(']')))) {
          return null;
        }
        try {
          return JSON.parse(text);
        } catch (_error) {
          return null;
        }
      };

      const toIsoOrNull = (value) => {
        if (typeof value !== 'string' || !value.trim()) return null;
        const d = new Date(value);
        return Number.isNaN(d.getTime()) ? null : d.toISOString();
      };

      const openCameraViolations = new Map();
      const cameraViolations = [];

      for (const row of cameraEventRows) {
        const jsonWindow = parseJsonFromText(row.window_title);
        const jsonProcess = parseJsonFromText(row.process_name);
        const normalizedType = String(row.event_type || '').replace(/_ended$/, '');
        const key = `${row.student_id}|${normalizedType}`;

        // Only keep camera violation types that admin has enabled (clean teacher UI).
        // This matches snapshot capture config (e.g. phone_violation, multiple_persons).
        if (normalizedType && !enabledCameraTypes.has(normalizedType)) {
          // If this is an *_ended event for a type we filtered out, ensure we don't keep a dangling open entry.
          if (String(row.event_type || '').endsWith('_ended')) {
            openCameraViolations.delete(key);
          }
          continue;
        }

        const screenshotPath =
          extractScreenshotPath(row.window_title, row.process_name) ||
          (jsonWindow && typeof jsonWindow.screenshotPath === 'string' ? jsonWindow.screenshotPath : null) ||
          (jsonProcess && typeof jsonProcess.screenshotPath === 'string' ? jsonProcess.screenshotPath : null);

        if (String(row.event_type || '').endsWith('_ended')) {
          const started = openCameraViolations.get(key);
          const endedMeta = jsonWindow && typeof jsonWindow === 'object' ? jsonWindow : {};
          const durationSecondsFromEnded =
            Number.isFinite(endedMeta.durationSeconds) ? Number(endedMeta.durationSeconds) : null;
          if (started) {
            started.durationSeconds = durationSecondsFromEnded;
            started.endedAt = row.timestamp;
            if (!started.screenshotPath && screenshotPath) started.screenshotPath = screenshotPath;
            cameraViolations.push(started);
            openCameraViolations.delete(key);
          }
          continue;
        }

        const startMeta = jsonWindow && typeof jsonWindow === 'object' ? jsonWindow : {};
        const startedAt = toIsoOrNull(startMeta.startedAt) || row.timestamp;
        openCameraViolations.set(key, {
          cameraViolationId: row.event_id,
          examId: row.exam_id,
          studentId: row.student_id,
          studentName: row.student_name,
          username: row.username,
          violationType: normalizedType,
          timestamp: startedAt,
          details: row.window_title || row.process_name || '',
          durationSeconds: null,
          screenshotPath: screenshotPath || null
        });
      }

      // Add still-open camera violations (no end event yet).
      for (const pending of openCameraViolations.values()) {
        cameraViolations.push(pending);
      }

      // De-dupe camera violations to avoid flooding the UI with repeated events.
      // Keep at most one event per (student,type) per cooldown window; prefer entries that include a screenshot.
      const dedupedCameraViolations = [];
      const lastKeptByKey = new Map(); // key -> { tsMs, idx }
      for (const v of cameraViolations) {
        const type = String(v.violationType || '').trim();
        const studentId = String(v.studentId || '').trim();
        if (!type || !studentId) continue;
        const ts = new Date(v.timestamp).getTime();
        if (!Number.isFinite(ts)) {
          dedupedCameraViolations.push(v);
          continue;
        }
        const dk = `${studentId}|${type}`;
        const last = lastKeptByKey.get(dk);
        if (!last) {
          lastKeptByKey.set(dk, { tsMs: ts, idx: dedupedCameraViolations.length });
          dedupedCameraViolations.push(v);
          continue;
        }
        const withinWindow = Math.abs(ts - last.tsMs) < snapshotCooldownSeconds * 1000;
        if (!withinWindow) {
          lastKeptByKey.set(dk, { tsMs: ts, idx: dedupedCameraViolations.length });
          dedupedCameraViolations.push(v);
          continue;
        }

        const existing = dedupedCameraViolations[last.idx];
        const existingHasShot = !!existing?.screenshotPath;
        const currentHasShot = !!v.screenshotPath;
        const existingDuration = typeof existing?.durationSeconds === 'number' ? existing.durationSeconds : null;
        const currentDuration = typeof v.durationSeconds === 'number' ? v.durationSeconds : null;

        // Replace if current provides better evidence (screenshot) or longer duration.
        const shouldReplace =
          (!existingHasShot && currentHasShot) ||
          (existingHasShot === currentHasShot &&
            currentDuration != null &&
            (existingDuration == null || currentDuration > existingDuration));

        if (shouldReplace) {
          dedupedCameraViolations[last.idx] = v;
          lastKeptByKey.set(dk, { tsMs: ts, idx: last.idx });
        }
      }

      const reviewRows = this.db.prepare(`
        SELECT student_id, is_reviewed, is_suspicious, reviewed_at, notes, updated_at
        FROM integrity_case_reviews
        WHERE exam_id = ?
      `).all(examId);
      const reviewByStudent = new Map(
        reviewRows.map((row) => [
          row.student_id,
          {
            isReviewed: !!row.is_reviewed,
            isSuspicious: !!row.is_suspicious,
            reviewedAt: row.reviewed_at || null,
            reviewNotes: row.notes || '',
            reviewUpdatedAt: row.updated_at || null
          }
        ])
      );

      const perStudent = new Map();
      const ensureStudent = (studentId, studentName, username) => {
        if (!perStudent.has(studentId)) {
          const reviewState = reviewByStudent.get(studentId) || {
            isReviewed: false,
            isSuspicious: false,
            reviewedAt: null,
            reviewNotes: '',
            reviewUpdatedAt: null
          };
          perStudent.set(studentId, {
            studentId,
            studentName,
            username,
            appViolationCount: 0,
            cameraViolationCount: 0,
            ...reviewState
          });
        }
        return perStudent.get(studentId);
      };

      for (const violation of appViolations) {
        const row = ensureStudent(violation.studentId, violation.studentName, violation.username);
        row.appViolationCount += 1;
      }
      for (const violation of dedupedCameraViolations) {
        const row = ensureStudent(violation.studentId, violation.studentName, violation.username);
        row.cameraViolationCount += 1;
      }

      const students = Array.from(perStudent.values())
        .map((row) => {
          const total = row.appViolationCount + row.cameraViolationCount;
          let riskLevel = 'low';
          if (total >= 8 || row.cameraViolationCount >= 4) riskLevel = 'high';
          else if (total >= 3 || row.cameraViolationCount >= 1) riskLevel = 'medium';
          return {
            ...row,
            totalViolationCount: total,
            riskLevel
          };
        })
        .sort((a, b) => {
          if (a.isReviewed !== b.isReviewed) return a.isReviewed ? 1 : -1;
          if (a.isSuspicious !== b.isSuspicious) return a.isSuspicious ? -1 : 1;
          return b.totalViolationCount - a.totalViolationCount;
        });

      return {
        students,
        appViolations,
        cameraViolations: dedupedCameraViolations
      };
    } catch (error) {
      console.error('Error getting integrity review data by exam:', error);
      throw error;
    }
  }

  getIntegrityCaseReview(examId, studentId) {
    return this.db.prepare(`
      SELECT review_id, exam_id, student_id, teacher_id, is_reviewed, is_suspicious, reviewed_at, notes, updated_at
      FROM integrity_case_reviews
      WHERE exam_id = ? AND student_id = ?
      LIMIT 1
    `).get(examId, studentId);
  }

  upsertIntegrityCaseReview({ examId, studentId, teacherId, isReviewed, isSuspicious, notes }) {
    const existing = this.getIntegrityCaseReview(examId, studentId);
    const resolvedReviewed = typeof isReviewed === 'boolean' ? isReviewed : !!existing?.is_reviewed;
    const resolvedSuspicious = typeof isSuspicious === 'boolean' ? isSuspicious : !!existing?.is_suspicious;
    const resolvedNotes = notes != null ? String(notes) : (existing?.notes || null);
    const reviewedAt = resolvedReviewed ? new Date().toISOString() : null;

    if (!existing) {
      this.db.prepare(`
        INSERT INTO integrity_case_reviews (
          review_id, exam_id, student_id, teacher_id, is_reviewed, is_suspicious, reviewed_at, notes, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `).run(
        uuidv4(),
        examId,
        studentId,
        teacherId,
        resolvedReviewed ? 1 : 0,
        resolvedSuspicious ? 1 : 0,
        reviewedAt,
        resolvedNotes
      );
    } else {
      this.db.prepare(`
        UPDATE integrity_case_reviews
        SET teacher_id = ?,
            is_reviewed = ?,
            is_suspicious = ?,
            reviewed_at = ?,
            notes = ?,
            updated_at = datetime('now')
        WHERE exam_id = ? AND student_id = ?
      `).run(
        teacherId,
        resolvedReviewed ? 1 : 0,
        resolvedSuspicious ? 1 : 0,
        reviewedAt,
        resolvedNotes,
        examId,
        studentId
      );
    }

    return this.getIntegrityCaseReview(examId, studentId);
  }

  /**
   * Get exam participants count (students who started the exam)
   */
  getExamParticipantsCount(examId) {
    try {
      const stmt = this.db.prepare(`
        SELECT COUNT(DISTINCT student_id) as participant_count
        FROM events 
        WHERE exam_id = ? AND event_type = 'exam_start'
      `);

      const result = stmt.get(examId);
      return result ? result.participant_count : 0;
    } catch (error) {
      console.error('Error getting exam participants count:', error);
      throw error;
    }
  }

  /**
   * Get student exam history (ended exams or submitted exams)
   */
  getStudentExamHistory(studentId) {
    try {
      const stmt = this.db.prepare(`
        SELECT DISTINCT e.exam_id, e.title, e.start_time, e.end_time, 
               e.teacher_id, e.course_id, e.allowed_apps,
               u.full_name as teacher_name,
               c.course_name, c.course_code,
               es.submitted_at,
               e.created_at
        FROM exams e
        JOIN users u ON e.teacher_id = u.user_id
        LEFT JOIN courses c ON e.course_id = c.course_id
        LEFT JOIN exam_submissions es ON e.exam_id = es.exam_id AND es.student_id = ?
        JOIN enrollments en ON e.course_id = en.course_id AND en.student_id = ?
        WHERE (datetime(e.end_time) <= datetime('now', 'localtime') OR es.submission_id IS NOT NULL)
        ORDER BY e.end_time DESC
      `);

      const history = stmt.all(studentId, studentId);

      // Parse allowed_apps JSON
      return history.map(exam => ({
        ...exam,
        allowed_apps: JSON.parse(exam.allowed_apps || '[]'),
        status: exam.submitted_at ? 'submitted' : 'completed'
      }));
    } catch (error) {
      console.error('Error getting student exam history:', error);
      throw error;
    }
  }

  /**
   * Register or update device
   */
  registerDevice(deviceId, deviceName = null) {
    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO devices (device_id, device_name, last_used)
        VALUES (?, ?, datetime('now'))
      `);

      const result = stmt.run(deviceId, deviceName);
      return result.changes > 0;
    } catch (error) {
      console.error('Error registering device:', error);
      throw error;
    }
  }

  /**
   * Initialize default admin account and system settings
   */
  async initializeDefaultAdmin() {
    try {
      // Check if any admin account exists
      const adminExists = this.db.prepare('SELECT COUNT(*) as count FROM users WHERE role = ?').get('admin');

      if (adminExists.count === 0) {
        // Create default admin account only if no admin exists
        await this.createUser({
          username: 'admin',
          password: 'admin123',
          role: 'admin',
          fullName: 'System Administrator',
          email: 'admin@labguard.com'
        });
        console.log('Created default admin account: admin/admin123');
        console.log('IMPORTANT: Please change the default admin password after first login!');
      }

      // Initialize default system settings
      this.setSystemSetting('face_matching_threshold', 0.45, 'number', 'Face recognition matching threshold');
      this.setSystemSetting('max_login_attempts', 5, 'number', 'Maximum login attempts before lockout');
      this.setSystemSetting('session_timeout', 28800000, 'number', 'Session timeout in milliseconds (8 hours)');

      // Initialize snapshot configuration settings (only if not already set)
      const existingSnapshotConfig = this.getSystemSetting('snapshot_enabled_violations');
      if (!existingSnapshotConfig) {
        this.setSystemSetting(
          'snapshot_enabled_violations', 
          ['phone_violation', 'multiple_persons'], 
          'json', 
          'List of violations that trigger snapshot capture'
        );
        this.setSystemSetting('snapshot_cooldown_seconds', 7, 'number', 'Cooldown between snapshots of same violation type');
        this.setSystemSetting('enable_violation_snapshots', true, 'boolean', 'Enable/disable violation snapshot capture');
        console.log('Initialized default snapshot configuration');
      }

      return true;
    } catch (error) {
      console.error('Error initializing default admin:', error);
      throw error;
    }
  }

  /**
   * Clear all data from database (for development/testing)
   */
  clearAllData() {
    try {
      this.db.exec('DELETE FROM audit_logs');
      this.db.exec('DELETE FROM face_embeddings');
      this.db.exec('DELETE FROM events');
      this.db.exec('DELETE FROM exams');
      this.db.exec('DELETE FROM users');
      this.db.exec('DELETE FROM devices');
      this.db.exec('DELETE FROM system_settings');
      console.log('Database cleared successfully');
    } catch (error) {
      console.error('Error clearing database:', error);
      throw error;
    }
  }

  /**
   * Clear only audit logs
   */
  clearAuditLogs() {
    try {
      const result = this.db.prepare('DELETE FROM audit_logs').run();
      console.log(`Cleared ${result.changes} audit log entries`);
      return result.changes;
    } catch (error) {
      console.error('Error clearing audit logs:', error);
      throw error;
    }
  }

  /**
   * Check if system has been set up with users
   */
  isSystemSetup() {
    try {
      const userCount = this.db.prepare('SELECT COUNT(*) as count FROM users').get().count;
      const nonAdminCount = this.db.prepare('SELECT COUNT(*) as count FROM users WHERE role != ?').get('admin').count;

      return {
        hasUsers: userCount > 0,
        hasNonAdminUsers: nonAdminCount > 0,
        totalUsers: userCount,
        nonAdminUsers: nonAdminCount
      };
    } catch (error) {
      console.error('Error checking system setup:', error);
      return {
        hasUsers: false,
        hasNonAdminUsers: false,
        totalUsers: 0,
        nonAdminUsers: 0
      };
    }
  }

  // FACE EMBEDDING METHODS

  /**
   * Store face embedding for a user
   */
  async storeFaceEmbedding(userId, embeddingData, confidenceScore = null) {
    try {
      const embeddingId = uuidv4();

      // Convert embedding array to Buffer for BLOB storage
      const embeddingBuffer = Buffer.from(JSON.stringify(embeddingData));

      const stmt = this.db.prepare(`
        INSERT INTO face_embeddings (embedding_id, user_id, embedding_data, confidence_score)
        VALUES (?, ?, ?, ?)
      `);

      const result = stmt.run(embeddingId, userId, embeddingBuffer, confidenceScore);

      // Update user's face registration status
      this.updateUserFaceStatus(userId, true);

      return {
        embeddingId,
        userId,
        confidenceScore,
        createdAt: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error storing face embedding:', error);
      throw error;
    }
  }

  /**
   * Get face embedding for a user
   */
  getFaceEmbedding(userId) {
    try {
      const stmt = this.db.prepare(`
        SELECT embedding_id, embedding_data, embedding_version, confidence_score, created_at
        FROM face_embeddings 
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT 1
      `);

      const result = stmt.get(userId);

      if (result) {
        // Convert Buffer back to array
        result.embedding_data = JSON.parse(result.embedding_data.toString());
      }

      return result;
    } catch (error) {
      console.error('Error getting face embedding:', error);
      throw error;
    }
  }

  /**
   * Delete face embedding for a user
   */
  deleteFaceEmbedding(userId) {
    try {
      const stmt = this.db.prepare('DELETE FROM face_embeddings WHERE user_id = ?');
      const result = stmt.run(userId);

      // Update user's face registration status
      if (result.changes > 0) {
        this.updateUserFaceStatus(userId, false);
      }

      return result.changes > 0;
    } catch (error) {
      console.error('Error deleting face embedding:', error);
      throw error;
    }
  }

  /**
   * Update user's face registration status
   */
  updateUserFaceStatus(userId, hasRegisteredFace) {
    try {
      const stmt = this.db.prepare(`
        UPDATE users 
        SET has_registered_face = ?, face_registration_date = ?
        WHERE user_id = ?
      `);

      const registrationDate = hasRegisteredFace ? new Date().toISOString() : null;
      const result = stmt.run(hasRegisteredFace ? 1 : 0, registrationDate, userId);

      return result.changes > 0;
    } catch (error) {
      console.error('Error updating user face status:', error);
      throw error;
    }
  }

  /**
   * Bulk create users from CSV data
   */
  async bulkCreateUsers(csvData, createdBy = null) {
    try {
      const results = {
        successful: [],
        failed: [],
        total: csvData.length
      };

      for (const userData of csvData) {
        try {
          const user = await this.createUser({
            ...userData,
            createdBy
          });
          results.successful.push(user);
        } catch (error) {
          results.failed.push({
            userData,
            error: error.message
          });
        }
      }

      return results;
    } catch (error) {
      console.error('Error in bulk user creation:', error);
      throw error;
    }
  }

  // SYSTEM SETTINGS METHODS

  /**
   * Get system setting by key
   */
  getSystemSetting(key) {
    try {
      const stmt = this.db.prepare(`
        SELECT setting_value, setting_type 
        FROM system_settings 
        WHERE setting_key = ?
      `);

      const result = stmt.get(key);

      if (result) {
        // Convert value based on type
        switch (result.setting_type) {
          case 'number':
            return parseFloat(result.setting_value);
          case 'boolean':
            return result.setting_value === 'true';
          case 'json':
            return JSON.parse(result.setting_value);
          default:
            return result.setting_value;
        }
      }

      return null;
    } catch (error) {
      console.error('Error getting system setting:', error);
      throw error;
    }
  }

  /**
   * Set system setting
   */
  setSystemSetting(key, value, type = 'string', description = null, updatedBy = null) {
    try {
      let stringValue;

      // Convert value to string based on type
      switch (type) {
        case 'json':
          stringValue = JSON.stringify(value);
          break;
        case 'boolean':
          stringValue = value ? 'true' : 'false';
          break;
        default:
          stringValue = String(value);
      }

      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO system_settings 
        (setting_key, setting_value, setting_type, description, updated_by, updated_at)
        VALUES (?, ?, ?, ?, ?, datetime('now'))
      `);

      const result = stmt.run(key, stringValue, type, description, updatedBy);
      return result.changes > 0;
    } catch (error) {
      console.error('Error setting system setting:', error);
      throw error;
    }
  }

  // AUDIT LOGGING METHODS

  /**
   * Log audit event
   */
  logAuditEvent(userId, action, details = null, ipAddress = null, userAgent = null) {
    try {
      const logId = uuidv4();

      const stmt = this.db.prepare(`
        INSERT INTO audit_logs (log_id, user_id, action, details, ip_address, user_agent)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      const result = stmt.run(
        logId,
        userId,
        action,
        details ? JSON.stringify(details) : null,
        ipAddress,
        userAgent
      );

      return {
        logId,
        userId,
        action,
        details,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error logging audit event:', error);
      throw error;
    }
  }

  /**
   * Get audit logs with optional filtering
   */
  getAuditLogs(filters = {}) {
    try {
      let query = `
        SELECT al.*, u.username, u.full_name
        FROM audit_logs al
        LEFT JOIN users u ON al.user_id = u.user_id
        WHERE 1=1
      `;

      const params = [];

      if (filters.userId) {
        query += ' AND al.user_id = ?';
        params.push(filters.userId);
      }

      if (filters.action) {
        query += ' AND al.action = ?';
        params.push(filters.action);
      }

      if (filters.startDate) {
        query += ' AND al.timestamp >= ?';
        params.push(filters.startDate);
      }

      if (filters.endDate) {
        query += ' AND al.timestamp <= ?';
        params.push(filters.endDate);
      }

      query += ' ORDER BY al.timestamp DESC';

      if (filters.limit) {
        query += ' LIMIT ?';
        params.push(filters.limit);
      }

      const stmt = this.db.prepare(query);
      const results = stmt.all(...params);

      // Parse details JSON for each log
      return results.map(log => ({
        ...log,
        details: log.details ? JSON.parse(log.details) : null
      }));
    } catch (error) {
      console.error('Error getting audit logs:', error);
      throw error;
    }
  }

  /**
   * Submit exam
   */
  submitExam(examId, studentId, filesData = []) {
    try {
      const { v4: uuidv4 } = require('uuid');
      const submissionId = uuidv4();

      const stmt = this.db.prepare(`
        INSERT INTO exam_submissions (submission_id, exam_id, student_id, files_data, status)
        VALUES (?, ?, ?, ?, 'submitted')
      `);

      stmt.run(submissionId, examId, studentId, JSON.stringify(filesData));

      return {
        submissionId,
        examId,
        studentId,
        submittedAt: new Date().toISOString(),
        status: 'submitted'
      };
    } catch (error) {
      console.error('Error submitting exam:', error);
      throw error;
    }
  }

  /**
   * Get exam submission
   */
  getExamSubmission(examId, studentId) {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM exam_submissions
        WHERE exam_id = ? AND student_id = ?
        ORDER BY submitted_at DESC
        LIMIT 1
      `);

      return stmt.get(examId, studentId);
    } catch (error) {
      console.error('Error getting exam submission:', error);
      throw error;
    }
  }

  /**
   * Unsubmit exam (delete submission)
   */
  unsubmitExam(examId, studentId) {
    try {
      const stmt = this.db.prepare(`
        DELETE FROM exam_submissions
        WHERE exam_id = ? AND student_id = ?
      `);

      stmt.run(examId, studentId);
      return true;
    } catch (error) {
      console.error('Error unsubmitting exam:', error);
      throw error;
    }
  }

  // --- CODE EVALUATION MODULE: exam_questions, question_test_cases, code_evaluations, test_case_results ---

  /**
   * Insert exam question
   */
  insertExamQuestion(data) {
    const questionId = data.question_id || uuidv4();
    const stmt = this.db.prepare(`
      INSERT INTO exam_questions (question_id, exam_id, title, description, source_page, max_score, constraints_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      questionId,
      data.exam_id,
      data.title || '',
      data.description || null,
      data.source_page ?? null,
      data.max_score ?? 100,
      this._toJsonText(data.constraints_json ?? data.constraints ?? null)
    );
    return this.getExamQuestionById(questionId);
  }

  /**
   * Get exam question by ID
   */
  getExamQuestionById(questionId) {
    const row = this.db.prepare('SELECT * FROM exam_questions WHERE question_id = ?').get(questionId);
    return row ? this._rowToExamQuestion(row) : null;
  }

  /**
   * Get all questions for an exam
   */
  getExamQuestionsByExamId(examId) {
    const rows = this.db.prepare('SELECT * FROM exam_questions WHERE exam_id = ? ORDER BY created_at ASC').all(examId);
    return rows.map(r => this._rowToExamQuestion(r));
  }

  /**
   * Update exam question
   */
  updateExamQuestion(questionId, data) {
    const updates = [];
    const params = [];
    const allowed = ['title', 'description', 'source_page', 'max_score', 'constraints_json'];
    for (const key of allowed) {
      if (data[key] !== undefined) {
        const col = key.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');
        let val = data[key];
        if (key === 'constraints_json') {
          val = this._toJsonText(val);
        }
        updates.push(`${col} = ?`);
        params.push(val);
      }
    }
    if (updates.length === 0) return false;
    params.push(questionId);
    const stmt = this.db.prepare(`UPDATE exam_questions SET ${updates.join(', ')} WHERE question_id = ?`);
    stmt.run(...params);
    return true;
  }

  /**
   * Delete exam question (caller should delete test cases first or cascade)
   */
  deleteExamQuestion(questionId) {
    this.db.prepare('DELETE FROM question_test_cases WHERE question_id = ?').run(questionId);
    const result = this.db.prepare('DELETE FROM exam_questions WHERE question_id = ?').run(questionId);
    return result.changes > 0;
  }

  getQuestionDependencyStats(questionId) {
    const testCaseCount = this.db
      .prepare('SELECT COUNT(*) AS count FROM question_test_cases WHERE question_id = ?')
      .get(questionId);
    const evaluationCount = this.db
      .prepare('SELECT COUNT(*) AS count FROM code_evaluations WHERE question_id = ?')
      .get(questionId);
    return {
      testCaseCount: Number(testCaseCount?.count || 0),
      evaluationCount: Number(evaluationCount?.count || 0)
    };
  }

  _rowToExamQuestion(row) {
    return {
      question_id: row.question_id,
      exam_id: row.exam_id,
      title: row.title,
      description: row.description,
      source_page: row.source_page,
      max_score: row.max_score,
      constraints_json: this._fromJsonText(row.constraints_json),
      created_at: row.created_at
    };
  }

  /**
   * Insert question test case
   */
  insertQuestionTestCase(data) {
    const testCaseId = data.test_case_id || uuidv4();
    const stmt = this.db.prepare(`
      INSERT INTO question_test_cases (
        test_case_id, question_id, name, input, expected_output,
        is_hidden, is_edge_case, is_generated, time_limit_ms, memory_limit_kb, weight, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      testCaseId,
      data.question_id,
      data.name || '',
      data.input ?? null,
      data.expected_output ?? null,
      data.is_hidden ? 1 : 0,
      data.is_edge_case ? 1 : 0,
      data.is_generated ? 1 : 0,
      data.time_limit_ms ?? null,
      data.memory_limit_kb ?? null,
      data.weight ?? 1.0,
      data.metadata ? JSON.stringify(data.metadata) : null
    );
    return this.getQuestionTestCaseById(testCaseId);
  }

  /**
   * Get test case by ID
   */
  getQuestionTestCaseById(testCaseId) {
    const row = this.db.prepare('SELECT * FROM question_test_cases WHERE test_case_id = ?').get(testCaseId);
    return row ? this._rowToQuestionTestCase(row) : null;
  }

  /**
   * Get all test cases for a question
   */
  getQuestionTestCasesByQuestionId(questionId) {
    const rows = this.db.prepare('SELECT * FROM question_test_cases WHERE question_id = ?').all(questionId);
    return rows.map(r => this._rowToQuestionTestCase(r));
  }

  /**
   * Update question test case
   */
  updateQuestionTestCase(testCaseId, data) {
    const updates = [];
    const params = [];
    const allowed = ['name', 'input', 'expected_output', 'is_hidden', 'is_edge_case', 'is_generated', 'time_limit_ms', 'memory_limit_kb', 'weight', 'metadata'];
    for (const key of allowed) {
      if (data[key] !== undefined) {
        const col = key.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');
        let val = data[key];
        if (key === 'metadata' && val != null) {
          val = JSON.stringify(val);
        }
        if (key === 'is_hidden' || key === 'is_edge_case' || key === 'is_generated') {
          // Normalize booleans to integers for SQLite
          val = val ? 1 : 0;
        }
        updates.push(`${col} = ?`);
        params.push(val);
      }
    }
    if (updates.length === 0) return false;
    params.push(testCaseId);
    const stmt = this.db.prepare(`UPDATE question_test_cases SET ${updates.join(', ')} WHERE test_case_id = ?`);
    stmt.run(...params);
    return true;
  }

  /**
   * Delete question test case
   */
  deleteQuestionTestCase(testCaseId) {
    const result = this.db.prepare('DELETE FROM question_test_cases WHERE test_case_id = ?').run(testCaseId);
    return result.changes > 0;
  }

  getTestCaseDependencyStats(testCaseId) {
    const evalResultCount = this.db
      .prepare('SELECT COUNT(*) AS count FROM test_case_results WHERE test_case_id = ?')
      .get(testCaseId);
    return {
      evalResultCount: Number(evalResultCount?.count || 0)
    };
  }

  _rowToQuestionTestCase(row) {
    const metadata = row.metadata ? JSON.parse(row.metadata) : null;
    return {
      test_case_id: row.test_case_id,
      question_id: row.question_id,
      name: row.name,
      input: row.input,
      expected_output: row.expected_output,
      is_hidden: !!row.is_hidden,
      is_edge_case: !!row.is_edge_case,
      is_generated: !!row.is_generated,
      time_limit_ms: row.time_limit_ms,
      memory_limit_kb: row.memory_limit_kb,
      weight: row.weight,
      metadata,
      description:
        metadata && typeof metadata.description === 'string' && metadata.description.trim()
          ? metadata.description.trim()
          : row.name || ''
    };
  }

  /**
   * Insert code evaluation
   */
  insertCodeEvaluation(data) {
    const evaluationId = data.evaluation_id || uuidv4();
    const score = data.score ?? 0;
    const maxScore = data.max_score ?? 0;
    const manualScore = data.manual_score ?? null;
    const finalScore = manualScore != null ? manualScore : score;
    const stmt = this.db.prepare(`
      INSERT INTO code_evaluations (
        evaluation_id, submission_id, question_id, score, max_score, status,
        compile_exit_code, compile_stdout, compile_stderr, error_summary, manual_score, final_score,
        analysis_breakdown_json, requirement_checks_json, hardcoding_flags_json,
        ai_summary_text, ai_summary_confidence, ai_summary_updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      evaluationId,
      data.submission_id,
      data.question_id,
      score,
      maxScore,
      data.status || 'pending',
      data.compile_exit_code ?? null,
      data.compile_stdout ?? null,
      data.compile_stderr ?? null,
      data.error_summary ?? null,
      manualScore,
      finalScore,
      this._toJsonText(data.analysis_breakdown_json),
      this._toJsonText(data.requirement_checks_json),
      this._toJsonText(data.hardcoding_flags_json),
      data.ai_summary_text ?? null,
      data.ai_summary_confidence ?? null,
      data.ai_summary_updated_at ?? null
    );
    return this.getCodeEvaluationById(evaluationId);
  }

  /**
   * Get code evaluation by ID
   */
  getCodeEvaluationById(evaluationId) {
    const row = this.db.prepare('SELECT * FROM code_evaluations WHERE evaluation_id = ?').get(evaluationId);
    return row ? this._rowToCodeEvaluation(row) : null;
  }

  /**
   * Get code evaluations by submission ID
   */
  getCodeEvaluationsBySubmissionId(submissionId) {
    const rows = this.db.prepare('SELECT * FROM code_evaluations WHERE submission_id = ? ORDER BY created_at ASC').all(submissionId);
    return rows.map(r => this._rowToCodeEvaluation(r));
  }

  /**
   * Get code evaluations by question ID (across all submissions)
   */
  getCodeEvaluationsByQuestionId(questionId) {
    const rows = this.db.prepare('SELECT * FROM code_evaluations WHERE question_id = ? ORDER BY created_at ASC').all(questionId);
    return rows.map(r => this._rowToCodeEvaluation(r));
  }

  /**
   * Update code evaluation (e.g. status, compile_*, score)
   */
  updateCodeEvaluation(evaluationId, data) {
    const updates = [];
    const params = [];
    const allowed = [
      'score',
      'max_score',
      'status',
      'compile_exit_code',
      'compile_stdout',
      'compile_stderr',
      'error_summary',
      'manual_score',
      'analysis_breakdown_json',
      'requirement_checks_json',
      'hardcoding_flags_json',
      'ai_summary_text',
      'ai_summary_confidence',
      'ai_summary_updated_at'
    ];
    for (const key of allowed) {
      if (data[key] !== undefined) {
        const col = key.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');
        let val = data[key];
        if (
          key === 'analysis_breakdown_json' ||
          key === 'requirement_checks_json' ||
          key === 'hardcoding_flags_json'
        ) {
          val = this._toJsonText(val);
        }
        updates.push(`${col} = ?`);
        params.push(val);
      }
    }
    if (updates.length === 0) return false;
    params.push(evaluationId);
    const stmt = this.db.prepare(`UPDATE code_evaluations SET ${updates.join(', ')} WHERE evaluation_id = ?`);
    stmt.run(...params);
    this.recomputeCodeEvaluationFinalScore(evaluationId);
    return true;
  }

  /**
   * Set manual score and recompute final_score (final_score = manual_score if set, else score)
   */
  updateCodeEvaluationManualScore(evaluationId, manualScore) {
    const stmt = this.db.prepare('UPDATE code_evaluations SET manual_score = ? WHERE evaluation_id = ?');
    stmt.run(manualScore, evaluationId);
    return this.recomputeCodeEvaluationFinalScore(evaluationId);
  }

  /**
   * Recompute final_score for an evaluation: final_score = manual_score if not null, else score
   */
  recomputeCodeEvaluationFinalScore(evaluationId) {
    const row = this.db.prepare('SELECT manual_score, score FROM code_evaluations WHERE evaluation_id = ?').get(evaluationId);
    if (!row) return false;
    const finalScore = row.manual_score != null ? row.manual_score : row.score;
    this.db.prepare('UPDATE code_evaluations SET final_score = ? WHERE evaluation_id = ?').run(finalScore, evaluationId);
    return true;
  }

  _rowToCodeEvaluation(row) {
    return {
      evaluation_id: row.evaluation_id,
      submission_id: row.submission_id,
      question_id: row.question_id,
      created_at: row.created_at,
      score: row.score,
      max_score: row.max_score,
      status: row.status,
      compile_exit_code: row.compile_exit_code,
      compile_stdout: row.compile_stdout,
      compile_stderr: row.compile_stderr,
      error_summary: row.error_summary,
      manual_score: row.manual_score,
      final_score: row.final_score,
      analysis_breakdown_json: this._fromJsonText(row.analysis_breakdown_json),
      requirement_checks_json: this._fromJsonText(row.requirement_checks_json),
      hardcoding_flags_json: this._fromJsonText(row.hardcoding_flags_json),
      ai_summary_text: row.ai_summary_text,
      ai_summary_confidence: row.ai_summary_confidence,
      ai_summary_updated_at: row.ai_summary_updated_at
    };
  }

  _toJsonText(value) {
    if (value == null) return null;
    if (typeof value === 'string') return value;
    try {
      return JSON.stringify(value);
    } catch (error) {
      return null;
    }
  }

  _fromJsonText(value) {
    if (value == null) return null;
    if (typeof value !== 'string') return value;
    try {
      return JSON.parse(value);
    } catch (error) {
      return null;
    }
  }

  /**
   * Insert test case result
   */
  insertTestCaseResult(data) {
    const resultId = data.result_id || uuidv4();
    const stmt = this.db.prepare(`
      INSERT INTO test_case_results (
        result_id, evaluation_id, test_case_id, passed, execution_time_ms, memory_kb, exit_code, stdout, stderr
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      resultId,
      data.evaluation_id,
      data.test_case_id,
      data.passed ? 1 : 0,
      data.execution_time_ms ?? null,
      data.memory_kb ?? null,
      data.exit_code ?? null,
      data.stdout ?? null,
      data.stderr ?? null
    );
    return this.getTestCaseResultById(resultId);
  }

  /**
   * Get test case result by ID
   */
  getTestCaseResultById(resultId) {
    const row = this.db.prepare('SELECT * FROM test_case_results WHERE result_id = ?').get(resultId);
    return row ? this._rowToTestCaseResult(row) : null;
  }

  /**
   * Get all test case results for an evaluation
   */
  getTestCaseResultsByEvaluationId(evaluationId) {
    const rows = this.db.prepare(`
      SELECT
        r.*,
        tc.name AS test_case_name,
        tc.input AS test_case_input,
        tc.expected_output AS test_case_expected_output,
        tc.is_hidden AS test_case_is_hidden,
        tc.is_edge_case AS test_case_is_edge_case,
        tc.metadata AS test_case_metadata
      FROM test_case_results r
      LEFT JOIN question_test_cases tc ON tc.test_case_id = r.test_case_id
      WHERE r.evaluation_id = ?
      ORDER BY tc.is_hidden ASC, tc.name ASC, r.result_id ASC
    `).all(evaluationId);
    return rows.map(r => this._rowToTestCaseResult(r));
  }

  /**
   * Update test case result
   */
  updateTestCaseResult(resultId, data) {
    const updates = [];
    const params = [];
    const allowed = ['passed', 'execution_time_ms', 'memory_kb', 'exit_code', 'stdout', 'stderr'];
    for (const key of allowed) {
      if (data[key] !== undefined) {
        const col = key.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');
        let val = data[key];
        if (key === 'passed') {
          val = val ? 1 : 0;
        }
        updates.push(`${col} = ?`);
        params.push(val);
      }
    }
    if (updates.length === 0) return false;
    params.push(resultId);
    const stmt = this.db.prepare(`UPDATE test_case_results SET ${updates.join(', ')} WHERE result_id = ?`);
    stmt.run(...params);
    return true;
  }

  _rowToTestCaseResult(row) {
    const metadata = row.test_case_metadata ? this._fromJsonText(row.test_case_metadata) : null;
    return {
      result_id: row.result_id,
      evaluation_id: row.evaluation_id,
      test_case_id: row.test_case_id,
      passed: !!row.passed,
      execution_time_ms: row.execution_time_ms,
      memory_kb: row.memory_kb,
      exit_code: row.exit_code,
      stdout: row.stdout,
      stderr: row.stderr,
      name: row.test_case_name || null,
      input: row.test_case_input ?? null,
      expected_output: row.test_case_expected_output ?? null,
      is_hidden: row.test_case_is_hidden == null ? null : !!row.test_case_is_hidden,
      is_edge_case: row.test_case_is_edge_case == null ? null : !!row.test_case_is_edge_case,
      metadata,
      description:
        metadata && typeof metadata.description === 'string' && metadata.description.trim()
          ? metadata.description.trim()
          : row.test_case_name || null
    };
  }

  _extractQuestionRequirementSummary(constraints) {
    const c = constraints && typeof constraints === 'object' ? constraints : {};
    return {
      problem_type:
        typeof c.problem_type === 'string' && c.problem_type.trim()
          ? c.problem_type.trim()
          : 'basic_programming',
      required_concepts: Array.isArray(c.required_concepts)
        ? c.required_concepts.filter((item) => typeof item === 'string' && item.trim())
        : [],
      requirements_mode:
        c.requirements_mode === 'manual' || c.requirements_mode === 'auto'
          ? c.requirements_mode
          : 'auto',
      is_pattern_question: !!c.is_pattern_question,
      difficulty:
        typeof c.difficulty === 'string' && c.difficulty.trim() ? c.difficulty.trim() : 'medium',
      expected_complexity:
        typeof c.expected_complexity === 'string' && c.expected_complexity.trim()
          ? c.expected_complexity.trim()
          : 'unspecified'
    };
  }

  _isEvaluationHardcoded(evaluation) {
    const hardcoding = evaluation && evaluation.hardcoding_flags_json;
    if (!hardcoding || typeof hardcoding !== 'object') return false;
    const suspicion = String(hardcoding.suspicion_level || 'low').toLowerCase();
    return suspicion === 'medium' || suspicion === 'high';
  }

  _isConceptRequirementMet(evaluation) {
    const requirementChecks = evaluation && evaluation.requirement_checks_json;
    if (!requirementChecks || typeof requirementChecks !== 'object') return true;
    const unmet = Array.isArray(requirementChecks.unmet_requirements)
      ? requirementChecks.unmet_requirements
      : [];
    return unmet.length === 0;
  }

  /**
   * Get all students who have submissions in this teacher's exams.
   */
  getAllStudentsByTeacher(teacherId) {
    const rows = this.db.prepare(`
      SELECT
        u.user_id,
        u.full_name AS name,
        COALESCE(u.email, '') AS email,
        COUNT(DISTINCT es.exam_id) AS examsAttempted,
        COUNT(DISTINCT es.submission_id) AS totalSubmissions,
        MAX(es.submitted_at) AS lastActive
      FROM users u
      JOIN exam_submissions es ON es.student_id = u.user_id
      JOIN exams e ON e.exam_id = es.exam_id
      WHERE e.teacher_id = ?
        AND u.role = 'student'
      GROUP BY u.user_id
      ORDER BY u.full_name ASC
    `).all(teacherId);

    const avgStmt = this.db.prepare(`
      WITH latest_per_question AS (
        SELECT ce.*
        FROM code_evaluations ce
        JOIN (
          SELECT submission_id, question_id, MAX(created_at) AS created_at
          FROM code_evaluations
          GROUP BY submission_id, question_id
        ) latest
          ON latest.submission_id = ce.submission_id
         AND latest.question_id = ce.question_id
         AND latest.created_at = ce.created_at
        JOIN exam_submissions es ON es.submission_id = ce.submission_id
        JOIN exams e ON e.exam_id = es.exam_id
        WHERE e.teacher_id = ?
          AND es.student_id = ?
      )
      SELECT
        ROUND(AVG(
          CASE
            WHEN COALESCE(max_score, 0) > 0
              THEN (COALESCE(final_score, score, 0) * 100.0) / max_score
            ELSE 0
          END
        ), 1) AS overallAvgScore
      FROM latest_per_question
    `);

    return rows.map((row) => {
      const avgRow = avgStmt.get(teacherId, row.user_id);
      return {
        userId: row.user_id,
        user_id: row.user_id,
        name: row.name,
        email: row.email || '',
        examsAttempted: row.examsAttempted || 0,
        totalSubmissions: row.totalSubmissions || 0,
        overallAvgScore: Number(avgRow?.overallAvgScore ?? 0),
        lastActive: row.lastActive || null
      };
    });
  }

  /**
   * Get latest evaluation-backed submission history for one student across a teacher's exams.
   */
  getStudentSubmissionHistory(studentId, teacherId) {
    const rows = this.db.prepare(`
      WITH latest_per_question AS (
        SELECT ce.*
        FROM code_evaluations ce
        JOIN (
          SELECT submission_id, question_id, MAX(created_at) AS created_at
          FROM code_evaluations
          GROUP BY submission_id, question_id
        ) latest
          ON latest.submission_id = ce.submission_id
         AND latest.question_id = ce.question_id
         AND latest.created_at = ce.created_at
      )
      SELECT
        lpq.evaluation_id,
        lpq.submission_id,
        es.exam_id,
        e.title AS examTitle,
        lpq.question_id,
        q.title AS questionTitle,
        q.constraints_json,
        COALESCE(lpq.final_score, lpq.score, 0) AS score,
        lpq.created_at AS submitted_at,
        'cpp' AS language,
        lpq.status,
        lpq.requirement_checks_json,
        lpq.hardcoding_flags_json
      FROM latest_per_question lpq
      JOIN exam_submissions es ON es.submission_id = lpq.submission_id
      JOIN exams e ON e.exam_id = es.exam_id
      JOIN exam_questions q ON q.question_id = lpq.question_id
      WHERE es.student_id = ?
        AND e.teacher_id = ?
      ORDER BY lpq.created_at ASC
    `).all(studentId, teacherId);

    return rows.map((row) => {
      const constraints = this._fromJsonText(row.constraints_json) || {};
      const summary = this._extractQuestionRequirementSummary(constraints);
      const requirementChecks = this._fromJsonText(row.requirement_checks_json) || {};
      const hardcodingFlags = this._fromJsonText(row.hardcoding_flags_json) || {};
      return {
        evaluation_id: row.evaluation_id,
        submission_id: row.submission_id,
        exam_id: row.exam_id,
        examTitle: row.examTitle,
        question_id: row.question_id,
        questionTitle: row.questionTitle,
        required_concepts: JSON.stringify(summary.required_concepts || []),
        difficulty: summary.difficulty,
        score: Number(row.score || 0),
        submitted_at: row.submitted_at,
        language: row.language || 'cpp',
        concept_passed: (Array.isArray(requirementChecks.unmet_requirements) ? requirementChecks.unmet_requirements.length : 0) === 0 ? 1 : 0,
        hardcoded: this._isEvaluationHardcoded({ hardcoding_flags_json: hardcodingFlags }) ? 1 : 0,
        status: row.status
      };
    });
  }

  /**
   * Get aggregated exam performance for one student.
   */
  getStudentExamPerformance(studentId, teacherId) {
    const history = this.getStudentSubmissionHistory(studentId, teacherId);
    const examMap = new Map();
    for (const row of history) {
      const existing = examMap.get(row.exam_id) || {
        examId: row.exam_id,
        examTitle: row.examTitle,
        examDate: row.submitted_at,
        questionsAttempted: 0,
        scoreTotal: 0,
        passedCount: 0,
        failedCount: 0,
        hardcodingFlags: 0
      };
      existing.questionsAttempted += 1;
      existing.scoreTotal += Number(row.score || 0);
      if (Number(row.score || 0) >= 80) existing.passedCount += 1;
      else existing.failedCount += 1;
      if (row.hardcoded) existing.hardcodingFlags += 1;
      if (!existing.examDate || row.submitted_at < existing.examDate) {
        existing.examDate = row.submitted_at;
      }
      examMap.set(row.exam_id, existing);
    }

    return Array.from(examMap.values())
      .map((exam) => ({
        examId: exam.examId,
        examTitle: exam.examTitle,
        examDate: exam.examDate,
        questionsAttempted: exam.questionsAttempted,
        avgScore:
          exam.questionsAttempted > 0
            ? Math.round((exam.scoreTotal / exam.questionsAttempted) * 10) / 10
            : 0,
        passedCount: exam.passedCount,
        failedCount: exam.failedCount,
        hardcodingFlags: exam.hardcodingFlags
      }))
      .sort((a, b) => new Date(a.examDate) - new Date(b.examDate));
  }

  verifySubmissionBelongsToTeacher(submissionId, teacherId) {
    return this.db.prepare(`
      SELECT es.* FROM exam_submissions es
      JOIN exams e ON e.exam_id = es.exam_id
      WHERE es.submission_id = ? AND e.teacher_id = ?
    `).get(submissionId, teacherId);
  }

  verifyStudentBelongsToTeacher(studentId, teacherId) {
    return this.db.prepare(`
      SELECT es.* FROM exam_submissions es
      JOIN exams e ON e.exam_id = es.exam_id
      WHERE es.student_id = ? AND e.teacher_id = ?
      LIMIT 1
    `).get(studentId, teacherId);
  }

  getSubmissionTestCaseResults(submissionId) {
    const rows = this.db.prepare(`
      WITH latest_eval AS (
        SELECT ce.*
        FROM code_evaluations ce
        JOIN (
          SELECT question_id, MAX(created_at) AS created_at
          FROM code_evaluations
          WHERE submission_id = ?
          GROUP BY question_id
        ) latest
          ON latest.question_id = ce.question_id
         AND latest.created_at = ce.created_at
        WHERE ce.submission_id = ?
      )
      SELECT
        le.submission_id,
        r.test_case_id,
        tc.input AS input_data,
        tc.expected_output,
        r.stdout AS actual_output,
        r.passed,
        0 AS score,
        r.stderr AS error_message,
        tc.metadata AS metadata,
        tc.name
      FROM latest_eval le
      JOIN test_case_results r ON r.evaluation_id = le.evaluation_id
      LEFT JOIN question_test_cases tc ON tc.test_case_id = r.test_case_id
      ORDER BY tc.name ASC, r.result_id ASC
    `).all(submissionId, submissionId);

    return rows.map((row) => {
      const metadata = this._fromJsonText(row.metadata) || {};
      return {
        submission_id: row.submission_id,
        test_case_id: row.test_case_id,
        description:
          typeof metadata.description === 'string' && metadata.description.trim()
            ? metadata.description.trim()
            : row.name || '',
        input_data: row.input_data,
        expected_output: row.expected_output,
        actual_output: row.actual_output,
        passed: row.passed ? 1 : 0,
        score: row.passed ? 100 : 0,
        error_message: row.error_message
      };
    });
  }

  getExamStudentScores(examId) {
    const questionRows = this.getExamQuestionsByExamId(examId);
    const questions = questionRows.map((q, index) => ({
      question_id: q.question_id,
      title: q.title,
      marks: q.max_score || 0,
      question_order: index + 1
    }));

    const students = this.db.prepare(`
      SELECT DISTINCT
        es.student_id,
        u.full_name AS student_name,
        u.username
      FROM exam_submissions es
      JOIN users u ON u.user_id = es.student_id
      WHERE es.exam_id = ?
      ORDER BY u.full_name ASC
    `).all(examId);

    const latestEvaluations = this.db.prepare(`
      WITH latest_per_submission_question AS (
        SELECT ce.*
        FROM code_evaluations ce
        JOIN (
          SELECT submission_id, question_id, MAX(created_at) AS created_at
          FROM code_evaluations
          GROUP BY submission_id, question_id
        ) latest
          ON latest.submission_id = ce.submission_id
         AND latest.question_id = ce.question_id
         AND latest.created_at = ce.created_at
      )
      SELECT
        es.student_id,
        le.question_id,
        le.evaluation_id,
        COALESCE(le.final_score, le.score, 0) AS final_score,
        COALESCE(le.max_score, 0) AS eval_max_score,
        le.requirement_checks_json,
        le.hardcoding_flags_json,
        le.created_at,
        COUNT(*) OVER (PARTITION BY es.student_id, le.question_id) AS attempts
      FROM latest_per_submission_question le
      JOIN exam_submissions es ON es.submission_id = le.submission_id
      WHERE es.exam_id = ?
    `).all(examId);

    const bestMap = new Map();
    for (const row of latestEvaluations) {
      const key = `${row.student_id}|${row.question_id}`;
      const existing = bestMap.get(key);
      const currentPct = row.eval_max_score > 0 ? (Number(row.final_score || 0) * 100) / Number(row.eval_max_score) : 0;
      const existingPct =
        existing && existing.eval_max_score > 0
          ? (Number(existing.final_score || 0) * 100) / Number(existing.eval_max_score)
          : -1;
      if (!existing || currentPct >= existingPct) {
        bestMap.set(key, row);
      }
    }

    const resultStudents = students.map((student) => {
      let totalEarned = 0;
      let totalMax = 0;

      const scores = questions.map((question) => {
        totalMax += Number(question.marks || 0);
        const best = bestMap.get(`${student.student_id}|${question.question_id}`) || null;
        if (!best) {
          return {
            questionId: question.question_id,
            evaluationId: null,
            earnedPct: null,
            earned: null,
            maxMarks: question.marks || 0,
            attempts: 0,
            hardcoded: false,
            conceptFailed: false,
            lastSubmitted: null
          };
        }

        const earnedPct =
          Number(best.eval_max_score || 0) > 0
            ? Math.round((Number(best.final_score || 0) * 10000) / Number(best.eval_max_score || 1)) / 100
            : 0;
        const earned =
          question.marks && question.marks > 0
            ? Math.round(((earnedPct / 100) * Number(question.marks || 0)) * 100) / 100
            : 0;
        totalEarned += earned;
        const requirementChecks = this._fromJsonText(best.requirement_checks_json);
        const hardcodingFlags = this._fromJsonText(best.hardcoding_flags_json);

        return {
          questionId: question.question_id,
          evaluationId: best.evaluation_id,
          earnedPct,
          earned,
          maxMarks: question.marks || 0,
          attempts: Number(best.attempts || 1),
          hardcoded: this._isEvaluationHardcoded({ hardcoding_flags_json: hardcodingFlags }),
          conceptFailed: !this._isConceptRequirementMet({ requirement_checks_json: requirementChecks }),
          lastSubmitted: best.created_at || null
        };
      });

      return {
        studentId: student.student_id,
        studentName: student.student_name,
        username: student.username,
        scores,
        totalEarned: Math.round(totalEarned * 100) / 100,
        totalMax,
        totalPct: totalMax > 0 ? Math.round((totalEarned / totalMax) * 100) : 0
      };
    });

    return { questions, students: resultStudents };
  }

  /**
   * Close database connection
   */
  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

module.exports = DatabaseService;
