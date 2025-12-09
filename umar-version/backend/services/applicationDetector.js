/**
 * Application Detection Service
 * Provides high-level application detection and monitoring functionality
 */

const WindowsApiService = require('./windowsApi');

class ApplicationDetector {
    constructor() {
        this.windowsApi = new WindowsApiService();
        this.lastActiveApp = null;
        this.isMonitoring = false;
        this.monitoringInterval = null;
        this.pollingIntervalMs = 1000; // Default 1 second polling

        // Event callbacks
        this.onApplicationChange = null;
        this.onError = null;
    }

    /**
     * Initialize the application detector
     * @returns {boolean} True if initialization successful
     */
    initialize() {
        try {
            if (!this.windowsApi.isInitialized()) {
                throw new Error('Windows API failed to initialize');
            }

            // Test API functionality
            const testResults = this.windowsApi.testApi();
            if (!testResults.canGetForegroundWindow) {
                throw new Error('Cannot access foreground window - insufficient permissions');
            }

            console.log('Application detector initialized successfully');
            return true;
        } catch (error) {
            console.error('Failed to initialize application detector:', error);
            if (this.onError) {
                this.onError(error);
            }
            return false;
        }
    }

    /**
     * Set polling interval for monitoring
     * @param {number} intervalMs - Polling interval in milliseconds
     */
    setPollingInterval(intervalMs) {
        if (intervalMs < 100) {
            console.warn('Polling interval too low, setting to minimum 100ms');
            intervalMs = 100;
        }

        this.pollingIntervalMs = intervalMs;

        // Restart monitoring with new interval if currently monitoring
        if (this.isMonitoring) {
            this.stopMonitoring();
            this.startMonitoring();
        }
    }

    /**
     * Set callback for application change events
     * @param {Function} callback - Callback function (oldApp, newApp) => void
     */
    setApplicationChangeCallback(callback) {
        this.onApplicationChange = callback;
    }

    /**
     * Set callback for error events
     * @param {Function} callback - Callback function (error) => void
     */
    setErrorCallback(callback) {
        this.onError = callback;
    }

    /**
     * Get current active application information
     * @returns {Object|null} Application information or null if failed
     */
    getCurrentActiveApplication() {
        try {
            const windowInfo = this.windowsApi.getActiveWindowInfo();

            if (!windowInfo) {
                return null;
            }

            return {
                applicationName: windowInfo.applicationName,
                windowTitle: windowInfo.windowTitle,
                className: windowInfo.className,
                processId: windowInfo.processId,
                executablePath: windowInfo.executablePath,
                timestamp: windowInfo.timestamp,
                // Normalized name for comparison
                normalizedName: this.normalizeApplicationName(windowInfo.applicationName)
            };
        } catch (error) {
            console.error('Failed to get current active application:', error);
            if (this.onError) {
                this.onError(error);
            }
            return null;
        }
    }

    /**
     * Normalize application name for consistent comparison
     * @param {string} appName - Raw application name
     * @returns {string} Normalized application name
     */
    normalizeApplicationName(appName) {
        if (!appName) {
            return 'unknown';
        }

        return appName
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9]/g, ''); // Remove special characters and spaces
    }

    /**
     * Check if an application is in the allowed list
     * @param {string} applicationName - Application name to check
     * @param {string[]} allowedApps - Array of allowed application names
     * @returns {boolean} True if application is allowed
     */
    isApplicationAllowed(applicationName, allowedApps) {
        if (!applicationName || !Array.isArray(allowedApps)) {
            return false;
        }

        const normalizedAppName = this.normalizeApplicationName(applicationName);

        // Always allow system and LAB-Guard related applications
        const systemApps = [
            'labguard', 'lab-guard', 'electron', 'kiro', 'dwm', 'explorer', 'winlogon',
            'csrss', 'wininit', 'services', 'lsass', 'svchost', 'taskhost',
            'conhost', 'audiodg', 'spoolsv', 'searchindexer', 'vscode', 'code'
        ];

        if (systemApps.some(sysApp =>
            normalizedAppName.includes(sysApp) || sysApp.includes(normalizedAppName)
        )) {
            return true;
        }

        // Application name mappings for common variations
        const appMappings = {
            // Chrome variations
            'chrome': ['chrome', 'googlechrome', 'chromeexe'],
            'chromeexe': ['chrome', 'googlechrome', 'chromeexe'],
            'googlechrome': ['chrome', 'googlechrome', 'chromeexe'],

            // Firefox variations
            'firefox': ['firefox', 'mozillafirefox', 'firefoxexe'],
            'firefoxexe': ['firefox', 'mozillafirefox', 'firefoxexe'],
            'mozillafirefox': ['firefox', 'mozillafirefox', 'firefoxexe'],

            // Calculator variations (including Windows 10/11 Calculator and UWP)
            'calc': ['calc', 'calculator', 'calcexe', 'calculatorexe', 'calculatorapp', 'calculatorappexe', 'microsoftwindowscalculator'],
            'calcexe': ['calc', 'calculator', 'calcexe', 'calculatorexe', 'calculatorapp', 'calculatorappexe', 'microsoftwindowscalculator'],
            'calculator': ['calc', 'calculator', 'calcexe', 'calculatorexe', 'calculatorapp', 'calculatorappexe', 'microsoftwindowscalculator'],
            'calculatorexe': ['calc', 'calculator', 'calcexe', 'calculatorexe', 'calculatorapp', 'calculatorappexe', 'microsoftwindowscalculator'],
            'calculatorapp': ['calc', 'calculator', 'calcexe', 'calculatorexe', 'calculatorapp', 'calculatorappexe', 'microsoftwindowscalculator'],
            'calculatorappexe': ['calc', 'calculator', 'calcexe', 'calculatorexe', 'calculatorapp', 'calculatorappexe', 'microsoftwindowscalculator'],
            'microsoftwindowscalculator': ['calc', 'calculator', 'calcexe', 'calculatorexe', 'calculatorapp', 'calculatorappexe', 'microsoftwindowscalculator'],

            // Notepad variations
            'notepad': ['notepad', 'notepadexe'],
            'notepadexe': ['notepad', 'notepadexe'],

            // Word variations
            'winword': ['winword', 'word', 'winwordexe', 'wordexe', 'microsoftword'],
            'winwordexe': ['winword', 'word', 'winwordexe', 'wordexe', 'microsoftword'],
            'word': ['winword', 'word', 'winwordexe', 'wordexe', 'microsoftword'],
            'wordexe': ['winword', 'word', 'winwordexe', 'wordexe', 'microsoftword'],
            'microsoftword': ['winword', 'word', 'winwordexe', 'wordexe', 'microsoftword'],

            // Excel variations
            'excel': ['excel', 'excelexe', 'microsoftexcel'],
            'excelexe': ['excel', 'excelexe', 'microsoftexcel'],
            'microsoftexcel': ['excel', 'excelexe', 'microsoftexcel'],

            // Edge variations
            'msedge': ['msedge', 'edge', 'microsoftedge', 'msedgeexe'],
            'msedgeexe': ['msedge', 'edge', 'microsoftedge', 'msedgeexe'],
            'edge': ['msedge', 'edge', 'microsoftedge', 'msedgeexe'],
            'microsoftedge': ['msedge', 'edge', 'microsoftedge', 'msedgeexe'],

            // VS Code variations
            'code': ['code', 'vscode', 'codeexe', 'vscodeexe', 'visualstudiocode'],
            'codeexe': ['code', 'vscode', 'codeexe', 'vscodeexe', 'visualstudiocode'],
            'vscode': ['code', 'vscode', 'codeexe', 'vscodeexe', 'visualstudiocode'],
            'vscodeexe': ['code', 'vscode', 'codeexe', 'vscodeexe', 'visualstudiocode'],
            'visualstudiocode': ['code', 'vscode', 'codeexe', 'vscodeexe', 'visualstudiocode']
        };

        // Check against user-defined allowed apps with enhanced matching
        return allowedApps.some(allowedApp => {
            const normalizedAllowed = this.normalizeApplicationName(allowedApp);

            // Direct match
            if (normalizedAppName === normalizedAllowed) {
                return true;
            }

            // Partial match (contains)
            if (normalizedAppName.includes(normalizedAllowed) || normalizedAllowed.includes(normalizedAppName)) {
                return true;
            }

            // Check application mappings for common variations
            const appVariations = appMappings[normalizedAllowed] || [];
            const allowedVariations = appMappings[normalizedAppName] || [];

            // Check if current app matches any variation of allowed app
            if (appVariations.includes(normalizedAppName)) {
                return true;
            }

            // Check if allowed app matches any variation of current app
            if (allowedVariations.includes(normalizedAllowed)) {
                return true;
            }

            // Check cross-variations (if both have mappings, check for overlap)
            if (appVariations.length > 0 && allowedVariations.length > 0) {
                return appVariations.some(variation => allowedVariations.includes(variation));
            }

            return false;
        });
    }

    /**
     * Start monitoring application changes
     * @returns {boolean} True if monitoring started successfully
     */
    startMonitoring() {
        if (this.isMonitoring) {
            console.warn('Application monitoring is already active');
            return true;
        }

        if (!this.windowsApi.isInitialized()) {
            console.error('Cannot start monitoring - Windows API not initialized');
            return false;
        }

        try {
            // Get initial active application
            this.lastActiveApp = this.getCurrentActiveApplication();

            // Start polling
            this.monitoringInterval = setInterval(() => {
                this.checkApplicationChange();
            }, this.pollingIntervalMs);

            this.isMonitoring = true;
            console.log(`Application monitoring started with ${this.pollingIntervalMs}ms interval`);
            return true;
        } catch (error) {
            console.error('Failed to start application monitoring:', error);
            if (this.onError) {
                this.onError(error);
            }
            return false;
        }
    }

    /**
     * Stop monitoring application changes
     */
    stopMonitoring() {
        if (!this.isMonitoring) {
            return;
        }

        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
        }

        this.isMonitoring = false;
        this.lastActiveApp = null;
        console.log('Application monitoring stopped');
    }

    /**
     * Check for application changes (internal polling method)
     */
    checkApplicationChange() {
        try {
            const currentApp = this.getCurrentActiveApplication();

            // Compare with last known active app
            if (this.hasApplicationChanged(this.lastActiveApp, currentApp)) {
                const oldApp = this.lastActiveApp;
                this.lastActiveApp = currentApp;

                // Trigger callback if set
                if (this.onApplicationChange) {
                    this.onApplicationChange(oldApp, currentApp);
                }
            }
        } catch (error) {
            console.error('Error during application change check:', error);
            if (this.onError) {
                this.onError(error);
            }
        }
    }

    /**
     * Check if application has changed
     * @param {Object|null} oldApp - Previous application info
     * @param {Object|null} newApp - Current application info
     * @returns {boolean} True if application changed
     */
    hasApplicationChanged(oldApp, newApp) {
        // Handle null cases
        if (!oldApp && !newApp) return false;
        if (!oldApp && newApp) return true;
        if (oldApp && !newApp) return true;

        // Compare normalized application names and process IDs
        return oldApp.normalizedName !== newApp.normalizedName ||
            oldApp.processId !== newApp.processId;
    }

    /**
     * Get monitoring status
     * @returns {Object} Monitoring status information
     */
    getMonitoringStatus() {
        return {
            isMonitoring: this.isMonitoring,
            pollingInterval: this.pollingIntervalMs,
            apiInitialized: this.windowsApi.isInitialized(),
            lastActiveApp: this.lastActiveApp,
            currentTime: new Date().toISOString()
        };
    }

    /**
     * Test application detection functionality
     * @returns {Object} Test results
     */
    async testDetection() {
        const results = {
            apiTest: null,
            currentApp: null,
            monitoringTest: false,
            error: null
        };

        try {
            // Test Windows API
            results.apiTest = this.windowsApi.testApi();

            // Test current app detection
            results.currentApp = this.getCurrentActiveApplication();

            // Test monitoring (brief test)
            if (this.initialize()) {
                let changeDetected = false;

                this.setApplicationChangeCallback(() => {
                    changeDetected = true;
                });

                this.startMonitoring();

                // Wait 2 seconds for potential changes
                await new Promise(resolve => setTimeout(resolve, 2000));

                this.stopMonitoring();
                results.monitoringTest = true; // Monitoring started/stopped successfully
            }

        } catch (error) {
            results.error = error.message;
        }

        return results;
    }

    /**
     * Cleanup resources
     */
    cleanup() {
        this.stopMonitoring();
        this.onApplicationChange = null;
        this.onError = null;
    }
}

module.exports = ApplicationDetector;