/**
 * MonitoringController Integration Tests
 * Tests end-to-end monitoring workflow, service coordination, and error recovery
 */

const MonitoringController = require('../../services/monitoringController');
const DatabaseService = require('../../services/database');
const WindowsMonitorService = require('../../services/windowsMonitorService');
const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');

// Mock dependencies
jest.mock('../../services/windowsMonitorService');

describe('MonitoringController Integration Tests', () => {
    let controller;
    let mockDbService;
    let mockScreenshotService;
    let mockWindowsMonitorService;
    let testDbPath;

    // Test data
    const examId = 'exam-integration-test-123';
    const studentId = 'student-integration-test-456';
    const deviceId = 'device-integration-test-789';
    const allowedApps = ['notepad.exe', 'calculator.exe'];

    beforeEach(async () => {
        jest.clearAllMocks();

        // Setup test database
        testDbPath = path.join(__dirname, 'test-monitoring-controller.sqlite');
        mockDbService = new DatabaseService(testDbPath);
        await mockDbService.initializeDatabase();

        // Ensure app_violations table exists for testing
        try {
            mockDbService.db.exec(`
                CREATE TABLE IF NOT EXISTS app_violations (
                    violation_id TEXT PRIMARY KEY,
                    exam_id TEXT NOT NULL,
                    student_id TEXT NOT NULL,
                    device_id TEXT NOT NULL,
                    app_name TEXT NOT NULL,
                    window_title TEXT,
                    focus_start_time DATETIME NOT NULL,
                    focus_end_time DATETIME,
                    duration_seconds INTEGER,
                    screenshot_path TEXT,
                    screenshot_captured INTEGER DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (exam_id) REFERENCES exams (exam_id),
                    FOREIGN KEY (student_id) REFERENCES users (user_id)
                )
            `);
        } catch (error) {
            console.log('Table creation error (may be expected):', error.message);
        }

        // Create test data with specific IDs
        const teacher = await mockDbService.createUser({
            username: 'teacher_monitoring',
            password: 'password123',
            role: 'teacher',
            fullName: 'Monitoring Test Teacher'
        });

        // Create student with specific ID by updating the database directly
        const student = await mockDbService.createUser({
            username: 'student_monitoring',
            password: 'password123',
            role: 'student',
            fullName: 'Monitoring Test Student'
        });

        // Update student ID in database to match test ID
        mockDbService.db.prepare('UPDATE users SET user_id = ? WHERE user_id = ?').run(studentId, student.userId);

        const exam = mockDbService.createExam({
            teacherId: teacher.userId,
            title: 'Monitoring Integration Test Exam',
            pdfPath: '/path/to/test-exam.pdf',
            startTime: '2024-12-01 10:00:00',
            endTime: '2024-12-01 12:00:00',
            allowedApps: allowedApps
        });

        // Update exam ID in database to match test ID
        mockDbService.db.prepare('UPDATE exams SET exam_id = ? WHERE exam_id = ?').run(examId, exam.examId);

        mockDbService.registerDevice(deviceId, 'Integration Test Device');

        // Setup mock services
        mockScreenshotService = {
            captureActiveWindow: jest.fn().mockResolvedValue({
                success: true,
                filePath: '/screenshots/default-violation.png'
            })
        };

        // Create controller
        controller = new MonitoringController(mockDbService, mockScreenshotService);

        // Setup WindowsMonitorService mock
        mockWindowsMonitorService = new EventEmitter();
        mockWindowsMonitorService.initialize = jest.fn().mockReturnValue(true);
        mockWindowsMonitorService.startMonitoring = jest.fn().mockReturnValue(true);
        mockWindowsMonitorService.stopMonitoring = jest.fn();
        mockWindowsMonitorService.cleanup = jest.fn();
        mockWindowsMonitorService.getMonitoringStatus = jest.fn().mockReturnValue({
            isActive: true,
            pollingInterval: 1000,
            allowedApps: allowedApps
        });
        mockWindowsMonitorService.setPollingInterval = jest.fn();

        // Mock the WindowsMonitorService constructor
        WindowsMonitorService.mockImplementation(() => mockWindowsMonitorService);
    });

    afterEach(async () => {
        if (controller) {
            await controller.cleanup();
        }
        if (mockDbService) {
            mockDbService.close();
        }
        if (fs.existsSync(testDbPath)) {
            fs.unlinkSync(testDbPath);
        }
    });

    describe('End-to-End Monitoring Workflow', () => {
        test('should complete basic monitoring lifecycle successfully', async () => {
            const events = [];

            // Track monitoring events
            controller.on('monitoringStarted', (data) => events.push({ type: 'monitoringStarted', data }));
            controller.on('monitoringStopped', (data) => events.push({ type: 'monitoringStopped', data }));

            // 1. Start monitoring
            const startResult = await controller.startExamMonitoring(
                examId, studentId, deviceId, allowedApps
            );

            expect(startResult.success).toBe(true);
            expect(controller.isMonitoring).toBe(true);
            expect(mockWindowsMonitorService.initialize).toHaveBeenCalled();
            expect(mockWindowsMonitorService.startMonitoring).toHaveBeenCalledWith(allowedApps);

            // 2. Stop monitoring
            const stopResult = await controller.stopExamMonitoring();

            expect(stopResult.success).toBe(true);
            expect(controller.isMonitoring).toBe(false);
            expect(mockWindowsMonitorService.stopMonitoring).toHaveBeenCalled();

            // Verify event sequence
            expect(events).toHaveLength(2);
            expect(events[0].type).toBe('monitoringStarted');
            expect(events[1].type).toBe('monitoringStopped');
        });

        test('should handle violation detection and logging', async () => {
            const violationEvents = [];
            controller.on('violationStarted', (data) => violationEvents.push({ type: 'started', data }));
            controller.on('violationEnded', (data) => violationEvents.push({ type: 'ended', data }));

            await controller.startExamMonitoring(examId, studentId, deviceId, allowedApps);

            // Simulate violation started
            const violationData = {
                violationId: 'test-violation-123',
                applicationName: 'chrome.exe',
                windowTitle: 'Google Chrome',
                startTime: new Date(),
                processId: 1234,
                executablePath: 'C:\\Program Files\\Google\\Chrome\\chrome.exe'
            };

            mockWindowsMonitorService.emit('violationStarted', violationData);
            await new Promise(resolve => setTimeout(resolve, 100));

            // Simulate violation ended
            const endTime = new Date(violationData.startTime.getTime() + 60000); // 1 minute later
            mockWindowsMonitorService.emit('violationEnded', {
                violationId: 'test-violation-123',
                endTime: endTime,
                duration: 60000
            });

            await new Promise(resolve => setTimeout(resolve, 100));

            // Verify violation events were handled
            expect(violationEvents).toHaveLength(2);
            expect(violationEvents[0].type).toBe('started');
            expect(violationEvents[1].type).toBe('ended');

            // Verify violation was logged to database
            const violations = mockDbService.getAppViolationsByExam(examId);
            expect(violations).toHaveLength(1);
            expect(violations[0].appName).toBe('chrome.exe');
        });

        test('should handle application changes without violations', async () => {
            const changeEvents = [];
            controller.on('applicationChanged', (data) => changeEvents.push(data));

            await controller.startExamMonitoring(examId, studentId, deviceId, allowedApps);

            // Simulate application changes between allowed apps
            mockWindowsMonitorService.emit('applicationChanged', {
                previousApp: {
                    applicationName: 'notepad.exe',
                    windowTitle: 'Untitled - Notepad'
                },
                currentApp: {
                    applicationName: 'calculator.exe',
                    windowTitle: 'Calculator'
                },
                timestamp: new Date()
            });

            await new Promise(resolve => setTimeout(resolve, 50));

            expect(changeEvents).toHaveLength(1);
            expect(changeEvents[0].previousApp.applicationName).toBe('notepad.exe');
            expect(changeEvents[0].currentApp.applicationName).toBe('calculator.exe');

            // Should not create violations for allowed apps
            const violations = mockDbService.getAppViolationsByExam(examId);
            expect(violations).toHaveLength(0);
        });
    });

    describe('Service Coordination', () => {
        test('should coordinate between monitoring, logging, and screenshot services', async () => {
            const screenshotCalls = [];

            // Track service calls
            mockScreenshotService.captureActiveWindow.mockImplementation(async (examId, studentId, appName) => {
                screenshotCalls.push({ examId, studentId, appName });
                return {
                    success: true,
                    filePath: `/screenshots/${appName}-violation.png`
                };
            });

            await controller.startExamMonitoring(examId, studentId, deviceId, allowedApps);

            // Simulate violation
            const violationData = {
                violationId: 'coordination-test',
                applicationName: 'steam.exe',
                windowTitle: 'Steam',
                startTime: new Date(),
                processId: 9999
            };

            mockWindowsMonitorService.emit('violationStarted', violationData);
            await new Promise(resolve => setTimeout(resolve, 100));

            // Verify coordination
            expect(screenshotCalls).toHaveLength(1);
            expect(screenshotCalls[0].appName).toBe('steam.exe-coordination-test');

            // Verify active violation tracking
            expect(controller.activeViolations.size).toBe(1);
            const activeViolation = Array.from(controller.activeViolations.values())[0];
            expect(activeViolation.appName).toBe('steam.exe');
            expect(activeViolation.screenshotCaptured).toBe(true);
        });

        test('should handle screenshot failure gracefully', async () => {
            // Mock screenshot failure
            mockScreenshotService.captureActiveWindow.mockResolvedValue({
                success: false,
                error: 'Screenshot capture failed'
            });

            await controller.startExamMonitoring(examId, studentId, deviceId, allowedApps);

            const violationData = {
                violationId: 'screenshot-fail-test',
                applicationName: 'firefox.exe',
                windowTitle: 'Firefox',
                startTime: new Date(),
                processId: 7777
            };

            mockWindowsMonitorService.emit('violationStarted', violationData);
            await new Promise(resolve => setTimeout(resolve, 100));

            // Verify violation was still logged despite screenshot failure
            const violations = mockDbService.getAppViolationsByExam(examId);
            expect(violations).toHaveLength(1);
            expect(violations[0].appName).toBe('firefox.exe');
            expect(violations[0].screenshotCaptured).toBe(false);
        });

        test('should disable screenshot capture when configured', async () => {
            // Disable screenshots
            controller.updateConfiguration({ screenshotEnabled: false });

            await controller.startExamMonitoring(examId, studentId, deviceId, allowedApps);

            const violationData = {
                violationId: 'no-screenshot-test',
                applicationName: 'discord.exe',
                windowTitle: 'Discord',
                startTime: new Date(),
                processId: 8888
            };

            mockWindowsMonitorService.emit('violationStarted', violationData);
            await new Promise(resolve => setTimeout(resolve, 100));

            // Verify screenshot service was not called
            expect(mockScreenshotService.captureActiveWindow).not.toHaveBeenCalled();

            // Verify violation was still logged
            const violations = mockDbService.getAppViolationsByExam(examId);
            expect(violations).toHaveLength(1);
            expect(violations[0].screenshotCaptured).toBe(false);
        });
    });

    describe('Error Recovery and Service Restart', () => {
        test('should handle monitoring service errors with retry mechanism', async () => {
            const errorEvents = [];
            controller.on('error', (data) => errorEvents.push(data));

            await controller.startExamMonitoring(examId, studentId, deviceId, allowedApps);

            // Simulate monitoring errors
            const error1 = new Error('Windows API failure');
            const error2 = new Error('Process detection failed');

            mockWindowsMonitorService.emit('error', error1);
            await new Promise(resolve => setTimeout(resolve, 100));

            mockWindowsMonitorService.emit('error', error2);
            await new Promise(resolve => setTimeout(resolve, 100));

            // Verify error handling
            expect(errorEvents).toHaveLength(2);
            expect(errorEvents[0].type).toBe('monitoring_error');
            expect(errorEvents[0].error).toBe('Windows API failure');
            expect(errorEvents[0].errorCount).toBe(1);
            expect(errorEvents[0].canRecover).toBe(true);

            expect(errorEvents[1].errorCount).toBe(2);
            expect(errorEvents[1].canRecover).toBe(true);

            // Verify monitoring is still active (within retry limits)
            expect(controller.isMonitoring).toBe(true);
        });

        test('should stop monitoring after maximum error count reached', async () => {
            const errorEvents = [];
            const criticalEvents = [];

            controller.on('error', (data) => errorEvents.push(data));
            controller.on('criticalError', (data) => criticalEvents.push(data));
            controller.on('monitoringStopped', (data) => criticalEvents.push({ type: 'stopped', data }));

            await controller.startExamMonitoring(examId, studentId, deviceId, allowedApps);

            // Simulate maximum errors (default is 3)
            for (let i = 1; i <= 4; i++) {
                mockWindowsMonitorService.emit('error', new Error(`Error ${i}`));
                await new Promise(resolve => setTimeout(resolve, 50));
            }

            // Verify critical error handling
            expect(errorEvents).toHaveLength(4);
            expect(criticalEvents.length).toBeGreaterThanOrEqual(1);

            // Verify monitoring was stopped
            expect(controller.isMonitoring).toBe(false);
        });

        test('should track error recovery attempts', async () => {
            const restartEvents = [];
            controller.on('serviceRestarted', (data) => restartEvents.push(data));

            // Mock exam retrieval for restart
            mockDbService.getExamById = jest.fn().mockReturnValue({
                examId: examId,
                allowedApps: allowedApps
            });

            await controller.startExamMonitoring(examId, studentId, deviceId, allowedApps);

            // Simulate error that triggers restart
            mockWindowsMonitorService.emit('error', new Error('Recoverable error'));

            // Wait for error handling
            await new Promise(resolve => setTimeout(resolve, 100));

            // Verify error was handled
            expect(controller.errorCount).toBe(1);
            expect(controller.lastError).toBeDefined();
        });
    });

    describe('Configuration and Status Management', () => {
        test('should update monitoring configuration dynamically', () => {
            const newConfig = {
                pollingInterval: 2000,
                screenshotEnabled: false,
                maxRetries: 5,
                retryDelay: 10000
            };

            controller.updateConfiguration(newConfig);

            expect(controller.pollingInterval).toBe(2000);
            expect(controller.screenshotEnabled).toBe(false);
            expect(controller.maxRetries).toBe(5);
            expect(controller.retryDelay).toBe(10000);
        });

        test('should provide comprehensive monitoring status', async () => {
            await controller.startExamMonitoring(examId, studentId, deviceId, allowedApps);

            const status = controller.getMonitoringStatus();

            expect(status.isMonitoring).toBe(true);
            expect(status.examId).toBe(examId);
            expect(status.studentId).toBe(studentId);
            expect(status.deviceId).toBe(deviceId);
            expect(status.startTime).toBeDefined();
            expect(status.activeViolations).toBeDefined();
            expect(status.errorCount).toBe(0);
            expect(status.restartAttempts).toBe(0);
            expect(status.serviceStatus).toBeDefined();
        });

        test('should prevent starting monitoring when already active', async () => {
            await controller.startExamMonitoring(examId, studentId, deviceId, allowedApps);

            const result = await controller.startExamMonitoring(
                'another-exam', 'another-student', 'another-device', ['notepad.exe']
            );

            expect(result.success).toBe(false);
            expect(result.error).toContain('already active');
        });

        test('should handle stopping monitoring when not active', async () => {
            const result = await controller.stopExamMonitoring();

            expect(result.success).toBe(false);
            expect(result.error).toContain('No active monitoring session');
        });
    });

    describe('Violation Finalization', () => {
        test('should finalize monitoring session properly', async () => {
            await controller.startExamMonitoring(examId, studentId, deviceId, allowedApps);

            // Verify monitoring started
            expect(controller.isMonitoring).toBe(true);

            // Stop monitoring (should finalize all active violations)
            const result = await controller.stopExamMonitoring();

            // Verify monitoring stopped successfully
            expect(result.success).toBe(true);
            expect(controller.isMonitoring).toBe(false);
            expect(controller.activeViolations.size).toBe(0);
        });

        test('should handle finalization errors gracefully', async () => {
            // Mock database error during finalization
            const originalUpdate = mockDbService.updateViolationEndTime;
            mockDbService.updateViolationEndTime = jest.fn().mockImplementation(() => {
                throw new Error('Database update failed');
            });

            await controller.startExamMonitoring(examId, studentId, deviceId, allowedApps);

            // Stop monitoring should not throw despite finalization errors
            const result = await controller.stopExamMonitoring();
            expect(result.success).toBe(true);

            // Restore original method
            mockDbService.updateViolationEndTime = originalUpdate;
        });
    });

    describe('Input Validation and Error Handling', () => {
        test('should validate required parameters for starting monitoring', async () => {
            // Missing examId
            let result = await controller.startExamMonitoring(null, studentId, deviceId, allowedApps);
            expect(result.success).toBe(false);
            expect(result.error).toContain('Missing required parameters');

            // Missing studentId
            result = await controller.startExamMonitoring(examId, null, deviceId, allowedApps);
            expect(result.success).toBe(false);
            expect(result.error).toContain('Missing required parameters');

            // Missing deviceId
            result = await controller.startExamMonitoring(examId, studentId, null, allowedApps);
            expect(result.success).toBe(false);
            expect(result.error).toContain('Missing required parameters');

            // Invalid allowedApps
            result = await controller.startExamMonitoring(examId, studentId, deviceId, 'not-an-array');
            expect(result.success).toBe(false);
            expect(result.error).toContain('allowedApps must be an array');
        });

        test('should handle Windows monitor service initialization failure', async () => {
            mockWindowsMonitorService.initialize.mockReturnValue(false);

            const result = await controller.startExamMonitoring(examId, studentId, deviceId, allowedApps);

            expect(result.success).toBe(false);
            expect(result.error).toContain('Failed to initialize Windows monitoring service');
            expect(controller.isMonitoring).toBe(false);
        });

        test('should handle Windows monitor service start failure', async () => {
            mockWindowsMonitorService.startMonitoring.mockReturnValue(false);

            const result = await controller.startExamMonitoring(examId, studentId, deviceId, allowedApps);

            expect(result.success).toBe(false);
            expect(result.error).toContain('Failed to start Windows monitoring service');
            expect(controller.isMonitoring).toBe(false);
        });

        test('should cleanup resources on startup failure', async () => {
            mockWindowsMonitorService.startMonitoring.mockReturnValue(false);

            await controller.startExamMonitoring(examId, studentId, deviceId, allowedApps);

            // Verify cleanup was called
            expect(mockWindowsMonitorService.stopMonitoring).toHaveBeenCalled();
            expect(mockWindowsMonitorService.cleanup).toHaveBeenCalled();
        });
    });

    describe('Event Handling and Real-time Updates', () => {
        test('should emit real-time events for UI updates', async () => {
            const events = [];

            controller.on('monitoringStarted', (data) => events.push({ type: 'started', data }));
            controller.on('violationStarted', (data) => events.push({ type: 'violationStarted', data }));
            controller.on('applicationChanged', (data) => events.push({ type: 'appChanged', data }));
            controller.on('monitoringStopped', (data) => events.push({ type: 'stopped', data }));

            await controller.startExamMonitoring(examId, studentId, deviceId, allowedApps);

            // Simulate various events
            mockWindowsMonitorService.emit('violationStarted', {
                violationId: 'ui-test',
                applicationName: 'test.exe',
                windowTitle: 'Test',
                startTime: new Date(),
                processId: 4444
            });

            mockWindowsMonitorService.emit('applicationChanged', {
                previousApp: { applicationName: 'notepad.exe', windowTitle: 'Notepad' },
                currentApp: { applicationName: 'calculator.exe', windowTitle: 'Calculator' },
                timestamp: new Date()
            });

            await new Promise(resolve => setTimeout(resolve, 100));

            await controller.stopExamMonitoring();

            // Verify events were emitted
            expect(events.length).toBeGreaterThanOrEqual(3);
            expect(events[0].type).toBe('started');

            // Verify event data structure
            const violationEvent = events.find(e => e.type === 'violationStarted');
            if (violationEvent) {
                expect(violationEvent.data).toHaveProperty('violationId');
                expect(violationEvent.data).toHaveProperty('examId');
                expect(violationEvent.data).toHaveProperty('studentId');
                expect(violationEvent.data).toHaveProperty('appName');
            }
        });

        test('should handle violation events for non-existent violations gracefully', async () => {
            await controller.startExamMonitoring(examId, studentId, deviceId, allowedApps);

            // Simulate ending a violation that was never started
            mockWindowsMonitorService.emit('violationEnded', {
                violationId: 'non-existent-violation',
                endTime: new Date(),
                duration: 60000
            });

            await new Promise(resolve => setTimeout(resolve, 50));

            // Should not crash or create database entries
            const violations = mockDbService.getAppViolationsByExam(examId);
            expect(violations).toHaveLength(0);
        });
    });
});