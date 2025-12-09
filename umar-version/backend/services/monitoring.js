const { exec } = require('child_process');
const { promisify } = require('util');
const DatabaseService = require('./database');

const execAsync = promisify(exec);

/**
 * MonitoringService - Monitors active applications during exam sessions
 * Uses Windows PowerShell commands to detect active windows and processes
 */
class MonitoringService {
  constructor(databaseService = null) {
    this.databaseService = databaseService || new DatabaseService();
    this.isMonitoring = false;
    this.monitoringInterval = null;
    this.currentSession = null;
    this.pollingIntervalMs = 5000; // 5 seconds as per requirements
    this.eventQueue = []; // Queue for failed database writes
    this.retryInterval = null;
  }

  /**
   * Start monitoring session for an exam
   * @param {string} examId - The exam ID being monitored
   * @param {string} studentId - The student taking the exam
   * @param {string} deviceId - The device ID where exam is taking place
   * @param {Array} allowedApps - List of allowed application names/titles
   */
  async startMonitoring(examId, studentId, deviceId, allowedApps) {
    try {
      if (this.isMonitoring) {
        throw new Error('Monitoring session already active');
      }

      this.currentSession = {
        examId,
        studentId,
        deviceId,
        allowedApps: allowedApps || [],
        startTime: new Date().toISOString()
      };

      // Log exam start event
      await this.logEvent({
        examId,
        studentId,
        deviceId,
        eventType: 'exam_start',
        windowTitle: null,
        processName: null,
        isViolation: false
      });

      this.isMonitoring = true;
      
      // Start monitoring interval
      this.monitoringInterval = setInterval(async () => {
        await this.checkActiveWindow();
      }, this.pollingIntervalMs);

      // Start retry interval for failed events
      this.retryInterval = setInterval(() => {
        this.retryFailedEvents();
      }, 10000); // Retry every 10 seconds

      console.log(`Monitoring started for exam ${examId}, student ${studentId}`);
      return true;
    } catch (error) {
      console.error('Error starting monitoring:', error);
      throw error;
    }
  }

  /**
   * Stop monitoring session
   */
  async stopMonitoring() {
    try {
      if (!this.isMonitoring || !this.currentSession) {
        console.log('No active monitoring session to stop');
        return false;
      }

      // Clear intervals
      if (this.monitoringInterval) {
        clearInterval(this.monitoringInterval);
        this.monitoringInterval = null;
      }

      if (this.retryInterval) {
        clearInterval(this.retryInterval);
        this.retryInterval = null;
      }

      // Log exam end event
      await this.logEvent({
        examId: this.currentSession.examId,
        studentId: this.currentSession.studentId,
        deviceId: this.currentSession.deviceId,
        eventType: 'exam_end',
        windowTitle: null,
        processName: null,
        isViolation: false
      });

      console.log(`Monitoring stopped for exam ${this.currentSession.examId}`);
      
      this.isMonitoring = false;
      this.currentSession = null;
      
      return true;
    } catch (error) {
      console.error('Error stopping monitoring:', error);
      throw error;
    }
  }

  /**
   * Get current active window information using Windows PowerShell
   * @returns {Object} Object containing windowTitle and processName
   */
  async getCurrentActiveWindow() {
    try {
      // PowerShell command to get active window title and process name
      const command = `
        powershell -Command "
        Add-Type -TypeDefinition '
        using System;
        using System.Runtime.InteropServices;
        using System.Text;
        public class Win32 {
          [DllImport(\\"user32.dll\\")]
          public static extern IntPtr GetForegroundWindow();
          [DllImport(\\"user32.dll\\")]
          public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
          [DllImport(\\"user32.dll\\")]
          public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
        }';
        $hwnd = [Win32]::GetForegroundWindow();
        $title = New-Object System.Text.StringBuilder 256;
        [Win32]::GetWindowText($hwnd, $title, $title.Capacity) | Out-Null;
        $processId = 0;
        [Win32]::GetWindowThreadProcessId($hwnd, [ref]$processId) | Out-Null;
        $process = Get-Process -Id $processId -ErrorAction SilentlyContinue;
        $result = @{
          WindowTitle = $title.ToString();
          ProcessName = if($process) { $process.ProcessName } else { 'Unknown' };
          ProcessId = $processId
        };
        $result | ConvertTo-Json -Compress
        "
      `;

      const { stdout, stderr } = await execAsync(command);
      
      if (stderr) {
        console.warn('PowerShell warning:', stderr);
      }

      if (!stdout.trim()) {
        throw new Error('No output from PowerShell command');
      }

      const result = JSON.parse(stdout.trim());
      
      return {
        windowTitle: result.WindowTitle || 'Unknown',
        processName: result.ProcessName || 'Unknown',
        processId: result.ProcessId || 0
      };
    } catch (error) {
      console.error('Error getting active window:', error);
      // Return fallback data instead of throwing
      return {
        windowTitle: 'Error detecting window',
        processName: 'Unknown',
        processId: 0,
        error: error.message
      };
    }
  }

  /**
   * Check if current active window is a violation
   * @param {string} windowTitle - Current window title
   * @param {string} processName - Current process name
   * @param {Array} allowedApps - List of allowed applications
   * @returns {boolean} True if violation detected
   */
  checkViolation(windowTitle, processName, allowedApps) {
    try {
      if (!allowedApps || allowedApps.length === 0) {
        return false; // No restrictions if no allowed apps specified
      }

      const windowTitleLower = (windowTitle || '').toLowerCase();
      const processNameLower = (processName || '').toLowerCase();

      // Check if window title or process name matches any allowed app
      for (const allowedApp of allowedApps) {
        const allowedAppLower = allowedApp.toLowerCase();
        
        // Check if allowed app name is contained in window title or process name
        if (windowTitleLower.includes(allowedAppLower) || 
            processNameLower.includes(allowedAppLower)) {
          return false; // Not a violation
        }
      }

      // Special cases - always allow these system processes
      const systemProcesses = [
        'dwm', 'explorer', 'winlogon', 'csrss', 'smss', 'wininit',
        'services', 'lsass', 'svchost', 'taskhost', 'taskhostw'
      ];

      if (systemProcesses.includes(processNameLower)) {
        return false;
      }

      // If we get here, it's a violation
      return true;
    } catch (error) {
      console.error('Error checking violation:', error);
      return false; // Default to no violation on error
    }
  }

  /**
   * Check active window and log activity
   */
  async checkActiveWindow() {
    try {
      if (!this.isMonitoring || !this.currentSession) {
        return;
      }

      const windowInfo = await this.getCurrentActiveWindow();
      const { windowTitle, processName } = windowInfo;

      // Check for violation
      const isViolation = this.checkViolation(
        windowTitle, 
        processName, 
        this.currentSession.allowedApps
      );

      // Log the activity
      await this.logEvent({
        examId: this.currentSession.examId,
        studentId: this.currentSession.studentId,
        deviceId: this.currentSession.deviceId,
        eventType: isViolation ? 'violation' : 'window_change',
        windowTitle,
        processName,
        isViolation
      });

      // Log violation to console for immediate feedback
      if (isViolation) {
        console.log(`VIOLATION DETECTED: ${processName} - ${windowTitle}`);
      }

    } catch (error) {
      console.error('Error checking active window:', error);
      
      // Log error event
      try {
        await this.logEvent({
          examId: this.currentSession.examId,
          studentId: this.currentSession.studentId,
          deviceId: this.currentSession.deviceId,
          eventType: 'monitoring_error',
          windowTitle: null,
          processName: null,
          isViolation: false
        });
      } catch (logError) {
        console.error('Error logging monitoring error:', logError);
      }
    }
  }

  /**
   * Log monitoring event to database
   * @param {Object} eventData - Event data to log
   */
  async logEvent(eventData) {
    try {
      const result = await this.databaseService.logEvent(eventData);
      return result;
    } catch (error) {
      console.error('Error logging event to database:', error);
      
      // Add to retry queue
      this.eventQueue.push({
        ...eventData,
        timestamp: new Date().toISOString(),
        retryCount: 0
      });
      
      throw error;
    }
  }

  /**
   * Retry failed event logging
   */
  async retryFailedEvents() {
    if (this.eventQueue.length === 0) {
      return;
    }

    const eventsToRetry = [...this.eventQueue];
    this.eventQueue = [];

    for (const event of eventsToRetry) {
      try {
        await this.databaseService.logEvent(event);
        console.log('Successfully retried logging event:', event.eventType);
      } catch (error) {
        event.retryCount = (event.retryCount || 0) + 1;
        
        // Only retry up to 3 times
        if (event.retryCount < 3) {
          this.eventQueue.push(event);
        } else {
          console.error('Failed to log event after 3 retries:', event);
        }
      }
    }
  }

  /**
   * Get current monitoring status
   * @returns {Object} Current monitoring status and session info
   */
  getMonitoringStatus() {
    return {
      isMonitoring: this.isMonitoring,
      currentSession: this.currentSession,
      queuedEvents: this.eventQueue.length,
      pollingInterval: this.pollingIntervalMs
    };
  }

  /**
   * Update polling interval (for testing purposes)
   * @param {number} intervalMs - New interval in milliseconds
   */
  setPollingInterval(intervalMs) {
    if (intervalMs < 1000) {
      throw new Error('Polling interval must be at least 1000ms');
    }
    
    this.pollingIntervalMs = intervalMs;
    
    // Restart monitoring with new interval if currently active
    if (this.isMonitoring && this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = setInterval(async () => {
        await this.checkActiveWindow();
      }, this.pollingIntervalMs);
    }
  }

  /**
   * Clean up resources
   */
  async cleanup() {
    try {
      if (this.isMonitoring) {
        await this.stopMonitoring();
      }
      
      // Process any remaining queued events
      await this.retryFailedEvents();
      
      console.log('MonitoringService cleanup completed');
    } catch (error) {
      console.error('Error during MonitoringService cleanup:', error);
    }
  }
}

module.exports = MonitoringService;