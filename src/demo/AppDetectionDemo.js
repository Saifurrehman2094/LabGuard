const AppDetectionModule = require('../modules/AppDetectionModule');

/**
 * App Detection Demo - Demonstrates the capabilities of the Enhanced App Detection Module
 * 
 * This demo shows:
 * - How to initialize and configure the module with system process filtering
 * - Real-time event handling for user applications only
 * - Data collection and monitoring with cheating risk assessment
 * - Cross-platform compatibility with focused monitoring
 */
class AppDetectionDemo {
    constructor() {
        console.log('🎯 Enhanced App Detection Demo Starting...\n');
        
        // Initialize the Enhanced App Detection Module with focused configuration
        this.appDetection = new AppDetectionModule({
            pollingInterval: 3000,        // Check every 3 seconds
            maxProcesses: 50,             // Focus on user apps only (reduced from 500)
            enableProcessMonitoring: true,
            enableWindowMonitoring: true,
            enableDataLogging: true,
            filterSystemProcesses: true,  // NEW: Filter out system processes
            focusOnUserApps: true         // NEW: Focus on user applications
        });
        
        this.setupEventListeners();
        this.runDemo();
    }
    
    /**
     * Set up event listeners for real-time monitoring
     */
    setupEventListeners() {
        // Process monitoring events
        this.appDetection.on('processListUpdated', (data) => {
            console.log(`📊 User Apps Updated: ${data.totalUserApps} apps (${data.systemProcessesFiltered} system processes filtered)`);
        });
        
        this.appDetection.on('newProcessesDetected', (data) => {
            console.log(`🆕 New User Apps: ${data.processes.length} apps detected`);
            data.processes.forEach(process => {
                const riskIcon = process.isPotentialCheatingApp ? '🚨' : '✅';
                console.log(`   ${riskIcon} ${process.name} (${process.category}) - Risk: ${process.riskLevel}`);
            });
        });
        
        this.appDetection.on('processesTerminated', (data) => {
            console.log(`❌ User Apps Terminated: ${data.processes.length} apps stopped`);
        });
        
        // Window monitoring events
        this.appDetection.on('activeWindowChanged', (data) => {
            console.log(`🪟 Active Window Changed: ${data.currentWindow.app} - "${data.currentWindow.title}"`);
        });
        
        // System events
        this.appDetection.on('monitoringStarted', () => {
            console.log('🚀 Enhanced Monitoring Started - Focus: User Applications Only');
        });
        
        this.appDetection.on('monitoringStopped', () => {
            console.log('🛑 Enhanced Monitoring Stopped');
        });
        
        this.appDetection.on('error', (error) => {
            console.error('❌ Error in Enhanced App Detection:', error.message);
        });
    }
    
    /**
     * Run the comprehensive demo
     */
    async runDemo() {
        try {
            console.log('🎬 Starting Enhanced App Detection Demo...\n');
            
            // Start monitoring
            await this.appDetection.startMonitoring();
            
            // Let it run for 30 seconds to demonstrate capabilities
            console.log('⏰ Enhanced monitoring will run for 30 seconds...\n');
            console.log('💡 Try opening/closing different applications to see real-time detection!\n');
            
            await new Promise(resolve => setTimeout(resolve, 30000));
            
            // Get final data snapshot
            console.log('\n📸 Getting Enhanced Data Snapshot...');
            const snapshot = await this.appDetection.getDataSnapshot();
            
            console.log('\n📊 Enhanced System Status:');
            console.log(`- User Applications Running: ${snapshot.processes.total}`);
            console.log(`- System Processes Filtered: ${snapshot.processes.systemProcessesFiltered}`);
            console.log(`- Active Window: ${snapshot.activeWindow.app}`);
            console.log(`- Window Title: ${snapshot.activeWindow.title}`);
            
            // Show sample of detected user applications
            if (snapshot.processes.list.length > 0) {
                console.log('\n🔍 Sample User Applications Detected:');
                snapshot.processes.list.forEach((process, index) => {
                    const riskIcon = process.isPotentialCheatingApp ? '🚨' : '✅';
                    console.log(`   ${index + 1}. ${riskIcon} ${process.name}`);
                    console.log(`      Category: ${process.category} | Risk: ${process.riskLevel}`);
                    console.log(`      PID: ${process.pid} | Memory: ${process.memory || 'N/A'}`);
                });
            }
            
            // Stop monitoring
            console.log('\n🛑 Stopping Enhanced Monitoring...');
            this.appDetection.stopMonitoring();
            
            // Cleanup
            this.appDetection.destroy();
            
            console.log('\n✅ Enhanced App Detection Demo completed successfully!');
            console.log('\n🎯 Key Improvements Demonstrated:');
            console.log('   • System processes filtered out (reduced noise)');
            console.log('   • Focus on user applications only');
            console.log('   • Cheating risk assessment for each app');
            console.log('   • Categorized application detection');
            console.log('   • Race condition prevention');
            console.log('   • More stable process counting');
            
        } catch (error) {
            console.error('❌ Enhanced Demo failed:', error.message);
            this.appDetection.destroy();
        }
    }
}

// Run the enhanced demo
new AppDetectionDemo();
