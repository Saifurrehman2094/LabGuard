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

        // Check against normalized allowed apps
        return allowedApps.some(allowedApp => {
            const normalizedAllowed = this.normalizeApplicationName(allowedApp);
            return normalizedAppName === normalizedAllowed ||
                normalizedAppName.includes(normalizedAllowed) ||
                normalizedAllowed.includes(normalizedAppName);
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