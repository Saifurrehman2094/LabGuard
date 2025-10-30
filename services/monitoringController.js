/**
 * MonitoringController - Orchestrates exam monitoring workflow
 * Coordinates between WindowsMonitorService, ScreenshotService, and DatabaseService
 */

const EventEmitter = require('events');
const WindowsMonitorService = require('./windowsMonitorService');
const ScreenshotService = require('./screenshotService');

class MonitoringController extends EventEmitter {
    constructor(dbService, screenshotService = null) {
        super();

        this.dbService = dbService;
        this.screenshotService = screenshotService || new ScreenshotService();
        this.windowsMonitorService = null;

        // Monitoring state
        this.isMonitoring = false;
        this.currentExamId = null;
        this.currentStudentId = null;
        this.currentDeviceId = null;
        this.monitoringStartTime = null;
        this.activeViolations = new Map(); // violationId -> violation data

        // Configuration
        this.pollingInterval = 1000; // 1 second
        this.screenshotEnabled = true;
        this.maxRetries = 3;
        this.retryDelay = 5000; // 5 seconds

        // Error handling
        this.errorCount = 0;
        this.lastError = null;
        this.restartAttempts = 0;
        this.maxRestartAttempts = 3;
    }

    /**
     * Start exam monitoring with comprehensive error handling
     * @param {string} examId - Exam identifier
     * @param {string} studentId - Student identifier
     * @param {string} deviceId - Device identifier
     * @param {string[]} allowedApps - Array of allowed application names
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async startExamMonitoring(examId, studentId, deviceId, allowedApps) {
        try {
            // Validate inputs
            if (!examId || !studentId || !deviceId) {
                throw new Error('Missing required parameters: examId, studentId, or deviceId');
            }

            if (!Array.isArray(allowedApps)) {
                throw new Error('allowedApps must be an array');
            }

            // Check if already monitoring
            if (this.isMonitoring) {
                return {
                    success: false,
                    error: 'Monitoring is already active. Stop current monitoring before starting new session.'
                };
            }

            // Initialize monitoring state
            this.currentExamId = examId;
            this.currentStudentId = studentId;
            this.currentDeviceId = deviceId;
            this.monitoringStartTime = new Date();
            this.activeViolations.clear();
            this.errorCount = 0;
            this.restartAttempts = 0;

            // Initialize Windows Monitor Service
            this.windowsMonitorService = new WindowsMonitorService({
                pollingInterval: this.pollingInterval
            });

            // Set up event handlers
            this.setupMonitoringEventHandlers();

            // Initialize the monitor service
            const initSuccess = this.windowsMonitorService.initialize();
            if (!initSuccess) {
                throw new Error('Failed to initialize Windows monitoring service');
            }

            // Start monitoring with allowed applications
            const startSuccess = this.windowsMonitorService.startMonitoring(allowedApps);
            if (!startSuccess) {
                throw new Error('Failed to start Windows monitoring service');
            }

            this.isMonitoring = true;

            // Log monitoring start event
            await this.logMonitoringEvent('monitoring_started', {
                allowedApps,
                pollingInterval: this.pollingInterval,
                screenshotEnabled: this.screenshotEnabled
            });

            this.emit('monitoringStarted', {
                examId,
                studentId,
                deviceId,
                allowedApps,
                startTime: this.monitoringStartTime
            });

            console.log(`Exam monitoring started for exam ${examId}, student ${studentId}`);

            return { success: true };

        } catch (error) {
            console.error('Failed to start exam monitoring:', error);

            // Cleanup on failure
            await this.cleanup();

            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Stop exam monitoring and finalize all violations
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async stopExamMonitoring() {
        try {
            if (!this.isMonitoring) {
                return {
                    success: false,
                    error: 'No active monitoring session to stop'
                };
            }

            const stopTime = new Date();
            const monitoringDuration = this.monitoringStartTime ?
                stopTime.getTime() - this.monitoringStartTime.getTime() : 0;

            // Finalize all active violations
            await this.finalizeActiveViolations();

            // Stop Windows monitoring service
            if (this.windowsMonitorService) {
                this.windowsMonitorService.stopMonitoring();
                this.windowsMonitorService.cleanup();
                this.windowsMonitorService = null;
            }

            // Log monitoring stop event
            await this.logMonitoringEvent('monitoring_stopped', {
                duration: monitoringDuration,
                totalViolations: this.activeViolations.size
            });

            // Reset state
            const examId = this.currentExamId;
            const studentId = this.currentStudentId;

            this.isMonitoring = false;
            this.currentExamId = null;
            this.currentStudentId = null;
            this.currentDeviceId = null;
            this.monitoringStartTime = null;
            this.activeViolations.clear();

            this.emit('monitoringStopped', {
                examId,
                studentId,
                stopTime,
                duration: monitoringDuration
            });

            console.log(`Exam monitoring stopped for exam ${examId}, student ${studentId}`);

            return { success: true };

        } catch (error) {
            console.error('Error stopping exam monitoring:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Setup event handlers for Windows Monitor Service
     */
    setupMonitoringEventHandlers() {
        if (!this.windowsMonitorService) {
            return;
        }

        // Handle violation started
        this.windowsMonitorService.on('violationStarted', async (violationData) => {
            await this.handleViolationStarted(violationData);
        });

        // Handle violation ended
        this.windowsMonitorService.on('violationEnded', async (violationData) => {
            await this.handleViolationEnded(violationData);
        });

        // Handle application changes (for logging)
        this.windowsMonitorService.on('applicationChanged', async (changeData) => {
            await this.handleApplicationChange(changeData);
        });

        // Handle monitoring errors
        this.windowsMonitorService.on('error', async (error) => {
            await this.handleMonitoringError(error);
        });

        // Handle monitoring status changes
        this.windowsMonitorService.on('monitoringStarted', (data) => {
            this.emit('serviceStarted', data);
        });

        this.windowsMonitorService.on('monitoringStopped', (data) => {
            this.emit('serviceStopped', data);
        });
    }

    /**
     * Handle violation started event
     * @param {Object} violationData - Violation data from monitor service
     */
    async handleViolationStarted(violationData) {
        try {
            const {
                violationId,
                applicationName,
                windowTitle,
                startTime,
                processId,
                executablePath
            } = violationData;

            // Capture screenshot if enabled
            let screenshotPath = null;
            let screenshotCaptured = false;

            if (this.screenshotEnabled) {
                const screenshotResult = await this.captureViolationScreenshot(
                    applicationName,
                    violationId
                );

                if (screenshotResult.success) {
                    screenshotPath = screenshotResult.filePath;
                    screenshotCaptured = true;
                } else {
                    console.warn(`Screenshot capture failed for violation ${violationId}:`, screenshotResult.error);
                }
            }

            // Log violation to database
            const dbViolation = await this.dbService.logAppViolation({
                examId: this.currentExamId,
                studentId: this.currentStudentId,
                deviceId: this.currentDeviceId,
                appName: applicationName,
                windowTitle: windowTitle,
                focusStartTime: startTime.toISOString(),
                screenshotPath: screenshotPath
            });

            // Store in active violations map
            this.activeViolations.set(violationId, {
                ...dbViolation,
                monitorViolationId: violationId,
                processId,
                executablePath,
                screenshotCaptured
            });

            // Emit violation event for real-time updates
            this.emit('violationStarted', {
                violationId: dbViolation.violationId,
                monitorViolationId: violationId,
                examId: this.currentExamId,
                studentId: this.currentStudentId,
                appName: applicationName,
                windowTitle: windowTitle,
                startTime: startTime,
                screenshotPath: screenshotPath,
                screenshotCaptured
            });

            console.log(`Violation started: ${applicationName} (${violationId})`);

        } catch (error) {
            console.error('Error handling violation started:', error);
            this.emit('error', {
                type: 'violation_handling_error',
                error: error.message,
                violationData
            });
        }
    }

    /**
     * Handle violation ended event
     * @param {Object} violationData - Violation data from monitor service
     */
    async handleViolationEnded(violationData) {
        try {
            const { violationId, endTime, duration } = violationData;

            // Get violation from active violations
            const activeViolation = this.activeViolations.get(violationId);
            if (!activeViolation) {
                console.warn(`Violation ${violationId} not found in active violations`);
                return;
            }

            // Update violation end time in database
            await this.dbService.updateViolationEndTime(
                activeViolation.violationId,
                endTime.toISOString()
            );

            // Remove from active violations
            this.activeViolations.delete(violationId);

            // Emit violation ended event
            this.emit('violationEnded', {
                violationId: activeViolation.violationId,
                monitorViolationId: violationId,
                examId: this.currentExamId,
                studentId: this.currentStudentId,
                appName: activeViolation.appName,
                endTime: endTime,
                duration: duration
            });

            console.log(`Violation ended: ${activeViolation.appName} (${violationId}) - Duration: ${duration}ms`);

        } catch (error) {
            console.error('Error handling violation ended:', error);
            this.emit('error', {
                type: 'violation_handling_error',
                error: error.message,
                violationData
            });
        }
    }

    /**
     * Handle application change events (for general logging)
     * @param {Object} changeData - Application change data
     */
    async handleApplicationChange(changeData) {
        try {
            const { previousApp, currentApp, timestamp } = changeData;

            // Log application change event (non-violation)
            await this.logMonitoringEvent('application_changed', {
                previousApp: previousApp ? {
                    name: previousApp.applicationName,
                    title: previousApp.windowTitle
                } : null,
                currentApp: currentApp ? {
                    name: currentApp.applicationName,
                    title: currentApp.windowTitle
                } : null,
                timestamp: timestamp.toISOString()
            });

            // Emit for real-time updates
            this.emit('applicationChanged', {
                examId: this.currentExamId,
                studentId: this.currentStudentId,
                previousApp,
                currentApp,
                timestamp
            });

        } catch (error) {
            console.error('Error handling application change:', error);
        }
    }

    /**
     * Handle monitoring errors with recovery mechanisms
     * @param {Error} error - Error from monitoring service
     */
    async handleMonitoringError(error) {
        try {
            this.errorCount++;
            this.lastError = error;

            console.error(`Monitoring error (${this.errorCount}):`, error.message);

            // Log error event
            await this.logMonitoringEvent('monitoring_error', {
                error: error.message,
                errorCount: this.errorCount,
                timestamp: new Date().toISOString()
            });

            // Emit error event
            this.emit('error', {
                type: 'monitoring_error',
                error: error.message,
                errorCount: this.errorCount,
                canRecover: this.errorCount < this.maxRetries
            });

            // Attempt recovery if within retry limits
            if (this.errorCount < this.maxRetries && this.isMonitoring) {
                console.log(`Attempting monitoring recovery (attempt ${this.errorCount}/${this.maxRetries})`);

                setTimeout(async () => {
                    await this.attemptServiceRestart();
                }, this.retryDelay);
            } else if (this.errorCount >= this.maxRetries) {
                console.error('Maximum error count reached, stopping monitoring');

                this.emit('criticalError', {
                    error: 'Maximum error count reached',
                    lastError: error.message,
                    errorCount: this.errorCount
                });

                // Force stop monitoring
                await this.stopExamMonitoring();
            }

        } catch (handlingError) {
            console.error('Error in error handling:', handlingError);
        }
    }

    /**
     * Attempt to restart the monitoring service
     */
    async attemptServiceRestart() {
        try {
            if (!this.isMonitoring) {
                return;
            }

            this.restartAttempts++;
            console.log(`Restarting monitoring service (attempt ${this.restartAttempts}/${this.maxRestartAttempts})`);

            // Stop current service
            if (this.windowsMonitorService) {
                this.windowsMonitorService.stopMonitoring();
                this.windowsMonitorService.cleanup();
            }

            // Wait before restart
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Create new service instance
            this.windowsMonitorService = new WindowsMonitorService({
                pollingInterval: this.pollingInterval
            });

            // Setup event handlers
            this.setupMonitoringEventHandlers();

            // Initialize and start
            const initSuccess = this.windowsMonitorService.initialize();
            if (!initSuccess) {
                throw new Error('Failed to reinitialize monitoring service');
            }

            // Get current exam to retrieve allowed apps
            const exam = this.dbService.getExamById(this.currentExamId);
            if (!exam) {
                throw new Error('Exam not found for restart');
            }

            const startSuccess = this.windowsMonitorService.startMonitoring(exam.allowedApps);
            if (!startSuccess) {
                throw new Error('Failed to restart monitoring service');
            }

            // Reset error count on successful restart
            this.errorCount = 0;
            this.lastError = null;

            console.log('Monitoring service restarted successfully');

            this.emit('serviceRestarted', {
                examId: this.currentExamId,
                studentId: this.currentStudentId,
                restartAttempt: this.restartAttempts
            });

        } catch (error) {
            console.error('Service restart failed:', error);

            if (this.restartAttempts >= this.maxRestartAttempts) {
                console.error('Maximum restart attempts reached, stopping monitoring');

                this.emit('criticalError', {
                    error: 'Service restart failed after maximum attempts',
                    lastError: error.message,
                    restartAttempts: this.restartAttempts
                });

                await this.stopExamMonitoring();
            } else {
                // Try again after delay
                setTimeout(async () => {
                    await this.attemptServiceRestart();
                }, this.retryDelay * 2); // Longer delay for restart attempts
            }
        }
    }

    /**
     * Capture screenshot for violation evidence
     * @param {string} appName - Application name
     * @param {string} violationId - Violation identifier
     * @returns {Promise<{success: boolean, filePath?: string, error?: string}>}
     */
    async captureViolationScreenshot(appName, violationId) {
        try {
            const result = await this.screenshotService.captureActiveWindow(
                this.currentExamId,
                this.currentStudentId,
                `${appName}-${violationId}`
            );

            return result;

        } catch (error) {
            console.error('Screenshot capture error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Log monitoring events to database
     * @param {string} eventType - Type of monitoring event
     * @param {Object} eventData - Additional event data
     */
    async logMonitoringEvent(eventType, eventData = {}) {
        try {
            if (!this.dbService) {
                return;
            }

            await this.dbService.logEvent({
                examId: this.currentExamId,
                studentId: this.currentStudentId,
                deviceId: this.currentDeviceId,
                eventType: eventType,
                windowTitle: eventData.windowTitle || null,
                processName: eventData.processName || null,
                isViolation: eventType.includes('violation') ? 1 : 0
            });

        } catch (error) {
            console.error('Error logging monitoring event:', error);
        }
    }

    /**
     * Finalize all active violations when monitoring stops
     */
    async finalizeActiveViolations() {
        try {
            const endTime = new Date();

            for (const [violationId, violation] of this.activeViolations) {
                try {
                    await this.dbService.updateViolationEndTime(
                        violation.violationId,
                        endTime.toISOString()
                    );

                    console.log(`Finalized violation: ${violation.appName} (${violationId})`);
                } catch (error) {
                    console.error(`Error finalizing violation ${violationId}:`, error);
                }
            }

            this.activeViolations.clear();

        } catch (error) {
            console.error('Error finalizing active violations:', error);
        }
    }

    /**
     * Get current monitoring status
     * @returns {Object} Current monitoring status
     */
    getMonitoringStatus() {
        return {
            isMonitoring: this.isMonitoring,
            examId: this.currentExamId,
            studentId: this.currentStudentId,
            deviceId: this.currentDeviceId,
            startTime: this.monitoringStartTime,
            activeViolations: Array.from(this.activeViolations.values()),
            errorCount: this.errorCount,
            lastError: this.lastError,
            restartAttempts: this.restartAttempts,
            serviceStatus: this.windowsMonitorService ?
                this.windowsMonitorService.getMonitoringStatus() : null
        };
    }

    /**
     * Update monitoring configuration
     * @param {Object} config - Configuration updates
     */
    updateConfiguration(config) {
        if (config.pollingInterval && config.pollingInterval > 0) {
            this.pollingInterval = config.pollingInterval;
            if (this.windowsMonitorService) {
                this.windowsMonitorService.setPollingInterval(config.pollingInterval);
            }
        }

        if (typeof config.screenshotEnabled === 'boolean') {
            this.screenshotEnabled = config.screenshotEnabled;
        }

        if (config.maxRetries && config.maxRetries > 0) {
            this.maxRetries = config.maxRetries;
        }

        if (config.retryDelay && config.retryDelay > 0) {
            this.retryDelay = config.retryDelay;
        }

        console.log('Monitoring configuration updated:', config);
    }

    /**
     * Cleanup resources and stop monitoring
     */
    async cleanup() {
        try {
            if (this.windowsMonitorService) {
                this.windowsMonitorService.stopMonitoring();
                this.windowsMonitorService.cleanup();
                this.windowsMonitorService = null;
            }

            this.isMonitoring = false;
            this.activeViolations.clear();
            this.removeAllListeners();

        } catch (error) {
            console.error('Error during cleanup:', error);
        }
    }
}

module.exports = MonitoringController;