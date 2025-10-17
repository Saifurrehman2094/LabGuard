const bcrypt = require('bcrypt');
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
    this.saltRounds = 12;
    this.users = new Map();
    this.exams = new Map();
    this.events = new Map();
    this.devices = new Map();
  }

  async initializeDatabase() {
    console.log('Database service initialized (in-memory mode for development)');
    return true;
  }

  createTables() {
    console.log('Using in-memory storage for development');
  }

  async createUser(userData) {
    const { username, password, role, fullName } = userData;
    
    // Check if username already exists
    for (const user of this.users.values()) {
      if (user.username === username) {
        throw new Error('Username already exists');
      }
    }
    
    const userId = uuidv4();
    const passwordHash = await bcrypt.hash(password, this.saltRounds);

    const user = {
      user_id: userId,
      username,
      password_hash: passwordHash,
      role,
      full_name: fullName,
      created_at: new Date().toISOString()
    };
    
    this.users.set(userId, user);
    
    return {
      userId,
      username,
      role,
      fullName,
      createdAt: user.created_at
    };
  }

  async getUserByCredentials(username, password) {
    let user = null;
    
    // Find user by username
    for (const u of this.users.values()) {
      if (u.username === username) {
        user = u;
        break;
      }
    }
    
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
  }

  getUserById(userId) {
    const user = this.users.get(userId);
    if (!user) return null;
    
    const { password_hash, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  createExam(examData) {
    const { teacherId, title, pdfPath, startTime, endTime, allowedApps } = examData;
    const examId = uuidv4();

    const exam = {
      exam_id: examId,
      teacher_id: teacherId,
      title,
      pdf_path: pdfPath,
      start_time: startTime,
      end_time: endTime,
      allowed_apps: allowedApps,
      created_at: new Date().toISOString()
    };

    this.exams.set(examId, exam);

    return {
      examId,
      teacherId,
      title,
      pdfPath,
      startTime,
      endTime,
      allowedApps,
      createdAt: exam.created_at
    };
  }

  getExamsByTeacher(teacherId) {
    const exams = [];
    for (const exam of this.exams.values()) {
      if (exam.teacher_id === teacherId) {
        exams.push({
          ...exam,
          allowedApps: exam.allowed_apps
        });
      }
    }
    return exams.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }

  getAvailableExams(studentId) {
    const now = new Date();
    const exams = [];
    
    for (const exam of this.exams.values()) {
      const endTime = new Date(exam.end_time);
      if (endTime >= now) {
        // Get teacher name
        const teacher = this.users.get(exam.teacher_id);
        exams.push({
          ...exam,
          allowedApps: exam.allowed_apps,
          teacher_name: teacher ? teacher.full_name : 'Unknown Teacher'
        });
      }
    }
    
    return exams.sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
  }

  getExamById(examId) {
    const exam = this.exams.get(examId);
    if (!exam) return null;
    
    return {
      ...exam,
      allowedApps: exam.allowed_apps
    };
  }

  updateExam(examId, updateData) {
    const exam = this.exams.get(examId);
    if (!exam) return false;

    const { title, pdfPath, startTime, endTime, allowedApps } = updateData;
    
    if (title !== undefined) exam.title = title;
    if (pdfPath !== undefined) exam.pdf_path = pdfPath;
    if (startTime !== undefined) exam.start_time = startTime;
    if (endTime !== undefined) exam.end_time = endTime;
    if (allowedApps !== undefined) exam.allowed_apps = allowedApps;

    this.exams.set(examId, exam);
    return true;
  }

  deleteExam(examId) {
    return this.exams.delete(examId);
  }

  logEvent(eventData) {
    const { examId, studentId, deviceId, eventType, windowTitle, processName, isViolation } = eventData;
    const eventId = uuidv4();

    const event = {
      event_id: eventId,
      exam_id: examId,
      student_id: studentId,
      device_id: deviceId,
      timestamp: new Date().toISOString(),
      event_type: eventType,
      window_title: windowTitle || null,
      process_name: processName || null,
      is_violation: isViolation ? 1 : 0
    };

    this.events.set(eventId, event);

    return {
      eventId,
      examId,
      studentId,
      deviceId,
      eventType,
      windowTitle,
      processName,
      isViolation,
      timestamp: event.timestamp
    };
  }

  getEventsByExam(examId) {
    const events = [];
    for (const event of this.events.values()) {
      if (event.exam_id === examId) {
        const student = this.users.get(event.student_id);
        events.push({
          ...event,
          student_name: student ? student.full_name : 'Unknown Student'
        });
      }
    }
    return events.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  }

  getViolationsByExam(examId) {
    const violations = [];
    for (const event of this.events.values()) {
      if (event.exam_id === examId && event.is_violation === 1) {
        const student = this.users.get(event.student_id);
        violations.push({
          ...event,
          student_name: student ? student.full_name : 'Unknown Student'
        });
      }
    }
    return violations.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  }

  getStudentExamHistory(studentId) {
    const now = new Date();
    const history = [];
    
    // Get exams where student has events and exam has ended
    const studentEvents = new Set();
    for (const event of this.events.values()) {
      if (event.student_id === studentId && event.event_type === 'exam_start') {
        studentEvents.add(event.exam_id);
      }
    }
    
    for (const examId of studentEvents) {
      const exam = this.exams.get(examId);
      if (exam && new Date(exam.end_time) < now) {
        const teacher = this.users.get(exam.teacher_id);
        history.push({
          exam_id: exam.exam_id,
          title: exam.title,
          start_time: exam.start_time,
          end_time: exam.end_time,
          teacher_id: exam.teacher_id,
          teacher_name: teacher ? teacher.full_name : 'Unknown Teacher',
          created_at: exam.created_at,
          allowed_apps: exam.allowed_apps
        });
      }
    }
    
    return history.sort((a, b) => new Date(b.end_time) - new Date(a.end_time));
  }

  registerDevice(deviceId, deviceName = null) {
    const device = {
      device_id: deviceId,
      device_name: deviceName,
      registered_at: new Date().toISOString(),
      last_used: new Date().toISOString()
    };
    
    this.devices.set(deviceId, device);
    return true;
  }

  async seedTestAccounts() {
    try {
      // Check if test accounts already exist
      let teacherExists = false;
      let studentExists = false;
      
      for (const user of this.users.values()) {
        if (user.username === 'teacher1') teacherExists = true;
        if (user.username === 'student1') studentExists = true;
      }

      if (!teacherExists) {
        await this.createUser({
          username: 'teacher1',
          password: 'password123',
          role: 'teacher',
          fullName: 'Dr. John Smith'
        });
        console.log('Created test teacher account: teacher1/password123');
      }

      if (!studentExists) {
        await this.createUser({
          username: 'student1',
          password: 'password123',
          role: 'student',
          fullName: 'Alice Johnson'
        });
        console.log('Created test student account: student1/password123');
      }

      // Create additional test accounts
      let teacher2Exists = false;
      let student2Exists = false;
      
      for (const user of this.users.values()) {
        if (user.username === 'teacher2') teacher2Exists = true;
        if (user.username === 'student2') student2Exists = true;
      }

      if (!teacher2Exists) {
        await this.createUser({
          username: 'teacher2',
          password: 'password123',
          role: 'teacher',
          fullName: 'Prof. Sarah Wilson'
        });
        console.log('Created test teacher account: teacher2/password123');
      }

      if (!student2Exists) {
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

  close() {
    // Nothing to close for in-memory storage
  }
}

module.exports = DatabaseService;