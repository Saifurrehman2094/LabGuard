const { ipcRenderer } = require('electron');

/**
 * Renderer Process Script for App Detection Module UI
 * 
 * This script handles:
 * - UI interactions and updates
 * - Communication with main process via IPC
 * - Real-time data display
 * - Event handling and logging
 */

class AppDetectionUI {
    constructor() {
        this.isMonitoring = false;
        this.monitoringStartTime = null;
        this.updateInterval = null;
        
        this.initializeElements();
        this.setupEventListeners();
        this.setupIPCEventListeners();
        
        console.log('🎨 App Detection UI initialized');
    }
    
    /**
     * Initialize DOM elements
     */
    initializeElements() {
        // Control buttons
        this.startBtn = document.getElementById('startBtn');
        this.stopBtn = document.getElementById('stopBtn');
        this.refreshBtn = document.getElementById('refreshBtn');
        
        // Status indicators
        this.statusIndicator = this.startBtn.querySelector('.status-indicator');
        
        // Statistics elements
        this.totalProcessesEl = document.getElementById('totalProcesses');
        this.systemProcessesFilteredEl = document.getElementById('systemProcessesFiltered');
        this.windowChangesEl = document.getElementById('windowChanges');
        this.monitoringTimeEl = document.getElementById('monitoringTime');
        this.lastUpdateEl = document.getElementById('lastUpdate');
        
        // Data display elements
        this.activeWindowInfo = document.getElementById('activeWindowInfo');
        this.processList = document.getElementById('processList');
        this.activityLog = document.getElementById('activityLog');
    }
    
    /**
     * Set up event listeners for UI interactions
     */
    setupEventListeners() {
        // Start monitoring button
        this.startBtn.addEventListener('click', async () => {
            await this.startMonitoring();
        });
        
        // Stop monitoring button
        this.stopBtn.addEventListener('click', async () => {
            await this.stopMonitoring();
        });
        
        // Refresh data button
        this.refreshBtn.addEventListener('click', async () => {
            await this.refreshData();
        });
    }
    
    /**
     * Set up IPC event listeners for communication with main process
     */
    setupIPCEventListeners() {
        // Monitoring lifecycle events
        ipcRenderer.on('monitoringStarted', (event, data) => {
            this.onMonitoringStarted(data);
        });
        
        ipcRenderer.on('monitoringStopped', (event, data) => {
            this.onMonitoringStopped(data);
        });
        
        // Process monitoring events
        ipcRenderer.on('processListUpdated', (event, data) => {
            this.onProcessListUpdated(data);
        });
        
        ipcRenderer.on('newProcessesDetected', (event, data) => {
            this.onNewProcessesDetected(data);
        });
        
        ipcRenderer.on('processesTerminated', (event, data) => {
            this.onProcessesTerminated(data);
        });
        
        // Window monitoring events
        ipcRenderer.on('activeWindowChanged', (event, data) => {
            this.onActiveWindowChanged(data);
        });
        
        ipcRenderer.on('activeWindowUpdated', (event, data) => {
            this.onActiveWindowUpdated(data);
        });
        
        // Monitoring cycle events
        ipcRenderer.on('monitoringCycleComplete', (event, data) => {
            this.onMonitoringCycleComplete(data);
        });
        
        // Error events
        ipcRenderer.on('error', (event, data) => {
            this.onError(data);
        });
    }
    
    /**
     * Start monitoring
     */
    async startMonitoring() {
        try {
            this.startBtn.disabled = true;
            this.logActivity('Starting monitoring...', 'info');
            
            const result = await ipcRenderer.invoke('startMonitoring');
            
            if (result.success) {
                this.logActivity('Monitoring started successfully', 'success');
                this.isMonitoring = true;
                this.monitoringStartTime = Date.now();
                this.updateButtonStates();
                this.startUpdateTimer();
            } else {
                this.logActivity(`Failed to start monitoring: ${result.message}`, 'error');
            }
            
        } catch (error) {
            this.logActivity(`Error starting monitoring: ${error.message}`, 'error');
        } finally {
            this.startBtn.disabled = false;
        }
    }
    
    /**
     * Stop monitoring
     */
    async stopMonitoring() {
        try {
            this.stopBtn.disabled = true;
            this.logActivity('Stopping monitoring...', 'info');
            
            const result = await ipcRenderer.invoke('stopMonitoring');
            
            if (result.success) {
                this.logActivity('Monitoring stopped successfully', 'success');
                this.isMonitoring = false;
                this.updateButtonStates();
                this.stopUpdateTimer();
            } else {
                this.logActivity(`Failed to stop monitoring: ${result.message}`, 'error');
            }
            
        } catch (error) {
            this.logActivity(`Error stopping monitoring: ${error.message}`, 'error');
        } finally {
            this.stopBtn.disabled = false;
        }
    }
    
    /**
     * Refresh data manually
     */
    async refreshData() {
        try {
            this.refreshBtn.disabled = true;
            this.logActivity('Refreshing data...', 'info');
            
            await this.updateDisplayData();
            
        } catch (error) {
            this.logActivity(`Error refreshing data: ${error.message}`, 'error');
        } finally {
            this.refreshBtn.disabled = false;
        }
    }
    
    /**
     * Update button states based on monitoring status
     */
    updateButtonStates() {
        if (this.isMonitoring) {
            this.startBtn.disabled = true;
            this.stopBtn.disabled = false;
            this.statusIndicator.className = 'status-indicator status-active';
        } else {
            this.startBtn.disabled = false;
            this.stopBtn.disabled = true;
            this.statusIndicator.className = 'status-indicator status-inactive';
        }
    }
    
    /**
     * Start the update timer for real-time updates
     */
    startUpdateTimer() {
        this.updateInterval = setInterval(() => {
            this.updateDisplayData();
        }, 5000); // Update every 5 seconds
    }
    
    /**
     * Stop the update timer
     */
    stopUpdateTimer() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
    }
    
    /**
     * Update display data from main process
     */
    async updateDisplayData() {
        try {
            const [snapshot, status] = await Promise.all([
                ipcRenderer.invoke('getDataSnapshot'),
                ipcRenderer.invoke('getSystemStatus')
            ]);
            
            if (snapshot) {
                this.updateProcessList(snapshot.processes.list);
                this.updateActiveWindow(snapshot.activeWindow);
            }
            
            if (status) {
                this.updateStatistics(status);
            }
            
        } catch (error) {
            console.error('Error updating display data:', error);
        }
    }
    
    /**
     * Update process list display
     */
    updateProcessList(processes) {
        if (!processes || processes.length === 0) {
            this.processList.innerHTML = '<div class="loading"><p>No processes found</p></div>';
            return;
        }
        
        const processHtml = processes.map(process => {
            // Determine risk level styling and icon
            let riskIcon = '';
            let riskClass = '';
            if (process.isPotentialCheatingApp) {
                riskIcon = '🚨';
                riskClass = 'high-risk';
            } else if (process.riskLevel === 'medium') {
                riskIcon = '⚠️';
                riskClass = 'medium-risk';
            } else {
                riskIcon = '✅';
                riskClass = 'low-risk';
            }
            
            return `
                <div class="process-item ${riskClass}">
                    <div class="process-info">
                        <div class="process-name">
                            ${riskIcon} ${this.escapeHtml(process.name)}
                            <span class="process-category">${process.category || 'unknown'}</span>
                        </div>
                        <div class="process-details">
                            PID: ${process.pid} | Memory: ${this.formatBytes(process.memory || 0)} | CPU: ${process.cpu || 'N/A'}% | Risk: ${process.riskLevel || 'low'}
                        </div>
                    </div>
                    <div class="process-pid ${riskClass}">${process.pid}</div>
                </div>
            `;
        }).join('');
        
        this.processList.innerHTML = processHtml;
    }
    
    /**
     * Update active window display
     */
    updateActiveWindow(window) {
        if (!window) {
            this.activeWindowInfo.innerHTML = `
                <div class="window-app">No Active Window</div>
                <div class="window-title">No window is currently active</div>
                <div class="window-pid">-</div>
            `;
            return;
        }
        
        this.activeWindowInfo.innerHTML = `
            <div class="window-app">${this.escapeHtml(window.app)}</div>
            <div class="window-title">${this.escapeHtml(window.title)}</div>
            <div class="window-pid">PID: ${window.pid}</div>
        `;
    }
    
    /**
     * Update statistics display with validation
     */
    updateStatistics(status) {
        // Validate status data
        if (!status || typeof status !== 'object') {
            console.warn('⚠️ Invalid status data received, skipping statistics update');
            return;
        }
        
        // Update user applications count with validation
        if (this.totalProcessesEl) {
            const processCount = status.currentProcesses;
            if (typeof processCount === 'number' && processCount >= 0) {
                this.totalProcessesEl.textContent = processCount;
            } else {
                console.warn('⚠️ Invalid process count:', processCount);
            }
        }
        
        // Update system processes filtered count with validation
        if (this.systemProcessesFilteredEl) {
            const filteredCount = status.systemProcessesFiltered;
            if (typeof filteredCount === 'number' && filteredCount >= 0) {
                this.systemProcessesFilteredEl.textContent = filteredCount;
            } else {
                console.warn('⚠️ Invalid filtered count:', filteredCount);
            }
        }
        
        // Update window changes count with validation
        if (this.windowChangesEl && status.stats && status.stats.totalWindowChanges) {
            const windowChanges = status.stats.totalWindowChanges;
            if (typeof windowChanges === 'number' && windowChanges >= 0) {
                this.windowChangesEl.textContent = windowChanges;
            }
        }
        
        // Update monitoring time
        if (this.monitoringTimeEl) {
            if (this.monitoringStartTime && status.isRunning) {
                const runtime = Math.floor((Date.now() - this.monitoringStartTime) / 1000);
                this.monitoringTimeEl.textContent = this.formatTime(runtime);
            } else {
                this.monitoringTimeEl.textContent = '-';
            }
        }
        
        // Update last update time
        if (this.lastUpdateEl && status.stats && status.stats.lastUpdate) {
            try {
                const lastUpdate = new Date(status.stats.lastUpdate);
                if (!isNaN(lastUpdate.getTime())) {
                    this.lastUpdateEl.textContent = lastUpdate.toLocaleTimeString();
                }
            } catch (error) {
                console.warn('⚠️ Invalid last update time:', error);
            }
        }
    }
    
    /**
     * Log activity to the activity log
     */
    logActivity(message, type = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        const logEntry = document.createElement('div');
        logEntry.className = 'log-entry';
        
        let typeClass = '';
        switch (type) {
            case 'success':
                typeClass = 'color: #4caf50;';
                break;
            case 'error':
                typeClass = 'color: #f44336;';
                break;
            case 'warning':
                typeClass = 'color: #ff9800;';
                break;
            default:
                typeClass = 'color: #2196f3;';
        }
        
        logEntry.innerHTML = `
            <div class="log-timestamp" style="${typeClass}">[${timestamp}] ${type.toUpperCase()}</div>
            <div class="log-message">${this.escapeHtml(message)}</div>
        `;
        
        this.activityLog.appendChild(logEntry);
        this.activityLog.scrollTop = this.activityLog.scrollHeight;
        
        // Keep only last 100 log entries
        while (this.activityLog.children.length > 100) {
            this.activityLog.removeChild(this.activityLog.firstChild);
        }
    }
    
    /**
     * Event handlers for IPC events
     */
    onMonitoringStarted(data) {
        this.logActivity('Monitoring started successfully', 'success');
        this.isMonitoring = true;
        this.monitoringStartTime = Date.now();
        this.updateButtonStates();
        this.startUpdateTimer();
    }
    
    onMonitoringStopped(data) {
        this.logActivity('Monitoring stopped', 'warning');
        this.isMonitoring = false;
        this.updateButtonStates();
        this.stopUpdateTimer();
    }
    
    onProcessListUpdated(data) {
        // Validate data before updating UI
        if (!data || !data.processes || !Array.isArray(data.processes)) {
            console.warn('⚠️ Invalid process data received, skipping UI update');
            return;
        }
        
        // Update process list display
        this.updateProcessList(data.processes);
        
        // Update unique applications count (more accurate than total processes)
        const uniqueAppCount = data.uniqueApplications || data.totalUserApps || data.totalProcesses || 0;
        if (this.totalProcessesEl && typeof uniqueAppCount === 'number' && uniqueAppCount >= 0) {
            this.totalProcessesEl.textContent = uniqueAppCount;
        }
        
        // Update system processes filtered count if available
        if (data.systemProcessesFiltered !== undefined && typeof data.systemProcessesFiltered === 'number') {
            const systemProcessesEl = document.getElementById('systemProcessesFiltered');
            if (systemProcessesEl) {
                systemProcessesEl.textContent = data.systemProcessesFiltered;
            }
        }
        
        // Log the update for debugging
        console.log(`📊 Process list updated: ${uniqueAppCount} unique apps, ${data.systemProcessesFiltered || 0} system processes filtered`);
    }
    
    onNewProcessesDetected(data) {
        this.logActivity(`New processes detected: ${data.processes.length}`, 'info');
    }
    
    onProcessesTerminated(data) {
        this.logActivity(`Processes terminated: ${data.processes.length}`, 'warning');
    }
    
    onActiveWindowChanged(data) {
        if (data.currentWindow) {
            this.logActivity(`Active window changed to: ${data.currentWindow.app}`, 'info');
            this.updateActiveWindow(data.currentWindow);
        }
    }
    
    onActiveWindowUpdated(data) {
        if (data.changed && data.window) {
            this.updateActiveWindow(data.window);
        }
    }
    
    onMonitoringCycleComplete(data) {
        // Update statistics periodically
        this.updateStatistics(data.stats);
    }
    
    onError(data) {
        this.logActivity(`Error: ${data.message}`, 'error');
    }
    
    /**
     * Utility functions
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    
    formatTime(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        
        if (hours > 0) {
            return `${hours}h ${minutes}m ${secs}s`;
        } else if (minutes > 0) {
            return `${minutes}m ${secs}s`;
        } else {
            return `${secs}s`;
        }
    }
}

// Initialize the UI when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.appDetectionUI = new AppDetectionUI();
});

// Handle page unload
window.addEventListener('beforeunload', () => {
    if (window.appDetectionUI) {
        window.appDetectionUI.stopUpdateTimer();
    }
});
