/**
 * Test script for Windows API integration and application detection
 * Run with: node scripts/test-windows-api.js
 */

const ApplicationDetector = require('../services/applicationDetector');

async function testWindowsApiIntegration() {
    console.log('=== Windows API Integration Test ===\n');

    const detector = new ApplicationDetector();

    try {
        // Test 1: Initialize detector
        console.log('1. Testing initialization...');
        const initialized = detector.initialize();
        console.log(`   Initialization: ${initialized ? 'SUCCESS' : 'FAILED'}\n`);

        if (!initialized) {
            console.log('Cannot proceed with tests - initialization failed');
            return;
        }

        // Test 2: Get current active application
        console.log('2. Testing current application detection...');
        const currentApp = detector.getCurrentActiveApplication();
        if (currentApp) {
            console.log('   SUCCESS - Current application detected:');
            console.log(`   - Application: ${currentApp.applicationName}`);
            console.log(`   - Window Title: ${currentApp.windowTitle}`);
            console.log(`   - Process ID: ${currentApp.processId}`);
            console.log(`   - Executable: ${currentApp.executablePath}`);
            console.log(`   - Normalized: ${currentApp.normalizedName}\n`);
        } else {
            console.log('   FAILED - Could not detect current application\n');
        }

        // Test 3: Test allowed application checking
        console.log('3. Testing allowed application logic...');
        const testAllowedApps = ['chrome', 'firefox', 'notepad', 'code'];
        if (currentApp) {
            const isAllowed = detector.isApplicationAllowed(currentApp.applicationName, testAllowedApps);
            console.log(`   Application "${currentApp.applicationName}" is ${isAllowed ? 'ALLOWED' : 'NOT ALLOWED'}`);
            console.log(`   Test allowed apps: ${testAllowedApps.join(', ')}\n`);
        }

        // Test 4: Test monitoring functionality
        console.log('4. Testing application monitoring...');
        console.log('   Starting monitoring for 10 seconds...');
        console.log('   Try switching between applications to test detection\n');

        let changeCount = 0;
        detector.setApplicationChangeCallback((oldApp, newApp) => {
            changeCount++;
            console.log(`   [${changeCount}] Application changed:`);
            console.log(`       From: ${oldApp ? oldApp.applicationName : 'None'}`);
            console.log(`       To: ${newApp ? newApp.applicationName : 'None'}`);
            console.log(`       Time: ${new Date().toLocaleTimeString()}\n`);
        });

        detector.setErrorCallback((error) => {
            console.log(`   ERROR: ${error.message}\n`);
        });

        const monitoringStarted = detector.startMonitoring();
        console.log(`   Monitoring started: ${monitoringStarted ? 'SUCCESS' : 'FAILED'}`);

        if (monitoringStarted) {
            // Monitor for 10 seconds
            await new Promise(resolve => setTimeout(resolve, 10000));

            detector.stopMonitoring();
            console.log(`   Monitoring stopped. Total changes detected: ${changeCount}\n`);
        }

        // Test 5: Get monitoring status
        console.log('5. Testing monitoring status...');
        const status = detector.getMonitoringStatus();
        console.log('   Status:', JSON.stringify(status, null, 2));

        // Test 6: Run comprehensive test
        console.log('\n6. Running comprehensive detection test...');
        const testResults = await detector.testDetection();
        console.log('   Test Results:');
        console.log(`   - API Test: ${testResults.apiTest ? 'PASSED' : 'FAILED'}`);
        console.log(`   - Current App: ${testResults.currentApp ? 'DETECTED' : 'NOT DETECTED'}`);
        console.log(`   - Monitoring Test: ${testResults.monitoringTest ? 'PASSED' : 'FAILED'}`);
        if (testResults.error) {
            console.log(`   - Error: ${testResults.error}`);
        }

        console.log('\n=== Test Complete ===');

        // Cleanup
        detector.cleanup();

    } catch (error) {
        console.error('Test failed with error:', error);
    }
}

// Run the test
if (require.main === module) {
    testWindowsApiIntegration().catch(console.error);
}

module.exports = { testWindowsApiIntegration };