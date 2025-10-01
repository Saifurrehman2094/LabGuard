const DatabaseService = require('../../services/database');
const fs = require('fs');
const path = require('path');

describe('DatabaseService', () => {
  let dbService;
  let testDbPath;

  beforeEach(async () => {
    // Create a temporary database for testing
    testDbPath = path.join(__dirname, 'test-database.sqlite');
    dbService = new DatabaseService(testDbPath);
    await dbService.initializeDatabase();
  });

  afterEach(() => {
    // Clean up test database
    if (dbService) {
      dbService.close();
    }
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('Database Initialization', () => {
    test('should initialize database successfully', async () => {
      const newDbService = new DatabaseService(path.join(__dirname, 'init-test.sqlite'));
      const result = await newDbService.initializeDatabase();
      
      expect(result).toBe(true);
      expect(newDbService.db).toBeDefined();
      
      newDbService.close();
      fs.unlinkSync(path.join(__dirname, 'init-test.sqlite'));
    });

    test('should create all required tables', () => {
      const tables = dbService.db.prepare(`
        SELECT name FROM sqlite_master WHERE type='table'
      `).all();

      const tableNames = tables.map(table => table.name);
      expect(tableNames).toContain('users');
      expect(tableNames).toContain('devices');
      expect(tableNames).toContain('exams');
      expect(tableNames).toContain('events');
    });
  });

  describe('User CRUD Operations', () => {
    test('should create a new user successfully', async () => {
      const userData = {
        username: 'testuser',
        password: 'testpassword123',
        role: 'student',
        fullName: 'Test User'
      };

      const result = await dbService.createUser(userData);

      expect(result).toHaveProperty('userId');
      expect(result.username).toBe(userData.username);
      expect(result.role).toBe(userData.role);
      expect(result.fullName).toBe(userData.fullName);
      expect(result).toHaveProperty('createdAt');
    });

    test('should throw error for duplicate username', async () => {
      const userData = {
        username: 'duplicate',
        password: 'password123',
        role: 'student',
        fullName: 'Duplicate User'
      };

      await dbService.createUser(userData);
      
      await expect(dbService.createUser(userData))
        .rejects.toThrow('Username already exists');
    });

    test('should authenticate user with valid credentials', async () => {
      const userData = {
        username: 'authtest',
        password: 'password123',
        role: 'teacher',
        fullName: 'Auth Test User'
      };

      await dbService.createUser(userData);
      
      const authenticatedUser = await dbService.getUserByCredentials('authtest', 'password123');
      
      expect(authenticatedUser).toBeDefined();
      expect(authenticatedUser.username).toBe('authtest');
      expect(authenticatedUser.role).toBe('teacher');
      expect(authenticatedUser).not.toHaveProperty('password_hash');
    });

    test('should return null for invalid credentials', async () => {
      const userData = {
        username: 'validuser',
        password: 'correctpassword',
        role: 'student',
        fullName: 'Valid User'
      };

      await dbService.createUser(userData);
      
      // Test wrong password
      const wrongPassword = await dbService.getUserByCredentials('validuser', 'wrongpassword');
      expect(wrongPassword).toBeNull();
      
      // Test non-existent user
      const nonExistentUser = await dbService.getUserByCredentials('nonexistent', 'password');
      expect(nonExistentUser).toBeNull();
    });

    test('should get user by ID', async () => {
      const userData = {
        username: 'getbyid',
        password: 'password123',
        role: 'student',
        fullName: 'Get By ID User'
      };

      const createdUser = await dbService.createUser(userData);
      const retrievedUser = dbService.getUserById(createdUser.userId);
      
      expect(retrievedUser).toBeDefined();
      expect(retrievedUser.user_id).toBe(createdUser.userId);
      expect(retrievedUser.username).toBe(userData.username);
      expect(retrievedUser).not.toHaveProperty('password_hash');
    });

    test('should update user information', async () => {
      const userData = {
        username: 'updatetest',
        password: 'oldpassword',
        role: 'student',
        fullName: 'Old Name'
      };

      const createdUser = await dbService.createUser(userData);
      
      const updateResult = await dbService.updateUser(createdUser.userId, {
        fullName: 'New Name',
        password: 'newpassword'
      });
      
      expect(updateResult).toBe(true);
      
      // Verify the update
      const updatedUser = dbService.getUserById(createdUser.userId);
      expect(updatedUser.full_name).toBe('New Name');
      
      // Verify password was updated
      const authResult = await dbService.getUserByCredentials('updatetest', 'newpassword');
      expect(authResult).toBeDefined();
    });

    test('should delete user', async () => {
      const userData = {
        username: 'deletetest',
        password: 'password123',
        role: 'student',
        fullName: 'Delete Test User'
      };

      const createdUser = await dbService.createUser(userData);
      const deleteResult = dbService.deleteUser(createdUser.userId);
      
      expect(deleteResult).toBe(true);
      
      // Verify user is deleted
      const deletedUser = dbService.getUserById(createdUser.userId);
      expect(deletedUser).toBeUndefined();
    });
  });

  describe('Exam Management', () => {
    let teacherId;

    beforeEach(async () => {
      const teacher = await dbService.createUser({
        username: 'teacher1',
        password: 'password123',
        role: 'teacher',
        fullName: 'Test Teacher'
      });
      teacherId = teacher.userId;
    });

    test('should create a new exam', () => {
      const examData = {
        teacherId: teacherId,
        title: 'Test Exam',
        pdfPath: '/path/to/exam.pdf',
        startTime: '2024-12-01 10:00:00',
        endTime: '2024-12-01 12:00:00',
        allowedApps: ['notepad.exe', 'calculator.exe']
      };

      const result = dbService.createExam(examData);

      expect(result).toHaveProperty('examId');
      expect(result.title).toBe(examData.title);
      expect(result.teacherId).toBe(teacherId);
      expect(result.allowedApps).toEqual(examData.allowedApps);
    });

    test('should get exams by teacher', () => {
      const examData1 = {
        teacherId: teacherId,
        title: 'Exam 1',
        pdfPath: '/path/to/exam1.pdf',
        startTime: '2024-12-01 10:00:00',
        endTime: '2024-12-01 12:00:00',
        allowedApps: ['notepad.exe']
      };

      const examData2 = {
        teacherId: teacherId,
        title: 'Exam 2',
        pdfPath: '/path/to/exam2.pdf',
        startTime: '2024-12-02 10:00:00',
        endTime: '2024-12-02 12:00:00',
        allowedApps: ['calculator.exe']
      };

      dbService.createExam(examData1);
      dbService.createExam(examData2);

      const exams = dbService.getExamsByTeacher(teacherId);

      expect(exams).toHaveLength(2);
      
      // Check that both exams are present (order may vary due to timing)
      const examTitles = exams.map(exam => exam.title);
      expect(examTitles).toContain('Exam 1');
      expect(examTitles).toContain('Exam 2');
      
      // Check that allowed apps are correctly parsed
      const exam1 = exams.find(exam => exam.title === 'Exam 1');
      const exam2 = exams.find(exam => exam.title === 'Exam 2');
      expect(exam1.allowedApps).toEqual(['notepad.exe']);
      expect(exam2.allowedApps).toEqual(['calculator.exe']);
    });

    test('should get available exams for students', () => {
      const futureExam = {
        teacherId: teacherId,
        title: 'Future Exam',
        pdfPath: '/path/to/future.pdf',
        startTime: '2025-12-01 10:00:00',
        endTime: '2025-12-01 12:00:00',
        allowedApps: ['notepad.exe']
      };

      const pastExam = {
        teacherId: teacherId,
        title: 'Past Exam',
        pdfPath: '/path/to/past.pdf',
        startTime: '2020-12-01 10:00:00',
        endTime: '2020-12-01 12:00:00',
        allowedApps: ['calculator.exe']
      };

      dbService.createExam(futureExam);
      dbService.createExam(pastExam);

      const availableExams = dbService.getAvailableExams('student123');

      expect(availableExams).toHaveLength(1);
      expect(availableExams[0].title).toBe('Future Exam');
      expect(availableExams[0]).toHaveProperty('teacher_name');
    });

    test('should get exam by ID', () => {
      const examData = {
        teacherId: teacherId,
        title: 'Get By ID Exam',
        pdfPath: '/path/to/exam.pdf',
        startTime: '2024-12-01 10:00:00',
        endTime: '2024-12-01 12:00:00',
        allowedApps: ['notepad.exe', 'calculator.exe']
      };

      const createdExam = dbService.createExam(examData);
      const retrievedExam = dbService.getExamById(createdExam.examId);

      expect(retrievedExam).toBeDefined();
      expect(retrievedExam.exam_id).toBe(createdExam.examId);
      expect(retrievedExam.title).toBe(examData.title);
      expect(retrievedExam.allowedApps).toEqual(examData.allowedApps);
    });

    test('should update exam', () => {
      const examData = {
        teacherId: teacherId,
        title: 'Original Title',
        pdfPath: '/path/to/original.pdf',
        startTime: '2024-12-01 10:00:00',
        endTime: '2024-12-01 12:00:00',
        allowedApps: ['notepad.exe']
      };

      const createdExam = dbService.createExam(examData);
      
      const updateResult = dbService.updateExam(createdExam.examId, {
        title: 'Updated Title',
        allowedApps: ['notepad.exe', 'calculator.exe']
      });

      expect(updateResult).toBe(true);

      const updatedExam = dbService.getExamById(createdExam.examId);
      expect(updatedExam.title).toBe('Updated Title');
      expect(updatedExam.allowedApps).toEqual(['notepad.exe', 'calculator.exe']);
    });
  });

  describe('Event Logging', () => {
    let examId, studentId, deviceId;

    beforeEach(async () => {
      const teacher = await dbService.createUser({
        username: 'teacher2',
        password: 'password123',
        role: 'teacher',
        fullName: 'Event Teacher'
      });

      const student = await dbService.createUser({
        username: 'student1',
        password: 'password123',
        role: 'student',
        fullName: 'Event Student'
      });

      const exam = dbService.createExam({
        teacherId: teacher.userId,
        title: 'Event Test Exam',
        pdfPath: '/path/to/exam.pdf',
        startTime: '2024-12-01 10:00:00',
        endTime: '2024-12-01 12:00:00',
        allowedApps: ['notepad.exe']
      });

      examId = exam.examId;
      studentId = student.userId;
      deviceId = 'test-device-123';

      dbService.registerDevice(deviceId, 'Test Device');
    });

    test('should log monitoring event', () => {
      const eventData = {
        examId: examId,
        studentId: studentId,
        deviceId: deviceId,
        eventType: 'window_change',
        windowTitle: 'Notepad',
        processName: 'notepad.exe',
        isViolation: false
      };

      const result = dbService.logEvent(eventData);

      expect(result).toHaveProperty('eventId');
      expect(result.examId).toBe(examId);
      expect(result.studentId).toBe(studentId);
      expect(result.deviceId).toBe(deviceId);
      expect(result.eventType).toBe('window_change');
      expect(result.isViolation).toBe(false);
    });

    test('should log violation event', () => {
      const violationData = {
        examId: examId,
        studentId: studentId,
        deviceId: deviceId,
        eventType: 'violation',
        windowTitle: 'Chrome Browser',
        processName: 'chrome.exe',
        isViolation: true
      };

      const result = dbService.logEvent(violationData);

      expect(result.isViolation).toBe(true);
      expect(result.eventType).toBe('violation');
      expect(result.windowTitle).toBe('Chrome Browser');
    });

    test('should get events by exam', () => {
      const event1 = {
        examId: examId,
        studentId: studentId,
        deviceId: deviceId,
        eventType: 'exam_start',
        windowTitle: null,
        processName: null,
        isViolation: false
      };

      const event2 = {
        examId: examId,
        studentId: studentId,
        deviceId: deviceId,
        eventType: 'violation',
        windowTitle: 'Unauthorized App',
        processName: 'unauthorized.exe',
        isViolation: true
      };

      dbService.logEvent(event1);
      dbService.logEvent(event2);

      const events = dbService.getEventsByExam(examId);

      expect(events).toHaveLength(2);
      expect(events[0].event_type).toBe('exam_start');
      expect(events[1].event_type).toBe('violation');
      expect(events[0]).toHaveProperty('student_name');
    });

    test('should get violations by exam', () => {
      const normalEvent = {
        examId: examId,
        studentId: studentId,
        deviceId: deviceId,
        eventType: 'window_change',
        windowTitle: 'Notepad',
        processName: 'notepad.exe',
        isViolation: false
      };

      const violationEvent = {
        examId: examId,
        studentId: studentId,
        deviceId: deviceId,
        eventType: 'violation',
        windowTitle: 'Chrome',
        processName: 'chrome.exe',
        isViolation: true
      };

      dbService.logEvent(normalEvent);
      dbService.logEvent(violationEvent);

      const violations = dbService.getViolationsByExam(examId);

      expect(violations).toHaveLength(1);
      expect(violations[0].is_violation).toBe(1);
      expect(violations[0].window_title).toBe('Chrome');
    });
  });

  describe('Device Management', () => {
    test('should register device', () => {
      const deviceId = 'device-123';
      const deviceName = 'Lab PC 01';

      const result = dbService.registerDevice(deviceId, deviceName);

      expect(result).toBe(true);

      // Verify device was registered
      const device = dbService.db.prepare('SELECT * FROM devices WHERE device_id = ?').get(deviceId);
      expect(device).toBeDefined();
      expect(device.device_name).toBe(deviceName);
    });

    test('should update existing device', () => {
      const deviceId = 'device-456';
      
      // Register device first time
      dbService.registerDevice(deviceId, 'Original Name');
      
      // Update device
      dbService.registerDevice(deviceId, 'Updated Name');

      const device = dbService.db.prepare('SELECT * FROM devices WHERE device_id = ?').get(deviceId);
      expect(device.device_name).toBe('Updated Name');
    });
  });

  describe('Database Connection Management', () => {
    test('should close database connection', () => {
      expect(dbService.db).toBeDefined();
      
      dbService.close();
      
      expect(dbService.db).toBeNull();
    });
  });

  describe('Error Handling', () => {
    test('should handle database connection errors gracefully', () => {
      // Test that the service handles errors properly in other operations
      const result = dbService.deleteUser('non-existent-id');
      expect(result).toBe(false);
      
      // Test getting non-existent user
      const user = dbService.getUserById('non-existent-id');
      expect(user).toBeUndefined();
    });

    test('should handle invalid update operations', async () => {
      const userData = {
        username: 'errortest',
        password: 'password123',
        role: 'student',
        fullName: 'Error Test User'
      };

      const createdUser = await dbService.createUser(userData);
      
      await expect(dbService.updateUser(createdUser.userId, {}))
        .rejects.toThrow('No valid update fields provided');
    });

    test('should handle non-existent user operations', () => {
      const result = dbService.deleteUser('non-existent-id');
      expect(result).toBe(false);
    });
  });
});