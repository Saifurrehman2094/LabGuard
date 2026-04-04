const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

// Determine run mode based on NODE_ENV
// If NODE_ENV is 'production', use production build
// Otherwise, use development server
const runInDevMode = process.env.NODE_ENV !== 'production';

// Import services
const AuthService = require('../services/auth');
const DatabaseService = require('../services/database'); // Using SQLite database
const FileService = require('../services/files');
const MonitoringController = require('../services/monitoringController');
const CameraMonitoringService = require('../services/cameraMonitoringService');
const PDFTextExtractor = require('../services/pdfTextExtractor');
const LLMTestCaseService = require('../services/llmTestCaseService');
const CodeEvalService = require('../services/codeEvalService');

// Initialize services
let authService;
let dbService;
let fileService;
let pdfTextExtractor;
let llmTestCaseService;
let codeEvalService;
let monitoringController;
let cameraMonitoringService;

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

    pdfTextExtractor = new PDFTextExtractor();
    llmTestCaseService = new LLMTestCaseService();
    codeEvalService = new CodeEvalService({ dbService });

    console.log('Initializing monitoring controller...');
    monitoringController = new MonitoringController(dbService);
    setupMonitoringEventHandlers();
    console.log('Monitoring controller initialized');

    console.log('Initializing camera monitoring service...');
    cameraMonitoringService = new CameraMonitoringService({
      pythonPath: process.env.CAMERA_PYTHON_PATH || 'py',
      pythonArgs: process.env.CAMERA_PYTHON_ARGS
        ? process.env.CAMERA_PYTHON_ARGS.split(' ')
        : ['-3.11', '-m', 'camera_monitoring.camera_processor'],
      cwd: path.join(__dirname, '..')
    });
    setupCameraMonitoringEventHandlers();
    console.log('Camera monitoring service initialized');

    console.log('All services initialized successfully');
  } catch (error) {
    console.error('Failed to initialize services:', error);
    throw error;
  }
}

function emitDashboardUpdate(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('dashboard:updated', payload);
  }
}

function getQuestionRequirementView(question) {
  const constraints =
    question && question.constraints_json && typeof question.constraints_json === 'object'
      ? question.constraints_json
      : {};

  return {
    ...question,
    constraints_json: constraints,
    problem_type:
      typeof constraints.problem_type === 'string' && constraints.problem_type.trim()
        ? constraints.problem_type.trim()
        : 'basic_programming',
    required_concepts: Array.isArray(constraints.required_concepts)
      ? constraints.required_concepts.filter((item) => typeof item === 'string' && item.trim())
      : [],
    requirements_mode:
      constraints.requirements_mode === 'manual' || constraints.requirements_mode === 'auto'
        ? constraints.requirements_mode
        : 'auto',
    concept_threshold:
      typeof constraints.concept_threshold === 'number' && Number.isFinite(constraints.concept_threshold)
        ? constraints.concept_threshold
        : 99,
    is_pattern_question: !!constraints.is_pattern_question,
    difficulty:
      typeof constraints.difficulty === 'string' && constraints.difficulty.trim()
        ? constraints.difficulty.trim()
        : 'medium'
  };
}

function normalizeTestCaseForTeacher(tc) {
  const metadata = tc && tc.metadata && typeof tc.metadata === 'object' ? tc.metadata : {};
  const description =
    typeof tc?.description === 'string' && tc.description.trim()
      ? tc.description.trim()
      : typeof metadata.description === 'string' && metadata.description.trim()
      ? metadata.description.trim()
      : tc?.name || 'Test case';
  return {
    ...tc,
    metadata: {
      ...metadata,
      description
    },
    description
  };
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
    // Stop all monitoring services before logout
    console.log('[Logout] Stopping all monitoring services...');
    
    // Stop app-level monitoring
    try {
      if (monitoringController) {
        const monitoringStatus = monitoringController.getMonitoringStatus();
        if (monitoringStatus && monitoringStatus.isActive) {
          console.log('[Logout] Stopping app-level monitoring...');
          await monitoringController.stopExamMonitoring();
          console.log('[Logout] App-level monitoring stopped');
        }
      }
    } catch (monitoringError) {
      console.error('[Logout] Error stopping app-level monitoring:', monitoringError);
      // Continue with logout even if monitoring stop fails
    }

    // Stop camera monitoring
    try {
      if (cameraMonitoringService) {
        const cameraStatus = cameraMonitoringService.getStatus();
        if (cameraStatus && cameraStatus.isMonitoring) {
          console.log('[Logout] Stopping camera monitoring...');
          cameraMonitoringService.stopMonitoring();
          console.log('[Logout] Camera monitoring stopped');
        }
      }
    } catch (cameraError) {
      console.error('[Logout] Error stopping camera monitoring:', cameraError);
      // Continue with logout even if camera monitoring stop fails
    }

    // Now perform the actual logout
    const result = await authService.logout();
    console.log('[Logout] Logout completed successfully');
    return result;
  } catch (error) {
    console.error('[Logout] Logout error:', error);
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

// Camera monitoring status forwarding
function setupCameraMonitoringEventHandlers() {
  if (!cameraMonitoringService) {
    return;
  }

  cameraMonitoringService.on('status', (status) => {
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('camera:status-update', status);
    }
  });

  cameraMonitoringService.on('error', (error) => {
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('camera:error', error);
    }
  });

  cameraMonitoringService.on('stderr', (message) => {
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('camera:stderr', message);
    }
  });

  cameraMonitoringService.on('exit', (payload) => {
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('camera:process-exit', payload);
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

// Camera monitoring IPC handlers
ipcMain.handle('camera:start-test', async (event, options) => {
  try {
    if (!cameraMonitoringService) {
      return { success: false, error: 'Camera monitoring service not initialized' };
    }

    // Merge options with snapshot configuration from database
    const snapshotConfig = {
      snapshotViolations: dbService.getSystemSetting('snapshot_enabled_violations') || ['phone_violation', 'multiple_persons'],
      snapshotsEnabled: dbService.getSystemSetting('enable_violation_snapshots') !== false
    };

    // Get current user for student name if available
    let studentName = 'unknown';
    const currentUser = authService.getCurrentUser();
    if (currentUser && currentUser.fullName) {
      studentName = currentUser.fullName;
    }

    // Build final options
    const finalOptions = {
      ...options,
      studentName: options?.studentName || studentName,
      snapshotViolations: snapshotConfig.snapshotsEnabled ? snapshotConfig.snapshotViolations : []
    };

    console.log('[Camera] Starting with options:', finalOptions);

    const result = cameraMonitoringService.startMonitoring(finalOptions);
    return {
      success: result.success,
      pid: result.pid,
      args: result.args,
      error: result.error
    };
  } catch (error) {
    console.error('Error starting camera monitoring:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('camera:stop-test', async () => {
  try {
    if (!cameraMonitoringService) {
      return { success: false, error: 'Camera monitoring service not initialized' };
    }

    return cameraMonitoringService.stopMonitoring();
  } catch (error) {
    console.error('Error stopping camera monitoring:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('camera:get-status', async () => {
  try {
    if (!cameraMonitoringService) {
      return { success: false, error: 'Camera monitoring service not initialized' };
    }

    return { success: true, status: cameraMonitoringService.getStatus() };
  } catch (error) {
    console.error('Error getting camera monitoring status:', error);
    return { success: false, error: error.message };
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

// Extract candidate questions from exam PDF (Code Eval – teacher)
ipcMain.handle('exam:extract-questions', async (event, examId) => {
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser || (currentUser.role !== 'teacher' && currentUser.role !== 'admin')) {
      return { success: false, error: 'Unauthorized' };
    }

    const exam = dbService.getExamById(examId);
    if (!exam) {
      return { success: false, error: 'Exam not found' };
    }

    if (!exam.pdfPath) {
      return {
        success: false,
        error: 'No PDF uploaded for this exam. You can add questions manually.'
      };
    }

    const fs = require('fs');
    if (!fs.existsSync(exam.pdfPath)) {
      return {
        success: false,
        error: 'PDF file not found on disk. You can add questions manually.'
      };
    }

    const { questions } = await pdfTextExtractor.extractAndSplit(exam.pdfPath);
    const result = questions.map((q, i) => ({
      tempId: `temp-${examId}-${i + 1}`,
      title: q.title,
      description: q.description,
      page: q.page
    }));

    return { success: true, questions: result };
  } catch (error) {
    console.error('exam:extract-questions error:', error);
    const message = error.message || 'Unknown error';
    if (message.includes('not found') || message.includes('Invalid PDF') || message.includes('corrupt')) {
      return {
        success: false,
        error: 'Could not read PDF. The file may be corrupted or password-protected. You can add questions manually.'
      };
    }
    return {
      success: false,
      error: `Extraction failed: ${message}. You can add questions manually.`
    };
  }
});

ipcMain.handle('ai:analyze-requirements', async (event, problemText) => {
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser || (currentUser.role !== 'teacher' && currentUser.role !== 'admin')) {
      return { success: false, error: 'Unauthorized' };
    }

    const result = await llmTestCaseService.analyzeRequirements(problemText || '');
    if (!result.success) {
      return { success: false, error: result.error || 'Failed to analyze requirements' };
    }

    return {
      success: true,
      requiredConcepts: result.requiredConcepts || [],
      isPatternQuestion: !!result.isPatternQuestion,
      problemType: result.problemType || 'basic_programming',
      source: result.source || 'heuristic'
    };
  } catch (error) {
    console.error('ai:analyze-requirements error:', error);
    return {
      success: false,
      error: error.message || 'Unknown error'
    };
  }
});

// Generate test cases for a question via LLM (Code Eval – teacher)
ipcMain.handle('exam:generate-testcases', async (event, examId, questionId, llmProvider = 'auto') => {
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser || (currentUser.role !== 'teacher' && currentUser.role !== 'admin')) {
      return { success: false, error: 'Unauthorized', code: 'UNAUTHORIZED' };
    }

    const question = dbService.getExamQuestionById(questionId);
    if (!question) {
      return { success: false, error: 'Question not found', code: 'NOT_FOUND' };
    }
    if (question.exam_id !== examId) {
      return { success: false, error: 'Question does not belong to this exam', code: 'MISMATCH' };
    }

    const constraints = question.constraints_json && typeof question.constraints_json === 'object'
      ? question.constraints_json
      : null;
    const constraintsHint = constraints
      ? `\n\nTeacher constraints (use these when designing test cases, if relevant):\n${JSON.stringify(constraints, null, 2)}`
      : '';
    const questionText = [question.title, question.description].filter(Boolean).join('\n\n') + constraintsHint;
    if (!questionText.trim()) {
      return { success: false, error: 'Question has no text to send to the LLM', code: 'EMPTY_QUESTION' };
    }

    const result = await llmTestCaseService.generateTestCases(questionText, { provider: llmProvider });
    if (result.success) {
      return {
        success: true,
        testCases: (result.testCases || []).map((tc) =>
          normalizeTestCaseForTeacher({
            ...tc,
            metadata: {
              ...(tc.metadata || {}),
              description: tc.description
            }
          })
        )
      };
    }
    return {
      success: false,
      error: result.error || 'Failed to generate test cases',
      code: result.code || 'UNKNOWN'
    };
  } catch (error) {
    console.error('exam:generate-testcases error:', error);
    return {
      success: false,
      error: error.message || 'Unknown error',
      code: 'ERROR'
    };
  }
});

// Run code evaluation for a submission/question (Code Eval – teacher/system)
ipcMain.handle('evaluation:run', async (event, examId, submissionId, questionId, reRun = false) => {
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser || (currentUser.role !== 'teacher' && currentUser.role !== 'admin')) {
      return { success: false, error: 'Unauthorized' };
    }

    if (!codeEvalService) {
      return { success: false, error: 'Code evaluation service not initialized' };
    }

    const result = await codeEvalService.runEvaluation({ examId, submissionId, questionId, reRun });
    emitDashboardUpdate({
      type: 'examGraded',
      examId,
      submissionId,
      questionId,
      evaluationId: result.evaluation?.evaluation_id || null
    });
    return {
      success: true,
      evaluation: result.evaluation,
      results: result.results
    };
  } catch (error) {
    console.error('evaluation:run error:', error);
    return {
      success: false,
      error: error.message || 'Unknown error'
    };
  }
});

// Run code evaluation for all questions with test cases for a single submission
ipcMain.handle('evaluation:run-for-submission', async (event, examId, submissionId) => {
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser || (currentUser.role !== 'teacher' && currentUser.role !== 'admin')) {
      return { success: false, error: 'Unauthorized' };
    }

    if (!codeEvalService) {
      return { success: false, error: 'Code evaluation service not initialized' };
    }

    const questions = dbService.getExamQuestionsByExamId(examId);
    const runs = [];
    for (const q of questions) {
      const tcs = dbService.getQuestionTestCasesByQuestionId(q.question_id);
      if (!tcs.length) continue;
      const result = await codeEvalService.runEvaluation({
        examId,
        submissionId,
        questionId: q.question_id,
        reRun: false
      });
      runs.push({
        question_id: q.question_id,
        evaluation: result.evaluation,
        results_count: result.results.length
      });
    }

    emitDashboardUpdate({
      type: 'examGraded',
      examId,
      submissionId
    });

    return { success: true, runs };
  } catch (error) {
    console.error('evaluation:run-for-submission error:', error);
    return {
      success: false,
      error: error.message || 'Unknown error'
    };
  }
});

// Run code evaluation for all submissions of an exam
ipcMain.handle('evaluation:run-for-exam', async (event, examId) => {
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser || (currentUser.role !== 'teacher' && currentUser.role !== 'admin')) {
      return { success: false, error: 'Unauthorized' };
    }

    const submissions = dbService.db
      .prepare('SELECT submission_id FROM exam_submissions WHERE exam_id = ?')
      .all(examId);

    const questions = dbService.getExamQuestionsByExamId(examId);
    let totalEvaluations = 0;

    for (const sub of submissions) {
      for (const q of questions) {
        const tcs = dbService.getQuestionTestCasesByQuestionId(q.question_id);
        if (!tcs.length) continue;

        await codeEvalService.runEvaluation({
          examId,
          submissionId: sub.submission_id,
          questionId: q.question_id,
          reRun: false
        });
        totalEvaluations++;
      }
    }

    emitDashboardUpdate({
      type: 'examGraded',
      examId
    });

    return { success: true, totalSubmissions: submissions.length, totalEvaluations };
  } catch (error) {
    console.error('evaluation:run-for-exam error:', error);
    return {
      success: false,
      error: error.message || 'Unknown error'
    };
  }
});

// Get evaluation detail (single evaluation with results)
ipcMain.handle('evaluation:get-detail', async (event, evaluationId) => {
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser || (currentUser.role !== 'teacher' && currentUser.role !== 'admin')) {
      return { success: false, error: 'Unauthorized' };
    }

    const evaluation = dbService.getCodeEvaluationById(evaluationId);
    if (!evaluation) {
      return { success: false, error: 'Evaluation not found' };
    }
    const results = dbService.getTestCaseResultsByEvaluationId(evaluationId).map((row) =>
      normalizeTestCaseForTeacher(row)
    );
    const question = evaluation.question_id ? dbService.getExamQuestionById(evaluation.question_id) : null;
    const submission = dbService.db.prepare(`
      SELECT es.*, u.full_name, u.username
      FROM exam_submissions es
      LEFT JOIN users u ON u.user_id = es.student_id
      WHERE es.submission_id = ?
    `).get(evaluation.submission_id);
    const exam = submission ? dbService.getExamById(submission.exam_id) : null;
    return {
      success: true,
      evaluation,
      results,
      question: question ? getQuestionRequirementView(question) : null,
      submission: submission || null,
      exam: exam || null
    };
  } catch (error) {
    console.error('evaluation:get-detail error:', error);
    return {
      success: false,
      error: error.message || 'Unknown error'
    };
  }
});

// Get evaluations by exam (for dashboard)
ipcMain.handle('evaluation:get-by-exam', async (event, examId) => {
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser || (currentUser.role !== 'teacher' && currentUser.role !== 'admin')) {
      return { success: false, error: 'Unauthorized' };
    }

    // Return submissions for this exam with student identity and evaluations
    const submissions = dbService.db
      .prepare(`
        SELECT es.submission_id, es.student_id, es.submitted_at,
               u.username, u.full_name
        FROM exam_submissions es
        JOIN users u ON es.student_id = u.user_id
        WHERE es.exam_id = ?
      `)
      .all(examId);

    const data = submissions.map((sub) => {
      const evals = dbService.getCodeEvaluationsBySubmissionId(sub.submission_id);
      const lastEval = evals.length ? evals[evals.length - 1] : null;

      // If teacher re-runs evaluation multiple times, we will have multiple evaluation rows.
      // For the dashboard totals, only the latest evaluation per question should count.
      // `getCodeEvaluationsBySubmissionId` orders by created_at ASC, so overwriting keeps the latest.
      const latestByQuestion = new Map();
      for (const e of evals) {
        latestByQuestion.set(e.question_id, e);
      }
      const latestEvals = Array.from(latestByQuestion.values());

      const totalAutoScore = latestEvals.reduce((sum, e) => sum + (e.score ?? 0), 0);
      const totalFinalScore = latestEvals.reduce((sum, e) => sum + (e.final_score ?? 0), 0);
      const totalMaxScore = latestEvals.reduce((sum, e) => sum + (e.max_score ?? 0), 0);

      return {
        submission_id: sub.submission_id,
        student_id: sub.student_id,
        username: sub.username,
        full_name: sub.full_name,
        submitted_at: sub.submitted_at,
        evaluations: evals,
        aggregates: {
          last_status: lastEval ? lastEval.status : null,
          last_evaluated_at: lastEval ? lastEval.created_at : null,
          total_auto_score: totalAutoScore,
          total_final_score: totalFinalScore,
          total_max_score: totalMaxScore
        }
      };
    });

    return { success: true, data };
  } catch (error) {
    console.error('evaluation:get-by-exam error:', error);
    return {
      success: false,
      error: error.message || 'Unknown error'
    };
  }
});

// Update manual score for an evaluation
ipcMain.handle('evaluation:update-manual-score', async (event, evaluationId, manualScore) => {
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser || (currentUser.role !== 'teacher' && currentUser.role !== 'admin')) {
      return { success: false, error: 'Unauthorized' };
    }

    dbService.updateCodeEvaluationManualScore(evaluationId, manualScore);
    const evaluation = dbService.getCodeEvaluationById(evaluationId);
    return { success: true, evaluation };
  } catch (error) {
    console.error('evaluation:update-manual-score error:', error);
    return {
      success: false,
      error: error.message || 'Unknown error'
    };
  }
});

ipcMain.handle('evaluation:get-analysis-capabilities', async () => {
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser || (currentUser.role !== 'teacher' && currentUser.role !== 'admin')) {
      return { success: false, error: 'Unauthorized' };
    }
    if (!codeEvalService) {
      return { success: false, error: 'Code evaluation service not initialized' };
    }
    return {
      success: true,
      capabilities: codeEvalService.getAnalysisCapabilities()
    };
  } catch (error) {
    console.error('evaluation:get-analysis-capabilities error:', error);
    return {
      success: false,
      error: error.message || 'Unknown error'
    };
  }
});

// Generate AI-assisted summary for one evaluation
ipcMain.handle('evaluation:generate-summary', async (event, evaluationId, options = {}) => {
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser || (currentUser.role !== 'teacher' && currentUser.role !== 'admin')) {
      return { success: false, error: 'Unauthorized' };
    }

    const evaluation = dbService.getCodeEvaluationById(evaluationId);
    if (!evaluation) {
      return { success: false, error: 'Evaluation not found' };
    }

    const evidence = {
      evaluation_id: evaluation.evaluation_id,
      status: evaluation.status,
      score: evaluation.score,
      max_score: evaluation.max_score,
      analysis_breakdown: evaluation.analysis_breakdown_json,
      requirement_checks: evaluation.requirement_checks_json,
      hardcoding_flags: evaluation.hardcoding_flags_json
    };

    const aiRes = await llmTestCaseService.generateSubmissionSummary(evidence, options);
    let summaryText;
    let summaryConfidence;
    if (aiRes.success) {
      summaryText = aiRes.summary;
      summaryConfidence = aiRes.confidence || 'medium';
    } else {
      summaryText = buildFallbackSummary(evidence, aiRes.error);
      summaryConfidence = 'low';
    }

    dbService.updateCodeEvaluation(evaluationId, {
      ai_summary_text: summaryText,
      ai_summary_confidence: summaryConfidence,
      ai_summary_updated_at: new Date().toISOString()
    });

    return {
      success: true,
      summary: summaryText,
      confidence: summaryConfidence,
      provider: aiRes.success ? 'ai' : 'fallback'
    };
  } catch (error) {
    console.error('evaluation:generate-summary error:', error);
    return {
      success: false,
      error: error.message || 'Unknown error'
    };
  }
});

function buildFallbackSummary(evidence, reason) {
  const breakdown = evidence.analysis_breakdown || {};
  const hardcoding = evidence.hardcoding_flags || {};
  const unmet = (evidence.requirement_checks && evidence.requirement_checks.unmet_requirements) || [];
  const lines = [];
  lines.push(
    `AI-assisted summary (fallback): score ${evidence.score ?? 0}/${evidence.max_score ?? 0}, status ${evidence.status || 'unknown'}.`
  );
  lines.push(`Pass rate signal: ${(breakdown.pass_rate != null ? Math.round(breakdown.pass_rate * 100) : 0)}%.`);
  lines.push(`Near-correct indicator: ${breakdown.near_correct ? 'yes' : 'no'}.`);
  lines.push(`Requirement checks: ${unmet.length ? unmet.join(', ') : 'all required checks appear satisfied'}.`);
  lines.push(
    `Hardcoding suspicion: ${hardcoding.suspicion_level || 'low'}${hardcoding.reasons?.length ? ` (${hardcoding.reasons.join(', ')})` : ''}.`
  );
  lines.push(`Suggestion: review first failing case and retry after targeted fix. (${reason || 'AI unavailable'})`);
  return lines.join('\n');
}

// Save exam questions (Code Eval – teacher)
ipcMain.handle('exam:save-questions', async (event, examId, questions) => {
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser || (currentUser.role !== 'teacher' && currentUser.role !== 'admin')) {
      return { success: false, error: 'Unauthorized' };
    }

    if (!Array.isArray(questions)) {
      return { success: false, error: 'Invalid questions payload' };
    }

    const exam = dbService.getExamById(examId);
    if (!exam) {
      return { success: false, error: 'Exam not found' };
    }

    const savedQuestions = [];
    for (const q of questions) {
      const nextConstraints =
        q && q.constraints_json && typeof q.constraints_json === 'object'
          ? { ...q.constraints_json }
          : {};
      if (q && q.problem_type !== undefined) nextConstraints.problem_type = q.problem_type;
      if (q && q.required_concepts !== undefined) nextConstraints.required_concepts = q.required_concepts;
      if (q && q.requirements_mode !== undefined) nextConstraints.requirements_mode = q.requirements_mode;
      if (q && q.concept_threshold !== undefined) nextConstraints.concept_threshold = q.concept_threshold;
      if (q && q.is_pattern_question !== undefined) nextConstraints.is_pattern_question = q.is_pattern_question;
      if (q && q.difficulty !== undefined) nextConstraints.difficulty = q.difficulty;

      const data = {
        exam_id: examId,
        title: (q && q.title) || '',
        description: q && q.description ? q.description : null,
        source_page: q && (q.page ?? q.source_page) != null ? (q.page ?? q.source_page) : null,
        max_score: q && (q.max_score ?? q.maxScore) != null ? (q.max_score ?? q.maxScore) : 100,
        constraints_json:
          Object.keys(nextConstraints).length > 0
            ? nextConstraints
            : q && (q.constraints_json ?? q.constraints) != null
            ? (q.constraints_json ?? q.constraints)
            : null
      };

      if (q && q.question_id) {
        dbService.updateExamQuestion(q.question_id, data);
        const updated = dbService.getExamQuestionById(q.question_id);
        if (updated) {
          savedQuestions.push(getQuestionRequirementView(updated));
        }
      } else {
        const created = dbService.insertExamQuestion(data);
        savedQuestions.push(getQuestionRequirementView(created));
      }
    }

    emitDashboardUpdate({
      type: 'questionAdded',
      examId,
      count: savedQuestions.length
    });

    return { success: true, questions: savedQuestions };
  } catch (error) {
    console.error('exam:save-questions error:', error);
    return {
      success: false,
      error: error.message || 'Unknown error'
    };
  }
});

// Upsert (create/update/delete) test cases for a question (Code Eval – teacher)
ipcMain.handle('exam:upsert-testcases', async (event, questionId, testCases) => {
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser || (currentUser.role !== 'teacher' && currentUser.role !== 'admin')) {
      return { success: false, error: 'Unauthorized' };
    }

    if (!questionId) {
      return { success: false, error: 'Missing questionId' };
    }

    const question = dbService.getExamQuestionById(questionId);
    if (!question) {
      return { success: false, error: 'Question not found' };
    }

    if (!Array.isArray(testCases)) {
      return { success: false, error: 'Invalid testCases payload' };
    }

    for (const tc of testCases) {
      if (!tc) continue;

      const op =
        tc.op ||
        tc.mode ||
        (tc.isDeleted ? 'delete' : (tc.test_case_id || tc.testCaseId) ? 'update' : 'create');

      const testCaseId = tc.test_case_id || tc.testCaseId || null;

      if (op === 'delete') {
        if (testCaseId) {
          dbService.deleteQuestionTestCase(testCaseId);
        }
        continue;
      }

      const data = {
        question_id: questionId,
        name: tc.name || '',
        input: tc.input ?? null,
        expected_output: tc.expected_output ?? tc.expectedOutput ?? null,
        is_hidden: tc.is_hidden ?? tc.isHidden ?? false,
        is_edge_case: tc.is_edge_case ?? tc.isEdgeCase ?? false,
        is_generated: tc.is_generated ?? tc.isGenerated ?? false,
        time_limit_ms: tc.time_limit_ms ?? tc.timeLimitMs ?? null,
        memory_limit_kb: tc.memory_limit_kb ?? tc.memoryLimitKb ?? null,
        weight: tc.weight != null ? tc.weight : 1.0,
        metadata: {
          ...((tc.metadata && typeof tc.metadata === 'object') ? tc.metadata : {}),
          description:
            typeof tc.description === 'string' && tc.description.trim()
              ? tc.description.trim()
              : (tc.metadata && typeof tc.metadata.description === 'string' && tc.metadata.description.trim())
              ? tc.metadata.description.trim()
              : tc.name || 'Test case'
        }
      };

      if (op === 'update' && testCaseId) {
        dbService.updateQuestionTestCase(testCaseId, data);
      } else {
        dbService.insertQuestionTestCase(data);
      }
    }

    const saved = dbService.getQuestionTestCasesByQuestionId(questionId).map(normalizeTestCaseForTeacher);
    emitDashboardUpdate({
      type: 'testCaseAdded',
      examId: question.exam_id,
      questionId,
      count: saved.length
    });
    return { success: true, testCases: saved };
  } catch (error) {
    console.error('exam:upsert-testcases error:', error);
    return {
      success: false,
      error: error.message || 'Unknown error'
    };
  }
});

// Get exam questions with their test cases (Code Eval – teacher)
ipcMain.handle('exam:get-questions-with-testcases', async (event, examId) => {
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser || (currentUser.role !== 'teacher' && currentUser.role !== 'admin')) {
      return { success: false, error: 'Unauthorized' };
    }

    const exam = dbService.getExamById(examId);
    if (!exam) {
      return { success: false, error: 'Exam not found' };
    }

    const questions = dbService.getExamQuestionsByExamId(examId);
    const withTestCases = questions.map(q => ({
      ...getQuestionRequirementView(q),
      testCases: dbService.getQuestionTestCasesByQuestionId(q.question_id).map(normalizeTestCaseForTeacher)
    }));

    return { success: true, questions: withTestCases };
  } catch (error) {
    console.error('exam:get-questions-with-testcases error:', error);
    return {
      success: false,
      error: error.message || 'Unknown error'
    };
  }
});

// Dev-only: Phase 1 Code Eval DB test (T2, T3) – call from DevTools: require('electron').ipcRenderer.invoke('code-eval:phase1-db-test')
const PHASE1_TEST_EXAM_ID = 'phase1-test-exam-id';
const PHASE1_TEST_SUBMISSION_ID = 'phase1-test-submission-id';
ipcMain.handle('code-eval:phase1-db-test', async () => {
  try {
    const q = dbService.insertExamQuestion({
      exam_id: PHASE1_TEST_EXAM_ID,
      title: 'Q1',
      description: 'Add two numbers',
      source_page: 1,
      max_score: 10
    });
    if (!q || !q.question_id) throw new Error('T2: insertExamQuestion failed');

    const tc = dbService.insertQuestionTestCase({
      question_id: q.question_id,
      name: 'TC1',
      input: '1 2',
      expected_output: '3',
      is_hidden: 0,
      weight: 1
    });
    if (!tc || !tc.test_case_id) throw new Error('T2: insertQuestionTestCase failed');

    const ev = dbService.insertCodeEvaluation({
      submission_id: PHASE1_TEST_SUBMISSION_ID,
      question_id: q.question_id,
      score: 8,
      max_score: 10,
      status: 'completed'
    });
    if (!ev || !ev.evaluation_id) throw new Error('T2: insertCodeEvaluation failed');

    const res = dbService.insertTestCaseResult({
      evaluation_id: ev.evaluation_id,
      test_case_id: tc.test_case_id,
      passed: 1,
      execution_time_ms: 5,
      stdout: '3',
      stderr: ''
    });
    if (!res || !res.result_id) throw new Error('T2: insertTestCaseResult failed');

    if (dbService.getExamQuestionsByExamId(PHASE1_TEST_EXAM_ID).length === 0) throw new Error('T2: getExamQuestionsByExamId empty');
    if (dbService.getQuestionTestCasesByQuestionId(q.question_id).length === 0) throw new Error('T2: getQuestionTestCasesByQuestionId empty');
    if (dbService.getCodeEvaluationsBySubmissionId(PHASE1_TEST_SUBMISSION_ID).length === 0) throw new Error('T2: getCodeEvaluationsBySubmissionId empty');
    if (dbService.getTestCaseResultsByEvaluationId(ev.evaluation_id).length === 0) throw new Error('T2: getTestCaseResultsByEvaluationId empty');

    const before = dbService.getCodeEvaluationById(ev.evaluation_id);
    if (before.final_score !== 8) throw new Error(`T3: expected final_score 8, got ${before.final_score}`);

    dbService.updateCodeEvaluationManualScore(ev.evaluation_id, 9);
    const after = dbService.getCodeEvaluationById(ev.evaluation_id);
    if (after.manual_score !== 9 || after.final_score !== 9) throw new Error(`T3: manual_score/final_score expected 9, got ${after.manual_score}/${after.final_score}`);

    dbService.updateCodeEvaluation(ev.evaluation_id, { manual_score: null });
    const afterClear = dbService.getCodeEvaluationById(ev.evaluation_id);
    if (afterClear.final_score !== 8) throw new Error(`T3: after clear manual_score expected final_score 8, got ${afterClear.final_score}`);

    dbService.db.prepare('DELETE FROM test_case_results WHERE evaluation_id = ?').run(ev.evaluation_id);
    dbService.db.prepare('DELETE FROM code_evaluations WHERE evaluation_id = ?').run(ev.evaluation_id);
    dbService.deleteQuestionTestCase(tc.test_case_id);
    dbService.deleteExamQuestion(q.question_id);

    return { success: true, message: 'Phase 1 DB tests T2, T3 passed.' };
  } catch (err) {
    console.error('Phase 1 DB test failed:', err);
    return { success: false, error: err.message };
  }
});

// ============================================
// COURSE MANAGEMENT IPC HANDLERS
// ============================================

ipcMain.handle('course:create', async (event, courseData) => {
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser || currentUser.role !== 'admin') {
      return { success: false, error: 'Only administrators can create courses' };
    }

    // Admin must specify teacherId in courseData
    if (!courseData.teacherId) {
      return { success: false, error: 'Teacher ID is required when creating a course' };
    }

    const course = dbService.createCourse({
      ...courseData,
      teacherId: courseData.teacherId
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
    if (!currentUser || currentUser.role !== 'admin') {
      return { success: false, error: 'Only administrators can enroll students in courses' };
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
    // Self-enrollment is disabled - only admins can enroll students
    return { success: false, error: 'Self-enrollment is disabled. Please contact an administrator to enroll in courses.' };
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

// Snapshot configuration IPC handlers
ipcMain.handle('admin:get-snapshot-config', async (event) => {
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser || currentUser.role !== 'admin') {
      return {
        success: false,
        error: 'Admin access required'
      };
    }

    const config = {
      enabled_violations: dbService.getSystemSetting('snapshot_enabled_violations') || ['phone_violation', 'multiple_persons'],
      cooldown_seconds: dbService.getSystemSetting('snapshot_cooldown_seconds') || 7,
      snapshots_enabled: dbService.getSystemSetting('enable_violation_snapshots') !== false
    };

    return {
      success: true,
      config
    };
  } catch (error) {
    console.error('Get snapshot config error:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

ipcMain.handle('admin:update-snapshot-config', async (event, config) => {
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser || currentUser.role !== 'admin') {
      return {
        success: false,
        error: 'Admin access required'
      };
    }

    // Update snapshot settings
    if (config.enabled_violations !== undefined) {
      dbService.setSystemSetting(
        'snapshot_enabled_violations', 
        config.enabled_violations, 
        'json', 
        'List of violations that trigger snapshot capture',
        currentUser.userId
      );
    }

    if (config.cooldown_seconds !== undefined) {
      dbService.setSystemSetting(
        'snapshot_cooldown_seconds', 
        config.cooldown_seconds, 
        'number', 
        'Cooldown between snapshots of same violation type',
        currentUser.userId
      );
    }

    if (config.snapshots_enabled !== undefined) {
      dbService.setSystemSetting(
        'enable_violation_snapshots', 
        config.snapshots_enabled, 
        'boolean', 
        'Enable/disable violation snapshot capture',
        currentUser.userId
      );
    }

    // Log admin action
    dbService.logAuditEvent(currentUser.userId, 'SNAPSHOT_CONFIG_UPDATED', {
      updatedConfig: config
    });

    return {
      success: true,
      message: 'Snapshot configuration updated successfully'
    };
  } catch (error) {
    console.error('Update snapshot config error:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

ipcMain.handle('system:get-setup-status', async (event) => {
  try {
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

// ===== ANALYTICS DASHBOARD HANDLERS =====

ipcMain.handle('dashboard:summary', async () => {
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser || (currentUser.role !== 'teacher' && currentUser.role !== 'admin')) {
      return { success: false, error: 'Unauthorized' };
    }

    const teacherId = currentUser.userId;
    const db = dbService.db;
    const totalExams = db.prepare('SELECT COUNT(*) AS c FROM exams WHERE teacher_id = ?').get(teacherId)?.c || 0;
    const totalQuestions = db.prepare(`
      SELECT COUNT(*) AS c
      FROM exam_questions q
      JOIN exams e ON e.exam_id = q.exam_id
      WHERE e.teacher_id = ?
    `).get(teacherId)?.c || 0;
    const totalTestCases = db.prepare(`
      SELECT COUNT(*) AS c
      FROM question_test_cases tc
      JOIN exam_questions q ON q.question_id = tc.question_id
      JOIN exams e ON e.exam_id = q.exam_id
      WHERE e.teacher_id = ?
    `).get(teacherId)?.c || 0;
    const totalSubmissions = db.prepare(`
      SELECT COUNT(*) AS c
      FROM exam_submissions es
      JOIN exams e ON e.exam_id = es.exam_id
      WHERE e.teacher_id = ?
    `).get(teacherId)?.c || 0;

    const grading = db.prepare(`
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
        JOIN exam_submissions es ON es.submission_id = ce.submission_id
        JOIN exams e ON e.exam_id = es.exam_id
        WHERE e.teacher_id = ?
      )
      SELECT
        SUM(CASE
          WHEN json_extract(hardcoding_flags_json, '$.suspicion_level') IN ('medium', 'high')
          THEN 1 ELSE 0 END
        ) AS hardcodingFlags
      FROM latest_per_submission_question
    `).get(teacherId) || {};

    const resultStats = db.prepare(`
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
        JOIN exam_submissions es ON es.submission_id = ce.submission_id
        JOIN exams e ON e.exam_id = es.exam_id
        WHERE e.teacher_id = ?
      )
      SELECT
        COUNT(*) AS totalResults,
        SUM(CASE WHEN r.passed = 1 THEN 1 ELSE 0 END) AS passedResults
      FROM latest_per_submission_question le
      JOIN test_case_results r ON r.evaluation_id = le.evaluation_id
    `).get(teacherId) || {};

    const verifiedCorrect = Number(resultStats.passedResults || 0);
    const totalResults = Number(resultStats.totalResults || 0);
    const accuracyRate = totalResults > 0 ? Math.round((verifiedCorrect / totalResults) * 10000) / 100 : 0;

    return {
      success: true,
      data: {
        totalQuestions,
        totalTestCases,
        avgCasesPerQuestion: totalQuestions > 0 ? Math.round((totalTestCases / totalQuestions) * 100) / 100 : 0,
        totalExams,
        totalSubmissions,
        hardcodingFlags: Number(grading.hardcodingFlags || 0),
        verifiedCorrect,
        accuracyRate
      }
    };
  } catch (error) {
    console.error('[Dashboard] dashboard:summary error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('dashboard:papers', async () => {
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser || (currentUser.role !== 'teacher' && currentUser.role !== 'admin')) {
      return { success: false, error: 'Unauthorized' };
    }

    const exams = dbService.db
      .prepare('SELECT exam_id, title, created_at FROM exams WHERE teacher_id = ? ORDER BY created_at DESC')
      .all(currentUser.userId);

    const papers = exams.map((exam) => {
      const questions = dbService.getExamQuestionsByExamId(exam.exam_id);
      const questionIds = questions.map((q) => q.question_id);
      const testCaseCount = questionIds.length
        ? dbService.db.prepare(
            `SELECT COUNT(*) AS c FROM question_test_cases WHERE question_id IN (${questionIds.map(() => '?').join(',')})`
          ).get(...questionIds)?.c || 0
        : 0;
      const correctness = questionIds.length
        ? dbService.db.prepare(`
            WITH latest_eval AS (
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
              WHERE es.exam_id = ?
            )
            SELECT
              COUNT(*) AS totalResults,
              SUM(CASE WHEN r.passed = 1 THEN 1 ELSE 0 END) AS passedResults
            FROM latest_eval le
            JOIN test_case_results r ON r.evaluation_id = le.evaluation_id
          `).get(exam.exam_id)
        : { totalResults: 0, passedResults: 0 };

      const difficultyCounts = questions.reduce(
        (acc, question) => {
          const summary = getQuestionRequirementView(question);
          if (summary.difficulty === 'easy') acc.easy += 1;
          else if (summary.difficulty === 'hard') acc.hard += 1;
          else acc.medium += 1;
          return acc;
        },
        { easy: 0, medium: 0, hard: 0 }
      );

      return {
        examId: exam.exam_id,
        examTitle: exam.title,
        questionCount: questions.length,
        testCaseCount,
        correctCases: Number(correctness?.passedResults || 0),
        wrongCases: Math.max(0, Number(correctness?.totalResults || 0) - Number(correctness?.passedResults || 0)),
        easyCount: difficultyCounts.easy,
        mediumCount: difficultyCounts.medium,
        hardCount: difficultyCounts.hard,
        createdAt: exam.created_at
      };
    });

    return { success: true, data: papers };
  } catch (error) {
    console.error('[Dashboard] dashboard:papers error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('dashboard:concepts', async () => {
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser || (currentUser.role !== 'teacher' && currentUser.role !== 'admin')) {
      return { success: false, error: 'Unauthorized' };
    }

    const questions = dbService.db.prepare(`
      SELECT q.*
      FROM exam_questions q
      JOIN exams e ON e.exam_id = q.exam_id
      WHERE e.teacher_id = ?
    `).all(currentUser.userId);

    const counts = new Map();
    for (const question of questions) {
      const summary = getQuestionRequirementView(question);
      for (const concept of summary.required_concepts || []) {
        counts.set(concept, (counts.get(concept) || 0) + 1);
      }
    }

    const result = Array.from(counts.entries())
      .map(([concept, count]) => ({ concept, count }))
      .sort((a, b) => b.count - a.count);

    return { success: true, data: result };
  } catch (error) {
    console.error('[Dashboard] dashboard:concepts error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('dashboard:questions', async (event, examId) => {
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser || (currentUser.role !== 'teacher' && currentUser.role !== 'admin')) {
      return { success: false, error: 'Unauthorized' };
    }

    const exam = dbService.getExamById(examId);
    if (!exam || exam.teacherId !== currentUser.userId) {
      return { success: false, error: 'Unauthorized: Exam does not belong to this teacher' };
    }

    const questions = dbService.getExamQuestionsByExamId(examId);
    const result = questions.map((question) => {
      const tcCount = dbService.getQuestionTestCasesByQuestionId(question.question_id).length;
      const accuracy = dbService.db.prepare(`
        WITH latest_eval AS (
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
          WHERE ce.question_id = ?
        )
        SELECT
          COUNT(*) AS totalResults,
          SUM(CASE WHEN r.passed = 1 THEN 1 ELSE 0 END) AS passedResults
        FROM latest_eval le
        JOIN test_case_results r ON r.evaluation_id = le.evaluation_id
      `).get(question.question_id) || {};
      const summary = getQuestionRequirementView(question);
      const totalResults = Number(accuracy.totalResults || 0);
      const passedResults = Number(accuracy.passedResults || 0);
      return {
        questionId: question.question_id,
        title: question.title || 'Untitled question',
        testCaseCount: tcCount,
        correctCount: passedResults,
        accuracyPercent: totalResults > 0 ? Math.round((passedResults / totalResults) * 100) : 0,
        requiredConcepts: summary.required_concepts || [],
        difficulty: summary.difficulty,
        platform: 'manual'
      };
    });

    return { success: true, data: result };
  } catch (error) {
    console.error('[Dashboard] dashboard:questions error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('dashboard:pipeline', async () => {
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser || (currentUser.role !== 'teacher' && currentUser.role !== 'admin')) {
      return { success: false, error: 'Unauthorized' };
    }

    const config = llmTestCaseService.getConfig();
    return {
      success: true,
      data: {
        primaryModel: 'llama-3.3-70b-versatile',
        primaryProvider: 'Groq',
        fallbackModel: 'gemini-flash-latest',
        fallbackProvider: 'Gemini',
        temperature: 0.2,
        maxTokens: 8192,
        casesPerPrompt: 8,
        judge0PythonId: 71,
        judge0CppId: 54,
        memoryLimitMB: 256,
        judge0Endpoint: 'local compiler',
        groqConfigured: !!config.groqApiKey,
        geminiConfigured: !!config.geminiApiKey
      }
    };
  } catch (error) {
    console.error('[Dashboard] dashboard:pipeline error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('dashboard:platforms', async () => {
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser || (currentUser.role !== 'teacher' && currentUser.role !== 'admin')) {
      return { success: false, error: 'Unauthorized' };
    }

    const total = dbService.db.prepare(`
      SELECT COUNT(*) AS c
      FROM exam_questions q
      JOIN exams e ON e.exam_id = q.exam_id
      WHERE e.teacher_id = ?
    `).get(currentUser.userId)?.c || 0;

    return {
      success: true,
      data: [
        {
          platform: 'manual',
          count: total,
          percentage: total > 0 ? 100 : 0
        }
      ]
    };
  } catch (error) {
    console.error('[Dashboard] dashboard:platforms error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('dashboard:events-recent', async () => {
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser || (currentUser.role !== 'teacher' && currentUser.role !== 'admin')) {
      return { success: false, error: 'Unauthorized' };
    }

    const teacherId = currentUser.userId;
    let rows = [];
    try {
      rows = dbService.db.prepare(`
        SELECT
          av.violation_id AS id,
          av.exam_id,
          av.student_id,
          av.focus_start_time AS timestamp,
          av.app_name AS event_type,
          av.window_title,
          1 AS is_violation,
          u.full_name AS student_name,
          e.title AS exam_title
        FROM app_violations av
        LEFT JOIN users u ON u.user_id = av.student_id
        LEFT JOIN exams e ON e.exam_id = av.exam_id
        WHERE e.teacher_id = ?
        ORDER BY av.focus_start_time DESC
        LIMIT 20
      `).all(teacherId);
    } catch (error) {
      rows = dbService.db.prepare(`
        SELECT
          ev.event_id AS id,
          ev.exam_id,
          ev.student_id,
          ev.timestamp,
          ev.event_type,
          ev.window_title,
          ev.is_violation,
          u.full_name AS student_name,
          e.title AS exam_title
        FROM events ev
        LEFT JOIN users u ON u.user_id = ev.student_id
        LEFT JOIN exams e ON e.exam_id = ev.exam_id
        WHERE e.teacher_id = ?
        ORDER BY ev.timestamp DESC
        LIMIT 20
      `).all(teacherId);
    }

    return { success: true, data: rows };
  } catch (error) {
    console.error('[Dashboard] dashboard:events-recent error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('dashboard:submissions-recent', async () => {
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser || (currentUser.role !== 'teacher' && currentUser.role !== 'admin')) {
      return { success: false, error: 'Unauthorized' };
    }

    const rows = dbService.db.prepare(`
      WITH latest_eval AS (
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
        le.evaluation_id,
        le.submission_id,
        es.exam_id,
        le.question_id,
        es.student_id,
        COALESCE(le.final_score, le.score, 0) AS score,
        le.max_score,
        le.created_at AS submitted_at,
        le.requirement_checks_json,
        le.hardcoding_flags_json,
        u.full_name AS student_name,
        u.username,
        q.title AS question_title,
        e.title AS exam_title
      FROM latest_eval le
      JOIN exam_submissions es ON es.submission_id = le.submission_id
      JOIN users u ON u.user_id = es.student_id
      JOIN exam_questions q ON q.question_id = le.question_id
      JOIN exams e ON e.exam_id = es.exam_id
      WHERE e.teacher_id = ?
      ORDER BY le.created_at DESC
      LIMIT 10
    `).all(currentUser.userId);

    const result = rows.map((row) => {
      const counts = dbService.db.prepare(`
        SELECT
          COUNT(*) AS total_count,
          SUM(CASE WHEN passed = 1 THEN 1 ELSE 0 END) AS passed_count
        FROM test_case_results
        WHERE evaluation_id = ?
      `).get(row.evaluation_id) || {};
      const scorePct =
        Number(row.max_score || 0) > 0
          ? Math.round((Number(row.score || 0) * 10000) / Number(row.max_score || 1)) / 100
          : 0;
      const requirementChecks = dbService._fromJsonText(row.requirement_checks_json);
      const hardcodingFlags = dbService._fromJsonText(row.hardcoding_flags_json);
      return {
        submission_id: row.submission_id,
        exam_id: row.exam_id,
        question_id: row.question_id,
        student_id: row.student_id,
        score: scorePct,
        passed_count: Number(counts.passed_count || 0),
        total_count: Number(counts.total_count || 0),
        hardcoded: dbService._isEvaluationHardcoded({ hardcoding_flags_json: hardcodingFlags }) ? 1 : 0,
        concept_passed: dbService._isConceptRequirementMet({ requirement_checks_json: requirementChecks }) ? 1 : 0,
        submitted_at: row.submitted_at,
        language: 'cpp',
        student_name: row.student_name,
        username: row.username,
        question_title: row.question_title,
        exam_title: row.exam_title
      };
    });

    return { success: true, data: result };
  } catch (error) {
    console.error('[Dashboard] dashboard:submissions-recent error:', error);
    return { success: false, error: error.message };
  }
});

// ===== STUDENT ANALYTICS HANDLERS =====

ipcMain.handle('students:getAll', async (event, teacherId) => {
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser || (currentUser.role !== 'teacher' && currentUser.role !== 'admin')) {
      return { success: false, error: 'Unauthorized' };
    }
    if (currentUser.role === 'teacher' && currentUser.userId !== teacherId) {
      return { success: false, error: 'Cannot access other teachers\' data' };
    }

    const studentAnalytics = require('../services/studentAnalyticsService');
    const students = dbService.getAllStudentsByTeacher(teacherId);
    const studentsWithRiskFlags = students.map((student) => {
      const submissions = dbService.getStudentSubmissionHistory(student.userId, teacherId);
      const conceptStats = studentAnalytics.computeConceptStats(submissions);
      const atRiskConcepts = conceptStats.filter((item) => item.isAtRisk);
      return {
        ...student,
        isAtRisk: atRiskConcepts.length > 0,
        atRiskConceptCount: atRiskConcepts.length
      };
    });

    return { success: true, students: studentsWithRiskFlags };
  } catch (error) {
    console.error('[StudentAnalytics] getAll error:', error.message);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('students:getAtRisk', async (event, teacherId) => {
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser || (currentUser.role !== 'teacher' && currentUser.role !== 'admin')) {
      return { success: false, error: 'Unauthorized' };
    }
    if (currentUser.role === 'teacher' && currentUser.userId !== teacherId) {
      return { success: false, error: 'Cannot access other teachers\' data' };
    }

    const studentAnalytics = require('../services/studentAnalyticsService');
    const students = dbService.getAllStudentsByTeacher(teacherId);
    const atRiskStudents = students
      .map((student) => {
        const submissions = dbService.getStudentSubmissionHistory(student.userId, teacherId);
        const conceptStats = studentAnalytics.computeConceptStats(submissions);
        const atRiskConcepts = conceptStats
          .filter((item) => item.isAtRisk)
          .map((item) => ({
            concept: item.concept,
            consecutiveFailures: item.consecutiveFailures,
            failRate: item.failRate
          }));
        return {
          userId: student.userId,
          name: student.name,
          email: student.email,
          atRiskConcepts,
          lastActive: student.lastActive
        };
      })
      .filter((student) => student.atRiskConcepts.length > 0);

    return { success: true, atRiskStudents };
  } catch (error) {
    console.error('[StudentAnalytics] getAtRisk error:', error.message);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('students:getProfile', async (event, { teacherId, studentId }) => {
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser || (currentUser.role !== 'teacher' && currentUser.role !== 'admin')) {
      return { success: false, error: 'Unauthorized' };
    }
    if (currentUser.role === 'teacher' && currentUser.userId !== teacherId) {
      return { success: false, error: 'Cannot access other teachers\' data' };
    }

    const authorized = dbService.verifyStudentBelongsToTeacher(studentId, teacherId);
    if (!authorized) {
      return { success: false, error: 'Student has no submissions in your exams' };
    }

    const studentAnalytics = require('../services/studentAnalyticsService');
    const students = dbService.getAllStudentsByTeacher(teacherId);
    const student = students.find((item) => item.userId === studentId);
    if (!student) {
      return { success: false, error: 'Student not found' };
    }

    const submissions = dbService.getStudentSubmissionHistory(studentId, teacherId);
    const conceptStats = studentAnalytics.computeConceptStats(submissions);
    const examPerformance = dbService.getStudentExamPerformance(studentId, teacherId);
    const atRiskConcepts = conceptStats.filter((item) => item.isAtRisk);
    const overallTrend = studentAnalytics.computeImprovementTrend(
      examPerformance.filter((item) => item.questionsAttempted > 0)
    );

    return {
      success: true,
      profile: {
        student,
        conceptStats,
        examPerformance,
        atRiskConcepts,
        overallTrend,
        submissions
      }
    };
  } catch (error) {
    console.error('[StudentAnalytics] getProfile error:', error.message);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('students:generateReport', async (event, { teacherId, studentId, format }) => {
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser || (currentUser.role !== 'teacher' && currentUser.role !== 'admin')) {
      return { success: false, error: 'Unauthorized' };
    }
    if (currentUser.role === 'teacher' && currentUser.userId !== teacherId) {
      return { success: false, error: 'Cannot generate reports for other teachers\' students' };
    }

    const studentAnalytics = require('../services/studentAnalyticsService');
    const students = dbService.getAllStudentsByTeacher(teacherId);
    const student = students.find((item) => item.userId === studentId);
    if (!student) {
      return { success: false, error: 'Student not found' };
    }

    const submissions = dbService.getStudentSubmissionHistory(studentId, teacherId);
    const conceptStats = studentAnalytics.computeConceptStats(submissions);
    const examPerformance = dbService.getStudentExamPerformance(studentId, teacherId);
    const atRiskConcepts = conceptStats.filter((item) => item.isAtRisk);
    const overallTrend = studentAnalytics.computeImprovementTrend(
      examPerformance.filter((item) => item.questionsAttempted > 0)
    );
    const profile = {
      student,
      conceptStats,
      examPerformance,
      atRiskConcepts,
      overallTrend,
      submissions
    };
    const reportText = studentAnalytics.generateReportText(profile, currentUser.fullName || 'Instructor');
    const safeName = String(student.name || 'student').replace(/\s+/g, '_');
    const dateLabel = new Date().toISOString().split('T')[0];

    if (format === 'json') {
      return {
        success: true,
        format: 'json',
        content: JSON.stringify(profile, null, 2),
        filename: `labguard_report_${safeName}_${dateLabel}.json`
      };
    }

    return {
      success: true,
      format: 'text',
      content: reportText,
      filename: `labguard_report_${safeName}_${dateLabel}.txt`
    };
  } catch (error) {
    console.error('[StudentAnalytics] generateReport error:', error.message);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('students:getExamScores', async (event, examId) => {
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser || (currentUser.role !== 'teacher' && currentUser.role !== 'admin')) {
      return { success: false, error: 'Unauthorized' };
    }
    const exam = dbService.getExamById(examId);
    if (!exam || (currentUser.role === 'teacher' && exam.teacherId !== currentUser.userId)) {
      return { success: false, error: 'Exam not found or access denied' };
    }

    const result = dbService.getExamStudentScores(examId);
    return { success: true, ...result };
  } catch (error) {
    console.error('[StudentAnalytics] getExamScores error:', error.message);
    return { success: false, error: error.message };
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
