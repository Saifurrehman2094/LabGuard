/**
 * Test script for WindowsMonitorService
 * Tests the monitoring service functionality
 */

const WindowsMonitorService = require('../services/windowsMonitorService');

async function testWindowsMonitorService() {
    console.log('=== Windows Monitor Service Test ===\n');

    const monitor = new WindowsMonitorService({
        pollingInterval: 500 // Faster polling for testing
    });

    // Set up event listeners
    monitor.on('initialized', () => {
        console.log('✓ Monitor service initialized');
    });

    monitor.on('monitoringStarted', (data) => {
        console.log('✓ Monitoring started:', data);
    });

    monitor.on('monitoringStopped', (data) => {
        console.log('✓ Monitoring stopped:', data);
    });

    monitor.on('applicationChanged', (data) => {
        console.log('📱 Application changed:');
        console.log(`  From: ${data.previousApp?.applicationName || 'None'}`);
        console.log(`  To: ${data.currentApp?.applicationName || 'None'}`);
    });

    monitor.on('applicationChecked', (data) => {
        console.log(`🔍 Application checked: ${data.applicationName} - ${data.isAllowed ? 'ALLOWED' : 'VIOLATION'}`);
    });

    monitor.on('violationStarted', (data) => {
        console.log('🚨 VIOLATION STARTED:');
        console.log(`  App: ${data.applicationName}`);
        console.log(`  Window: ${data.windowTitle}`);
        console.log(`  Time: ${data.startTime}`);
        console.log(`  ID: ${data.violationId}`);
    });

    monitor.on('violationEnded', (data) => {
        console.log('✅ VIOLATION ENDED:');
        console.log(`  App: ${data.applicationName}`);
        console.log(`  Duration: ${data.duration}ms`);
        console.log(`  ID: ${data.violationId}`);
    });

    monitor.on('error', (error) => {
        console.error('❌ Error:', error.message);
    });

    try {
        // Test 1: Initialization
        console.log('1. Testing initialization...');
        const initSuccess = monitor.initialize();
        console.log(`   Initialization: ${initSuccess ? 'SUCCESS' : 'FAILED'}\n`);

        if (!initSuccess) {
            console.log('Cannot continue tests - initialization failed');
            return;
        }

        // Test 2: Get current application
        console.log('2. Testing current application detection...');
        const currentApp = monitor.getCurrentActiveApplication();
        if (currentApp) {
            console.log(`   Current app: ${currentApp.applicationName}`);
            console.log(`   Window title: ${currentApp.windowTitle}`);
            console.log(`   Process ID: ${currentApp.processId}\n`);
        } else {
            console.log('   No active application detected\n');
        }

        // Test 3: Application matching
        console.log('3. Testing application matching...');
        if (currentApp) {
            // Test with empty allowed list (should be violation)
            const matchResult1 = monitor.checkApplicationMatch(currentApp.applicationName, currentApp.executablePath);
            console.log(`   Match with empty list: ${JSON.stringify(matchResult1)}`);

            // Test with current app in allowed list
            monitor.updateAllowedApplications([currentApp.applicationName]);
            const matchResult2 = monitor.checkApplicationMatch(currentApp.applicationName, currentApp.executablePath);
            console.log(`   Match with app in allowed list: ${JSON.stringify(matchResult2)}\n`);
        }

        // Test 4: Start monitoring with limited allowed apps
        console.log('4. Testing monitoring with limited allowed apps...');
        const allowedApps = ['notepad', 'calculator']; // Very restrictive list
        const monitoringStarted = monitor.startMonitoring(allowedApps);
        console.log(`   Monitoring started: ${monitoringStarted}`);

        if (monitoringStarted) {
            console.log('   Monitoring for 10 seconds...');
            console.log('   Try switching between applications to test violation detection\n');

            // Monitor for 10 seconds
            await new Promise(resolve => setTimeout(resolve, 10000));

            // Test 5: Get monitoring status
            console.log('5. Getting monitoring status...');
            const status = monitor.getMonitoringStatus();
            console.log(`   Is monitoring: ${status.isMonitoring}`);
            console.log(`   Allowed apps: ${status.allowedApplications.join(', ')}`);
            console.log(`   Current violation: ${status.currentViolation ? status.currentViolation.applicationName : 'None'}\n`);

            // Test 6: Stop monitoring
            console.log('6. Stopping monitoring...');
            monitor.stopMonitoring();
        }

        // Test 7: Service test
        console.log('7. Running service self-test...');
        const testResults = await monitor.testService();
        console.log('   Test results:', JSON.stringify(testResults, null, 2));

    } catch (error) {
        console.error('Test failed:', error);
    } finally {
        // Cleanup
        console.log('\n8. Cleaning up...');
        monitor.cleanup();
        console.log('✓ Cleanup completed');
    }

    console.log('\n=== Test Complete ===');
}

// Run the test
if (require.main === module) {
    testWindowsMonitorService().catch(console.error);
}

module.exports = testWindowsMonitorService;