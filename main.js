const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');
const AppDetectionModule = require('./src/modules/AppDetectionModule');

// Keep a global reference of the window object
let mainWindow;
let appDetectionModule;

/**
 * Main Electron Application for AI-Powered Cheating Detection System
 * 
 * This application demonstrates the App Detection Module capabilities
 * and provides a foundation for the complete cheating detection system.
 */

function createWindow() {
    // Create the browser window
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            enableRemoteModule: true
        },
        title: 'AI-Powered Cheating Detection System - App Detection Module',
        icon: path.join(__dirname, 'assets/icon.png'), // You can add an icon later
        show: false
    });

    // Load the index.html file
    mainWindow.loadFile('index.html');

    // Show window when ready
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        
        // Initialize the App Detection Module after window is ready
        initializeAppDetectionModule();
    });

    // Handle window closed
    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    // Create application menu
    createApplicationMenu();
}

/**
 * Initialize the App Detection Module
 */
function initializeAppDetectionModule() {
    try {
        console.log('🔍 Initializing App Detection Module...');
        
        // Create the Enhanced App Detection Module instance
        appDetectionModule = new AppDetectionModule({
            pollingInterval: 3000,        // Check every 3 seconds
            maxProcesses: 50,             // Focus on user apps only (reduced from 1000)
            enableProcessMonitoring: true,
            enableWindowMonitoring: true,
            enableDataLogging: true,
            filterSystemProcesses: true,  // NEW: Filter out system processes
            focusOnUserApps: true,        // NEW: Focus on user applications
            debugMode: true               // NEW: Enable debug mode for troubleshooting
        });

        // Set up event listeners for the main process
        setupAppDetectionEvents();
        
        // Set up IPC handlers for communication with renderer process
        setupIPCHandlers();
        
        console.log('✅ App Detection Module initialized successfully');
        
    } catch (error) {
        console.error('❌ Failed to initialize App Detection Module:', error);
    }
}

/**
 * Set up event listeners for the App Detection Module
 */
function setupAppDetectionEvents() {
    if (!appDetectionModule) return;

    // Monitoring lifecycle events
    appDetectionModule.on('monitoringStarted', (data) => {
        console.log('🚀 App Detection Monitoring Started');
        sendToRenderer('monitoringStarted', data);
    });

    appDetectionModule.on('monitoringStopped', (data) => {
        console.log('🛑 App Detection Monitoring Stopped');
        sendToRenderer('monitoringStopped', data);
    });

    // Process monitoring events
    appDetectionModule.on('processListUpdated', (data) => {
        sendToRenderer('processListUpdated', data);
    });

    appDetectionModule.on('newProcessesDetected', (data) => {
        console.log(`🆕 New processes detected: ${data.processes.length}`);
        sendToRenderer('newProcessesDetected', data);
    });

    appDetectionModule.on('processesTerminated', (data) => {
        console.log(`💀 Processes terminated: ${data.processes.length}`);
        sendToRenderer('processesTerminated', data);
    });

    // Window monitoring events
    appDetectionModule.on('activeWindowChanged', (data) => {
        console.log(`🔄 Active window changed to: ${data.currentWindow?.app || 'Unknown'}`);
        sendToRenderer('activeWindowChanged', data);
    });

    appDetectionModule.on('activeWindowUpdated', (data) => {
        sendToRenderer('activeWindowUpdated', data);
    });

    // Monitoring cycle events
    appDetectionModule.on('monitoringCycleComplete', (data) => {
        sendToRenderer('monitoringCycleComplete', data);
    });

    // Error handling
    appDetectionModule.on('error', (error) => {
        console.error('❌ App Detection Error:', error);
        sendToRenderer('error', { message: error.message });
    });
}

/**
 * Set up IPC handlers for communication with renderer process
 */
function setupIPCHandlers() {
    // Start monitoring
    ipcMain.handle('startMonitoring', async () => {
        try {
            if (appDetectionModule) {
                await appDetectionModule.startMonitoring();
                return { success: true, message: 'Monitoring started successfully' };
            }
            return { success: false, message: 'App Detection Module not initialized' };
        } catch (error) {
            return { success: false, message: error.message };
        }
    });

    // Stop monitoring
    ipcMain.handle('stopMonitoring', async () => {
        try {
            if (appDetectionModule) {
                appDetectionModule.stopMonitoring();
                return { success: true, message: 'Monitoring stopped successfully' };
            }
            return { success: false, message: 'App Detection Module not initialized' };
        } catch (error) {
            return { success: false, message: error.message };
        }
    });

    // Get current data snapshot
    ipcMain.handle('getDataSnapshot', async () => {
        try {
            if (appDetectionModule) {
                return await appDetectionModule.getDataSnapshot();
            }
            return null;
        } catch (error) {
            throw error;
        }
    });

    // Get system status
    ipcMain.handle('getSystemStatus', () => {
        if (appDetectionModule) {
            return appDetectionModule.getSystemStatus();
        }
        return null;
    });

    // Get process history
    ipcMain.handle('getProcessHistory', () => {
        if (appDetectionModule) {
            return appDetectionModule.getProcessHistory();
        }
        return [];
    });

    // Get window history
    ipcMain.handle('getWindowHistory', () => {
        if (appDetectionModule) {
            return appDetectionModule.getWindowHistory();
        }
        return [];
    });

    // Update configuration
    ipcMain.handle('updateConfig', async (event, newConfig) => {
        try {
            if (appDetectionModule) {
                // Stop current monitoring if running
                if (appDetectionModule.isRunning) {
                    appDetectionModule.stopMonitoring();
                }
                
                // Update configuration
                Object.assign(appDetectionModule.config, newConfig);
                
                // Restart monitoring if it was running
                if (appDetectionModule.isRunning) {
                    await appDetectionModule.startMonitoring();
                }
                
                return { success: true, message: 'Configuration updated successfully' };
            }
            return { success: false, message: 'App Detection Module not initialized' };
        } catch (error) {
            return { success: false, message: error.message };
        }
    });
}

/**
 * Send data to renderer process
 */
function sendToRenderer(channel, data) {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(channel, data);
    }
}

/**
 * Create application menu
 */
function createApplicationMenu() {
    const template = [
        {
            label: 'File',
            submenu: [
                {
                    label: 'Start Monitoring',
                    accelerator: 'CmdOrCtrl+S',
                    click: async () => {
                        if (appDetectionModule) {
                            await appDetectionModule.startMonitoring();
                        }
                    }
                },
                {
                    label: 'Stop Monitoring',
                    accelerator: 'CmdOrCtrl+X',
                    click: () => {
                        if (appDetectionModule) {
                            appDetectionModule.stopMonitoring();
                        }
                    }
                },
                { type: 'separator' },
                {
                    label: 'Exit',
                    accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
                    click: () => {
                        app.quit();
                    }
                }
            ]
        },
        {
            label: 'View',
            submenu: [
                { role: 'reload' },
                { role: 'forceReload' },
                { role: 'toggleDevTools' },
                { type: 'separator' },
                { role: 'resetZoom' },
                { role: 'zoomIn' },
                { role: 'zoomOut' },
                { type: 'separator' },
                { role: 'togglefullscreen' }
            ]
        },
        {
            label: 'Help',
            submenu: [
                {
                    label: 'About',
                    click: () => {
                        // You can implement an about dialog here
                        console.log('AI-Powered Cheating Detection System v1.0.0');
                    }
                }
            ]
        }
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
}

/**
 * App event handlers
 */

// This method will be called when Electron has finished initialization
app.whenReady().then(createWindow);

// Quit when all windows are closed
app.on('window-all-closed', () => {
    // On macOS it is common for applications and their menu bar
    // to stay active until the user quits explicitly with Cmd + Q
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

// Handle app quit
app.on('before-quit', () => {
    console.log('🔄 Application shutting down...');
    
    // Clean up App Detection Module
    if (appDetectionModule) {
        appDetectionModule.destroy();
    }
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

console.log('🚀 AI-Powered Cheating Detection System - App Detection Module Starting...');
