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

    // Create exams table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS exams (
        exam_id TEXT PRIMARY KEY,
        teacher_id TEXT NOT NULL,
        title TEXT NOT NULL,
        pdf_path TEXT,
        start_time DATETIME NOT NULL,
        end_time DATETIME NOT NULL,
        allowed_apps TEXT NOT NULL DEFAULT '[]',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (teacher_id) REFERENCES users (user_id)
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

  // EXAM MANAGEMENT METHODS

  /**
   * Create a new exam
   */
  createExam(examData) {
    try {
      const { teacherId, title, pdfPath, startTime, endTime, allowedApps } = examData;
      const examId = uuidv4();

      const stmt = this.db.prepare(`
        INSERT INTO exams (exam_id, teacher_id, title, pdf_path, start_time, end_time, allowed_apps)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      const allowedAppsJson = JSON.stringify(allowedApps);
      const result = stmt.run(examId, teacherId, title, pdfPath, startTime, endTime, allowedAppsJson);

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
   * Get available exams for students (current and future exams)
   */
  getAvailableExams(studentId) {
    try {
      const stmt = this.db.prepare(`
        SELECT e.exam_id, e.teacher_id, e.title, e.start_time, e.end_time, e.allowed_apps, e.created_at,
               u.full_name as teacher_name
        FROM exams e
        JOIN users u ON e.teacher_id = u.user_id
        WHERE datetime(e.end_time) >= datetime('now')
        ORDER BY e.start_time ASC
      `);

      const exams = stmt.all();

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
        exam.allowedApps = JSON.parse(exam.allowed_apps);
      }

      return exam;
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
      const stmt = this.db.prepare('DELETE FROM exams WHERE exam_id = ?');
      const result = stmt.run(examId);
      return result.changes > 0;
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
   * Get student exam history (completed exams)
   */
  getStudentExamHistory(studentId) {
    try {
      const stmt = this.db.prepare(`
        SELECT DISTINCT e.exam_id, ex.title, ex.start_time, ex.end_time, 
               ex.teacher_id, u.full_name as teacher_name, ex.created_at
        FROM events e
        JOIN exams ex ON e.exam_id = ex.exam_id
        JOIN users u ON ex.teacher_id = u.user_id
        WHERE e.student_id = ? AND e.event_type = 'exam_start'
        AND datetime(ex.end_time) < datetime('now')
        ORDER BY ex.end_time DESC
      `);

      const history = stmt.all(studentId);

      // Get allowed apps for each exam
      return history.map(exam => {
        const examDetails = this.getExamById(exam.exam_id);
        return {
          ...exam,
          allowed_apps: examDetails ? examDetails.allowedApps : []
        };
      });
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
   * Seed database with test accounts
   */
  async seedTestAccounts() {
    try {
      // Check if admin account exists
      const adminExists = this.db.prepare('SELECT COUNT(*) as count FROM users WHERE username = ?').get('admin');

      if (adminExists.count === 0) {
        await this.createUser({
          username: 'admin',
          password: 'admin123',
          role: 'admin',
          fullName: 'System Administrator',
          email: 'admin@labguard.com'
        });
        console.log('Created admin account: admin/admin123');
      }

      // Check if test accounts already exist
      const teacherExists = this.db.prepare('SELECT COUNT(*) as count FROM users WHERE username = ?').get('teacher1');
      const studentExists = this.db.prepare('SELECT COUNT(*) as count FROM users WHERE username = ?').get('student1');

      if (teacherExists.count === 0) {
        await this.createUser({
          username: 'teacher1',
          password: 'password123',
          role: 'teacher',
          fullName: 'Dr. John Smith',
          email: 'john.smith@university.edu',
          createdBy: 'admin'
        });
        console.log('Created test teacher account: teacher1/password123');
      }

      if (studentExists.count === 0) {
        await this.createUser({
          username: 'student1',
          password: 'password123',
          role: 'student',
          fullName: 'Alice Johnson',
          email: 'alice.johnson@student.edu',
          createdBy: 'admin'
        });
        console.log('Created test student account: student1/password123');
      }

      // Create additional test accounts
      const teacher2Exists = this.db.prepare('SELECT COUNT(*) as count FROM users WHERE username = ?').get('teacher2');
      const student2Exists = this.db.prepare('SELECT COUNT(*) as count FROM users WHERE username = ?').get('student2');

      if (teacher2Exists.count === 0) {
        await this.createUser({
          username: 'teacher2',
          password: 'password123',
          role: 'teacher',
          fullName: 'Prof. Sarah Wilson',
          email: 'sarah.wilson@university.edu',
          createdBy: 'admin'
        });
        console.log('Created test teacher account: teacher2/password123');
      }

      if (student2Exists.count === 0) {
        await this.createUser({
          username: 'student2',
          password: 'password123',
          role: 'student',
          fullName: 'Bob Martinez',
          email: 'bob.martinez@student.edu',
          createdBy: 'admin'
        });
        console.log('Created test student account: student2/password123');
      }

      // Initialize default system settings
      this.setSystemSetting('face_matching_threshold', 0.45, 'number', 'Face recognition matching threshold');
      this.setSystemSetting('max_login_attempts', 5, 'number', 'Maximum login attempts before lockout');
      this.setSystemSetting('session_timeout', 28800000, 'number', 'Session timeout in milliseconds (8 hours)');

      return true;
    } catch (error) {
      console.error('Error seeding test accounts:', error);
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