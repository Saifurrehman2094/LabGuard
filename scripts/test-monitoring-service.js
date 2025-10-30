/**
 * Test script for complete monitoring service integration
 * Run with: node scripts/test-monitoring-service.js
 */

const MonitoringService = require('../services/monitoringService');

async function testMonitoringService() {
    console.log('=== Monitoring Service Integration Test ===\n');

    const monitoringService = new MonitoringService();

    try {
        // Test 1: Initialize service
        console.log('1. Testing service initialization...');
        const initialized = monitoringService.initialize();
        console.log(`   Initialization: ${initialized ? 'SUCCESS' : 'FAILED'}\n`);

        if (!initialized) {
            console.log('Cannot proceed with tests - initialization failed');
            return;
        }

        // Test 2: Get current application
        console.log('2. Testing current application detection...');
        const currentApp = monitoringService.getCurrentApplication();
        if (currentApp) {
            console.log('   SUCCESS - Current application:');
            console.log(`   - Name: ${currentApp.applicationName}`);
            console.log(`   - Title: ${currentApp.windowTitle}`);
            console.log(`   - Process: ${currentApp.processId}\n`);
        } else {
            console.log('   FAILED - Could not detect current application\n');
        }

        // Test 3: Start monitoring with test parameters
        console.log('3. Testing monitoring start...');
        const testAllowedApps = ['notepad', 'calculator', 'chrome', 'firefox'];
        const startResult = monitoringService.startMonitoring(
            'test-exam-123',
            'test-student-456',
            testAllowedApps
        );

        console.log(`   Start result: ${startResult.success ? 'SUCCESS' : 'FAILED'}`);
        if (startResult.success) {
            console.log(`   - Exam ID: ${startResult.examId}`);
            console.log(`   - Student ID: ${startResult.studentId}`);
            console.log(`   - Allowed apps: ${startResult.allowedApps.join(', ')}\n`);
        } else {
            console.log(`   - Error: ${startResult.error}\n`);
        }

        if (!startResult.success) {
            return;
        }

        // Test 4: Monitor for violations
        console.log('4. Testing violation detection...');
        console.log('   Monitoring for 15 seconds...');
        console.log('   Try switching to different applications to test violation detection\n');

        let violationCount = 0;
        monitoringService.setViolationCallback((violation) => {
            violationCount++;
            console.log(`   [VIOLATION ${violationCount}] Detected:`);
            console.log(`       App: ${violation.applicationName}`);
            console.log(`       Window: ${violation.windowTitle}`);
            console.log(`       Time: ${new Date(violation.focusStartTime).toLocaleTimeString()}`);
            console.log(`       Status: ${violation.isActive ? 'ACTIVE' : 'ENDED'}\n`);
        });

        monitoringService.setErrorCallback((error) => {
            console.log(`   [ERROR] ${error.message}\n`);
        });

        // Monitor for 15 seconds
        await new Promise(resolve => setTimeout(resolve, 15000));

        // Test 5: Get monitoring status
        console.log('5. Testing monitoring status...');
        const status = monitoringService.getStatus();
        console.log('   Current Status:');
        console.log(`   - Is Monitoring: ${status.isMonitoring}`);
        console.log(`   - Exam ID: ${status.examId}`);
        console.log(`   - Student ID: ${status.studentId}`);
        console.log(`   - Total Violations: ${status.totalViolations}`);
        console.log(`   - Active Violations: ${status.activeViolations}\n`);

        // Test 6: Get violations
        console.log('6. Testing violation retrieval...');
        const violations = monitoringService.getViolations();
        console.log(`   Total violations recorded: ${violations.length}`);
        violations.forEach((violation, index) => {
            console.log(`   [${index + 1}] ${violation.applicationName} - ${violation.isActive ? 'Active' : 'Ended'}`);
            if (violation.durationSeconds) {
                console.log(`       Duration: ${violation.durationSeconds} seconds`);
            }
        });
        console.log();

        // Test 7: Stop monitoring
        console.log('7. Testing monitoring stop...');
        const stopResult = monitoringService.stopMonitoring();
        console.log(`   Stop result: ${stopResult.success ? 'SUCCESS' : 'FAILED'}`);
        if (stopResult.success) {
            console.log('   Summary:');
            console.log(`   - Exam: ${stopResult.summary.examId}`);
            console.log(`   - Student: ${stopResult.summary.studentId}`);
            console.log(`   - Total Violations: ${stopResult.summary.totalViolations}`);
        }

        // Test 8: Comprehensive test
        console.log('\n8. Running comprehensive monitoring test...');
        const testResults = await monitoringService.testMonitoring();
        console.log('   Test Results:');
        console.log(`   - Initialization: ${testResults.initialization ? 'PASSED' : 'FAILED'}`);
        console.log(`   - Current App Detection: ${testResults.currentApp ? 'PASSED' : 'FAILED'}`);
        console.log(`   - Violation Testing: ${testResults.testViolation ? 'PASSED' : 'FAILED'}`);
        if (testResults.error) {
            console.log(`   - Error: ${testResults.error}`);
        }

        console.log('\n=== Test Complete ===');
        console.log(`Total violations detected during test: ${violationCount}`);

        // Cleanup
        monitoringService.cleanup();

    } catch (error) {
        console.error('Test failed with error:', error);
    }
}

// Run the test
if (require.main === module) {
    testMonitoringService().catch(console.error);
}

module.exports = { testMonitoringService };