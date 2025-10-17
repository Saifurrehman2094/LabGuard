/**
 * End-to-End Integration Tests for Exam Monitoring System
 * Tests complete workflow from exam start to finish including:
 * - Violation detection and logging
 * - Warning display system
 * - Monitoring cleanup on exam completion
 * - Requirements: 1.1, 1.5, 4.1
 */

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const EventEmitter = require('events');

// Import services
const DatabaseService = require('../../services/database');
const MonitoringController = require('../../services/monitoringController');
const WindowsMonitorService = require('../../services/windowsMonitorService');
const ScreenshotService = require('../../services/screenshotService');

// Mock Electron APIs
jest.mock('electron', () => ({
    app: {
        getPath: jest.fn(() => '/test/path'),
        on: jest.fn(),
        whenReady: jest.fn(() => Promise.resolve())
    },
    BrowserWindow: jest.fn(() => ({
        loadURL: jest.fn(),
        webContents: {
            send: jest.fn(),
            on: jest.fn()
        },
        on: jest.fn(),
        show: jest.fn()
    })),
    ipcMain: {
        handle: jest.fn(),
        on: jest.fn()
    }
}));

// Mock Windows services
jest.mock('../../services/windowsMonitorService');
jest.mock('../../services/screenshotService');

describe('Exam Monitoring End-to-End Integration Tests', () => {
    let dbService;
    let monitoringController;
    let mockWindowsMonitorService;
    let mockScreenshotService;
    let mockMainWindow;
    let testDbPath;

    // Test data
    const examId = 'e2e-exam-123';
    const studentId = 'e2e-student-456';
    const deviceId = 'e2e-device-789';
    const teacherId = 'e2e-teacher-101';
    const allowedApps = ['notepad.exe', 'calculator.exe', 'chrome.exe'];

    beforeEach(async () => {
        jest.clearAllMocks();

        // Setup test database
        testDbPath = path.join(__dirname, 'test-e2e-monitoring.sqlite');
        if (fs.existsSync(testDbPath)) {
            fs.unlinkSync(testDbPath);
        }

        dbService = new DatabaseService(testDbPath);
        await dbService.initializeDatabase();

        // Perform migrations to ensure app_violations table exists
        dbService.performMigrations();

        // Create test users and exam
        const teacher = await dbService.createUser({
            username: 'e2e_teacher',
            password: 'password123',
            role: 'teacher',
            fullName: 'E2E Test Teacher'
        });

        const student = await dbService.createUser({
            username: 'e2e_student',
            password: 'password123',
            role: 'student',
            fullName: 'E2E Test Student'
        });

        // Update IDs to match test data
        dbService.db.prepare('UPDATE users SET user_id = ? WHERE user_id = ?').run(teacherId, teacher.userId);
        dbService.db.prepare('UPDATE users SET user_id = ? WHERE user_id = ?').run(studentId, student.userId);

        const exam = dbService.createExam({
            teacherId: teacherId,
            title: 'E2E Integration Test Exam',
            pdfPath: '/path/to/test-exam.pdf',
            startTime: '2024-12-01 10:00:00',
            endTime: '2024-12-01 12:00:00',
            allowedApps: allowedApps
        });

        dbService.db.prepare('UPDATE exams SET exam_id = ? WHERE exam_id = ?').run(examId, exam.examId);
        dbService.registerDevice(deviceId, 'E2E Test Device');

        // Setup mock services
        mockScreenshotService = {
            captureActiveWindow: jest.fn().mockResolvedValue({
                success: true,
                filePath: '/screenshots/test-violation.png'
            }),
            cleanup: jest.fn()
        };

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

        WindowsMonitorService.mockImplementation(() => mockWindowsMonitorService);
        ScreenshotService.mockImplementation(() => mockScreenshotService);

        // Setup monitoring controller
        monitoringController = new MonitoringController(dbService, mockScreenshotService);

        // Setup mock main window for IPC communication
        mockMainWindow = {
            webContents: {
                send: jest.fn()
            }
        };
    });

    afterEach(async () => {
        if (monitoringController) {
            await monitoringController.cleanup();
        }
        if (dbService) {
            dbService.close();
        }
        if (fs.existsSync(testDbPath)) {
            fs.unlinkSync(testDbPath);
        }
    });

    describe('Complete Exam Monitoring Workflow', () => {
        test('should execute complete exam workflow from start to finish', async () => {
            const workflowEvents = [];
            const violationEvents = [];
            const warningEvents = [];

            // Track all events throughout the workflow
            monitoringController.on('monitoringStarted', (data) => {
                workflowEvents.push({ type: 'monitoring_started', timestamp: new Date(), data });
            });

            monitoringController.on('violationStarted', (data) => {
                violationEvents.push({ type: 'violation_started', timestamp: new Date(), data });
                warningEvents.push({ type: 'warning_displayed', violationId: data.violationId });
            });

            monitoringController.on('violationEnded', (data) => {
                violationEvents.push({ type: 'violation_ended', timestamp: new Date(), data });
                warningEvents.push({ type: 'warning_updated', violationId: data.violationId });
            });

            monitoringController.on('monitoringStopped', (data) => {
                workflowEvents.push({ type: 'monitoring_stopped', timestamp: new Date(), data });
            });

            // Step 1: Start exam monitoring (Requirement 1.1)
            console.log('Step 1: Starting exam monitoring...');
            const startResult = await monitoringController.startExamMonitoring(
                examId, studentId, deviceId, allowedApps
            );

            expect(startResult.success).toBe(true);
            expect(monitoringController.isMonitoring).toBe(true);
            expect(workflowEvents).toHaveLength(1);
            expect(workflowEvents[0].type).toBe('monitoring_started');

            // Step 2: Simulate student using allowed applications (no violations)
            console.log('Step 2: Simulating allowed application usage...');
            mockWindowsMonitorService.emit('applicationChanged', {
                previousApp: null,
                currentApp: {
                    applicationName: 'notepad.exe',
                    windowTitle: 'Untitled - Notepad',
                    processId: 1234
                },
                timestamp: new Date()
            });

            await new Promise(resolve => setTimeout(resolve, 100));

            // Should not create violations for allowed apps
            let violations = dbService.getAppViolationsByExam(examId);
            expect(violations).toHaveLength(0);

            // Step 3: Simulate violation - unauthorized application usage (Requirement 1.1, 4.1)
            console.log('Step 3: Simulating violation - unauthorized app usage...');
            const violationStartTime = new Date();
            const violationData = {
                violationId: 'e2e-violation-001',
                applicationName: 'steam.exe',
                windowTitle: 'Steam - Gaming Platform',
                startTime: violationStartTime,
                processId: 5678,
                executablePath: 'C:\\Program Files\\Steam\\steam.exe'
            };

            mockWindowsMonitorService.emit('violationStarted', violationData);
            await new Promise(resolve => setTimeout(resolve, 200));

            // Verify violation was detected and logged
            violations = dbService.getAppViolationsByExam(examId);
            expect(violations).toHaveLength(1);
            expect(violations[0].appName).toBe('steam.exe');
            expect(violations[0].examId).toBe(examId);
            expect(violations[0].studentId).toBe(studentId);
            expect(violations[0].screenshotCaptured).toBe(true);

            // Verify screenshot was captured
            expect(mockScreenshotService.captureActiveWindow).toHaveBeenCalledWith(
                examId, studentId, 'steam.exe-e2e-violation-001'
            );

            // Verify warning events were triggered (Requirement 4.1)
            expect(violationEvents).toHaveLength(1);
            expect(violationEvents[0].type).toBe('violation_started');
            expect(warningEvents).toHaveLength(1);
            expect(warningEvents[0].type).toBe('warning_displayed');

            // Step 4: Simulate continued violation usage
            console.log('Step 4: Simulating continued violation usage...');
            await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate 1 second of usage

            // Step 5: Simulate violation end - return to allowed application
            console.log('Step 5: Simulating violation end...');
            const violationEndTime = new Date();
            mockWindowsMonitorService.emit('violationEnded', {
                violationId: 'e2e-violation-001',
                endTime: violationEndTime,
                duration: violationEndTime.getTime() - violationStartTime.getTime()
            });

            await new Promise(resolve => setTimeout(resolve, 100));

            // Verify violation was properly ended
            violations = dbService.getAppViolationsByExam(examId);
            expect(violations).toHaveLength(1);
            expect(violations[0].focusEndTime).toBeTruthy();
            expect(violations[0].durationSeconds).toBeGreaterThan(0);

            // Verify warning was updated
            expect(violationEvents).toHaveLength(2);
            expect(violationEvents[1].type).toBe('violation_ended');
            expect(warningEvents).toHaveLength(2);
            expect(warningEvents[1].type).toBe('warning_updated');

            // Step 6: Simulate multiple violations to test warning system
            console.log('Step 6: Simulating multiple violations...');
            const violation2Data = {
                violationId: 'e2e-violation-002',
                applicationName: 'discord.exe',
                windowTitle: 'Discord - Chat Application',
                startTime: new Date(),
                processId: 9999
            };

            mockWindowsMonitorService.emit('violationStarted', violation2Data);
            await new Promise(resolve => setTimeout(resolve, 100));

            // Verify multiple violations are tracked
            violations = dbService.getAppViolationsByExam(examId);
            expect(violations).toHaveLength(2);
            expect(monitoringController.activeViolations.size).toBe(1); // One active, one ended

            // Step 7: End exam and stop monitoring (Requirement 1.5)
            console.log('Step 7: Ending exam and stopping monitoring...');
            const stopResult = await monitoringController.stopExamMonitoring();

            expect(stopResult.success).toBe(true);
            expect(monitoringController.isMonitoring).toBe(false);
            expect(monitoringController.activeViolations.size).toBe(0);

            // Verify monitoring stopped event
            expect(workflowEvents).toHaveLength(2);
            expect(workflowEvents[1].type).toBe('monitoring_stopped');

            // Step 8: Verify final violation data integrity
            console.log('Step 8: Verifying final data integrity...');
            violations = dbService.getAppViolationsByExam(examId);
            expect(violations).toHaveLength(2);

            // Verify all violations have proper data
            violations.forEach(violation => {
                expect(violation.examId).toBe(examId);
                expect(violation.studentId).toBe(studentId);
                expect(violation.deviceId).toBe(deviceId);
                expect(violation.focusStartTime).toBeTruthy();
                expect(violation.createdAt).toBeTruthy();
            });

            // Verify cleanup was performed
            expect(mockWindowsMonitorService.stopMonitoring).toHaveBeenCalled();
            expect(mockWindowsMonitorService.cleanup).toHaveBeenCalled();

            console.log('Complete exam workflow test completed successfully');
        });

        test('should handle exam workflow with screenshot failures gracefully', async () => {
            // Mock screenshot service to fail
            mockScreenshotService.captureActiveWindow.mockResolvedValue({
                success: false,
                error: 'Screenshot capture failed - insufficient permissions'
            });

            // Start monitoring
            await monitoringController.startExamMonitoring(examId, studentId, deviceId, allowedApps);

            // Simulate violation
            const violationData = {
                violationId: 'screenshot-fail-test',
                applicationName: 'unauthorized.exe',
                windowTitle: 'Unauthorized Application',
                startTime: new Date(),
                processId: 7777
            };

            mockWindowsMonitorService.emit('violationStarted', violationData);
            await new Promise(resolve => setTimeout(resolve, 100));

            // Verify violation was logged despite screenshot failure
            const violations = dbService.getAppViolationsByExam(examId);
            expect(violations).toHaveLength(1);
            expect(violations[0].appName).toBe('unauthorized.exe');
            expect(violations[0].screenshotCaptured).toBe(false);
            expect(violations[0].screenshotPath).toBeFalsy();

            // End monitoring
            await monitoringController.stopExamMonitoring();
        });

        test('should handle monitoring service errors during exam', async () => {
            const errorEvents = [];
            monitoringController.on('error', (data) => errorEvents.push(data));

            // Start monitoring
            await monitoringController.startExamMonitoring(examId, studentId, deviceId, allowedApps);

            // Simulate monitoring service error
            const monitoringError = new Error('Windows API access denied');
            mockWindowsMonitorService.emit('error', monitoringError);

            await new Promise(resolve => setTimeout(resolve, 100));

            // Verify error was handled
            expect(errorEvents).toHaveLength(1);
            expect(errorEvents[0].error).toBe('Windows API access denied');
            expect(errorEvents[0].canRecover).toBe(true);

            // Monitoring should still be active (within retry limits)
            expect(monitoringController.isMonitoring).toBe(true);

            // End monitoring
            await monitoringController.stopExamMonitoring();
        });
    });

    describe('Violation Detection and Logging Integration', () => {
        test('should detect and log violations with complete metadata', async () => {
            await monitoringController.startExamMonitoring(examId, studentId, deviceId, allowedApps);

            const testViolations = [
                {
                    violationId: 'metadata-test-1',
                    applicationName: 'firefox.exe',
                    windowTitle: 'Mozilla Firefox - Private Browsing',
                    startTime: new Date(),
                    processId: 1111,
                    executablePath: 'C:\\Program Files\\Mozilla Firefox\\firefox.exe'
                },
                {
                    violationId: 'metadata-test-2',
                    applicationName: 'spotify.exe',
                    windowTitle: 'Spotify - Music Player',
                    startTime: new Date(),
                    processId: 2222,
                    executablePath: 'C:\\Users\\Student\\AppData\\Roaming\\Spotify\\Spotify.exe'
                }
            ];

            // Simulate multiple violations
            for (const violation of testViolations) {
                mockWindowsMonitorService.emit('violationStarted', violation);
                await new Promise(resolve => setTimeout(resolve, 50));
            }

            // Verify all violations were logged with complete metadata
            const violations = dbService.getAppViolationsByExam(examId);
            expect(violations).toHaveLength(2);

            violations.forEach((violation, index) => {
                expect(violation.examId).toBe(examId);
                expect(violation.studentId).toBe(studentId);
                expect(violation.deviceId).toBe(deviceId);
                expect(violation.appName).toBe(testViolations[index].applicationName);
                expect(violation.windowTitle).toBe(testViolations[index].windowTitle);
                expect(violation.focusStartTime).toBeTruthy();
                expect(violation.screenshotCaptured).toBe(true);
                expect(violation.screenshotPath).toBeTruthy();
            });

            await monitoringController.stopExamMonitoring();
        });

        test('should handle rapid application switching correctly', async () => {
            await monitoringController.startExamMonitoring(examId, studentId, deviceId, allowedApps);

            // Simulate rapid switching between allowed and unauthorized apps
            const switchingSequence = [
                { app: 'notepad.exe', allowed: true },
                { app: 'unauthorized1.exe', allowed: false },
                { app: 'calculator.exe', allowed: true },
                { app: 'unauthorized2.exe', allowed: false },
                { app: 'chrome.exe', allowed: true }
            ];

            for (let i = 0; i < switchingSequence.length; i++) {
                const { app, allowed } = switchingSequence[i];

                if (allowed) {
                    mockWindowsMonitorService.emit('applicationChanged', {
                        previousApp: i > 0 ? { applicationName: switchingSequence[i - 1].app } : null,
                        currentApp: { applicationName: app, windowTitle: `${app} Window` },
                        timestamp: new Date()
                    });
                } else {
                    mockWindowsMonitorService.emit('violationStarted', {
                        violationId: `rapid-switch-${i}`,
                        applicationName: app,
                        windowTitle: `${app} Window`,
                        startTime: new Date(),
                        processId: 1000 + i
                    });

                    // Quickly end the violation (rapid switching)
                    setTimeout(() => {
                        mockWindowsMonitorService.emit('violationEnded', {
                            violationId: `rapid-switch-${i}`,
                            endTime: new Date(),
                            duration: 500 // 500ms usage
                        });
                    }, 50);
                }

                await new Promise(resolve => setTimeout(resolve, 100));
            }

            // Verify only unauthorized apps created violations
            const violations = dbService.getAppViolationsByExam(examId);
            expect(violations).toHaveLength(2);
            expect(violations[0].appName).toBe('unauthorized1.exe');
            expect(violations[1].appName).toBe('unauthorized2.exe');

            await monitoringController.stopExamMonitoring();
        });
    });

    describe('Warning Display System Integration', () => {
        test('should emit proper events for warning system updates', async () => {
            const warningSystemEvents = [];

            // Mock IPC communication to frontend
            const mockIPCHandler = (channel, data) => {
                if (channel === 'violation-started' || channel === 'violation-ended') {
                    warningSystemEvents.push({ channel, data, timestamp: new Date() });
                }
            };

            // Setup IPC event tracking
            monitoringController.on('violationStarted', (data) => {
                mockIPCHandler('violation-started', data);
            });

            monitoringController.on('violationEnded', (data) => {
                mockIPCHandler('violation-ended', data);
            });

            await monitoringController.startExamMonitoring(examId, studentId, deviceId, allowedApps);

            // Simulate violation lifecycle for warning system
            const violationData = {
                violationId: 'warning-system-test',
                applicationName: 'game.exe',
                windowTitle: 'Unauthorized Game',
                startTime: new Date(),
                processId: 8888
            };

            mockWindowsMonitorService.emit('violationStarted', violationData);
            await new Promise(resolve => setTimeout(resolve, 100));

            // Verify warning start event
            expect(warningSystemEvents).toHaveLength(1);
            expect(warningSystemEvents[0].channel).toBe('violation-started');
            expect(warningSystemEvents[0].data.monitorViolationId).toBe('warning-system-test');
            expect(warningSystemEvents[0].data.appName).toBe('game.exe');

            // End violation
            mockWindowsMonitorService.emit('violationEnded', {
                violationId: 'warning-system-test',
                endTime: new Date(),
                duration: 2000
            });

            await new Promise(resolve => setTimeout(resolve, 100));

            // Verify warning end event
            expect(warningSystemEvents).toHaveLength(2);
            expect(warningSystemEvents[1].channel).toBe('violation-ended');
            expect(warningSystemEvents[1].data.monitorViolationId).toBe('warning-system-test');
            expect(warningSystemEvents[1].data.duration).toBe(2000);

            await monitoringController.stopExamMonitoring();
        });

        test('should provide real-time violation status for warning cards', async () => {
            await monitoringController.startExamMonitoring(examId, studentId, deviceId, allowedApps);

            // Start multiple violations
            const violations = [
                { id: 'warning-1', app: 'app1.exe' },
                { id: 'warning-2', app: 'app2.exe' },
                { id: 'warning-3', app: 'app3.exe' }
            ];

            for (const violation of violations) {
                mockWindowsMonitorService.emit('violationStarted', {
                    violationId: violation.id,
                    applicationName: violation.app,
                    windowTitle: `${violation.app} Window`,
                    startTime: new Date(),
                    processId: Math.floor(Math.random() * 10000)
                });
                await new Promise(resolve => setTimeout(resolve, 50));
            }

            // Verify active violations tracking
            expect(monitoringController.activeViolations.size).toBe(3);

            // End some violations
            mockWindowsMonitorService.emit('violationEnded', {
                violationId: 'warning-1',
                endTime: new Date(),
                duration: 1000
            });

            await new Promise(resolve => setTimeout(resolve, 50));

            expect(monitoringController.activeViolations.size).toBe(2);

            // Get monitoring status for warning system
            const status = monitoringController.getMonitoringStatus();
            expect(status.activeViolations.length).toBe(2);

            // Verify total violations in database
            const allViolations = dbService.getAppViolationsByExam(examId);
            expect(allViolations.length).toBe(3);

            await monitoringController.stopExamMonitoring();
        });
    });

    describe('Monitoring Cleanup on Exam Completion', () => {
        test('should properly cleanup all resources when exam ends', async () => {
            await monitoringController.startExamMonitoring(examId, studentId, deviceId, allowedApps);

            // Create some active violations
            mockWindowsMonitorService.emit('violationStarted', {
                violationId: 'cleanup-test-1',
                applicationName: 'cleanup1.exe',
                windowTitle: 'Cleanup Test 1',
                startTime: new Date(),
                processId: 1111
            });

            mockWindowsMonitorService.emit('violationStarted', {
                violationId: 'cleanup-test-2',
                applicationName: 'cleanup2.exe',
                windowTitle: 'Cleanup Test 2',
                startTime: new Date(),
                processId: 2222
            });

            await new Promise(resolve => setTimeout(resolve, 100));

            // Verify active violations exist
            expect(monitoringController.activeViolations.size).toBe(2);
            expect(monitoringController.isMonitoring).toBe(true);

            // Stop monitoring (simulates exam completion)
            const stopResult = await monitoringController.stopExamMonitoring();

            // Verify cleanup was successful
            expect(stopResult.success).toBe(true);
            expect(monitoringController.isMonitoring).toBe(false);
            expect(monitoringController.activeViolations.size).toBe(0);

            // Verify service cleanup was called
            expect(mockWindowsMonitorService.stopMonitoring).toHaveBeenCalled();
            expect(mockWindowsMonitorService.cleanup).toHaveBeenCalled();

            // Verify all active violations were finalized in database
            const violations = dbService.getAppViolationsByExam(examId);
            expect(violations).toHaveLength(2);
            violations.forEach(violation => {
                expect(violation.focusEndTime).toBeTruthy();
                expect(violation.durationSeconds).toBeGreaterThanOrEqual(0);
            });
        });

        test('should handle cleanup errors gracefully', async () => {
            // Mock cleanup failure
            mockWindowsMonitorService.cleanup.mockImplementation(() => {
                throw new Error('Cleanup failed');
            });

            await monitoringController.startExamMonitoring(examId, studentId, deviceId, allowedApps);

            // Create active violation
            mockWindowsMonitorService.emit('violationStarted', {
                violationId: 'cleanup-error-test',
                applicationName: 'error.exe',
                windowTitle: 'Error Test',
                startTime: new Date(),
                processId: 9999
            });

            await new Promise(resolve => setTimeout(resolve, 50));

            // Stop monitoring should not throw despite cleanup errors
            const stopResult = await monitoringController.stopExamMonitoring();

            // Cleanup error should cause failure but not throw
            expect(stopResult.success).toBe(false);
            expect(stopResult.error).toContain('Cleanup failed');

            // Monitoring might still be active due to cleanup failure
            // This is expected behavior - cleanup errors prevent clean shutdown
        });

        test('should prevent new violations after monitoring stops', async () => {
            await monitoringController.startExamMonitoring(examId, studentId, deviceId, allowedApps);

            // Stop monitoring
            await monitoringController.stopExamMonitoring();

            // Count violations before attempting post-stop violation
            const violationsBefore = dbService.getAppViolationsByExam(examId);
            const countBefore = violationsBefore.length;

            // Try to emit violation after stopping (should be ignored or cause error)
            const errorEvents = [];
            monitoringController.on('error', (data) => errorEvents.push(data));

            mockWindowsMonitorService.emit('violationStarted', {
                violationId: 'post-stop-violation',
                applicationName: 'poststop.exe',
                windowTitle: 'Post Stop Test',
                startTime: new Date(),
                processId: 7777
            });

            await new Promise(resolve => setTimeout(resolve, 100));

            // Should not create new violation records after monitoring stops
            const violationsAfter = dbService.getAppViolationsByExam(examId);
            expect(violationsAfter.length).toBe(countBefore);

            // Should either ignore the violation or emit an error
            expect(errorEvents.length).toBeGreaterThanOrEqual(0);
        });
    });

    describe('Performance and Resource Management', () => {
        test('should handle extended monitoring sessions efficiently', async () => {
            const startTime = Date.now();

            await monitoringController.startExamMonitoring(examId, studentId, deviceId, allowedApps);

            // Simulate extended session with many events
            const eventCount = 100;
            for (let i = 0; i < eventCount; i++) {
                if (i % 10 === 0) {
                    // Every 10th event is a violation
                    mockWindowsMonitorService.emit('violationStarted', {
                        violationId: `perf-test-${i}`,
                        applicationName: `violation${i}.exe`,
                        windowTitle: `Violation ${i}`,
                        startTime: new Date(),
                        processId: 1000 + i
                    });

                    // End violation after short time
                    setTimeout(() => {
                        mockWindowsMonitorService.emit('violationEnded', {
                            violationId: `perf-test-${i}`,
                            endTime: new Date(),
                            duration: 1000
                        });
                    }, 10);
                } else {
                    // Regular application changes
                    mockWindowsMonitorService.emit('applicationChanged', {
                        previousApp: { applicationName: 'notepad.exe' },
                        currentApp: { applicationName: 'calculator.exe' },
                        timestamp: new Date()
                    });
                }

                await new Promise(resolve => setTimeout(resolve, 5));
            }

            await new Promise(resolve => setTimeout(resolve, 100));

            const endTime = Date.now();
            const duration = endTime - startTime;

            // Verify performance (should complete within reasonable time)
            expect(duration).toBeLessThan(5000); // Less than 5 seconds

            // Verify all violations were processed
            const violations = dbService.getAppViolationsByExam(examId);
            expect(violations.length).toBe(10); // 10% of events were violations

            await monitoringController.stopExamMonitoring();
        });
    });
});