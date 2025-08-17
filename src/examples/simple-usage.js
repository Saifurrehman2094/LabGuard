const AppDetectionModule = require('../modules/AppDetectionModule');

/**
 * Simple Usage Example - Basic demonstration of the Enhanced App Detection Module
 * 
 * This example shows:
 * - Basic initialization with system process filtering
 * - Simple event handling for user applications only
 * - Data collection with cheating risk assessment
 * - Clean shutdown
 */
async function simpleUsageExample() {
    console.log('🚀 Enhanced Simple Usage Example Starting...\n');
    
    // Create an instance of the Enhanced App Detection Module
    const appDetection = new AppDetectionModule({
        pollingInterval: 5000,        // Check every 5 seconds
        maxProcesses: 30,             // Focus on user apps only (reduced from 200)
        enableProcessMonitoring: true,
        enableWindowMonitoring: true,
        enableDataLogging: false,     // Disable logging for simple example
        filterSystemProcesses: true,  // NEW: Filter out system processes
        focusOnUserApps: true         // NEW: Focus on user applications
    });
    
    // Set up basic event listeners
    appDetection.on('processListUpdated', (data) => {
        console.log(`📊 User Apps: ${data.totalUserApps} (${data.systemProcessesFiltered} system processes filtered)`);
    });
    
    appDetection.on('newProcessesDetected', (data) => {
        console.log(`🆕 New Apps: ${data.processes.length} detected`);
        data.processes.forEach(process => {
            const riskIcon = process.isPotentialCheatingApp ? '🚨' : '✅';
            console.log(`   ${riskIcon} ${process.name} - Risk: ${process.riskLevel}`);
        });
    });
    
    appDetection.on('activeWindowChanged', (data) => {
        console.log(`🪟 Active window: ${data.currentWindow.app}`);
    });
    
    appDetection.on('error', (error) => {
        console.error('❌ Error occurred:', error.message);
    });
    
    try {
        // Start monitoring
        console.log('🚀 Starting Enhanced App Detection Monitoring...');
        await appDetection.startMonitoring();
        console.log('✅ Enhanced App Detection Monitoring started successfully');
        console.log('⏰ Monitoring will run for 20 seconds...\n');
        
        // Let it run for 20 seconds
        await new Promise(resolve => setTimeout(resolve, 20000));
        
        // Get a data snapshot
        console.log('\n📸 Getting Enhanced Data Snapshot...');
        const snapshot = await appDetection.getDataSnapshot();
        
        console.log('\n📊 Enhanced System Status:');
        console.log(`- User Applications: ${snapshot.processes.total}`);
        console.log(`- System Processes Filtered: ${snapshot.processes.systemProcessesFiltered}`);
        console.log(`- Active Window: ${snapshot.activeWindow.app}`);
        console.log(`- Window Title: ${snapshot.activeWindow.title}`);
        
        // Stop monitoring
        console.log('\n🛑 Stopping monitoring...');
        appDetection.stopMonitoring();
        
        console.log('✅ Example completed successfully!');
        
    } catch (error) {
        console.error('❌ Example failed:', error.message);
    } finally {
        // Clean up
        appDetection.destroy();
    }
}

// Run the enhanced example
simpleUsageExample().catch(console.error);
