const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const isDev = require('electron-is-dev');

// Import services
const AuthService = require('../services/auth');
const DatabaseService = require('../services/database'); // Using SQLite database
const FileService = require('../services/files');

// Initialize services
let authService;
let dbService;
let fileService;

// Keep a global reference of the window object
let mainWindow;

function createWindow() {
  const preloadPath = path.join(__dirname, 'preload.js');
  console.log('Preload script path:', preloadPath);
  console.log('Preload script exists:', require('fs').existsSync(preloadPath));

  // Create the browser window with security best practices
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false, // Security: disable node integration
      contextIsolation: true, // Security: enable context isolation
      enableRemoteModule: false, // Security: disable remote module
      preload: preloadPath, // Use preload script for secure communication
      webSecurity: true, // Security: enable web security
      allowRunningInsecureContent: false, // Security: block insecure content
      experimentalFeatures: false // Security: disable experimental features
    },
    show: false, // Don't show until ready-to-show
    icon: path.join(__dirname, '../assets/icon.png') // App icon
  });

  // Load the app
  const startUrl = isDev
    ? 'http://localhost:3000'
    : `file://${path.join(__dirname, '../build/index.html')}`;

  console.log('Loading URL:', startUrl);
  mainWindow.loadURL(startUrl);

  // Show window when ready to prevent visual flash
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Open DevTools in development
  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Security: Prevent new window creation
  mainWindow.webContents.setWindowOpenHandler(() => {
    return { action: 'deny' };
  });

  // Security: Prevent navigation to external URLs
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl);

    if (parsedUrl.origin !== 'http://localhost:3000' && parsedUrl.origin !== 'file://') {
      event.preventDefault();
    }
  });
}

// Seed test exams for demonstration
async function seedTestExams(dbService) {
  try {
    // Check if exams already exist to avoid duplicates
    const teacher1 = await dbService.getUserByCredentials('teacher1', 'password123');
    if (!teacher1) return;

    const existingExams = dbService.getExamsByTeacher(teacher1.user_id);
    if (existingExams.length > 0) {
      console.log('Test exams already exist, skipping seeding');
      return;
    }

    // Create 5 fresh sample exams for teacher1
    const currentDate = new Date();
    const futureDate1 = new Date(currentDate.getTime() + 7 * 24 * 60 * 60 * 1000); // 1 week from now
    const futureDate2 = new Date(currentDate.getTime() + 14 * 24 * 60 * 60 * 1000); // 2 weeks from now
    const futureDate3 = new Date(currentDate.getTime() + 21 * 24 * 60 * 60 * 1000); // 3 weeks from now
    const futureDate4 = new Date(currentDate.getTime() + 28 * 24 * 60 * 60 * 1000); // 4 weeks from now
    const futureDate5 = new Date(currentDate.getTime() + 35 * 24 * 60 * 60 * 1000); // 5 weeks from now

    const exams = [
      {
        title: 'Mathematics Final Exam',
        startTime: futureDate1.toISOString().slice(0, 19).replace('T', ' '),
        endTime: new Date(futureDate1.getTime() + 3 * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' '),
        allowedApps: ['calc.exe', 'notepad.exe']
      },
      {
        title: 'Physics Midterm Exam',
        startTime: futureDate2.toISOString().slice(0, 19).replace('T', ' '),
        endTime: new Date(futureDate2.getTime() + 2 * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' '),
        allowedApps: ['calc.exe']
      },
      {
        title: 'Computer Science Quiz',
        startTime: futureDate3.toISOString().slice(0, 19).replace('T', ' '),
        endTime: new Date(futureDate3.getTime() + 1.5 * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' '),
        allowedApps: ['Code.exe', 'chrome.exe', 'notepad.exe']
      },
      {
        title: 'Chemistry Lab Assessment',
        startTime: futureDate4.toISOString().slice(0, 19).replace('T', ' '),
        endTime: new Date(futureDate4.getTime() + 2.5 * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' '),
        allowedApps: ['calc.exe', 'ChemSketch.exe']
      },
      {
        title: 'English Literature Essay',
        startTime: futureDate5.toISOString().slice(0, 19).replace('T', ' '),
        endTime: new Date(futureDate5.getTime() + 4 * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' '),
        allowedApps: ['winword.exe', 'notepad.exe']
      }
    ];

    for (const exam of exams) {
      dbService.createExam({
        teacherId: teacher1.user_id,
        title: exam.title,
        pdfPath: null,
        startTime: exam.startTime,
        endTime: exam.endTime,
        allowedApps: exam.allowedApps
      });
    }

    console.log('Created 5 fresh sample exams for teacher1');
  } catch (error) {
    console.error('Error seeding test exams:', error);
  }
}

// Initialize services
async function initializeServices() {
  try {
    console.log('Initializing database service...');
    dbService = new DatabaseService();
    await dbService.initializeDatabase();
    console.log('Database service initialized');

    // Clear existing data and start fresh (development only)
    // dbService.clearAllData(); // DISABLED: This was clearing face registrations
    // console.log('Database cleared');

    // Seed test accounts for development
    await dbService.seedTestAccounts();
    console.log('Test accounts seeded');

    // Create some test exams for demonstration
    await seedTestExams(dbService);
    console.log('Test exams seeded');

    console.log('Initializing auth service...');
    authService = new AuthService(dbService);
    await authService.initialize();
    console.log('Auth service initialized, login method exists:', typeof authService.login);

    console.log('Initializing file service...');
    fileService = new FileService();
    console.log('File service initialized');

    console.log('All services initialized successfully');
  } catch (error) {
    console.error('Failed to initialize services:', error);
    throw error;
  }
}

// IPC handlers for authentication
ipcMain.handle('auth:login', async (event, credentials) => {
  try {
    console.log('IPC auth:login called with:', credentials);
    console.log('authService exists:', !!authService);
    console.log('authService.login exists:', !!(authService && authService.login));

    if (!authService) {
      throw new Error('AuthService not initialized');
    }

    if (typeof authService.login !== 'function') {
      throw new Error('AuthService.login is not a function');
    }

    const result = await authService.login(credentials.username, credentials.password);
    console.log('Login result:', result);
    return result;
  } catch (error) {
    console.error('Login IPC error:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

ipcMain.handle('auth:logout', async (event) => {
  try {
    const result = await authService.logout();
    return result;
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
});

ipcMain.handle('auth:getCurrentUser', async (event) => {
  try {
    const user = authService.getCurrentUser();
    return {
      success: true,
      user
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
});

ipcMain.handle('device:getId', async (event) => {
  try {
    const deviceId = authService.getCurrentDeviceId();
    return {
      success: true,
      deviceId
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
});

// IPC handlers for 2FA and face recognition
ipcMain.handle('auth:verify-face', async (event, sessionId, faceEmbedding) => {
  try {
    console.log('IPC auth:verify-face called with sessionId:', sessionId);

    if (!authService) {
      return {
        success: false,
        error: 'Authentication service not initialized'
      };
    }

    const result = await authService.completeFaceAuth(sessionId, faceEmbedding);
    console.log('Face verification result:', result);

    return result;
  } catch (error) {
    console.error('Face verification error:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

ipcMain.handle('face:store-embedding', async (event, userId, embedding, confidenceScore) => {
  try {
    console.log('IPC face:store-embedding called for user:', userId);

    if (!authService || !authService.faceService) {
      return {
        success: false,
        error: 'Face recognition service not initialized'
      };
    }

    const result = await authService.faceService.storeFaceEmbedding(userId, embedding, confidenceScore);
    console.log('Face embedding stored:', result);

    return {
      success: true,
      data: result
    };
  } catch (error) {
    console.error('Face embedding storage error:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

ipcMain.handle('face:verify-embedding', async (event, userId, embedding) => {
  try {
    console.log('IPC face:verify-embedding called for user:', userId);

    if (!authService || !authService.faceService) {
      return {
        success: false,
        error: 'Face recognition service not initialized'
      };
    }

    const result = await authService.faceService.verifyFace(userId, embedding);
    console.log('Face verification result:', result);

    return {
      success: true,
      data: result
    };
  } catch (error) {
    console.error('Face verification error:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

ipcMain.handle('face:get-threshold', async (event) => {
  try {
    if (!authService || !authService.faceService) {
      return {
        success: false,
        error: 'Face recognition service not initialized'
      };
    }

    const threshold = authService.faceService.getMatchingThreshold();

    return {
      success: true,
      threshold
    };
  } catch (error) {
    console.error('Get threshold error:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

ipcMain.handle('face:set-threshold', async (event, threshold) => {
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser || currentUser.role !== 'admin') {
      return {
        success: false,
        error: 'Admin access required'
      };
    }

    if (!authService || !authService.faceService) {
      return {
        success: false,
        error: 'Face recognition service not initialized'
      };
    }

    const result = authService.faceService.setMatchingThreshold(threshold);

    return {
      success: true,
      threshold: authService.faceService.getMatchingThreshold()
    };
  } catch (error) {
    console.error('Set threshold error:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

ipcMain.handle('face:has-registered', async (event, userId) => {
  try {
    if (!authService || !authService.faceService) {
      return {
        success: false,
        error: 'Face recognition service not initialized'
      };
    }

    const hasRegistered = authService.faceService.hasRegisteredFace(userId);

    return {
      success: true,
      hasRegistered
    };
  } catch (error) {
    console.error('Check face registration error:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

ipcMain.handle('face:register-multiple', async (event, userId, embeddings, confidenceScores) => {
  try {
    console.log('IPC face:register-multiple called for user:', userId);

    if (!authService || !authService.faceService) {
      return {
        success: false,
        error: 'Face recognition service not initialized'
      };
    }

    const result = await authService.faceService.registerUserFaceWithMultipleCaptures(userId, embeddings, confidenceScores);
    console.log('Multiple face registration result:', result);

    return {
      success: true,
      data: result
    };
  } catch (error) {
    console.error('Multiple face registration error:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// IPC handlers for student exam access
ipcMain.handle('db:getAvailableExams', async (event, studentId) => {
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser || currentUser.role !== 'student') {
      return {
        success: false,
        error: 'Unauthorized: Only students can access available exams'
      };
    }

    const exams = dbService.getAvailableExams(studentId);
    return {
      success: true,
      exams
    };
  } catch (error) {
    console.error('Error getting available exams:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

ipcMain.handle('db:getStudentExamHistory', async (event, studentId) => {
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser || (currentUser.role !== 'student' && currentUser.userId !== studentId)) {
      return {
        success: false,
        error: 'Unauthorized: Cannot access other student\'s exam history'
      };
    }

    // Get completed exams for this student from events table
    const history = dbService.getStudentExamHistory(studentId);
    return {
      success: true,
      exams: history
    };
  } catch (error) {
    console.error('Error getting student exam history:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

ipcMain.handle('monitoring:start', async (event, examId, studentId, allowedApps) => {
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser || currentUser.role !== 'student') {
      return {
        success: false,
        error: 'Unauthorized: Only students can start monitoring'
      };
    }

    // Log exam start event
    const deviceId = authService.getCurrentDeviceId();
    dbService.logEvent({
      examId,
      studentId,
      deviceId,
      eventType: 'exam_start',
      windowTitle: null,
      processName: null,
      isViolation: false
    });

    // TODO: Start actual monitoring service (will be implemented in task 7)
    console.log('Monitoring started for exam:', examId, 'student:', studentId);

    return {
      success: true,
      message: 'Monitoring started successfully'
    };
  } catch (error) {
    console.error('Error starting monitoring:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

ipcMain.handle('monitoring:stop', async (event) => {
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser || currentUser.role !== 'student') {
      return {
        success: false,
        error: 'Unauthorized: Only students can stop monitoring'
      };
    }

    // TODO: Stop actual monitoring service (will be implemented in task 7)
    console.log('Monitoring stopped for user:', currentUser.userId);

    return {
      success: true,
      message: 'Monitoring stopped successfully'
    };
  } catch (error) {
    console.error('Error stopping monitoring:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// IPC handlers for exam management
ipcMain.handle('exam:create', async (event, examData) => {
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser || currentUser.role !== 'teacher') {
      return {
        success: false,
        error: 'Unauthorized: Only teachers can create exams'
      };
    }

    let pdfPath = null;

    // Handle PDF file upload if provided
    if (examData.pdfFile) {
      const { dialog } = require('electron');

      // In a real implementation, we would handle the file from the renderer
      // For now, we'll simulate the file upload process
      try {
        const uploadResult = await fileService.uploadPDF(
          examData.pdfFile.path, // This would come from the file dialog
          `temp-${Date.now()}`, // Temporary exam ID
          examData.pdfFile.name
        );
        pdfPath = uploadResult.filePath;
      } catch (fileError) {
        return {
          success: false,
          error: `File upload failed: ${fileError.message}`
        };
      }
    }

    // Create exam in database
    const exam = dbService.createExam({
      teacherId: currentUser.userId,
      title: examData.title,
      pdfPath: pdfPath,
      startTime: examData.startTime,
      endTime: examData.endTime,
      allowedApps: examData.allowedApps
    });

    // If we uploaded a PDF with a temporary name, rename it to use the actual exam ID
    if (pdfPath && examData.pdfFile) {
      const newUploadResult = await fileService.uploadPDF(
        pdfPath,
        exam.examId,
        examData.pdfFile.name
      );

      // Delete the temporary file
      fileService.deletePDF(`temp-${Date.now()}`);

      // Update exam with correct PDF path
      dbService.updateExam(exam.examId, { pdfPath: newUploadResult.filePath });
      exam.pdfPath = newUploadResult.filePath;
    }

    return {
      success: true,
      exam
    };
  } catch (error) {
    console.error('Error creating exam:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

ipcMain.handle('exam:getByTeacher', async (event, teacherId) => {
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser || (currentUser.role !== 'teacher' && currentUser.userId !== teacherId)) {
      return {
        success: false,
        error: 'Unauthorized: Cannot access other teacher\'s exams'
      };
    }

    const exams = dbService.getExamsByTeacher(teacherId);
    return {
      success: true,
      exams
    };
  } catch (error) {
    console.error('Error getting exams by teacher:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

ipcMain.handle('exam:update', async (event, updateData) => {
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser || currentUser.role !== 'teacher') {
      return {
        success: false,
        error: 'Unauthorized: Only teachers can update exams'
      };
    }

    // Get existing exam to verify ownership
    const existingExam = dbService.getExamById(updateData.examId);
    if (!existingExam) {
      return {
        success: false,
        error: 'Exam not found'
      };
    }

    if (existingExam.teacherId !== currentUser.userId) {
      return {
        success: false,
        error: 'Unauthorized: Cannot update other teacher\'s exam'
      };
    }

    let pdfPath = existingExam.pdfPath;

    // Handle PDF removal
    if (updateData.removePdf && existingExam.pdfPath) {
      fileService.deletePDF(updateData.examId);
      pdfPath = null;
    }

    // Handle new PDF upload
    if (updateData.pdfFile) {
      try {
        const uploadResult = await fileService.uploadPDF(
          updateData.pdfFile.path,
          updateData.examId,
          updateData.pdfFile.name
        );
        pdfPath = uploadResult.filePath;
      } catch (fileError) {
        return {
          success: false,
          error: `File upload failed: ${fileError.message}`
        };
      }
    }

    // Update exam in database
    const updateFields = {
      title: updateData.title,
      startTime: updateData.startTime,
      endTime: updateData.endTime,
      allowedApps: updateData.allowedApps,
      pdfPath: pdfPath
    };

    const success = dbService.updateExam(updateData.examId, updateFields);

    if (!success) {
      return {
        success: false,
        error: 'Failed to update exam'
      };
    }

    // Return updated exam
    const updatedExam = dbService.getExamById(updateData.examId);
    return {
      success: true,
      exam: updatedExam
    };
  } catch (error) {
    console.error('Error updating exam:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

ipcMain.handle('exam:delete', async (event, examId) => {
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser || currentUser.role !== 'teacher') {
      return {
        success: false,
        error: 'Unauthorized: Only teachers can delete exams'
      };
    }

    // Get existing exam to verify ownership
    const existingExam = dbService.getExamById(examId);
    if (!existingExam) {
      return {
        success: false,
        error: 'Exam not found'
      };
    }

    if (existingExam.teacherId !== currentUser.userId) {
      return {
        success: false,
        error: 'Unauthorized: Cannot delete other teacher\'s exam'
      };
    }

    // Delete associated PDF file if exists
    if (existingExam.pdfPath) {
      fileService.deletePDF(examId);
    }

    // Delete exam from database
    const success = dbService.deleteExam(examId);

    return {
      success,
      error: success ? null : 'Failed to delete exam'
    };
  } catch (error) {
    console.error('Error deleting exam:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// IPC handlers for admin user management
ipcMain.handle('admin:get-users', async (event, filters) => {
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser || currentUser.role !== 'admin') {
      return {
        success: false,
        error: 'Admin access required'
      };
    }

    // Get all users with face registration status
    const stmt = dbService.db.prepare(`
      SELECT user_id, username, role, full_name, email, has_registered_face, 
             face_registration_date, created_at, created_by, last_login
      FROM users 
      ORDER BY created_at DESC
    `);

    const users = stmt.all();

    return {
      success: true,
      users
    };
  } catch (error) {
    console.error('Get users error:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

ipcMain.handle('admin:create-user', async (event, userData) => {
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser || currentUser.role !== 'admin') {
      return {
        success: false,
        error: 'Admin access required'
      };
    }

    const user = await dbService.createUser({
      ...userData,
      createdBy: currentUser.userId
    });

    // Log admin action
    dbService.logAuditEvent(currentUser.userId, 'USER_CREATED', {
      createdUserId: user.userId,
      createdUserRole: userData.role
    });

    return {
      success: true,
      user
    };
  } catch (error) {
    console.error('Create user error:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

ipcMain.handle('admin:bulk-create-users', async (event, csvData) => {
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser || currentUser.role !== 'admin') {
      return {
        success: false,
        error: 'Admin access required'
      };
    }

    const result = await dbService.bulkCreateUsers(csvData, currentUser.userId);

    // Log admin action
    dbService.logAuditEvent(currentUser.userId, 'BULK_USERS_CREATED', {
      totalUsers: result.total,
      successfulUsers: result.successful.length,
      failedUsers: result.failed.length
    });

    return {
      success: true,
      data: result
    };
  } catch (error) {
    console.error('Bulk create users error:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

ipcMain.handle('admin:update-user', async (event, userId, updateData) => {
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser || currentUser.role !== 'admin') {
      return {
        success: false,
        error: 'Admin access required'
      };
    }

    const result = await dbService.updateUser(userId, updateData);

    if (result) {
      // Log admin action
      dbService.logAuditEvent(currentUser.userId, 'USER_UPDATED', {
        updatedUserId: userId,
        updateFields: Object.keys(updateData)
      });
    }

    return {
      success: result,
      message: result ? 'User updated successfully' : 'User not found or no changes made'
    };
  } catch (error) {
    console.error('Update user error:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

ipcMain.handle('admin:delete-user', async (event, userId) => {
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser || currentUser.role !== 'admin') {
      return {
        success: false,
        error: 'Admin access required'
      };
    }

    // Get user info before deletion for logging
    const userToDelete = dbService.getUserById(userId);

    // Delete face embedding first
    if (authService.faceService) {
      await authService.faceService.deleteFaceEmbedding(userId);
    }

    // Delete user
    const result = dbService.deleteUser(userId);

    if (result && userToDelete) {
      // Log admin action
      dbService.logAuditEvent(currentUser.userId, 'USER_DELETED', {
        deletedUserId: userId,
        deletedUserRole: userToDelete.role,
        deletedUsername: userToDelete.username
      });
    }

    return {
      success: result,
      message: result ? 'User deleted successfully' : 'User not found'
    };
  } catch (error) {
    console.error('Delete user error:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

ipcMain.handle('admin:get-audit-logs', async (event, filters) => {
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser || currentUser.role !== 'admin') {
      return {
        success: false,
        error: 'Admin access required'
      };
    }

    const logs = dbService.getAuditLogs(filters || {});

    return {
      success: true,
      logs
    };
  } catch (error) {
    console.error('Get audit logs error:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

ipcMain.handle('admin:get-face-stats', async (event) => {
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser || currentUser.role !== 'admin') {
      return {
        success: false,
        error: 'Admin access required'
      };
    }

    if (!authService.faceService) {
      return {
        success: false,
        error: 'Face recognition service not initialized'
      };
    }

    const stats = authService.faceService.getFaceRegistrationStats();

    return {
      success: true,
      stats
    };
  } catch (error) {
    console.error('Get face stats error:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

ipcMain.handle('admin:get-system-settings', async (event) => {
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser || currentUser.role !== 'admin') {
      return {
        success: false,
        error: 'Admin access required'
      };
    }

    const settings = {
      face_matching_threshold: dbService.getSystemSetting('face_matching_threshold') || 0.45,
      max_login_attempts: dbService.getSystemSetting('max_login_attempts') || 5,
      session_timeout: dbService.getSystemSetting('session_timeout') || 28800000
    };

    return {
      success: true,
      settings
    };
  } catch (error) {
    console.error('Get system settings error:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

ipcMain.handle('admin:update-system-settings', async (event, settings) => {
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser || currentUser.role !== 'admin') {
      return {
        success: false,
        error: 'Admin access required'
      };
    }

    // Update each setting
    for (const [key, value] of Object.entries(settings)) {
      const type = typeof value === 'number' ? 'number' : 'string';
      dbService.setSystemSetting(key, value, type, null, currentUser.userId);
    }

    // Log admin action
    dbService.logAuditEvent(currentUser.userId, 'SYSTEM_SETTINGS_UPDATED', {
      updatedSettings: Object.keys(settings)
    });

    return {
      success: true,
      message: 'System settings updated successfully'
    };
  } catch (error) {
    console.error('Update system settings error:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// App event handlers
app.whenReady().then(async () => {
  await initializeServices();
  createWindow();
});

app.on('window-all-closed', () => {
  // On macOS, keep app running even when all windows are closed
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On macOS, re-create window when dock icon is clicked
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Security: Prevent new window creation from renderer
app.on('web-contents-created', (event, contents) => {
  contents.on('new-window', (event, navigationUrl) => {
    event.preventDefault();
  });
});