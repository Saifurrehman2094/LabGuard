const Database = require('better-sqlite3');
const bcrypt = require('bcrypt');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Generate UUID v4 using crypto module
function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
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

      // Create database connection
      this.db = new Database(this.dbPath);
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('foreign_keys = ON');

      // Create tables
      this.createTables();
      
      return true;
    } catch (error) {
      console.error('Database initialization failed:', error);
      throw error;
    }
  }

  /**
   * Create all required database tables
   */
  createTables() {
    const createUsersTable = `
      CREATE TABLE IF NOT EXISTS users (
        user_id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('teacher', 'student')),
        full_name TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;

    const createDevicesTable = `
      CREATE TABLE IF NOT EXISTS devices (
        device_id TEXT PRIMARY KEY,
        device_name TEXT,
        registered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_used DATETIME
      )
    `;

    const createExamsTable = `
      CREATE TABLE IF NOT EXISTS exams (
        exam_id TEXT PRIMARY KEY,
        teacher_id TEXT NOT NULL,
        title TEXT NOT NULL,
        pdf_path TEXT,
        start_time DATETIME NOT NULL,
        end_time DATETIME NOT NULL,
        allowed_apps TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (teacher_id) REFERENCES users(user_id)
      )
    `;

    const createEventsTable = `
      CREATE TABLE IF NOT EXISTS events (
        event_id TEXT PRIMARY KEY,
        exam_id TEXT NOT NULL,
        student_id TEXT NOT NULL,
        device_id TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        event_type TEXT NOT NULL,
        window_title TEXT,
        process_name TEXT,
        is_violation BOOLEAN DEFAULT 0,
        FOREIGN KEY (exam_id) REFERENCES exams(exam_id),
        FOREIGN KEY (student_id) REFERENCES users(user_id),
        FOREIGN KEY (device_id) REFERENCES devices(device_id)
      )
    `;

    this.db.exec(createUsersTable);
    this.db.exec(createDevicesTable);
    this.db.exec(createExamsTable);
    this.db.exec(createEventsTable);
  }

  // USER CRUD OPERATIONS

  /**
   * Create a new user with hashed password
   */
  async createUser(userData) {
    try {
      const { username, password, role, fullName } = userData;
      const userId = uuidv4();
      const passwordHash = await bcrypt.hash(password, this.saltRounds);

      const stmt = this.db.prepare(`
        INSERT INTO users (user_id, username, password_hash, role, full_name)
        VALUES (?, ?, ?, ?, ?)
      `);

      const result = stmt.run(userId, username, passwordHash, role, fullName);
      
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
        SELECT user_id, username, role, full_name, created_at
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
      
      // Parse allowed_apps JSON for each exam
      return exams.map(exam => ({
        ...exam,
        allowedApps: JSON.parse(exam.allowed_apps)
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
      // Check if test accounts already exist
      const teacherExists = this.db.prepare('SELECT COUNT(*) as count FROM users WHERE username = ?').get('teacher1');
      const studentExists = this.db.prepare('SELECT COUNT(*) as count FROM users WHERE username = ?').get('student1');

      if (teacherExists.count === 0) {
        await this.createUser({
          username: 'teacher1',
          password: 'password123',
          role: 'teacher',
          fullName: 'Dr. John Smith'
        });
        console.log('Created test teacher account: teacher1/password123');
      }

      if (studentExists.count === 0) {
        await this.createUser({
          username: 'student1',
          password: 'password123',
          role: 'student',
          fullName: 'Alice Johnson'
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
          fullName: 'Prof. Sarah Wilson'
        });
        console.log('Created test teacher account: teacher2/password123');
      }

      if (student2Exists.count === 0) {
        await this.createUser({
          username: 'student2',
          password: 'password123',
          role: 'student',
          fullName: 'Bob Martinez'
        });
        console.log('Created test student account: student2/password123');
      }

      return true;
    } catch (error) {
      console.error('Error seeding test accounts:', error);
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