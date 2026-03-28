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

      // Create programming_questions table for test case generation
      const progQuestionsExists = this.db.prepare(`
        SELECT name FROM sqlite_master WHERE type='table' AND name='programming_questions'
      `).get();
      if (!progQuestionsExists) {
        this.db.exec(`
          CREATE TABLE programming_questions (
            question_id TEXT PRIMARY KEY,
            exam_id TEXT NOT NULL,
            title TEXT,
            problem_text TEXT NOT NULL,
            sample_input TEXT,
            sample_output TEXT,
            language TEXT DEFAULT 'python',
            time_limit_seconds INTEGER DEFAULT 2,
            memory_limit_mb INTEGER DEFAULT 256,
            sort_order INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (exam_id) REFERENCES exams(exam_id)
          )
        `);
        this.db.exec(`
          CREATE TABLE question_test_cases (
            test_case_id TEXT PRIMARY KEY,
            question_id TEXT NOT NULL,
            input_data TEXT NOT NULL,
            expected_output TEXT NOT NULL,
            description TEXT,
            is_sample INTEGER DEFAULT 0,
            sort_order INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (question_id) REFERENCES programming_questions(question_id)
          )
        `);
        this.db.exec(`
          CREATE TABLE code_submissions (
            submission_id TEXT PRIMARY KEY,
            exam_id TEXT NOT NULL,
            question_id TEXT NOT NULL,
            student_id TEXT NOT NULL,
            source_code TEXT NOT NULL,
            language TEXT NOT NULL,
            passed_count INTEGER DEFAULT 0,
            total_count INTEGER DEFAULT 0,
            score INTEGER DEFAULT 0,
            status TEXT DEFAULT 'pending',
            submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (exam_id) REFERENCES exams(exam_id),
            FOREIGN KEY (question_id) REFERENCES programming_questions(question_id),
            FOREIGN KEY (student_id) REFERENCES users(user_id)
          )
        `);
        this.db.exec(`
          CREATE TABLE submission_results (
            result_id TEXT PRIMARY KEY,
            submission_id TEXT NOT NULL,
            test_case_id TEXT NOT NULL,
            passed INTEGER NOT NULL,
            score INTEGER DEFAULT 0,
            actual_output TEXT,
            execution_time_ms INTEGER,
            error_message TEXT,
            FOREIGN KEY (submission_id) REFERENCES code_submissions(submission_id),
            FOREIGN KEY (test_case_id) REFERENCES question_test_cases(test_case_id)
          )
        `);
        console.log('Created programming_questions, question_test_cases, code_submissions, submission_results tables');
      }

      // Add score column to code_submissions (0-100, replaces pass/fail for grading)
      const codeSubmissionsExists = this.db.prepare(`
        SELECT name FROM sqlite_master WHERE type='table' AND name='code_submissions'
      `).get();
      if (codeSubmissionsExists) {
        const csCols = this.db.prepare("PRAGMA table_info(code_submissions)").all().map(c => c.name);
        if (!csCols.includes('score')) {
          this.db.exec('ALTER TABLE code_submissions ADD COLUMN score INTEGER DEFAULT 0');
          console.log('Added score column to code_submissions');
        }
      }

      // Add score column to submission_results (0-100 per test case)
      const submissionResultsExists = this.db.prepare(`
        SELECT name FROM sqlite_master WHERE type='table' AND name='submission_results'
      `).get();
      if (submissionResultsExists) {
        const srCols = this.db.prepare("PRAGMA table_info(submission_results)").all().map(c => c.name);
        if (!srCols.includes('score')) {
          this.db.exec('ALTER TABLE submission_results ADD COLUMN score INTEGER DEFAULT 0');
          console.log('Added score column to submission_results');
        }
      }

      // Add programming fundamentals columns to programming_questions
      const progQExists = this.db.prepare(`
        SELECT name FROM sqlite_master WHERE type='table' AND name='programming_questions'
      `).get();
      if (progQExists) {
        const pqCols = this.db.prepare("PRAGMA table_info(programming_questions)").all().map(c => c.name);
        if (!pqCols.includes('required_concepts')) {
          this.db.exec('ALTER TABLE programming_questions ADD COLUMN required_concepts TEXT');
          console.log('Added required_concepts to programming_questions');
        }
        if (!pqCols.includes('concept_threshold')) {
          this.db.exec('ALTER TABLE programming_questions ADD COLUMN concept_threshold INTEGER DEFAULT 99');
          console.log('Added concept_threshold to programming_questions');
        }
        if (!pqCols.includes('is_pattern_question')) {
          this.db.exec('ALTER TABLE programming_questions ADD COLUMN is_pattern_question INTEGER DEFAULT 0');
          console.log('Added is_pattern_question to programming_questions');
        }
        if (!pqCols.includes('reference_solution')) {
          this.db.exec('ALTER TABLE programming_questions ADD COLUMN reference_solution TEXT');
          console.log('Added reference_solution to programming_questions');
        }
        if (!pqCols.includes('max_marks')) {
          this.db.exec('ALTER TABLE programming_questions ADD COLUMN max_marks INTEGER DEFAULT 20');
          console.log('Added max_marks to programming_questions');
        }
      }

      // Add concept compliance to code_submissions
      if (codeSubmissionsExists) {
        const csCols2 = this.db.prepare("PRAGMA table_info(code_submissions)").all().map(c => c.name);
        if (!csCols2.includes('concept_passed')) {
          this.db.exec('ALTER TABLE code_submissions ADD COLUMN concept_passed INTEGER DEFAULT 1');
          console.log('Added concept_passed to code_submissions');
        }
        if (!csCols2.includes('concept_details')) {
          this.db.exec('ALTER TABLE code_submissions ADD COLUMN concept_details TEXT');
          console.log('Added concept_details to code_submissions');
        }
        if (!csCols2.includes('hardcoded')) {
          this.db.exec('ALTER TABLE code_submissions ADD COLUMN hardcoded INTEGER DEFAULT 0');
          console.log('Added hardcoded to code_submissions');
        }
        if (!csCols2.includes('hardcoded_reason')) {
          this.db.exec('ALTER TABLE code_submissions ADD COLUMN hardcoded_reason TEXT');
          console.log('Added hardcoded_reason to code_submissions');
        }
      }

      // Add updated_at column to exams table (for timer-reset tracking)
      const examCols = this.db.prepare("PRAGMA table_info(exams)").all().map(c => c.name);
      if (!examCols.includes('updated_at')) {
        this.db.exec('ALTER TABLE exams ADD COLUMN updated_at DATETIME');
        console.log('Added updated_at to exams');
      }

      // Student exam sessions table — tracks per-student start time for duration-based timer
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS student_exam_sessions (
          id TEXT PRIMARY KEY,
          exam_id TEXT NOT NULL,
          student_id TEXT NOT NULL,
          started_at DATETIME NOT NULL,
          exam_updated_at DATETIME,
          UNIQUE(exam_id, student_id),
          FOREIGN KEY (exam_id) REFERENCES exams(exam_id),
          FOREIGN KEY (student_id) REFERENCES users(user_id)
        )
      `);
      console.log('student_exam_sessions table ready');

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
        SELECT exam_id, teacher_id, title, pdf_path, start_time, end_time, allowed_apps, created_at, updated_at
        FROM exams
        WHERE exam_id = ?
      `);

      const exam = stmt.get(examId);

      if (exam) {
        const durationMinutes = exam.start_time && exam.end_time
          ? Math.round((new Date(exam.end_time) - new Date(exam.start_time)) / 60000)
          : 120;
        return {
          examId: exam.exam_id,
          teacherId: exam.teacher_id,
          title: exam.title,
          pdfPath: exam.pdf_path,
          startTime: exam.start_time,
          endTime: exam.end_time,
          allowedApps: JSON.parse(exam.allowed_apps),
          createdAt: exam.created_at,
          updatedAt: exam.updated_at || null,
          duration: durationMinutes
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
      const { title, pdfPath, startTime, endTime, allowedApps, updatedAt } = updateData;
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

      // Always stamp updated_at so student sessions can detect changes
      updates.push('updated_at = ?');
      params.push(updatedAt || new Date().toISOString());

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
        // Delete related exam_submissions first
        const deleteSubmissionsStmt = this.db.prepare('DELETE FROM exam_submissions WHERE exam_id = ?');
        deleteSubmissionsStmt.run(examId);

        // Delete related app_violations
        const deleteViolationsStmt = this.db.prepare('DELETE FROM app_violations WHERE exam_id = ?');
        deleteViolationsStmt.run(examId);

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

  // ─── STUDENT EXAM SESSIONS ────────────────────────────────────────────────

  getStudentExamSession(examId, studentId) {
    try {
      return this.db.prepare(
        'SELECT * FROM student_exam_sessions WHERE exam_id = ? AND student_id = ?'
      ).get(examId, studentId) || null;
    } catch (error) {
      console.error('Error getting student exam session:', error);
      return null;
    }
  }

  createStudentExamSession({ examId, studentId, startedAt, examUpdatedAt }) {
    try {
      const { v4: uuidv4 } = require('uuid');
      const id = uuidv4();
      this.db.prepare(`
        INSERT INTO student_exam_sessions (id, exam_id, student_id, started_at, exam_updated_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(id, examId, studentId, startedAt, examUpdatedAt || null);
      return { id, examId, studentId, startedAt, examUpdatedAt };
    } catch (error) {
      console.error('Error creating student exam session:', error);
      throw error;
    }
  }

  updateStudentExamSession(examId, studentId, { startedAt, examUpdatedAt }) {
    try {
      this.db.prepare(`
        UPDATE student_exam_sessions
        SET started_at = ?, exam_updated_at = ?
        WHERE exam_id = ? AND student_id = ?
      `).run(startedAt, examUpdatedAt || null, examId, studentId);
    } catch (error) {
      console.error('Error updating student exam session:', error);
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

  /**
   * Close database connection
   */
  /**
   * Programming questions & test cases (Test Case Generation module)
   */
  createProgrammingQuestion(examId, data) {
    const { v4: uuidv4 } = require('uuid');
    const questionId = uuidv4();
    const requiredConcepts = data.requiredConcepts ? JSON.stringify(data.requiredConcepts) : null;
    const cols = this.db.prepare("PRAGMA table_info(programming_questions)").all().map(c => c.name);
    const hasConcepts = cols.includes('required_concepts');
    if (hasConcepts) {
      this.db.prepare(`
        INSERT INTO programming_questions (question_id, exam_id, title, problem_text, sample_input, sample_output, language, time_limit_seconds, memory_limit_mb, sort_order, required_concepts, concept_threshold, is_pattern_question)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        questionId, examId, data.title || `Question ${Date.now()}`, data.problemText || '',
        data.sampleInput || null, data.sampleOutput || null, data.language || 'python',
        data.timeLimitSeconds || 2, data.memoryLimitMb || 256, data.sortOrder ?? 0,
        requiredConcepts, data.conceptThreshold ?? 99, data.isPatternQuestion ? 1 : 0
      );
    } else {
      this.db.prepare(`
        INSERT INTO programming_questions (question_id, exam_id, title, problem_text, sample_input, sample_output, language, time_limit_seconds, memory_limit_mb, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        questionId, examId, data.title || `Question ${Date.now()}`, data.problemText || '',
        data.sampleInput || null, data.sampleOutput || null, data.language || 'python',
        data.timeLimitSeconds || 2, data.memoryLimitMb || 256, data.sortOrder ?? 0
      );
    }
    return { questionId, ...data };
  }

  getProgrammingQuestionsByExam(examId) {
    const stmt = this.db.prepare(`
      SELECT * FROM programming_questions WHERE exam_id = ? ORDER BY sort_order, created_at
    `);
    return stmt.all(examId);
  }

  getProgrammingQuestionById(questionId) {
    return this.db.prepare('SELECT * FROM programming_questions WHERE question_id = ?').get(questionId);
  }

  updateProgrammingQuestion(questionId, data) {
    const updates = [];
    const values = [];
    const cols = this.db.prepare("PRAGMA table_info(programming_questions)").all().map(c => c.name);
    const add = (col, val) => { if (cols.includes(col)) { updates.push(`${col} = ?`); values.push(val); } };
    if (data.title !== undefined) add('title', data.title);
    if (data.problemText !== undefined) add('problem_text', data.problemText);
    if (data.sampleInput !== undefined) add('sample_input', data.sampleInput);
    if (data.sampleOutput !== undefined) add('sample_output', data.sampleOutput);
    if (data.language !== undefined) add('language', data.language);
    if (data.timeLimitSeconds !== undefined) add('time_limit_seconds', data.timeLimitSeconds);
    if (data.requiredConcepts !== undefined) add('required_concepts', Array.isArray(data.requiredConcepts) ? JSON.stringify(data.requiredConcepts) : data.requiredConcepts);
    if (data.conceptThreshold !== undefined) add('concept_threshold', data.conceptThreshold);
    if (data.isPatternQuestion !== undefined) add('is_pattern_question', data.isPatternQuestion ? 1 : 0);
    if (data.referenceSolution !== undefined) add('reference_solution', data.referenceSolution);
    if (data.maxMarks !== undefined) add('max_marks', data.maxMarks);
    if (updates.length === 0) return false;
    values.push(questionId);
    this.db.prepare(`UPDATE programming_questions SET ${updates.join(', ')} WHERE question_id = ?`).run(...values);
    return true;
  }

  deleteProgrammingQuestion(questionId) {
    this.db.prepare('DELETE FROM question_test_cases WHERE question_id = ?').run(questionId);
    this.db.prepare('DELETE FROM programming_questions WHERE question_id = ?').run(questionId);
    return true;
  }

  createTestCase(questionId, data) {
    const { v4: uuidv4 } = require('uuid');
    const testCaseId = uuidv4();
    this.db.prepare(`
      INSERT INTO question_test_cases (test_case_id, question_id, input_data, expected_output, description, is_sample, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      testCaseId,
      questionId,
      data.input,
      data.expectedOutput,
      data.description || null,
      data.isSample ? 1 : 0,
      data.sortOrder ?? 0
    );
    return { testCaseId, ...data };
  }

  getTestCasesByQuestion(questionId) {
    return this.db.prepare(`
      SELECT * FROM question_test_cases WHERE question_id = ? ORDER BY sort_order, created_at
    `).all(questionId);
  }

  deleteTestCase(testCaseId) {
    this.db.prepare('DELETE FROM question_test_cases WHERE test_case_id = ?').run(testCaseId);
    return true;
  }

  updateTestCase(testCaseId, data) {
    const updates = [];
    const values = [];
    if (data.input !== undefined) { updates.push('input_data = ?'); values.push(data.input); }
    if (data.expectedOutput !== undefined) { updates.push('expected_output = ?'); values.push(data.expectedOutput); }
    if (data.description !== undefined) { updates.push('description = ?'); values.push(data.description); }
    if (updates.length === 0) return false;
    values.push(testCaseId);
    this.db.prepare(`UPDATE question_test_cases SET ${updates.join(', ')} WHERE test_case_id = ?`).run(...values);
    return true;
  }

  createCodeSubmission(examId, questionId, studentId, sourceCode, language, passedCount, totalCount, status = 'completed', score = 0, conceptPassed = 1, conceptDetails = null, hardcoded = false, hardcodedReason = null) {
    const { v4: uuidv4 } = require('uuid');
    const submissionId = uuidv4();
    const cols = this.db.prepare("PRAGMA table_info(code_submissions)").all().map(c => c.name);
    const hasScore = cols.includes('score');
    const hasConcept = cols.includes('concept_passed');
    const hasHardcoded = cols.includes('hardcoded');
    const detailsStr = conceptDetails ? JSON.stringify(conceptDetails) : null;

    if (hasScore && hasConcept && hasHardcoded) {
      this.db.prepare(`
        INSERT INTO code_submissions
          (submission_id, exam_id, question_id, student_id, source_code, language,
           passed_count, total_count, score, status, concept_passed, concept_details,
           hardcoded, hardcoded_reason)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(submissionId, examId, questionId, studentId, sourceCode, language,
             passedCount, totalCount, score, status, conceptPassed ? 1 : 0, detailsStr,
             hardcoded ? 1 : 0, hardcodedReason || null);
    } else if (hasScore && hasConcept) {
      this.db.prepare(`
        INSERT INTO code_submissions
          (submission_id, exam_id, question_id, student_id, source_code, language,
           passed_count, total_count, score, status, concept_passed, concept_details)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(submissionId, examId, questionId, studentId, sourceCode, language,
             passedCount, totalCount, score, status, conceptPassed ? 1 : 0, detailsStr);
    } else if (hasScore) {
      this.db.prepare(`
        INSERT INTO code_submissions
          (submission_id, exam_id, question_id, student_id, source_code, language,
           passed_count, total_count, score, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(submissionId, examId, questionId, studentId, sourceCode, language,
             passedCount, totalCount, score, status);
    } else {
      this.db.prepare(`
        INSERT INTO code_submissions
          (submission_id, exam_id, question_id, student_id, source_code, language,
           passed_count, total_count, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(submissionId, examId, questionId, studentId, sourceCode, language,
             passedCount, totalCount, status);
    }
    return { submissionId };
  }

  createSubmissionResult(submissionId, testCaseId, passed, actualOutput, executionTimeMs, errorMessage, score = null) {
    const { v4: uuidv4 } = require('uuid');
    const resultId = uuidv4();
    const cols = this.db.prepare("PRAGMA table_info(submission_results)").all().map(c => c.name);
    const hasScore = cols.includes('score');
    const scoreVal = score != null ? score : (passed ? 100 : 0);
    if (hasScore) {
      this.db.prepare(`
        INSERT INTO submission_results (result_id, submission_id, test_case_id, passed, score, actual_output, execution_time_ms, error_message)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(resultId, submissionId, testCaseId, passed ? 1 : 0, scoreVal, actualOutput, executionTimeMs, errorMessage);
    } else {
      this.db.prepare(`
        INSERT INTO submission_results (result_id, submission_id, test_case_id, passed, actual_output, execution_time_ms, error_message)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(resultId, submissionId, testCaseId, passed ? 1 : 0, actualOutput, executionTimeMs, errorMessage);
    }
    return resultId;
  }

  getStudentCodeSubmissions(examId, studentId) {
    return this.db.prepare(`
      SELECT * FROM code_submissions WHERE exam_id = ? AND student_id = ? ORDER BY submitted_at DESC
    `).all(examId, studentId);
  }

  /**
   * Get per-student, per-question best scores for an exam.
   * Returns one row per (student, question) pair showing their best submission.
   */
  getExamStudentScores(examId) {
    // Questions for this exam (ordered)
    const questions = this.db.prepare(`
      SELECT question_id, title, marks, question_order
      FROM programming_questions
      WHERE exam_id = ?
      ORDER BY question_order ASC
    `).all(examId);

    // Distinct students who submitted anything for this exam
    const students = this.db.prepare(`
      SELECT DISTINCT cs.student_id, u.full_name AS student_name, u.username
      FROM code_submissions cs
      JOIN users u ON cs.student_id = u.user_id
      WHERE cs.exam_id = ?
      ORDER BY u.full_name
    `).all(examId);

    if (students.length === 0 || questions.length === 0) {
      return { questions, students: [] };
    }

    // Best submission per (student, question)
    const bestRows = this.db.prepare(`
      SELECT
        student_id,
        question_id,
        MAX(score)          AS best_score,
        MAX(passed_count)   AS best_passed,
        MAX(total_count)    AS total_count,
        COUNT(*)            AS attempts,
        MAX(hardcoded)      AS hardcoded,
        MAX(concept_passed) AS concept_passed,
        MAX(submitted_at)   AS last_submitted
      FROM code_submissions
      WHERE exam_id = ?
      GROUP BY student_id, question_id
    `).all(examId);

    // Index best rows by "studentId|questionId" for fast lookup
    const bestMap = {};
    for (const row of bestRows) {
      bestMap[`${row.student_id}|${row.question_id}`] = row;
    }

    // Build output: each student gets a scores array aligned with questions
    const result = students.map(student => {
      let totalEarned = 0;
      let totalMax    = 0;

      const scores = questions.map(q => {
        const key  = `${student.student_id}|${q.question_id}`;
        const best = bestMap[key] || null;

        const maxMarks   = q.marks || 0;
        const earnedPct  = best ? (best.best_score || 0) : null;   // 0-100
        const earned     = earnedPct !== null
          ? Math.round((earnedPct / 100) * maxMarks)
          : null;

        totalMax    += maxMarks;
        totalEarned += (earned !== null ? earned : 0);

        return {
          questionId:    q.question_id,
          earnedPct,           // 0-100 or null (not attempted)
          earned,              // actual marks or null
          maxMarks,
          attempts:      best ? best.attempts    : 0,
          hardcoded:     best ? !!best.hardcoded : false,
          conceptFailed: best ? !best.concept_passed : false,
          lastSubmitted: best ? best.last_submitted  : null
        };
      });

      const totalPct = totalMax > 0 ? Math.round((totalEarned / totalMax) * 100) : 0;

      return {
        studentId:   student.student_id,
        studentName: student.student_name,
        username:    student.username,
        scores,
        totalEarned,
        totalMax,
        totalPct
      };
    });

    return { questions, students: result };
  }

  getCodeSubmissionResults(submissionId) {
    return this.db.prepare(`
      SELECT sr.*, qt.input_data, qt.expected_output, qt.description
      FROM submission_results sr
      JOIN question_test_cases qt ON sr.test_case_id = qt.test_case_id
      WHERE sr.submission_id = ?
    `).all(submissionId);
  }

  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

module.exports = DatabaseService;