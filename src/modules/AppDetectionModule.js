const { EventEmitter } = require('events');
const psList = require('ps-list').default;
const activeWin = require('active-win');

/**
 * App Detection Module - Core Module for AI-Powered Cheating Detection System
 * 
 * This module provides:
 * - Real-time process monitoring (USER APPLICATIONS ONLY)
 * - Active window detection
 * - Cross-platform compatibility
 * - Event-driven architecture for real-time updates
 * - Modular design for future extensions
 * - System process filtering for focused cheating detection
 */
class AppDetectionModule extends EventEmitter {
    constructor(options = {}) {
        super();
        
        // Configuration options
        this.config = {
            pollingInterval: options.pollingInterval || 2000, // 2 seconds default
            maxProcesses: options.maxProcesses || 100, // Focus on user apps only
            enableProcessMonitoring: options.enableProcessMonitoring !== false,
            enableWindowMonitoring: options.enableWindowMonitoring !== false,
            enableDataLogging: options.enableDataLogging !== false,
            filterSystemProcesses: options.filterSystemProcesses !== false, // NEW: Filter system processes
            focusOnUserApps: options.focusOnUserApps !== false, // NEW: Focus on user applications
            debugMode: options.debugMode || false, // NEW: Debug mode for troubleshooting
            ...options
        };
        
        // Internal state
        this.isRunning = false;
        this.monitoringInterval = null;
        this.lastProcessList = [];
        this.lastActiveWindow = null;
        this.processHistory = [];
        this.windowHistory = [];
        this.isMonitoringCycleRunning = false; // NEW: Prevent race conditions
        
        // Statistics
        this.stats = {
            startTime: null,
            totalProcessesDetected: 0,
            totalUserAppsDetected: 0, // NEW: Track user apps separately
            totalSystemProcessesFiltered: 0, // NEW: Track filtered processes
            uniqueApplications: 0, // NEW: Track unique applications
            totalWindowChanges: 0,
            lastUpdate: null
        };
        
        // System process patterns to filter out (Windows focus)
        this.systemProcessPatterns = [
            // Windows System Processes
            'svchost.exe', 'lsass.exe', 'winlogon.exe', 'csrss.exe', 'wininit.exe',
            'services.exe', 'spoolsv.exe', 'dwm.exe', 'explorer.exe', 'taskmgr.exe',
            'rundll32.exe', 'regsvr32.exe', 'msiexec.exe', 'wuauserv.exe', 'spoolsv.exe',
            
            // Windows Defender
            'MsMpEng.exe', 'SecurityHealthService.exe', 'SecurityHealthSystray.exe',
            
            // Windows Update
            'wuauserv.exe', 'bits.exe', 'usosvc.exe', 'TrustedInstaller.exe',
            
            // System Services
            'SearchHost.exe', 'SearchIndexer.exe', 'SearchProtocolHost.exe',
            'RuntimeBroker.exe', 'ApplicationFrameHost.exe', 'ShellExperienceHost.exe',
            'StartMenuExperienceHost.exe', 'Taskmgr.exe', 'conhost.exe',
            
            // Background Tasks
            'backgroundTaskHost.exe', 'WmiPrvSE.exe', 'svchost.exe',
            
            // Common System Extensions
            'dllhost.exe', 'ctfmon.exe', 'hkcmd.exe', 'igfxpers.exe',
            
            // Development Tools (can be enabled/disabled)
            'node.exe', 'npm.exe', 'git.exe', 'code.exe', 'cursor.exe'
        ];
        
        // User application categories that could be used for cheating
        this.userAppCategories = {
            // Communication Apps
            communication: ['discord.exe', 'teams.exe', 'skype.exe', 'zoom.exe', 'whatsapp.exe', 'telegram.exe'],
            
            // Web Browsers
            browsers: ['chrome.exe', 'firefox.exe', 'edge.exe', 'opera.exe', 'brave.exe', 'safari.exe'],
            
            // Social Media
            social: ['facebook.exe', 'instagram.exe', 'twitter.exe', 'linkedin.exe', 'snapchat.exe'],
            
            // File Sharing
            fileSharing: ['dropbox.exe', 'onedrive.exe', 'google drive.exe', 'mega.exe', 'wechat.exe'],
            
            // Remote Access
            remoteAccess: ['teamviewer.exe', 'anydesk.exe', 'vnc.exe', 'rdp.exe', 'ultraviewer.exe'],
            
            // Screen Recording/Sharing
            screenTools: ['obs.exe', 'bandicam.exe', 'fraps.exe', 'camtasia.exe', 'screencast.exe'],
            
            // Messaging Apps
            messaging: ['slack.exe', 'discord.exe', 'telegram.exe', 'whatsapp.exe', 'signal.exe'],
            
            // Cloud Storage
            cloudStorage: ['dropbox.exe', 'onedrive.exe', 'google drive.exe', 'icloud.exe', 'box.exe']
        };
        
        // Whitelist of applications to monitor (only these will be shown)
        this.appWhitelist = [
            // Your actual applications - Main processes only
            'opera.exe', 'githubdesktop.exe', 'cursor.exe', 'whatsapp.exe',
            
            // Common cheating applications - Main processes only
            'discord.exe', 'teams.exe', 'skype.exe', 'zoom.exe', 'telegram.exe',
            'chrome.exe', 'firefox.exe', 'edge.exe', 'brave.exe',
            'teamviewer.exe', 'anydesk.exe', 'obs.exe', 'bandicam.exe',
            'slack.exe', 'dropbox.exe', 'onedrive.exe'
        ];
        
        // Process deduplication - Group similar processes
        this.processGroups = {
            'opera.exe': 'Opera Browser',
            'githubdesktop.exe': 'GitHub Desktop',
            'cursor.exe': 'Cursor Editor',
            'whatsapp.exe': 'WhatsApp',
            'discord.exe': 'Discord',
            'teams.exe': 'Microsoft Teams',
            'skype.exe': 'Skype',
            'zoom.exe': 'Zoom',
            'chrome.exe': 'Google Chrome',
            'firefox.exe': 'Firefox',
            'edge.exe': 'Microsoft Edge',
            'brave.exe': 'Brave Browser',
            'teamviewer.exe': 'TeamViewer',
            'anydesk.exe': 'AnyDesk',
            'obs.exe': 'OBS Studio',
            'bandicam.exe': 'Bandicam',
            'slack.exe': 'Slack',
            'dropbox.exe': 'Dropbox',
            'onedrive.exe': 'OneDrive'
        };
        
        // Bind methods to preserve context
        this.startMonitoring = this.startMonitoring.bind(this);
        this.stopMonitoring = this.stopMonitoring.bind(this);
        this.getRunningProcesses = this.getRunningProcesses.bind(this);
        this.getActiveWindow = this.getActiveWindow.bind(this);
        this.updateProcessList = this.updateProcessList.bind(this);
        this.updateActiveWindow = this.updateActiveWindow.bind(this);
        this.filterUserApplications = this.filterUserApplications.bind(this);
        this.categorizeApplication = this.categorizeApplication.bind(this);
        
        console.log('🔍 App Detection Module initialized with config:', this.config);
        console.log('🎯 Focus: User Applications Only (System processes filtered out)');
    }
    
    /**
     * Start the monitoring system
     */
    async startMonitoring() {
        if (this.isRunning) {
            console.log('⚠️ Monitoring is already running');
            return;
        }
        
        try {
            console.log('🚀 Starting App Detection Monitoring...');
            
            // Reset state
            this.lastProcessList = [];
            this.lastActiveWindow = null;
            this.isMonitoringCycleRunning = false;
            
            // Initialize first data collection
            await this.updateProcessList();
            await this.updateActiveWindow();
            
            // Start periodic monitoring with better timing control
            this.monitoringInterval = setInterval(async () => {
                // Prevent race conditions with better timing
                if (!this.isMonitoringCycleRunning) {
                    // Add small delay to ensure previous cycle is complete
                    setTimeout(() => {
                        if (!this.isMonitoringCycleRunning) {
                            this.performMonitoringCycle();
                        }
                    }, 100);
                }
            }, this.config.pollingInterval);
            
            this.isRunning = true;
            this.stats.startTime = new Date();
            
            // Emit start event
            this.emit('monitoringStarted', {
                timestamp: new Date(),
                config: this.config,
                stats: this.stats
            });
            
            console.log('✅ App Detection Monitoring started successfully');
            
        } catch (error) {
            console.error('❌ Failed to start monitoring:', error);
            this.emit('error', error);
        }
    }
    
    /**
     * Stop the monitoring system
     */
    stopMonitoring() {
        if (!this.isRunning) {
            console.log('⚠️ Monitoring is not running');
            return;
        }
        
        console.log('🛑 Stopping App Detection Monitoring...');
        
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
        }
        
        this.isRunning = false;
        
        // Emit stop event
        this.emit('monitoringStopped', {
            timestamp: new Date(),
            stats: this.stats
        });
        
        console.log('✅ App Detection Monitoring stopped');
    }
    
    /**
     * Perform a complete monitoring cycle (with enhanced race condition protection)
     */
    async performMonitoringCycle() {
        if (this.isMonitoringCycleRunning) {
            console.log('⚠️ Skipping monitoring cycle - previous cycle still running');
            return; // Skip if already running
        }
        
        this.isMonitoringCycleRunning = true;
        
        try {
            const cycleStart = Date.now();
            
            // Update process list with error handling
            if (this.config.enableProcessMonitoring) {
                try {
                    await this.updateProcessList();
                } catch (error) {
                    console.error('❌ Error updating process list:', error);
                    this.emit('error', error);
                }
            }
            
            // Update active window with error handling
            if (this.config.enableWindowMonitoring) {
                try {
                    await this.updateActiveWindow();
                } catch (error) {
                    console.error('❌ Error updating active window:', error);
                    this.emit('error', error);
                }
            }
            
            // Update statistics
            this.stats.lastUpdate = new Date();
            
            // Emit cycle complete event
            this.emit('monitoringCycleComplete', {
                timestamp: new Date(),
                cycleDuration: Date.now() - cycleStart,
                stats: this.stats
            });
            
        } catch (error) {
            console.error('❌ Error in monitoring cycle:', error);
            this.emit('error', error);
        } finally {
            // Ensure we always reset the flag
            this.isMonitoringCycleRunning = false;
        }
    }
    
    /**
     * Filter out system processes and focus on user applications
     */
    filterUserApplications(processes) {
        if (!this.config.filterSystemProcesses) {
            return processes; // Return all if filtering is disabled
        }
        
        const userApps = [];
        const uniqueApps = new Set(); // Track unique applications
        let systemProcessesFiltered = 0;
        
        if (this.config.debugMode) {
            console.log(`🔍 Debug: Processing ${processes.length} total processes`);
        }
        
        for (const process of processes) {
            const processName = process.name.toLowerCase();
            
            // Check if it's in our whitelist (only show these apps)
            const isWhitelisted = this.appWhitelist.some(app => 
                processName.includes(app.toLowerCase())
            );
            
            if (isWhitelisted) {
                // Find the base application name
                const baseApp = this.appWhitelist.find(app => 
                    processName.includes(app.toLowerCase())
                );
                
                if (baseApp) {
                    uniqueApps.add(baseApp);
                    
                    // Categorize the user application
                    const category = this.categorizeApplication(processName);
                    userApps.push({
                        ...process,
                        baseApp: baseApp,
                        displayName: this.processGroups[baseApp] || baseApp,
                        category: category,
                        isPotentialCheatingApp: this.isPotentialCheatingApp(processName, category)
                    });
                    
                    if (this.config.debugMode) {
                        console.log(`✅ Debug: Whitelisted app: ${process.name} (${baseApp}) - PID: ${process.pid}`);
                    }
                }
            } else {
                systemProcessesFiltered++;
                if (this.config.debugMode) {
                    console.log(`🔒 Debug: Filtered out: ${process.name} (PID: ${process.pid})`);
                }
            }
        }
        
        this.stats.totalSystemProcessesFiltered = systemProcessesFiltered;
        this.stats.uniqueApplications = uniqueApps.size; // Track unique app count
        
        if (this.config.debugMode) {
            console.log(`🔍 Debug: Filtering complete - ${uniqueApps.size} unique apps, ${userApps.length} total processes, ${systemProcessesFiltered} processes filtered`);
            console.log(`🔍 Debug: Unique apps: ${Array.from(uniqueApps).join(', ')}`);
        }
        
        return userApps;
    }
    
    /**
     * Enhanced system process detection - Much stricter filtering
     */
    isSystemProcess(processName, process) {
        // Check against known system process patterns
        const isKnownSystemProcess = this.systemProcessPatterns.some(pattern => 
            processName.includes(pattern.toLowerCase())
        );
        
        if (isKnownSystemProcess) return true;
        
        // Check for Windows system paths - Much stricter
        if (process.path) {
            const processPath = process.path.toLowerCase();
            const systemPaths = [
                '\\windows\\',
                '\\system32\\',
                '\\syswow64\\',
                '\\program files\\',
                '\\program files (x86)\\',
                '\\windows.old\\',
                '\\programdata\\',
                '\\users\\default\\',
                '\\users\\public\\'
            ];
            
            if (systemPaths.some(path => processPath.includes(path))) {
                return true;
            }
        }
        
        // Much stricter system-like process patterns
        const strictSystemPatterns = [
            // Core Windows processes
            'system', 'svchost', 'lsass', 'winlogon', 'csrss', 'wininit',
            'services', 'spoolsv', 'dwm', 'explorer', 'taskmgr', 'rundll32',
            'regsvr32', 'msiexec', 'wuauserv', 'search', 'runtime', 'background',
            'shell', 'start', 'conhost', 'dllhost', 'ctfmon', 'hkcmd', 'igfxpers',
            'intel', 'lenovo', 'microsoft', 'windows', 'update', 'defender',
            'security', 'health', 'service', 'host', 'broker', 'experience',
            
            // Additional strict patterns
            'registry', 'smss', 'lsaiso', 'memory compression', 'dax3api',
            'ipfsvc', 'lnbitssvc', 'ipf_uf', 'erlsrv', 'pg_ctl', 'mysqld',
            'mongod', 'sqlwriter', 'erl', 'epmd', 'postgres', 'wlanext',
            'win32sysinfo', 'vmcompute', 'nissrv', 'ipf_helper', 'fnhotkey',
            'automodetect', 'crossdevice', 'widgets', 'qshelper', 'filecoauth',
            'spotifywidgetprovider', 'crashpad_handler', 'appactions', 'stremio',
            'qtwebengineprocess', 'wmiapsrv', 'sppsvc', 'msedgewebview2',
            'officeclicktorun', 'appvshnotify', 'lockapp', 'sdxhelper',
            'unsecapp', 'monotificationux', 'opera_crashreporter', 'fastlist'
        ];
        
        // Check for exact matches or very close matches
        return strictSystemPatterns.some(pattern => {
            const lowerPattern = pattern.toLowerCase();
            return processName === lowerPattern || 
                   processName.includes(lowerPattern) ||
                   lowerPattern.includes(processName);
        });
    }
    
    /**
     * Categorize application based on its name
     */
    categorizeApplication(processName) {
        for (const [category, apps] of Object.entries(this.userAppCategories)) {
            if (apps.some(app => processName.includes(app.toLowerCase()))) {
                return category;
            }
        }
        return 'other'; // Uncategorized user application
    }
    
    /**
     * Determine if an application could be used for cheating
     */
    isPotentialCheatingApp(processName, category) {
        const highRiskCategories = ['communication', 'social', 'fileSharing', 'remoteAccess', 'screenTools'];
        const highRiskApps = ['discord.exe', 'teams.exe', 'whatsapp.exe', 'telegram.exe', 'teamviewer.exe', 'obs.exe'];
        
        return highRiskCategories.includes(category) || 
               highRiskApps.some(app => processName.includes(app.toLowerCase()));
    }
    
    /**
     * Get current running processes (filtered for user applications)
     */
    async getRunningProcesses() {
        try {
            const allProcesses = await psList();
            
            // Filter for user applications only
            let userProcesses = this.filterUserApplications(allProcesses);
            
            // Limit processes if needed
            if (this.config.maxProcesses && userProcesses.length > this.config.maxProcesses) {
                userProcesses = userProcesses.slice(0, this.config.maxProcesses);
            }
            
            // Update statistics
            this.stats.totalUserAppsDetected = userProcesses.length;
            
            // Format process data with cheating risk assessment
            const formattedProcesses = userProcesses.map(process => ({
                pid: process.pid,
                name: process.name,
                command: process.cmd,
                cpu: process.cpu,
                memory: process.memory,
                platform: process.platform,
                category: process.category || 'unknown',
                isPotentialCheatingApp: process.isPotentialCheatingApp || false,
                riskLevel: this.assessRiskLevel(process),
                timestamp: new Date()
            }));
            
            return formattedProcesses;
            
        } catch (error) {
            console.error('❌ Error getting running processes:', error);
            throw error;
        }
    }
    
    /**
     * Assess risk level of an application
     */
    assessRiskLevel(process) {
        if (process.isPotentialCheatingApp) {
            return 'high';
        }
        
        const category = process.category;
        if (['communication', 'social', 'fileSharing'].includes(category)) {
            return 'medium';
        }
        
        return 'low';
    }
    
    /**
     * Get currently active window
     */
    async getActiveWindow() {
        try {
            const activeWindow = await activeWin();
            
            if (!activeWindow) {
                return null;
            }
            
            // Format window data
            const formattedWindow = {
                title: activeWindow.title,
                app: activeWindow.owner.name,
                path: activeWindow.owner.path,
                pid: activeWindow.owner.pid,
                platform: process.platform,
                timestamp: new Date()
            };
            
            return formattedWindow;
            
        } catch (error) {
            console.error('❌ Error getting active window:', error);
            throw error;
        }
    }
    
    /**
     * Update process list and detect changes (user apps only)
     */
    async updateProcessList() {
        try {
            const currentProcesses = await this.getRunningProcesses();
            
            // Validate data before processing
            if (!Array.isArray(currentProcesses)) {
                console.warn('⚠️ Invalid process data received, skipping update');
                return;
            }
            
            // Ensure we have valid processes
            const validProcesses = currentProcesses.filter(process => 
                process && process.pid && process.name
            );
            
            if (validProcesses.length === 0) {
                console.warn('⚠️ No valid processes found, skipping update');
                return;
            }
            
            // Detect new processes
            const newProcesses = validProcesses.filter(current => 
                !this.lastProcessList.some(last => last.pid === current.pid)
            );
            
            // Detect terminated processes
            const terminatedProcesses = this.lastProcessList.filter(last => 
                !validProcesses.some(current => current.pid === last.pid)
            );
            
            // Update internal state only if we have valid data
            this.lastProcessList = validProcesses;
            this.stats.totalProcessesDetected = validProcesses.length;
            
            // Store in history if logging is enabled
            if (this.config.enableDataLogging) {
                this.processHistory.push({
                    timestamp: new Date(),
                    processes: validProcesses,
                    newProcesses,
                    terminatedProcesses,
                    systemProcessesFiltered: this.stats.totalSystemProcessesFiltered
                });
                
                // Keep only last 100 entries to prevent memory issues
                if (this.processHistory.length > 100) {
                    this.processHistory.shift();
                }
            }
            
            // Emit events for changes
            if (newProcesses.length > 0) {
                this.emit('newProcessesDetected', {
                    timestamp: new Date(),
                    processes: newProcesses,
                    totalProcesses: validProcesses.length,
                    systemProcessesFiltered: this.stats.totalSystemProcessesFiltered,
                    uniqueApplications: this.stats.uniqueApplications
                });
            }
            
            if (terminatedProcesses.length > 0) {
                this.emit('processesTerminated', {
                    timestamp: new Date(),
                    processes: terminatedProcesses,
                    totalProcesses: validProcesses.length,
                    systemProcessesFiltered: this.stats.totalSystemProcessesFiltered
                });
            }
            
            // Emit process list update with validated data
            this.emit('processListUpdated', {
                timestamp: new Date(),
                processes: validProcesses,
                newProcesses,
                terminatedProcesses,
                totalProcesses: validProcesses.length,
                totalUserApps: this.stats.totalUserAppsDetected,
                systemProcessesFiltered: this.stats.totalSystemProcessesFiltered,
                uniqueApplications: this.stats.uniqueApplications
            });
            
        } catch (error) {
            console.error('❌ Error updating process list:', error);
            this.emit('error', error);
        }
    }
    
    /**
     * Update active window and detect changes
     */
    async updateActiveWindow() {
        try {
            const currentWindow = await this.getActiveWindow();
            
            // Check if window changed
            const windowChanged = !this.lastActiveWindow || 
                (this.lastActiveWindow.title !== currentWindow?.title ||
                 this.lastActiveWindow.app !== currentWindow?.app);
            
            if (windowChanged && currentWindow) {
                this.stats.totalWindowChanges++;
                
                // Store in history if logging is enabled
                if (this.config.enableDataLogging) {
                    this.windowHistory.push({
                        timestamp: new Date(),
                        window: currentWindow
                    });
                    
                    // Keep only last 100 entries
                    if (this.windowHistory.length > 100) {
                        this.windowHistory.shift();
                    }
                }
                
                // Emit window change event
                this.emit('activeWindowChanged', {
                    timestamp: new Date(),
                    previousWindow: this.lastActiveWindow,
                    currentWindow: currentWindow,
                    totalChanges: this.stats.totalWindowChanges
                });
            }
            
            // Update internal state
            this.lastActiveWindow = currentWindow;
            
            // Emit window update event
            this.emit('activeWindowUpdated', {
                timestamp: new Date(),
                window: currentWindow,
                changed: windowChanged
            });
            
        } catch (error) {
            console.error('❌ Error updating active window:', error);
            this.emit('error', error);
        }
    }
    
    /**
     * Get current system status
     */
    getSystemStatus() {
        return {
            isRunning: this.isRunning,
            config: this.config,
            stats: this.stats,
            currentProcesses: this.lastProcessList.length,
            currentActiveWindow: this.lastActiveWindow,
            processHistoryLength: this.processHistory.length,
            windowHistoryLength: this.windowHistory.length,
            systemProcessesFiltered: this.stats.totalSystemProcessesFiltered
        };
    }
    
    /**
     * Get process history (if logging enabled)
     */
    getProcessHistory() {
        if (!this.config.enableDataLogging) {
            return [];
        }
        return [...this.processHistory];
    }
    
    /**
     * Get window history (if logging enabled)
     */
    getWindowHistory() {
        if (!this.config.enableDataLogging) {
            return [];
        }
        return [...this.windowHistory];
    }
    
    /**
     * Get real-time data snapshot (user apps only)
     */
    async getDataSnapshot() {
        try {
            const [processes, activeWindow] = await Promise.all([
                this.getRunningProcesses(),
                this.getActiveWindow()
            ]);
            
            return {
                timestamp: new Date(),
                processes: {
                    total: processes.length,
                    list: processes.slice(0, 10), // Return first 10 for performance
                    systemProcessesFiltered: this.stats.totalSystemProcessesFiltered
                },
                activeWindow: activeWindow,
                systemStatus: this.getSystemStatus()
            };
            
        } catch (error) {
            console.error('❌ Error getting data snapshot:', error);
            throw error;
        }
    }
    
    /**
     * Clean up resources
     */
    destroy() {
        this.stopMonitoring();
        this.removeAllListeners();
        console.log('🧹 App Detection Module destroyed');
    }
}

module.exports = AppDetectionModule;
