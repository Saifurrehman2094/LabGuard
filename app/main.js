const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const isDev = require('electron-is-dev');

// Import services
const AuthService = require('../services/auth');
const DatabaseService = require('../services/database');
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

// Initialize services
async function initializeServices() {
  try {
    console.log('Initializing database service...');
    dbService = new DatabaseService();
    await dbService.initializeDatabase();
    console.log('Database service initialized');
    
    // Seed test accounts for development
    await dbService.seedTestAccounts();
    console.log('Test accounts seeded');
    
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