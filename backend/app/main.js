// Load .env from project root (try multiple paths for dev vs packaged)
const path = require('path');
const fs = require('fs');
const envPaths = [
  path.join(__dirname, '../../.env'),
  path.join(process.cwd(), '.env'),
];
let loaded = false;
for (const envPath of envPaths) {
  if (fs.existsSync(envPath)) {
    require('dotenv').config({ path: envPath });
    loaded = true;
    break;
  }
}
if (!loaded) {
  require('dotenv').config({ path: envPaths[0] }); // fallback (no-op if missing)
}
const hasGroq = process.env.GROQ_API_KEY && !process.env.GROQ_API_KEY.includes('your_');
const hasGemini = process.env.GEMINI_API_KEY && !process.env.GEMINI_API_KEY.includes('your_');
if (!hasGroq && !hasGemini) {
  console.warn('No AI key set. Add GROQ_API_KEY (https://console.groq.com/) or GEMINI_API_KEY (https://aistudio.google.com/) to .env');
}

const { app, BrowserWindow, ipcMain } = require('electron');

// Determine run mode based on NODE_ENV
// If NODE_ENV is 'production', use production build
// Otherwise, use development server
const runInDevMode = process.env.NODE_ENV !== 'production';

// Import services
const AuthService = require('../services/auth');
const DatabaseService = require('../services/database'); // Using SQLite database
const FileService = require('../services/files');
const MonitoringController = require('../services/monitoringController');

// Initialize services
let authService;
let dbService;
let fileService;
let monitoringController;

// Keep a global reference of the window object
let mainWindow;

function createWindow() {
  const preloadPath = path.join(__dirname, 'preload.js');
  console.log('Preload script path:', preloadPath);
  console.log('Preload script exists:', require('fs').existsSync(preloadPath));

  const iconPath = path.join(__dirname, '../assets/icon.png');
  const browserOptions = {
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
    show: false // Don't show until ready-to-show
  };
  if (require('fs').existsSync(iconPath)) {
    browserOptions.icon = iconPath;
  }
  mainWindow = new BrowserWindow(browserOptions);

  // Load the app
  const startUrl = runInDevMode
    ? 'http://localhost:3001'
    : `file://${path.join(__dirname, '../../frontend/build/index.html')}`;
  console.log('Environment:', process.env.NODE_ENV || 'development');
  console.log('Running in dev mode:', runInDevMode);
  console.log('Loading URL:', startUrl);
  console.log('Build path exists:', require('fs').existsSync(path.join(__dirname, '../../frontend/build/index.html')));

  mainWindow.loadURL(startUrl).catch(err => {
    console.error('Failed to load URL:', err);
  });

  // Show window when ready to prevent visual flash
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Open DevTools in development or for debugging production
  if (runInDevMode) {
    mainWindow.webContents.openDevTools();
  }

  // Temporarily open DevTools in production to debug
  mainWindow.webContents.openDevTools();

  // Log any loading errors
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('Failed to load:', errorCode, errorDescription);
  });

  // Log when page finishes loading
  mainWindow.webContents.on('did-finish-load', () => {
    console.log('Page finished loading');
    // Check if React root exists
    mainWindow.webContents.executeJavaScript('document.getElementById("root") ? "Root found" : "Root NOT found"')
      .then(result => console.log('Root element:', result));
  });

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

    if (parsedUrl.origin !== 'http://localhost:3001' && parsedUrl.origin !== 'file://') {
      event.preventDefault();
    }
  });
}

// No test data seeding - all data will be managed dynamically by admin

// Store init error so frontend can display it (e.g. when better-sqlite3 is blocked)
let initError = null;

// Initialize services
async function initializeServices() {
  try {
    console.log('Initializing database service...');
    dbService = new DatabaseService();
    await dbService.initializeDatabase();
    console.log('Database service initialized');

    // Initialize default admin account and system settings
    await dbService.initializeDefaultAdmin();
    console.log('Default admin initialized');

    console.log('Initializing auth service...');
    authService = new AuthService(dbService);
    await authService.initialize();
    console.log('Auth service initialized, login method exists:', typeof authService.login);

    console.log('Initializing file service...');
    fileService = new FileService();
    console.log('File service initialized');

    console.log('Initializing monitoring controller...');
    monitoringController = new MonitoringController(dbService);
    setupMonitoringEventHandlers();
    console.log('Monitoring controller initialized');

    console.log('All services initialized successfully');
  } catch (error) {
    console.error('Failed to initialize services:', error);
    initError = error;
    // Don't throw - let createWindow run so user sees the app and error message
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
    if (!authService) {
      return { success: false, error: initError?.message || 'System not initialized' };
    }
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

// Setup monitoring event handlers for real-time communication
function setupMonitoringEventHandlers() {
  if (!monitoringController) {
    return;
  }

  // Handle monitoring started
  monitoringController.on('monitoringStarted', (data) => {
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('monitoring:started', data);
    }
  });

  // Handle monitoring stopped
  monitoringController.on('monitoringStopped', (data) => {
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('monitoring:stopped', data);
    }
  });

  // Handle violation started - real-time warning display
  monitoringController.on('violationStarted', (violationData) => {
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('monitoring:violation-started', violationData);
    }
  });

  // Handle violation ended - update warning display
  monitoringController.on('violationEnded', (violationData) => {
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('monitoring:violation-ended', violationData);
    }
  });

  // Handle application changes
  monitoringController.on('applicationChanged', (changeData) => {
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('monitoring:application-changed', changeData);
    }
  });

  // Handle monitoring errors
  monitoringController.on('error', (errorData) => {
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('monitoring:error', errorData);
    }
  });

  // Handle critical errors
  monitoringController.on('criticalError', (errorData) => {
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('monitoring:critical-error', errorData);
    }
  });

  // Handle service restart
  monitoringController.on('serviceRestarted', (data) => {
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('monitoring:service-restarted', data);
    }
  });
}

// Enhanced monitoring IPC handlers
ipcMain.handle('monitoring:start', async (event, examId, studentId, allowedApps) => {
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser || currentUser.role !== 'student') {
      return {
        success: false,
        error: 'Unauthorized: Only students can start monitoring'
      };
    }

    // Validate that the student can only start monitoring for themselves
    if (currentUser.userId !== studentId) {
      return {
        success: false,
        error: 'Unauthorized: Cannot start monitoring for another student'
      };
    }

    // Get device ID
    const deviceId = authService.getCurrentDeviceId();

    // Validate exam exists and is accessible
    const exam = dbService.getExamById(examId);
    if (!exam) {
      return {
        success: false,
        error: 'Exam not found'
      };
    }

    // Check if exam is currently active
    const now = new Date();
    const examStart = new Date(exam.startTime);
    const examEnd = new Date(exam.endTime);

    if (now < examStart) {
      return {
        success: false,
        error: 'Exam has not started yet'
      };
    }

    if (now > examEnd) {
      return {
        success: false,
        error: 'Exam has already ended'
      };
    }

    // Log exam start event
    dbService.logEvent({
      examId,
      studentId,
      deviceId,
      eventType: 'exam_start',
      windowTitle: null,
      processName: null,
      isViolation: false
    });

    // Start monitoring with MonitoringController
    const result = await monitoringController.startExamMonitoring(
      examId,
      studentId,
      deviceId,
      allowedApps || exam.allowedApps
    );

    if (result.success) {
      console.log('Enhanced monitoring started for exam:', examId, 'student:', studentId);
    }

    return result;

  } catch (error) {
    console.error('Error starting enhanced monitoring:', error);
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

    // Stop monitoring with MonitoringController
    const result = await monitoringController.stopExamMonitoring();

    if (result.success) {
      console.log('Enhanced monitoring stopped for user:', currentUser.userId);
    }

    return result;

  } catch (error) {
    console.error('Error stopping enhanced monitoring:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// Get current monitoring status
ipcMain.handle('monitoring:status', async (event) => {
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser) {
      return {
        success: false,
        error: 'User not authenticated'
      };
    }

    const status = monitoringController.getMonitoringStatus();

    return {
      success: true,
      status
    };

  } catch (error) {
    console.error('Error getting monitoring status:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// Get monitoring status (alias for compatibility)
ipcMain.handle('monitoring:get-status', async (event) => {
  try {
    const status = monitoringController.getMonitoringStatus();
    return {
      success: true,
      ...status
    };
  } catch (error) {
    console.error('Error getting monitoring status:', error);
    return {
      success: false,
      isActive: false,
      error: error.message
    };
  }
});

// Update monitoring configuration (admin only)
ipcMain.handle('monitoring:update-config', async (event, config) => {
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser || currentUser.role !== 'admin') {
      return {
        success: false,
        error: 'Admin access required'
      };
    }

    monitoringController.updateConfiguration(config);

    return {
      success: true,
      message: 'Monitoring configuration updated'
    };

  } catch (error) {
    console.error('Error updating monitoring configuration:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// Get violation data for teachers
ipcMain.handle('monitoring:get-violations', async (event, examId) => {
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser || currentUser.role !== 'teacher') {
      return {
        success: false,
        error: 'Unauthorized: Only teachers can view violation data'
      };
    }

    // Verify teacher owns the exam
    const exam = dbService.getExamById(examId);
    if (!exam) {
      return {
        success: false,
        error: 'Exam not found'
      };
    }

    if (exam.teacherId !== currentUser.userId) {
      return {
        success: false,
        error: 'Unauthorized: Cannot view violations for other teacher\'s exam'
      };
    }

    // Get violation data
    const violations = dbService.getAppViolationsByExam(examId);
    const stats = dbService.getViolationStatsByExam(examId);
    const participantCount = dbService.getExamParticipantsCount(examId);

    return {
      success: true,
      violations,
      stats,
      participantCount
    };

  } catch (error) {
    console.error('Error getting violation data:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// Get student's own violations
ipcMain.handle('monitoring:get-student-violations', async (event, examId) => {
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser || currentUser.role !== 'student') {
      return {
        success: false,
        error: 'Unauthorized: Only students can view their own violations'
      };
    }

    // If examId is null, get all violations for the student
    const violations = examId
      ? dbService.getAppViolationsByStudent(currentUser.userId, examId)
      : dbService.getAllViolationsByStudent(currentUser.userId);

    return {
      success: true,
      violations
    };

  } catch (error) {
    console.error('Error getting student violations:', error);
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
    if (examData.pdfFilePath && examData.pdfFileName) {
      try {
        // Validate that the file exists
        const fs = require('fs');
        if (!fs.existsSync(examData.pdfFilePath)) {
          return {
            success: false,
            error: 'Selected PDF file does not exist'
          };
        }

        const uploadResult = await fileService.uploadPDF(
          examData.pdfFilePath,
          `temp-${Date.now()}`, // Temporary exam ID
          examData.pdfFileName
        );
        pdfPath = uploadResult.filePath;
      } catch (fileError) {
        console.error('PDF upload error:', fileError);
        return {
          success: false,
          error: `File upload failed: ${fileError.message}`
        };
      }
    }

    // Create exam in database
    console.log('Creating exam with data:', {
      title: examData.title,
      courseId: examData.courseId,
      startTime: examData.startTime,
      endTime: examData.endTime
    });

    const exam = dbService.createExam({
      teacherId: currentUser.userId,
      courseId: examData.courseId,
      title: examData.title,
      pdfPath: pdfPath,
      startTime: examData.startTime,
      endTime: examData.endTime,
      allowedApps: examData.allowedApps
    });

    // If we uploaded a PDF with a temporary name, rename it to use the actual exam ID
    if (pdfPath && examData.pdfFileName) {
      try {
        const newUploadResult = await fileService.uploadPDF(
          pdfPath,
          exam.examId,
          examData.pdfFileName
        );

        // Delete the temporary file (extract temp ID from path)
        const tempId = path.basename(pdfPath, path.extname(pdfPath)).split('_')[0];
        fileService.deletePDF(tempId);

        // Update exam with correct PDF path
        dbService.updateExam(exam.examId, { pdfPath: newUploadResult.filePath });
        exam.pdfPath = newUploadResult.filePath;
      } catch (renameError) {
        console.error('Error renaming PDF file:', renameError);
        // Continue with the temporary file path
      }
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

// Get exam by ID
ipcMain.handle('exam:getById', async (event, examId) => {
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser) {
      return {
        success: false,
        error: 'Unauthorized: User not authenticated'
      };
    }

    const exam = dbService.getExamById(examId);

    if (!exam) {
      return {
        success: false,
        error: 'Exam not found'
      };
    }

    return {
      success: true,
      exam
    };
  } catch (error) {
    console.error('Error getting exam by ID:', error);
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
      console.log('Authorization failed - Exam teacherId:', existingExam.teacherId, 'Current userId:', currentUser.userId);
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
    if (updateData.pdfFilePath && updateData.pdfFileName) {
      try {
        // Validate that the file exists
        const fs = require('fs');
        if (!fs.existsSync(updateData.pdfFilePath)) {
          return {
            success: false,
            error: 'Selected PDF file does not exist'
          };
        }

        const uploadResult = await fileService.uploadPDF(
          updateData.pdfFilePath,
          updateData.examId,
          updateData.pdfFileName
        );
        pdfPath = uploadResult.filePath;
      } catch (fileError) {
        console.error('PDF upload error:', fileError);
        return {
          success: false,
          error: `File upload failed: ${fileError.message}`
        };
      }
    }

    // Update exam in database — always stamp updatedAt so student timers detect the change
    const nowIso = new Date().toISOString();
    const updateFields = {
      title: updateData.title,
      startTime: updateData.startTime,
      endTime: updateData.endTime,
      allowedApps: updateData.allowedApps,
      pdfPath: pdfPath,
      updatedAt: nowIso
    };

    const success = dbService.updateExam(updateData.examId, updateFields);

    if (!success) {
      return {
        success: false,
        error: 'Failed to update exam'
      };
    }

    // Broadcast to all renderer windows so students see the update immediately
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('exam-updated', { examId: updateData.examId });
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

ipcMain.handle('exam:get-student-session', async (event, examId) => {
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser || currentUser.role !== 'student') {
      return { success: false, error: 'Only students can access exam sessions' };
    }

    const exam = dbService.getExamById(examId);
    if (!exam) return { success: false, error: 'Exam not found' };

    const now = new Date().toISOString();
    const durationSeconds = (exam.duration || 120) * 60;

    let session = dbService.getStudentExamSession(examId, currentUser.userId);

    if (!session) {
      // First time this student opens the exam — create session
      dbService.createStudentExamSession({
        examId,
        studentId: currentUser.userId,
        startedAt: now,
        examUpdatedAt: exam.updatedAt || now
      });
      return {
        success: true,
        remainingSeconds: durationSeconds,
        isReset: false,
        fresh: true
      };
    }

    // Check if teacher updated exam AFTER this student started
    const examUpdatedAt = exam.updatedAt;
    const sessionExamUpdatedAt = session.exam_updated_at;
    const wasUpdated = examUpdatedAt && sessionExamUpdatedAt && examUpdatedAt > sessionExamUpdatedAt;

    if (wasUpdated) {
      // Reset session — give student a fresh full duration
      dbService.updateStudentExamSession(examId, currentUser.userId, {
        startedAt: now,
        examUpdatedAt: examUpdatedAt
      });
      return {
        success: true,
        remainingSeconds: durationSeconds,
        isReset: true,
        fresh: true
      };
    }

    // Student already has a valid session — calculate remaining time
    const elapsedMs = new Date(now) - new Date(session.started_at);
    const elapsedSeconds = Math.floor(elapsedMs / 1000);
    const remainingSeconds = Math.max(0, durationSeconds - elapsedSeconds);

    return {
      success: true,
      remainingSeconds,
      isReset: false,
      fresh: false
    };
  } catch (error) {
    console.error('Error getting student exam session:', error);
    return { success: false, error: error.message };
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
      console.log('Authorization failed - Exam teacherId:', existingExam.teacherId, 'Current userId:', currentUser.userId);
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

// Submit exam
ipcMain.handle('exam:submit', async (event, examId, filesData) => {
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser || currentUser.role !== 'student') {
      return {
        success: false,
        error: 'Unauthorized: Only students can submit exams'
      };
    }

    const submission = dbService.submitExam(examId, currentUser.userId, filesData);

    return {
      success: true,
      submission
    };
  } catch (error) {
    console.error('Error submitting exam:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// Get exam submission
ipcMain.handle('exam:get-submission', async (event, examId) => {
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser || currentUser.role !== 'student') {
      return {
        success: false,
        error: 'Unauthorized'
      };
    }

    const submission = dbService.getExamSubmission(examId, currentUser.userId);

    return {
      success: true,
      submission
    };
  } catch (error) {
    console.error('Error getting submission:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// Unsubmit exam
ipcMain.handle('exam:unsubmit', async (event, examId) => {
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser || currentUser.role !== 'student') {
      return {
        success: false,
        error: 'Unauthorized'
      };
    }

    dbService.unsubmitExam(examId, currentUser.userId);

    return {
      success: true
    };
  } catch (error) {
    console.error('Error unsubmitting exam:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// ============================================
// COURSE MANAGEMENT IPC HANDLERS
// ============================================

ipcMain.handle('course:create', async (event, courseData) => {
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser || currentUser.role !== 'teacher') {
      return { success: false, error: 'Only teachers can create courses' };
    }

    const course = dbService.createCourse({
      ...courseData,
      teacherId: currentUser.userId
    });

    return { success: true, course };
  } catch (error) {
    console.error('Error creating course:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('course:getByTeacher', async (event, teacherId) => {
  try {
    const courses = dbService.getCoursesByTeacher(teacherId);
    return { success: true, courses };
  } catch (error) {
    console.error('Error getting courses:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('course:enroll', async (event, courseId, studentId) => {
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser || (currentUser.role !== 'teacher' && currentUser.role !== 'admin')) {
      return { success: false, error: 'Unauthorized' };
    }

    const enrollment = dbService.enrollStudent(courseId, studentId);
    return { success: true, enrollment };
  } catch (error) {
    console.error('Error enrolling student:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('course:getEnrolled', async (event, courseId) => {
  try {
    const students = dbService.getEnrolledStudents(courseId);
    return { success: true, students };
  } catch (error) {
    console.error('Error getting enrolled students:', error);
    return { success: false, error: error.message };
  }
});

// Get all students for course enrollment - allows teachers and admins
ipcMain.handle('course:getStudentsForEnrollment', async () => {
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser || (currentUser.role !== 'teacher' && currentUser.role !== 'admin')) {
      return { success: false, error: 'Unauthorized: Teachers and admins only' };
    }

    const stmt = dbService.db.prepare(`
      SELECT user_id, username, full_name, email
      FROM users
      WHERE role = 'student'
      ORDER BY full_name ASC
    `);
    const students = stmt.all();
    return { success: true, students };
  } catch (error) {
    console.error('Error getting students for enrollment:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('course:getStudentCourses', async (event, studentId) => {
  try {
    const courses = dbService.getStudentCourses(studentId);
    return { success: true, courses };
  } catch (error) {
    console.error('Error getting student courses:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('course:unenroll', async (event, courseId, studentId) => {
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser || (currentUser.role !== 'teacher' && currentUser.role !== 'admin')) {
      return { success: false, error: 'Unauthorized' };
    }

    const success = dbService.unenrollStudent(courseId, studentId);
    return { success };
  } catch (error) {
    console.error('Error unenrolling student:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('course:getAllCourses', async (event) => {
  try {
    const stmt = dbService.db.prepare(`
      SELECT c.*, u.full_name as teacher_name,
             (SELECT COUNT(*) FROM enrollments WHERE course_id = c.course_id AND status = 'active') as student_count
      FROM courses c
      JOIN users u ON c.teacher_id = u.user_id
      ORDER BY c.course_name
    `);
    const courses = stmt.all();
    return { success: true, courses };
  } catch (error) {
    console.error('Error getting all courses:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('course:selfEnroll', async (event, courseId) => {
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser || currentUser.role !== 'student') {
      return { success: false, error: 'Only students can self-enroll' };
    }

    const enrollment = dbService.enrollStudent(courseId, currentUser.userId);
    return { success: true, enrollment };
  } catch (error) {
    console.error('Error self-enrolling:', error);
    return { success: false, error: error.message };
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

ipcMain.handle('system:get-setup-status', async (event) => {
  try {
    if (!dbService) {
      return { success: false, error: initError?.message || 'System not initialized' };
    }
    const setupStatus = dbService.isSystemSetup();
    return {
      success: true,
      data: setupStatus
    };
  } catch (error) {
    console.error('Get system setup status error:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// Return init error so frontend can show user-friendly message
ipcMain.handle('system:get-init-error', async () => {
  return initError ? { hasError: true, message: initError.message } : { hasError: false };
});

// ============================================
// TEST CASE GENERATION - AI & Code Execution
// ============================================

const aiService = require('../services/aiService');
const codeExecutionService = require('../services/codeExecutionService');
const conceptDetectionService = require('../services/conceptDetectionService');
const codeAnalysisService = require('../services/codeAnalysisService');

// Concept detection cache: Map<cacheKey, { result, expiresAt }>
// Keyed by questionId + first 400 chars of code; TTL 5 minutes.
const conceptCache = new Map();
const CONCEPT_CACHE_TTL_MS = 5 * 60 * 1000;

function getConceptCacheKey(questionId, sourceCode) {
  return `${questionId}::${sourceCode.slice(0, 400)}`;
}

// Concurrency limit for code submissions (multiple students can submit at once)
const SUBMISSION_CONCURRENCY = 10;
let activeSubmissions = 0;
const submissionQueue = [];

function acquireSubmissionSlot() {
  return new Promise((resolve) => {
    function tryAcquire() {
      if (activeSubmissions < SUBMISSION_CONCURRENCY) {
        activeSubmissions++;
        resolve();
      } else {
        submissionQueue.push(tryAcquire);
      }
    }
    tryAcquire();
  });
}

function releaseSubmissionSlot() {
  activeSubmissions--;
  if (submissionQueue.length > 0) {
    const next = submissionQueue.shift();
    next();
  }
}

ipcMain.handle('ai:extract-questions', async (event, rawText) => {
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser || (currentUser.role !== 'teacher' && currentUser.role !== 'admin')) {
      return { success: false, error: 'Unauthorized' };
    }
    const questions = await aiService.extractQuestionsFromText(rawText);
    return { success: true, questions };
  } catch (error) {
    console.error('AI extract questions error:', error);
    return { success: false, error: error.message, questions: [] };
  }
});

ipcMain.handle('ai:extract-question-at-index', async (event, rawText, index) => {
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser || (currentUser.role !== 'teacher' && currentUser.role !== 'admin')) {
      return { success: false, error: 'Unauthorized' };
    }
    const question = await aiService.extractQuestionAtIndex(rawText || '', index);
    return { success: true, question };
  } catch (error) {
    console.error('AI extract question at index error:', error);
    return { success: false, error: error.message, question: null };
  }
});

ipcMain.handle('ai:generate-test-cases', async (event, questionText, language, problemType, requiredConcepts) => {
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser || (currentUser.role !== 'teacher' && currentUser.role !== 'admin')) {
      return { success: false, error: 'Unauthorized' };
    }
    const { testCases, referenceSolution } = await aiService.generateTestCases(
      questionText,
      language || 'python',
      problemType || 'basic_programming',
      Array.isArray(requiredConcepts) ? requiredConcepts : []
    );
    return { success: true, testCases, referenceSolution: referenceSolution || '' };
  } catch (error) {
    console.error('AI generate test cases error:', error);
    return { success: false, error: error.message, testCases: [], referenceSolution: '' };
  }
});

ipcMain.handle('ai:analyze-requirements', async (event, problemText) => {
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser || (currentUser.role !== 'teacher' && currentUser.role !== 'admin')) {
      return { success: false, error: 'Unauthorized' };
    }
    const result = await aiService.analyzeProblemRequirements(problemText || '');
    return { success: true, ...result };
  } catch (error) {
    console.error('AI analyze requirements error:', error);
    return { success: false, error: error.message, requiredConcepts: [], isPatternQuestion: false, problemType: 'algorithm' };
  }
});

ipcMain.handle('ai:is-configured', async () => {
  return { configured: aiService.isConfigured() };
});

ipcMain.handle('ai:generate-three-solutions', async (event, questionText, language) => {
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser || (currentUser.role !== 'teacher' && currentUser.role !== 'admin')) {
      return { success: false, error: 'Unauthorized' };
    }
    const { solutions } = await aiService.generateThreeSolutions(questionText, language || 'python');
    return { success: true, solutions: solutions || [] };
  } catch (error) {
    console.error('AI generate three solutions error:', error);
    return { success: false, error: error.message, solutions: [] };
  }
});

ipcMain.handle('ai:fix-pattern-test-cases', async (event, questionId) => {
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser || (currentUser.role !== 'teacher' && currentUser.role !== 'admin')) {
      return { success: false, error: 'Unauthorized' };
    }

    // Load question (for reference solution + language)
    const question = db.getProgrammingQuestionById(questionId);
    if (!question) return { success: false, error: 'Question not found' };
    if (!question.reference_solution) return { success: false, error: 'No reference solution stored for this question — regenerate test cases first' };

    // Load existing test cases
    const testCases = db.getTestCasesByQuestion(questionId);
    if (!testCases || testCases.length === 0) return { success: false, error: 'No test cases found for this question' };

    const language = question.language || 'python';
    const fixResults = await aiService.fixPatternTestCases(question.reference_solution, testCases, language);

    let fixedCount = 0;
    for (const r of fixResults) {
      if (r.fixed && r.newOutput) {
        db.updateTestCase(r.testCaseId, { expected_output: r.newOutput });
        fixedCount++;
      }
    }

    return {
      success: true,
      fixedCount,
      totalChecked: fixResults.length,
      details: fixResults.map(r => ({
        testCaseId: r.testCaseId,
        fixed: r.fixed,
        error: r.error || null
      }))
    };
  } catch (error) {
    console.error('ai:fix-pattern-test-cases error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('code:run', async (event, { sourceCode, stdin, language, timeLimit }) => {
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser) return { success: false, error: 'Not authenticated' };
    const result = await codeExecutionService.runCode(sourceCode, stdin, language, timeLimit);
    return { success: true, ...result };
  } catch (error) {
    console.error('Code run error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('code:run-test-cases', async (event, { sourceCode, testCases, language, timeLimit }) => {
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser) return { success: false, error: 'Not authenticated' };
    const results = await codeExecutionService.runAgainstTestCases(sourceCode, testCases, language, timeLimit);
    const passedCount = results.filter(r => r.passed).length;
    const totalCount = results.length;
    const score = codeExecutionService.computeSubmissionScore(results);
    return { success: true, results, passedCount, totalCount, score };
  } catch (error) {
    console.error('Code run test cases error:', error);
    return { success: false, error: error.message };
  }
});

// Programming questions CRUD
ipcMain.handle('programming:get-questions', async (event, examId) => {
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser) return { success: false, error: 'Not authenticated' };
    const questions = dbService.getProgrammingQuestionsByExam(examId);
    return { success: true, questions };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('programming:create-question', async (event, examId, data) => {
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser || (currentUser.role !== 'teacher' && currentUser.role !== 'admin')) {
      return { success: false, error: 'Unauthorized' };
    }
    const result = dbService.createProgrammingQuestion(examId, data);
    return { success: true, question: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('programming:update-question', async (event, questionId, data) => {
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser || (currentUser.role !== 'teacher' && currentUser.role !== 'admin')) {
      return { success: false, error: 'Unauthorized' };
    }
    dbService.updateProgrammingQuestion(questionId, data);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('programming:delete-question', async (event, questionId) => {
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser || (currentUser.role !== 'teacher' && currentUser.role !== 'admin')) {
      return { success: false, error: 'Unauthorized' };
    }
    dbService.deleteProgrammingQuestion(questionId);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('programming:get-test-cases', async (event, questionId) => {
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser) return { success: false, error: 'Not authenticated' };
    const testCases = dbService.getTestCasesByQuestion(questionId);
    return { success: true, testCases };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('programming:add-test-case', async (event, questionId, data) => {
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser || (currentUser.role !== 'teacher' && currentUser.role !== 'admin')) {
      return { success: false, error: 'Unauthorized' };
    }
    const result = dbService.createTestCase(questionId, data);
    return { success: true, testCase: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('programming:delete-test-case', async (event, testCaseId) => {
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser || (currentUser.role !== 'teacher' && currentUser.role !== 'admin')) {
      return { success: false, error: 'Unauthorized' };
    }
    dbService.deleteTestCase(testCaseId);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('programming:update-test-case', async (event, testCaseId, data) => {
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser || (currentUser.role !== 'teacher' && currentUser.role !== 'admin')) {
      return { success: false, error: 'Unauthorized' };
    }
    dbService.updateTestCase(testCaseId, data);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

function normalizeInputForStdin(inputStr) {
  if (!inputStr || typeof inputStr !== 'string') return inputStr;
  const s = inputStr.trim();
  const arrMatch = s.match(/^\[[\d\s,.-]+\]$/);
  if (arrMatch) {
    try {
      const arr = JSON.parse(s);
      if (Array.isArray(arr) && arr.every(x => typeof x === 'number' || (typeof x === 'string' && /^-?\d+$/.test(x)))) {
        return arr.map(String).join(' ');
      }
    } catch (_) { /* ignore */ }
  }
  try {
    const parsed = JSON.parse(s);
    if (Array.isArray(parsed) && parsed.length > 0) {
      const first = parsed[0];
      if (Array.isArray(first)) {
        const allPairs = first.length === 2 && parsed.every(r => Array.isArray(r) && r.length === 2);
        if (allPairs) {
          return [parsed.length, ...parsed.map(r => r.map(String).join(' '))].join('\n');
        }
        const allSameLen = parsed.every(r => Array.isArray(r) && r.length === first.length);
        if (allSameLen) {
          const lines = [parsed.length + ' ' + first.length];
          for (const row of parsed) {
            lines.push(row.map(String).join(' '));
          }
          return lines.join('\n');
        }
      }
    }
  } catch (_) { /* ignore */ }
  return inputStr;
}

ipcMain.handle('code:verify-test-cases-with-solution', async (event, { questionId, sourceCode, language }) => {
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser || (currentUser.role !== 'teacher' && currentUser.role !== 'admin')) {
      return { success: false, error: 'Unauthorized' };
    }
    const testCases = dbService.getTestCasesByQuestion(questionId);
    if (!testCases.length) {
      return { success: false, error: 'No test cases to verify' };
    }
    const updated = [];
    const timeLimit = 5; // 5 seconds for complex problems (billing, etc.)
    for (const tc of testCases) {
      let inputToUse = tc.input_data || '';
      let runResult = await codeExecutionService.runCode(sourceCode, inputToUse, language || 'python', timeLimit);
      let expectedOutput = runResult.error ? '' : (runResult.stdout || '').trim();
      if (!expectedOutput && runResult.error) {
        const normalized = normalizeInputForStdin(inputToUse);
        if (normalized !== inputToUse) {
          runResult = await codeExecutionService.runCode(sourceCode, normalized, language || 'python', timeLimit);
          if (!runResult.error && runResult.stdout) {
            expectedOutput = (runResult.stdout || '').trim();
            inputToUse = normalized;
          }
        }
      }
      dbService.updateTestCase(tc.test_case_id, { expectedOutput, ...(inputToUse !== tc.input_data ? { input: inputToUse } : {}) });
      updated.push({ ...tc, expected_output: expectedOutput, input_data: inputToUse });
    }
    return { success: true, testCases: updated };
  } catch (error) {
    console.error('Verify test cases error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('programming:submit-code', async (event, examId, questionId, sourceCode, language) => {
  await acquireSubmissionSlot();
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser || currentUser.role !== 'student') {
      return { success: false, error: 'Only students can submit code' };
    }
    const question = dbService.getProgrammingQuestionById(questionId);
    if (!question) return { success: false, error: 'Question not found' };
    const testCases = dbService.getTestCasesByQuestion(questionId);
    const runTestCases = testCases.map(tc => ({
      testCaseId: tc.test_case_id,
      input: tc.input_data,
      expectedOutput: tc.expected_output
    }));
    const opts = {
      problemText: question.problem_text,
      analyzeLogic: aiService.analyzeCodeLogicForPartialCredit.bind(aiService)
    };

    // Step 1: Run test cases in parallel batches of 3 (faster than sequential)
    const results = await codeExecutionService.runTestCasesParallel(
      sourceCode, runTestCases, language || question.language,
      question.time_limit_seconds || 2, opts, 3
    );
    const passedCount = results.filter(r => r.passed).length;
    const totalCount = results.length;
    let rawScore = codeExecutionService.computeSubmissionScore(results);

    // Step 2: Concept compliance check — use cache to avoid re-analysing same code
    let conceptPassed = true;
    let conceptDetails = null;
    let requiredConcepts = [];
    try {
      requiredConcepts = question.required_concepts
        ? (typeof question.required_concepts === 'string' ? JSON.parse(question.required_concepts || '[]') : question.required_concepts)
        : [];
    } catch (_) { requiredConcepts = []; }
    const conceptThreshold = question.concept_threshold ?? 99;
    const isPatternQuestion = !!(question.is_pattern_question);

    if (requiredConcepts.length > 0 || isPatternQuestion) {
      const expectedOutputs = testCases.map(tc => tc.expected_output).filter(Boolean);
      const cacheKey = getConceptCacheKey(questionId, sourceCode);
      const now = Date.now();
      let cachedConcept = conceptCache.get(cacheKey);
      if (!cachedConcept || cachedConcept.expiresAt < now) {
        const detected = conceptDetectionService.analyzeConcepts(sourceCode, language || question.language, expectedOutputs, isPatternQuestion);
        const compliance = conceptDetectionService.checkConceptCompliance(detected, requiredConcepts, conceptThreshold);
        cachedConcept = { compliance, detected, expiresAt: now + CONCEPT_CACHE_TTL_MS };
        conceptCache.set(cacheKey, cachedConcept);
      }
      const { compliance } = cachedConcept;
      conceptPassed = compliance.passed;
      conceptDetails = { ...compliance.details, message: compliance.message, complianceScore: compliance.score };
      if (!conceptPassed) {
        rawScore = Math.min(rawScore, compliance.score);
      }
    }

    // Step 3: Hardcoding detection (uses codeAnalysisService)
    let hardcoded = false;
    let hardcodedReason = null;
    let hardcodedConfidence = null;
    try {
      const hardcodeResult = codeAnalysisService.detectHardcoding(
        sourceCode,
        testCases.map(tc => ({ expectedOutput: tc.expected_output })),
        question.problem_type || (isPatternQuestion ? 'patterns' : '')
      );
      if (hardcodeResult && hardcodeResult.hardcoded) {
        hardcoded = true;
        hardcodedReason = hardcodeResult.reason || 'Hardcoded output detected';
        hardcodedConfidence = hardcodeResult.confidence || 'high';
        rawScore = 0;
        console.log(`Hardcoding detected for question ${questionId}: ${hardcodedReason} (${hardcodedConfidence})`);
      }
    } catch (err) {
      console.warn('Hardcoding detection error:', err.message);
    }

    // Step 4: Partial credit via AI if not full score
    const referenceSolution = question.reference_solution || '';
    if (!hardcoded && rawScore < 100 && referenceSolution && referenceSolution.trim().length >= 20) {
      try {
        const partialScore = await aiService.analyzeSolutionForPartialCredit(
          question.problem_text,
          sourceCode,
          referenceSolution,
          requiredConcepts,
          results.map(r => ({ passed: r.passed, score: r.score ?? (r.passed ? 100 : 0) }))
        );
        rawScore = Math.max(rawScore, partialScore);
      } catch (err) {
        console.warn('Partial credit analysis failed:', err.message);
      }
    }

    const maxMarks = question.max_marks ?? 20;
    const score = hardcoded ? 0 : Math.round((rawScore / 100) * maxMarks);

    const submission = dbService.createCodeSubmission(
      examId, questionId, currentUser.userId, sourceCode, language || question.language,
      passedCount, totalCount, 'completed', score, conceptPassed, conceptDetails,
      hardcoded, hardcodedReason
    );
    for (const r of results) {
      dbService.createSubmissionResult(
        submission.submissionId, r.testCaseId, r.passed, r.actualOutput, r.executionTimeMs, r.error, r.score
      );
    }
    return {
      success: true,
      submissionId: submission.submissionId,
      passedCount,
      totalCount,
      score,
      maxMarks,
      hardcoded,
      hardcodedReason: hardcoded ? hardcodedReason : null,
      hardcodedConfidence: hardcoded ? hardcodedConfidence : null,
      conceptPassed,
      conceptMessage: conceptDetails?.message || null,
      results
    };
  } catch (error) {
    console.error('Submit code error:', error);
    return { success: false, error: error.message };
  } finally {
    releaseSubmissionSlot();
  }
});

ipcMain.handle('programming:get-submissions', async (event, examId, studentId) => {
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser) return { success: false, error: 'Not authenticated' };
    if (currentUser.role !== 'student' && currentUser.userId !== studentId) {
      return { success: false, error: 'Unauthorized' };
    }
    const submissions = dbService.getStudentCodeSubmissions(examId, studentId);
    return { success: true, submissions };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('programming:get-submission-results', async (event, submissionId) => {
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser) return { success: false, error: 'Not authenticated' };
    const results = dbService.getCodeSubmissionResults(submissionId);
    return { success: true, results };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Teacher: get all student scores for an exam
ipcMain.handle('programming:get-exam-scores', async (event, examId) => {
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser) return { success: false, error: 'Not authenticated' };
    if (currentUser.role !== 'teacher' && currentUser.role !== 'admin') {
      return { success: false, error: 'Unauthorized' };
    }
    const data = dbService.getExamStudentScores(examId);
    return { success: true, ...data };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// PDF viewing handler
ipcMain.handle('pdf:view', async (event, examId) => {
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser) {
      return {
        success: false,
        error: 'User not authenticated'
      };
    }

    // Get exam details to verify access and get PDF path
    const exam = dbService.getExamById(examId);
    if (!exam) {
      return {
        success: false,
        error: 'Exam not found'
      };
    }

    if (!exam.pdfPath) {
      return {
        success: false,
        error: 'No PDF available for this exam'
      };
    }

    // Check if file exists
    const fs = require('fs');
    if (!fs.existsSync(exam.pdfPath)) {
      return {
        success: false,
        error: 'PDF file not found on disk'
      };
    }

    // For students, check if exam is accessible (current or future)
    if (currentUser.role === 'student') {
      const now = new Date();
      const examEnd = new Date(exam.endTime);

      // Allow access if exam hasn't ended yet (students can view PDF during and before exam)
      if (now > examEnd) {
        return {
          success: false,
          error: 'Exam has ended, PDF is no longer accessible'
        };
      }
    }

    // Open PDF with default system application
    const { shell } = require('electron');
    await shell.openPath(exam.pdfPath);

    // Log PDF access
    dbService.logAuditEvent(currentUser.userId, 'PDF_ACCESSED', {
      examId: exam.examId,
      examTitle: exam.title,
      pdfPath: exam.pdfPath
    });

    return {
      success: true,
      message: 'PDF opened successfully'
    };
  } catch (error) {
    console.error('PDF view error:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// PDF data handler - returns PDF as base64 for in-app viewing
ipcMain.handle('pdf:get-data', async (event, examId) => {
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser) {
      return {
        success: false,
        error: 'User not authenticated'
      };
    }

    // Get exam details to verify access and get PDF path
    const exam = dbService.getExamById(examId);
    if (!exam) {
      return {
        success: false,
        error: 'Exam not found'
      };
    }

    if (!exam.pdfPath) {
      return {
        success: false,
        error: 'No PDF available for this exam'
      };
    }

    // Check if file exists
    const fs = require('fs');
    if (!fs.existsSync(exam.pdfPath)) {
      return {
        success: false,
        error: 'PDF file not found on disk'
      };
    }

    // For students, check if exam is accessible (current or future)
    if (currentUser.role === 'student') {
      const now = new Date();
      const examEnd = new Date(exam.endTime);

      // Allow access if exam hasn't ended yet (students can view PDF during and before exam)
      if (now > examEnd) {
        return {
          success: false,
          error: 'Exam has ended, PDF is no longer accessible'
        };
      }
    }

    // Read PDF file and convert to base64
    const pdfBuffer = fs.readFileSync(exam.pdfPath);
    const pdfBase64 = pdfBuffer.toString('base64');

    // Log PDF access
    dbService.logAuditEvent(currentUser.userId, 'PDF_ACCESSED', {
      examId: exam.examId,
      examTitle: exam.title,
      pdfPath: exam.pdfPath,
      accessType: 'in-app-viewer'
    });

    return {
      success: true,
      data: pdfBase64,
      examTitle: exam.title
    };
  } catch (error) {
    console.error('PDF data retrieval error:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// File dialog handlers
ipcMain.handle('file:open-dialog', async (event, options = {}) => {
  try {
    const { dialog } = require('electron');

    const defaultOptions = {
      title: 'Select PDF File',
      filters: [
        { name: 'PDF Files', extensions: ['pdf'] },
        { name: 'All Files', extensions: ['*'] }
      ],
      properties: ['openFile']
    };

    const dialogOptions = { ...defaultOptions, ...options };
    const result = await dialog.showOpenDialog(mainWindow, dialogOptions);

    if (result.canceled) {
      return {
        success: false,
        canceled: true
      };
    }

    return {
      success: true,
      filePaths: result.filePaths,
      filePath: result.filePaths[0] // For convenience
    };
  } catch (error) {
    console.error('File dialog error:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// Screenshot and report export handlers
ipcMain.handle('screenshot:get', async (event, screenshotPath) => {
  try {
    const fs = require('fs');
    const path = require('path');

    // Validate screenshot path is within allowed directories
    const allowedDir = path.join(__dirname, '..', 'screenshots');
    const fullPath = path.resolve(screenshotPath);

    if (!fullPath.startsWith(allowedDir)) {
      return {
        success: false,
        error: 'Invalid screenshot path'
      };
    }

    if (!fs.existsSync(fullPath)) {
      return {
        success: false,
        error: 'Screenshot file not found'
      };
    }

    // Read file and convert to base64 data URL
    const imageBuffer = fs.readFileSync(fullPath);
    const base64Image = imageBuffer.toString('base64');
    const mimeType = fullPath.endsWith('.png') ? 'image/png' : 'image/jpeg';
    const imageUrl = `data:${mimeType};base64,${base64Image}`;

    return {
      success: true,
      imageUrl
    };
  } catch (error) {
    console.error('Error loading screenshot:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

ipcMain.handle('screenshot:download', async (event, screenshotPath) => {
  try {
    const { dialog } = require('electron');
    const fs = require('fs');
    const path = require('path');

    // Validate screenshot path
    const allowedDir = path.join(__dirname, '..', 'screenshots');
    const fullPath = path.resolve(screenshotPath);

    if (!fullPath.startsWith(allowedDir) || !fs.existsSync(fullPath)) {
      return {
        success: false,
        error: 'Screenshot file not found'
      };
    }

    // Show save dialog
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Save Screenshot',
      defaultPath: path.basename(screenshotPath),
      filters: [
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg'] }
      ]
    });

    if (!result.canceled && result.filePath) {
      fs.copyFileSync(fullPath, result.filePath);
      return { success: true };
    }

    return { success: false, error: 'Save cancelled' };
  } catch (error) {
    console.error('Error downloading screenshot:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

ipcMain.handle('report:export-violations', async (event, reportData) => {
  try {
    const { dialog } = require('electron');
    const fs = require('fs');
    const path = require('path');

    // Show save dialog
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Export Violation Report',
      defaultPath: `violation-report-${reportData.examId}-${Date.now()}.json`,
      filters: [
        { name: 'JSON Files', extensions: ['json'] },
        { name: 'CSV Files', extensions: ['csv'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });

    if (result.canceled || !result.filePath) {
      return { success: false, error: 'Export cancelled' };
    }

    const filePath = result.filePath;
    const extension = path.extname(filePath).toLowerCase();

    if (extension === '.csv') {
      // Export as CSV
      const csvContent = generateCSVReport(reportData);
      fs.writeFileSync(filePath, csvContent, 'utf8');
    } else {
      // Export as JSON (default)
      const jsonContent = JSON.stringify({
        exportDate: new Date().toISOString(),
        examId: reportData.examId,
        examTitle: reportData.examTitle,
        totalStudents: reportData.totalStudents,
        summary: reportData.stats,
        violations: reportData.violations
      }, null, 2);
      fs.writeFileSync(filePath, jsonContent, 'utf8');
    }

    return { success: true, filePath };
  } catch (error) {
    console.error('Error exporting report:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// Helper function to generate CSV report
function generateCSVReport(reportData) {
  const headers = [
    'Violation ID',
    'Student Name',
    'Username',
    'Application',
    'Window Title',
    'Start Time',
    'End Time',
    'Duration (seconds)',
    'Screenshot Available'
  ];

  const rows = reportData.violations.map(violation => [
    violation.violationId,
    violation.studentName,
    violation.username,
    violation.appName,
    violation.windowTitle || '',
    violation.focusStartTime,
    violation.focusEndTime || '',
    violation.durationSeconds || '',
    violation.screenshotCaptured ? 'Yes' : 'No'
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
  ].join('\n');

  return csvContent;
}

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