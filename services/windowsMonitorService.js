/**
 * Windows Monitor Service for Exam Application Monitoring
 * Extends ApplicationDetector with violation detection and event emission
 */

const ApplicationDetector = require('./applicationDetector');
const EventEmitter = require('events');

class WindowsMonitorService extends EventEmitter {
    constructor(options = {}) {
        super();

        this.applicationDetector = new ApplicationDetector();
        this.pollingInterval = options.pollingInterval || 1000; // Default 1000ms
        this.allowedApplications = [];
        this.isMonitoring = false;
        this.currentViolation = null;
        this.monitoringStartTime = null;

        // Bind event handlers
        this.setupEventHandlers();
    }

    /**
     * Setup event handlers for application detector
     */
    setupEventHandlers() {
        this.applicationDetector.setApplicationChangeCallback((oldApp, newApp) => {
            this.handleApplicationChange(oldApp, newApp);
        });

        this.applicationDetector.setErrorCallback((error) => {
            this.emit('error', error);
        });
    }

    /**
     * Initialize the monitoring service
     * @returns {boolean} True if initialization successful
     */
    initialize() {
        try {
            const success = this.applicationDetector.initialize();
            if (success) {
                this.applicationDetector.setPollingInterval(this.pollingInterval);
                this.emit('initialized');
            }
            return success;
        } catch (error) {
            this.emit('error', error);
            return false;
        }
    }

    /**
     * Start monitoring with allowed applications list
     * @param {string[]} allowedApps - Array of allowed application names
     * @returns {boolean} True if monitoring started successfully
     */
    startMonitoring(allowedApps = []) {
        if (this.isMonitoring) {
            console.warn('Windows monitoring is already active');
            return true;
        }

        if (!Array.isArray(allowedApps)) {
            throw new Error('Allowed applications must be an array');
        }

        try {
            this.allowedApplications = allowedApps.map(app => app.toLowerCase().trim());
            this.monitoringStartTime = new Date();
            this.currentViolation = null;

            // Start the underlying application detector
            const success = this.applicationDetector.startMonitoring();

            if (success) {
                this.isMonitoring = true;

                // Check initial application state
                const currentApp = this.applicationDetector.getCurrentActiveApplication();
                if (currentApp) {
                    this.checkApplicationViolation(currentApp);
                }

                this.emit('monitoringStarted', {
                    allowedApplications: this.allowedApplications,
                    startTime: this.monitoringStartTime,
                    pollingInterval: this.pollingInterval
                });

                console.log(`Windows monitoring started with ${this.allowedApplications.length} allowed applications`);
            }

            return success;
        } catch (error) {
            this.emit('error', error);
            return false;
        }
    }

    /**
     * Stop monitoring
     */
    stopMonitoring() {
        if (!this.isMonitoring) {
            return;
        }

        try {
            // End any active violation
            if (this.currentViolation) {
                this.endCurrentViolation();
            }

            // Stop the underlying application detector
            this.applicationDetector.stopMonitoring();

            this.isMonitoring = false;
            const monitoringDuration = this.monitoringStartTime ?
                Date.now() - this.monitoringStartTime.getTime() : 0;

            this.emit('monitoringStopped', {
                duration: monitoringDuration,
                stopTime: new Date()
            });

            console.log('Windows monitoring stopped');
        } catch (error) {
            this.emit('error', error);
        }
    }

    /**
     * Handle application change events from ApplicationDetector
     * @param {Object|null} oldApp - Previous application info
     * @param {Object|null} newApp - Current application info
     */
    handleApplicationChange(oldApp, newApp) {
        try {
            // Emit application change event
            this.emit('applicationChanged', {
                previousApp: oldApp,
                currentApp: newApp,
                timestamp: new Date()
            });

            // End current violation if switching away from unauthorized app
            if (this.currentViolation && oldApp) {
                this.endCurrentViolation();
            }

            // Check new application for violations
            if (newApp) {
                this.checkApplicationViolation(newApp);
            }
        } catch (error) {
            this.emit('error', error);
        }
    }

    /**
     * Check if current application is a violation
     * @param {Object} appInfo - Application information
     */
    checkApplicationViolation(appInfo) {
        if (!appInfo || !this.isMonitoring) {
            return;
        }

        const isAllowed = this.isApplicationAllowed(appInfo.applicationName);

        // Emit application check event for logging/debugging
        this.emit('applicationChecked', {
            applicationName: appInfo.applicationName,
            windowTitle: appInfo.windowTitle,
            isAllowed,
            timestamp: new Date()
        });

        if (!isAllowed) {
            // Only start violation if not already in violation for same app
            if (!this.currentViolation ||
                this.currentViolation.applicationName !== appInfo.applicationName ||
                this.currentViolation.processId !== appInfo.processId) {

                // End any existing violation first
                if (this.currentViolation) {
                    this.endCurrentViolation();
                }

                // Start new violation
                this.startViolation(appInfo);
            }
        }
    }

    /**
     * Check if an application is allowed
     * @param {string} applicationName - Application name to check
     * @returns {boolean} True if application is allowed
     */
    isApplicationAllowed(applicationName) {
        if (!applicationName) {
            return false;
        }

        // Use ApplicationDetector's normalization and checking logic
        return this.applicationDetector.isApplicationAllowed(applicationName, this.allowedApplications);
    }

    /**
     * Normalize application name for consistent comparison
     * @param {string} appName - Raw application name
     * @returns {string} Normalized application name
     */
    normalizeApplicationName(appName) {
        return this.applicationDetector.normalizeApplicationName(appName);
    }

    /**
     * Add allowed application to the list
     * @param {string} applicationName - Application name to add
     */
    addAllowedApplication(applicationName) {
        if (!applicationName) {
            return;
        }

        const normalizedName = applicationName.toLowerCase().trim();
        if (!this.allowedApplications.includes(normalizedName)) {
            this.allowedApplications.push(normalizedName);

            this.emit('allowedApplicationAdded', {
                applicationName: normalizedName,
                timestamp: new Date()
            });
        }
    }

    /**
     * Remove allowed application from the list
     * @param {string} applicationName - Application name to remove
     */
    removeAllowedApplication(applicationName) {
        if (!applicationName) {
            return;
        }

        const normalizedName = applicationName.toLowerCase().trim();
        const index = this.allowedApplications.indexOf(normalizedName);

        if (index > -1) {
            this.allowedApplications.splice(index, 1);

            this.emit('allowedApplicationRemoved', {
                applicationName: normalizedName,
                timestamp: new Date()
            });
        }
    }

    /**
     * Update the entire allowed applications list
     * @param {string[]} allowedApps - New array of allowed application names
     */
    updateAllowedApplications(allowedApps) {
        if (!Array.isArray(allowedApps)) {
            throw new Error('Allowed applications must be an array');
        }

        const oldAllowedApps = [...this.allowedApplications];
        this.allowedApplications = allowedApps.map(app => app.toLowerCase().trim());

        this.emit('allowedApplicationsUpdated', {
            previousApps: oldAllowedApps,
            currentApps: this.allowedApplications,
            timestamp: new Date()
        });

        // If currently monitoring, check if current app is now a violation
        if (this.isMonitoring) {
            const currentApp = this.getCurrentActiveApplication();
            if (currentApp) {
                // End current violation if it exists
                if (this.currentViolation) {
                    this.endCurrentViolation();
                }

                // Check new violation status
                this.checkApplicationViolation(currentApp);
            }
        }
    }

    /**
     * Get list of allowed applications
     * @returns {string[]} Array of allowed application names
     */
    getAllowedApplications() {
        return [...this.allowedApplications];
    }

    /**
     * Start a new violation
     * @param {Object} appInfo - Application information
     */
    startViolation(appInfo) {
        const violationId = this.generateViolationId();
        const startTime = new Date();

        this.currentViolation = {
            violationId,
            applicationName: appInfo.applicationName,
            windowTitle: appInfo.windowTitle,
            processId: appInfo.processId,
            executablePath: appInfo.executablePath,
            startTime,
            endTime: null,
            duration: null,
            isActive: true
        };

        this.emit('violationStarted', {
            ...this.currentViolation,
            timestamp: startTime
        });

        console.log(`Violation started: ${appInfo.applicationName} (${violationId})`);
    }

    /**
     * End the current violation
     */
    endCurrentViolation() {
        if (!this.currentViolation) {
            return;
        }

        const endTime = new Date();
        const duration = endTime.getTime() - this.currentViolation.startTime.getTime();

        this.currentViolation.endTime = endTime;
        this.currentViolation.duration = duration;
        this.currentViolation.isActive = false;

        this.emit('violationEnded', {
            ...this.currentViolation,
            timestamp: endTime
        });

        console.log(`Violation ended: ${this.currentViolation.applicationName} (${this.currentViolation.violationId}) - Duration: ${duration}ms`);

        this.currentViolation = null;
    }

    /**
     * Generate unique violation ID
     * @returns {string} Unique violation ID
     */
    generateViolationId() {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substr(2, 9);
        return `violation_${timestamp}_${random}`;
    }

    /**
     * Get current active application
     * @returns {Object|null} Current application info
     */
    getCurrentActiveApplication() {
        return this.applicationDetector.getCurrentActiveApplication();
    }

    /**
     * Set polling interval
     * @param {number} intervalMs - Polling interval in milliseconds
     */
    setPollingInterval(intervalMs) {
        this.pollingInterval = intervalMs;
        this.applicationDetector.setPollingInterval(intervalMs);
    }

    /**
     * Get monitoring status
     * @returns {Object} Monitoring status information
     */
    getMonitoringStatus() {
        const detectorStatus = this.applicationDetector.getMonitoringStatus();

        return {
            isMonitoring: this.isMonitoring,
            pollingInterval: this.pollingInterval,
            allowedApplications: this.allowedApplications,
            currentViolation: this.currentViolation,
            monitoringStartTime: this.monitoringStartTime,
            detectorStatus,
            currentTime: new Date()
        };
    }

    /**
     * Test the monitoring service
     * @returns {Object} Test results
     */
    async testService() {
        const results = {
            initialization: false,
            applicationDetection: false,
            violationDetection: false,
            eventEmission: false,
            error: null
        };

        try {
            // Test initialization
            results.initialization = this.initialize();

            if (results.initialization) {
                // Test application detection
                const currentApp = this.getCurrentActiveApplication();
                results.applicationDetection = currentApp !== null;

                // Test violation detection with empty allowed list
                if (currentApp) {
                    const wasAllowed = this.isApplicationAllowed(currentApp.applicationName);

                    // Temporarily set empty allowed list to trigger violation
                    const originalAllowed = this.allowedApplications;
                    this.allowedApplications = [];

                    const isViolation = !this.isApplicationAllowed(currentApp.applicationName);
                    results.violationDetection = isViolation;

                    // Restore original allowed list
                    this.allowedApplications = originalAllowed;
                }

                // Test event emission
                let eventReceived = false;
                this.once('test-event', () => {
                    eventReceived = true;
                });

                this.emit('test-event');
                results.eventEmission = eventReceived;
            }

        } catch (error) {
            results.error = error.message;
        }

        return results;
    }

    /**
     * Advanced application matching with multiple strategies
     * @param {string} applicationName - Application name to check
     * @param {string} executablePath - Full executable path (optional)
     * @returns {Object} Matching result with details
     */
    checkApplicationMatch(applicationName, executablePath = null) {
        if (!applicationName) {
            return {
                isAllowed: false,
                matchType: 'no-app-name',
                matchedAgainst: null
            };
        }

        const normalizedAppName = this.normalizeApplicationName(applicationName);

        // Strategy 1: Exact normalized match
        for (const allowedApp of this.allowedApplications) {
            const normalizedAllowed = this.normalizeApplicationName(allowedApp);

            if (normalizedAppName === normalizedAllowed) {
                return {
                    isAllowed: true,
                    matchType: 'exact',
                    matchedAgainst: allowedApp
                };
            }
        }

        // Strategy 2: Substring match (app name contains allowed app or vice versa)
        for (const allowedApp of this.allowedApplications) {
            const normalizedAllowed = this.normalizeApplicationName(allowedApp);

            if (normalizedAppName.includes(normalizedAllowed) ||
                normalizedAllowed.includes(normalizedAppName)) {
                return {
                    isAllowed: true,
                    matchType: 'substring',
                    matchedAgainst: allowedApp
                };
            }
        }

        // Strategy 3: Executable path matching (if available)
        if (executablePath) {
            const executableName = this.extractExecutableName(executablePath);
            const normalizedExecName = this.normalizeApplicationName(executableName);

            for (const allowedApp of this.allowedApplications) {
                const normalizedAllowed = this.normalizeApplicationName(allowedApp);

                if (normalizedExecName === normalizedAllowed ||
                    normalizedExecName.includes(normalizedAllowed) ||
                    normalizedAllowed.includes(normalizedExecName)) {
                    return {
                        isAllowed: true,
                        matchType: 'executable',
                        matchedAgainst: allowedApp
                    };
                }
            }
        }

        // No match found
        return {
            isAllowed: false,
            matchType: 'no-match',
            matchedAgainst: null
        };
    }

    /**
     * Extract executable name from full path
     * @param {string} executablePath - Full executable path
     * @returns {string} Executable name without extension
     */
    extractExecutableName(executablePath) {
        if (!executablePath) {
            return '';
        }

        try {
            // Extract filename from path
            const filename = executablePath.split('\\').pop() || executablePath;
            // Remove .exe extension
            return filename.replace(/\.exe$/i, '');
        } catch (error) {
            console.error('Failed to extract executable name:', error);
            return '';
        }
    }

    /**
     * Cleanup resources
     */
    cleanup() {
        this.stopMonitoring();
        this.applicationDetector.cleanup();
        this.removeAllListeners();
    }
}

module.exports = WindowsMonitorService;