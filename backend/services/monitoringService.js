/**
 * Basic Monitoring Service Integration
 * Demonstrates how to use the Windows API integration for exam monitoring
 */

const ApplicationDetector = require('./applicationDetector');

class MonitoringService {
    constructor() {
        this.detector = new ApplicationDetector();
        this.isMonitoring = false;
        this.currentExam = null;
        this.currentStudent = null;
        this.allowedApps = [];
        this.violations = [];

        // Event callbacks
        this.onViolationDetected = null;
        this.onMonitoringError = null;
    }

    /**
     * Initialize the monitoring service
     * @returns {boolean} True if initialization successful
     */
    initialize() {
        try {
            const initialized = this.detector.initialize();

            if (initialized) {
                // Set up event handlers
                this.detector.setApplicationChangeCallback((oldApp, newApp) => {
                    this.handleApplicationChange(oldApp, newApp);
                });

                this.detector.setErrorCallback((error) => {
                    console.error('Application detector error:', error);
                    if (this.onMonitoringError) {
                        this.onMonitoringError(error);
                    }
                });

                console.log('Monitoring service initialized successfully');
            }

            return initialized;
        } catch (error) {
            console.error('Failed to initialize monitoring service:', error);
            return false;
        }
    }

    /**
     * Start monitoring for an exam
     * @param {string} examId - Exam identifier
     * @param {string} studentId - Student identifier
     * @param {string[]} allowedApps - Array of allowed application names
     * @returns {Object} Result object with success status
     */
    startMonitoring(examId, studentId, allowedApps = []) {
        try {
            if (this.isMonitoring) {
                return {
                    success: false,
                    error: 'Monitoring is already active'
                };
            }

            if (!this.detector.initialize()) {
                return {
                    success: false,
                    error: 'Failed to initialize application detector'
                };
            }

            // Set monitoring parameters
            this.currentExam = examId;
            this.currentStudent = studentId;
            this.allowedApps = allowedApps || [];
            this.violations = [];

            // Start application monitoring
            const started = this.detector.startMonitoring();

            if (started) {
                this.isMonitoring = true;
                console.log(`Monitoring started for exam ${examId}, student ${studentId}`);
                console.log(`Allowed applications: ${this.allowedApps.join(', ')}`);

                return {
                    success: true,
                    message: 'Monitoring started successfully',
                    examId: this.currentExam,
                    studentId: this.currentStudent,
                    allowedApps: this.allowedApps
                };
            } else {
                return {
                    success: false,
                    error: 'Failed to start application monitoring'
                };
            }

        } catch (error) {
            console.error('Error starting monitoring:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Stop monitoring
     * @returns {Object} Result object with success status
     */
    stopMonitoring() {
        try {
            if (!this.isMonitoring) {
                return {
                    success: false,
                    error: 'Monitoring is not active'
                };
            }

            this.detector.stopMonitoring();

            const summary = {
                examId: this.currentExam,
                studentId: this.currentStudent,
                totalViolations: this.violations.length,
                violations: [...this.violations]
            };

            // Reset state
            this.isMonitoring = false;
            this.currentExam = null;
            this.currentStudent = null;
            this.allowedApps = [];
            this.violations = [];

            console.log('Monitoring stopped');

            return {
                success: true,
                message: 'Monitoring stopped successfully',
                summary: summary
            };

        } catch (error) {
            console.error('Error stopping monitoring:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Handle application change events
     * @param {Object|null} oldApp - Previous application
     * @param {Object|null} newApp - Current application
     */
    handleApplicationChange(oldApp, newApp) {
        if (!this.isMonitoring || !newApp) {
            return;
        }

        console.log(`Application changed: ${oldApp?.applicationName || 'None'} -> ${newApp.applicationName}`);

        // Check if new application is allowed
        const isAllowed = this.detector.isApplicationAllowed(newApp.applicationName, this.allowedApps);

        if (!isAllowed) {
            // Violation detected
            const violation = {
                violationId: `violation_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                examId: this.currentExam,
                studentId: this.currentStudent,
                applicationName: newApp.applicationName,
                windowTitle: newApp.windowTitle,
                processId: newApp.processId,
                executablePath: newApp.executablePath,
                focusStartTime: new Date().toISOString(),
                focusEndTime: null, // Will be set when app loses focus
                isActive: true
            };

            this.violations.push(violation);

            console.log(`VIOLATION DETECTED: ${newApp.applicationName} is not allowed`);

            // Trigger violation callback
            if (this.onViolationDetected) {
                this.onViolationDetected(violation);
            }
        } else {
            console.log(`Application ${newApp.applicationName} is allowed`);

            // Check if we need to end any active violations
            this.endActiveViolations();
        }
    }

    /**
     * End active violations (when switching to allowed app)
     */
    endActiveViolations() {
        const now = new Date().toISOString();

        this.violations.forEach(violation => {
            if (violation.isActive) {
                violation.focusEndTime = now;
                violation.isActive = false;

                // Calculate duration
                const startTime = new Date(violation.focusStartTime);
                const endTime = new Date(now);
                violation.durationSeconds = Math.floor((endTime - startTime) / 1000);

                console.log(`Violation ended: ${violation.applicationName} (${violation.durationSeconds}s)`);
            }
        });
    }

    /**
     * Get current monitoring status
     * @returns {Object} Monitoring status
     */
    getStatus() {
        return {
            isMonitoring: this.isMonitoring,
            examId: this.currentExam,
            studentId: this.currentStudent,
            allowedApps: [...this.allowedApps],
            totalViolations: this.violations.length,
            activeViolations: this.violations.filter(v => v.isActive).length,
            detectorStatus: this.detector.getMonitoringStatus()
        };
    }

    /**
     * Get current active application
     * @returns {Object|null} Current application info
     */
    getCurrentApplication() {
        return this.detector.getCurrentActiveApplication();
    }

    /**
     * Get all violations for current session
     * @returns {Array} Array of violation objects
     */
    getViolations() {
        return [...this.violations];
    }

    /**
     * Set violation detection callback
     * @param {Function} callback - Callback function (violation) => void
     */
    setViolationCallback(callback) {
        this.onViolationDetected = callback;
    }

    /**
     * Set error callback
     * @param {Function} callback - Callback function (error) => void
     */
    setErrorCallback(callback) {
        this.onMonitoringError = callback;
    }

    /**
     * Test monitoring functionality
     * @returns {Object} Test results
     */
    async testMonitoring() {
        const results = {
            initialization: false,
            currentApp: null,
            testViolation: false,
            error: null
        };

        try {
            // Test initialization
            results.initialization = this.initialize();

            if (results.initialization) {
                // Test current app detection
                results.currentApp = this.getCurrentApplication();

                // Test violation detection with fake allowed apps
                const testResult = this.startMonitoring('test-exam', 'test-student', ['notepad', 'calculator']);
                results.testViolation = testResult.success;

                if (testResult.success) {
                    // Wait a moment then stop
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    this.stopMonitoring();
                }
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
        this.detector.cleanup();
        this.onViolationDetected = null;
        this.onMonitoringError = null;
    }
}

module.exports = MonitoringService;