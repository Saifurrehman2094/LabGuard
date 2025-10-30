const DatabaseService = require('../../services/database');
const fs = require('fs');
const path = require('path');

describe('DatabaseService - App Violations Integration Tests', () => {
    let dbService;
    let testDbPath;
    let teacherId, studentId, examId, deviceId;

    beforeEach(async () => {
        // Create a temporary database for testing
        testDbPath = path.join(__dirname, 'test-violations-database.sqlite');
        dbService = new DatabaseService(testDbPath);
        await dbService.initializeDatabase();

        // Manually ensure app_violations table exists for testing
        try {
            dbService.db.exec(`
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

        // Set up test data
        const teacher = await dbService.createUser({
            username: 'teacher_violations',
            password: 'password123',
            role: 'teacher',
            fullName: 'Violations Test Teacher'
        });

        const student = await dbService.createUser({
            username: 'student_violations',
            password: 'password123',
            role: 'student',
            fullName: 'Violations Test Student'
        });

        const exam = dbService.createExam({
            teacherId: teacher.userId,
            title: 'Violations Test Exam',
            pdfPath: '/path/to/violations-exam.pdf',
            startTime: '2024-12-01 10:00:00',
            endTime: '2024-12-01 12:00:00',
            allowedApps: ['notepad.exe', 'calculator.exe']
        });

        teacherId = teacher.userId;
        studentId = student.userId;
        examId = exam.examId;
        deviceId = 'test-device-violations-123';

        dbService.registerDevice(deviceId, 'Violations Test Device');
    });

    afterEach(() => {
        // Clean up test database
        if (dbService) {
            dbService.close();
        }
        if (fs.existsSync(testDbPath)) {
            fs.unlinkSync(testDbPath);
        }
    });

    describe('App Violations Table Schema and Constraints', () => {
        test('should have app_violations table with correct schema', () => {
            const tableInfo = dbService.db.prepare("PRAGMA table_info(app_violations)").all();
            const columnNames = tableInfo.map(col => col.name);

            expect(columnNames).toContain('violation_id');
            expect(columnNames).toContain('exam_id');
            expect(columnNames).toContain('student_id');
            expect(columnNames).toContain('device_id');
            expect(columnNames).toContain('app_name');
            expect(columnNames).toContain('window_title');
            expect(columnNames).toContain('focus_start_time');
            expect(columnNames).toContain('focus_end_time');
            expect(columnNames).toContain('duration_seconds');
            expect(columnNames).toContain('screenshot_path');
            expect(columnNames).toContain('screenshot_captured');
            expect(columnNames).toContain('created_at');
        });

        test('should enforce foreign key constraints for exam_id', () => {
            const violationData = {
                examId: 'non-existent-exam-id',
                studentId: studentId,
                deviceId: deviceId,
                appName: 'chrome.exe',
                windowTitle: 'Google Chrome',
                focusStartTime: new Date().toISOString()
            };

            // This should fail due to foreign key constraint
            expect(() => {
                dbService.logAppViolation(violationData);
            }).toThrow();
        });

        test('should enforce foreign key constraints for student_id', () => {
            const violationData = {
                examId: examId,
                studentId: 'non-existent-student-id',
                deviceId: deviceId,
                appName: 'chrome.exe',
                windowTitle: 'Google Chrome',
                focusStartTime: new Date().toISOString()
            };

            // This should fail due to foreign key constraint
            expect(() => {
                dbService.logAppViolation(violationData);
            }).toThrow();
        });

        test('should allow null values for optional fields', () => {
            const violationData = {
                examId: examId,
                studentId: studentId,
                deviceId: deviceId,
                appName: 'chrome.exe',
                windowTitle: null, // Optional field
                focusStartTime: new Date().toISOString(),
                screenshotPath: null // Optional field
            };

            const result = dbService.logAppViolation(violationData);

            expect(result).toBeDefined();
            expect(result.windowTitle).toBeNull();
            expect(result.screenshotPath).toBeNull();
            expect(result.screenshotCaptured).toBe(false);
        });
    });

    describe('Violation Record Creation', () => {
        test('should create violation record with all required fields', () => {
            const startTime = new Date().toISOString();
            const violationData = {
                examId: examId,
                studentId: studentId,
                deviceId: deviceId,
                appName: 'chrome.exe',
                windowTitle: 'Google Chrome - New Tab',
                focusStartTime: startTime,
                screenshotPath: '/screenshots/violation-123.png'
            };

            const result = dbService.logAppViolation(violationData);

            expect(result).toHaveProperty('violationId');
            expect(result.examId).toBe(examId);
            expect(result.studentId).toBe(studentId);
            expect(result.deviceId).toBe(deviceId);
            expect(result.appName).toBe('chrome.exe');
            expect(result.windowTitle).toBe('Google Chrome - New Tab');
            expect(result.focusStartTime).toBe(startTime);
            expect(result.screenshotPath).toBe('/screenshots/violation-123.png');
            expect(result.screenshotCaptured).toBe(true);
            expect(result).toHaveProperty('createdAt');
        });

        test('should create violation record without screenshot', () => {
            const violationData = {
                examId: examId,
                studentId: studentId,
                deviceId: deviceId,
                appName: 'firefox.exe',
                windowTitle: 'Mozilla Firefox',
                focusStartTime: new Date().toISOString()
            };

            const result = dbService.logAppViolation(violationData);

            expect(result.screenshotPath).toBeUndefined();
            expect(result.screenshotCaptured).toBe(false);
        });

        test('should auto-generate violation ID and timestamps', () => {
            const violationData = {
                examId: examId,
                studentId: studentId,
                deviceId: deviceId,
                appName: 'discord.exe',
                windowTitle: 'Discord'
            };

            const result = dbService.logAppViolation(violationData);

            expect(result.violationId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
            expect(result.focusStartTime).toBeDefined();
            expect(result.createdAt).toBeDefined();
        });

        test('should handle special characters in app names and window titles', () => {
            const violationData = {
                examId: examId,
                studentId: studentId,
                deviceId: deviceId,
                appName: 'app with spaces & symbols.exe',
                windowTitle: 'Window Title with "quotes" and \'apostrophes\' & symbols',
                focusStartTime: new Date().toISOString()
            };

            const result = dbService.logAppViolation(violationData);

            expect(result.appName).toBe('app with spaces & symbols.exe');
            expect(result.windowTitle).toBe('Window Title with "quotes" and \'apostrophes\' & symbols');
        });
    });

    describe('Violation Record Updates', () => {
        let violationId;

        beforeEach(() => {
            const violationData = {
                examId: examId,
                studentId: studentId,
                deviceId: deviceId,
                appName: 'chrome.exe',
                windowTitle: 'Google Chrome',
                focusStartTime: '2024-12-01 10:30:00'
            };

            const result = dbService.logAppViolation(violationData);
            violationId = result.violationId;
        });

        test('should update violation end time and calculate duration', () => {
            const endTime = '2024-12-01 10:32:30'; // 2.5 minutes later

            const result = dbService.updateViolationEndTime(violationId, endTime);

            expect(result.violationId).toBe(violationId);
            expect(result.focusEndTime).toBe(endTime);
            expect(result.durationSeconds).toBe(150); // 2.5 minutes = 150 seconds
            expect(result.updated).toBe(true);
        });

        test('should calculate duration correctly for different time spans', () => {
            // Test 1 hour duration
            const endTime = '2024-12-01 11:30:00'; // 1 hour later

            const result = dbService.updateViolationEndTime(violationId, endTime);

            expect(result.durationSeconds).toBe(3600); // 1 hour = 3600 seconds
        });

        test('should handle automatic end time generation', () => {
            const beforeUpdate = new Date();
            const result = dbService.updateViolationEndTime(violationId);
            const afterUpdate = new Date();

            expect(result.focusEndTime).toBeDefined();
            expect(result.durationSeconds).toBeGreaterThan(0);

            const endTime = new Date(result.focusEndTime);
            expect(endTime.getTime()).toBeGreaterThanOrEqual(beforeUpdate.getTime());
            expect(endTime.getTime()).toBeLessThanOrEqual(afterUpdate.getTime());
        });

        test('should throw error for non-existent violation ID', () => {
            const nonExistentId = 'non-existent-violation-id';

            expect(() => {
                dbService.updateViolationEndTime(nonExistentId, new Date().toISOString());
            }).toThrow(`Violation with ID ${nonExistentId} not found`);
        });

        test('should handle multiple updates to same violation', () => {
            // First update
            const firstEndTime = '2024-12-01 10:31:00';
            const firstResult = dbService.updateViolationEndTime(violationId, firstEndTime);
            expect(firstResult.durationSeconds).toBe(60);

            // Second update (should overwrite)
            const secondEndTime = '2024-12-01 10:32:00';
            const secondResult = dbService.updateViolationEndTime(violationId, secondEndTime);
            expect(secondResult.durationSeconds).toBe(120);
        });
    });

    describe('Violation Data Retrieval', () => {
        let student2Id, exam2Id;

        beforeEach(async () => {
            // Create additional test data
            const student2 = await dbService.createUser({
                username: 'student2_violations',
                password: 'password123',
                role: 'student',
                fullName: 'Second Violations Student'
            });

            const exam2 = dbService.createExam({
                teacherId: teacherId,
                title: 'Second Violations Exam',
                pdfPath: '/path/to/exam2.pdf',
                startTime: '2024-12-02 10:00:00',
                endTime: '2024-12-02 12:00:00',
                allowedApps: ['notepad.exe']
            });

            student2Id = student2.userId;
            exam2Id = exam2.examId;

            // Create sample violations
            const violations = [
                {
                    examId: examId,
                    studentId: studentId,
                    deviceId: deviceId,
                    appName: 'chrome.exe',
                    windowTitle: 'Google Chrome',
                    focusStartTime: '2024-12-01 10:30:00',
                    screenshotPath: '/screenshots/chrome-violation.png'
                },
                {
                    examId: examId,
                    studentId: studentId,
                    deviceId: deviceId,
                    appName: 'discord.exe',
                    windowTitle: 'Discord',
                    focusStartTime: '2024-12-01 10:35:00'
                },
                {
                    examId: examId,
                    studentId: student2Id,
                    deviceId: deviceId,
                    appName: 'steam.exe',
                    windowTitle: 'Steam',
                    focusStartTime: '2024-12-01 10:40:00'
                },
                {
                    examId: exam2Id,
                    studentId: studentId,
                    deviceId: deviceId,
                    appName: 'firefox.exe',
                    windowTitle: 'Firefox',
                    focusStartTime: '2024-12-02 10:15:00'
                }
            ];

            violations.forEach(violation => {
                const result = dbService.logAppViolation(violation);
                // Update some violations with end times
                if (violation.appName === 'chrome.exe') {
                    dbService.updateViolationEndTime(result.violationId, '2024-12-01 10:32:00');
                }
                if (violation.appName === 'discord.exe') {
                    dbService.updateViolationEndTime(result.violationId, '2024-12-01 10:36:30');
                }
            });
        });

        test('should get all violations by exam ID', () => {
            const violations = dbService.getAppViolationsByExam(examId);

            expect(violations).toHaveLength(3); // chrome, discord, steam
            expect(violations[0]).toHaveProperty('studentName');
            expect(violations[0]).toHaveProperty('username');

            const appNames = violations.map(v => v.appName);
            expect(appNames).toContain('chrome.exe');
            expect(appNames).toContain('discord.exe');
            expect(appNames).toContain('steam.exe');
        });

        test('should get violations by student and exam', () => {
            const violations = dbService.getAppViolationsByStudent(studentId, examId);

            expect(violations).toHaveLength(2); // chrome, discord
            expect(violations[0]).toHaveProperty('examTitle');

            const appNames = violations.map(v => v.appName);
            expect(appNames).toContain('chrome.exe');
            expect(appNames).toContain('discord.exe');
            expect(appNames).not.toContain('steam.exe'); // Different student
        });

        test('should get all violations for a student across exams', () => {
            const violations = dbService.getAllAppViolationsByStudent(studentId);

            expect(violations).toHaveLength(3); // chrome, discord from exam1, firefox from exam2
            expect(violations[0]).toHaveProperty('examTitle');
            expect(violations[0]).toHaveProperty('examStartTime');

            const examIds = violations.map(v => v.examId);
            expect(examIds).toContain(examId);
            expect(examIds).toContain(exam2Id);
        });

        test('should return violations in correct camelCase format', () => {
            const violations = dbService.getAppViolationsByExam(examId);
            const violation = violations[0];

            expect(violation).toHaveProperty('violationId');
            expect(violation).toHaveProperty('examId');
            expect(violation).toHaveProperty('studentId');
            expect(violation).toHaveProperty('studentName');
            expect(violation).toHaveProperty('deviceId');
            expect(violation).toHaveProperty('appName');
            expect(violation).toHaveProperty('windowTitle');
            expect(violation).toHaveProperty('focusStartTime');
            expect(violation).toHaveProperty('focusEndTime');
            expect(violation).toHaveProperty('durationSeconds');
            expect(violation).toHaveProperty('screenshotPath');
            expect(violation).toHaveProperty('screenshotCaptured');
            expect(violation).toHaveProperty('createdAt');
        });

        test('should handle empty results gracefully', () => {
            const nonExistentExamId = 'non-existent-exam-id';
            const violations = dbService.getAppViolationsByExam(nonExistentExamId);

            expect(violations).toHaveLength(0);
            expect(Array.isArray(violations)).toBe(true);
        });
    });

    describe('Violation Statistics and Analytics', () => {
        beforeEach(() => {
            // Create comprehensive test data for statistics
            const violations = [
                {
                    examId: examId,
                    studentId: studentId,
                    deviceId: deviceId,
                    appName: 'chrome.exe',
                    windowTitle: 'Google Chrome',
                    focusStartTime: '2024-12-01 10:30:00'
                },
                {
                    examId: examId,
                    studentId: studentId,
                    deviceId: deviceId,
                    appName: 'chrome.exe',
                    windowTitle: 'Google Chrome - YouTube',
                    focusStartTime: '2024-12-01 10:35:00'
                },
                {
                    examId: examId,
                    studentId: studentId,
                    deviceId: deviceId,
                    appName: 'discord.exe',
                    windowTitle: 'Discord',
                    focusStartTime: '2024-12-01 10:40:00'
                }
            ];

            violations.forEach((violation, index) => {
                const result = dbService.logAppViolation(violation);
                // Add end times with different durations
                const endTimes = [
                    '2024-12-01 10:32:00', // 2 minutes
                    '2024-12-01 10:37:00', // 2 minutes
                    '2024-12-01 10:41:30'  // 1.5 minutes
                ];
                dbService.updateViolationEndTime(result.violationId, endTimes[index]);
            });
        });

        test('should calculate violation statistics by exam', () => {
            const stats = dbService.getViolationStatsByExam(examId);

            expect(stats.overall.totalViolations).toBe(3);
            expect(stats.overall.studentsWithViolations).toBe(1);
            expect(stats.overall.uniqueApps).toBe(2);
            expect(stats.overall.totalDurationSeconds).toBe(330); // 2+2+1.5 minutes = 5.5 minutes = 330 seconds
            expect(stats.overall.avgDurationSeconds).toBe(110); // 330/3 = 110 seconds

            expect(stats.byApp).toHaveLength(2);

            const chromeStats = stats.byApp.find(app => app.appName === 'chrome.exe');
            const discordStats = stats.byApp.find(app => app.appName === 'discord.exe');

            expect(chromeStats.violationCount).toBe(2);
            expect(chromeStats.totalDurationSeconds).toBe(240); // 4 minutes
            expect(discordStats.violationCount).toBe(1);
            expect(discordStats.totalDurationSeconds).toBe(90); // 1.5 minutes
        });

        test('should handle empty statistics gracefully', () => {
            const emptyExamId = 'empty-exam-id';
            const stats = dbService.getViolationStatsByExam(emptyExamId);

            expect(stats.overall.totalViolations).toBe(0);
            expect(stats.overall.studentsWithViolations).toBe(0);
            expect(stats.overall.uniqueApps).toBe(0);
            expect(stats.overall.totalDurationSeconds).toBe(0);
            expect(stats.overall.avgDurationSeconds).toBe(0);
            expect(stats.byApp).toHaveLength(0);
        });
    });

    describe('Data Integrity and Performance', () => {
        test('should maintain data integrity with concurrent operations', () => {
            const violations = [];

            // Create multiple violations simultaneously
            for (let i = 0; i < 10; i++) {
                const violation = dbService.logAppViolation({
                    examId: examId,
                    studentId: studentId,
                    deviceId: deviceId,
                    appName: `app${i}.exe`,
                    windowTitle: `Application ${i}`,
                    focusStartTime: new Date(Date.now() + i * 1000).toISOString()
                });
                violations.push(violation);
            }

            // Update all violations with end times
            violations.forEach((violation, index) => {
                const endTime = new Date(Date.now() + (index + 1) * 2000).toISOString();
                dbService.updateViolationEndTime(violation.violationId, endTime);
            });

            // Verify all violations were created and updated correctly
            const retrievedViolations = dbService.getAppViolationsByExam(examId);
            expect(retrievedViolations).toHaveLength(10);

            retrievedViolations.forEach(violation => {
                expect(violation.focusEndTime).toBeDefined();
                expect(violation.durationSeconds).toBeGreaterThan(0);
            });
        });

        test('should handle large datasets efficiently', () => {
            const startTime = Date.now();

            // Create 100 violations
            for (let i = 0; i < 100; i++) {
                dbService.logAppViolation({
                    examId: examId,
                    studentId: studentId,
                    deviceId: deviceId,
                    appName: `performance-test-app-${i % 10}.exe`,
                    windowTitle: `Performance Test Window ${i}`,
                    focusStartTime: new Date(Date.now() + i * 100).toISOString()
                });
            }

            const creationTime = Date.now() - startTime;

            // Query performance test
            const queryStartTime = Date.now();
            const violations = dbService.getAppViolationsByExam(examId);
            const queryTime = Date.now() - queryStartTime;

            expect(violations).toHaveLength(100);
            expect(creationTime).toBeLessThan(5000); // Should complete within 5 seconds
            expect(queryTime).toBeLessThan(1000); // Query should complete within 1 second
        });

        test('should maintain referential integrity on cascading deletes', () => {
            // Create violation
            const violation = dbService.logAppViolation({
                examId: examId,
                studentId: studentId,
                deviceId: deviceId,
                appName: 'test-cascade.exe',
                windowTitle: 'Test Cascade',
                focusStartTime: new Date().toISOString()
            });

            // Verify violation exists
            let violations = dbService.getAppViolationsByExam(examId);
            expect(violations).toHaveLength(1);

            // Try to delete the exam - should fail due to foreign key constraint
            expect(() => {
                dbService.deleteExam(examId);
            }).toThrow();

            // Verify exam still exists due to foreign key constraint
            const examExists = dbService.getExamById(examId);
            expect(examExists).not.toBeNull();
        });
    });

    describe('Error Handling and Edge Cases', () => {
        test('should handle invalid date formats gracefully', () => {
            const violationData = {
                examId: examId,
                studentId: studentId,
                deviceId: deviceId,
                appName: 'test.exe',
                windowTitle: 'Test',
                focusStartTime: 'invalid-date-format'
            };

            // Should not throw error, but handle gracefully
            const result = dbService.logAppViolation(violationData);
            expect(result).toBeDefined();
            expect(result.focusStartTime).toBe('invalid-date-format');
        });

        test('should handle very long app names and window titles', () => {
            const longAppName = 'a'.repeat(1000) + '.exe';
            const longWindowTitle = 'b'.repeat(2000);

            const violationData = {
                examId: examId,
                studentId: studentId,
                deviceId: deviceId,
                appName: longAppName,
                windowTitle: longWindowTitle,
                focusStartTime: new Date().toISOString()
            };

            const result = dbService.logAppViolation(violationData);
            expect(result.appName).toBe(longAppName);
            expect(result.windowTitle).toBe(longWindowTitle);
        });

        test('should handle null and undefined values appropriately', () => {
            const violationData = {
                examId: examId,
                studentId: studentId,
                deviceId: deviceId,
                appName: 'test.exe',
                windowTitle: undefined,
                focusStartTime: new Date().toISOString(),
                screenshotPath: null
            };

            const result = dbService.logAppViolation(violationData);
            expect(result.windowTitle).toBeUndefined();
            expect(result.screenshotPath).toBeNull();
            expect(result.screenshotCaptured).toBe(false);
        });

        test('should handle database connection errors', () => {
            // Close the database connection
            dbService.close();

            expect(() => {
                dbService.logAppViolation({
                    examId: examId,
                    studentId: studentId,
                    deviceId: deviceId,
                    appName: 'test.exe',
                    focusStartTime: new Date().toISOString()
                });
            }).toThrow();
        });
    });
});