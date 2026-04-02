/**
 * Camera Monitoring Service
 * 
 * Manages Python subprocess for camera-based monitoring.
 * Spawns Python camera_processor.py, parses JSON from stdout,
 * and forwards status updates to renderer via IPC events.
 * 
 * Features:
 * - Python subprocess lifecycle management
 * - JSON status parsing from stdout
 * - Error handling and recovery
 * - Event emission for IPC forwarding
 * - Process logging and debugging
 */

const { spawn } = require('child_process');
const EventEmitter = require('events');
const path = require('path');

class CameraMonitoringService extends EventEmitter {
  /**
   * Initialize the camera monitoring service.
   * 
   * @param {Object} options - Configuration options
   * @param {string} options.pythonPath - Path to Python executable (default: 'py')
   * @param {string[]} options.pythonArgs - Additional Python arguments (default: ['-3.11', '-m', 'camera_monitoring.camera_processor'])
   * @param {string} options.cwd - Working directory for Python process (default: backend directory)
   */
  constructor(options = {}) {
    super();
    
    // Configuration
    this.pythonPath = options.pythonPath || 'py';
    this.pythonArgs = options.pythonArgs || ['-3.11', '-m', 'camera_monitoring.camera_processor'];
    this.cwd = options.cwd || path.join(__dirname, '..');
    
    // Process state
    this.pythonProcess = null;
    this.isMonitoring = false;
    this.processPid = null;
    this.lastStatus = null;
    this.startTime = null;
    
    // Buffer for incomplete JSON lines
    this.stdoutBuffer = '';
    this.stderrBuffer = '';
    
    // Statistics
    this.stats = {
      statusUpdates: 0,
      errors: 0,
      restarts: 0
    };
    
    console.log('[CameraMonitoringService] Initialized', {
      pythonPath: this.pythonPath,
      pythonArgs: this.pythonArgs,
      cwd: this.cwd
    });
  }

  /**
   * Start camera monitoring by spawning Python subprocess.
   * 
   * @param {Object} options - Startup options
   * @param {number} options.cameraIndex - Camera device index
   * @param {boolean} options.enableDisplay - Show OpenCV window
   * @param {boolean} options.enableFrameTransmission - Send frames as base64
   * @param {boolean} options.debug - Enable debug logging
   * @param {string} options.studentName - Student name for snapshot naming
   * @param {string[]} options.snapshotViolations - List of violations that trigger snapshots
   * @returns {Object} Result object with success status, pid, and args
   */
  startMonitoring(options = {}) {
    if (this.isMonitoring) {
      console.warn('[CameraMonitoringService] Monitoring already active');
      return {
        success: false,
        error: 'Monitoring is already active',
        pid: this.processPid
      };
    }

    try {
      // Build Python command arguments
      const args = [...this.pythonArgs];
      
      // Add optional arguments
      if (options.cameraIndex !== undefined) {
        args.push('--camera', options.cameraIndex.toString());
      }
      if (options.enableDisplay) {
        args.push('--display');
      }
      if (options.enableFrameTransmission) {
        args.push('--transmit-frames');
      }
      if (options.debug) {
        args.push('--debug');
      }
      // Add student name for snapshot naming
      if (options.studentName) {
        args.push('--student-name', options.studentName);
      }
      // Add snapshot violations configuration
      if (options.snapshotViolations && options.snapshotViolations.length > 0) {
        args.push('--snapshot-violations', options.snapshotViolations.join(','));
      }

      console.log('[CameraMonitoringService] Starting Python process:', {
        command: `${this.pythonPath} ${args.join(' ')}`,
        cwd: this.cwd
      });

      // Spawn Python subprocess
      this.pythonProcess = spawn(this.pythonPath, args, {
        cwd: this.cwd,
        stdio: ['pipe', 'pipe', 'pipe'], // stdin, stdout, stderr
        shell: false
      });

      this.processPid = this.pythonProcess.pid;
      this.isMonitoring = true;
      this.startTime = Date.now();
      this.stdoutBuffer = '';
      this.stderrBuffer = '';

      // Setup stdout handler (JSON status updates)
      this.pythonProcess.stdout.setEncoding('utf8');
      this.pythonProcess.stdout.on('data', (data) => {
        this.handleStdout(data);
      });

      // Setup stderr handler (Python logging)
      this.pythonProcess.stderr.setEncoding('utf8');
      this.pythonProcess.stderr.on('data', (data) => {
        this.handleStderr(data);
      });

      // Handle process exit
      this.pythonProcess.on('exit', (code, signal) => {
        this.handleProcessExit(code, signal);
      });

      // Handle process errors
      this.pythonProcess.on('error', (error) => {
        this.handleProcessError(error);
      });

      console.log('[CameraMonitoringService] Python process started', {
        pid: this.processPid,
        args: args
      });

      // Emit start event
      this.emit('started', {
        pid: this.processPid,
        args: args,
        timestamp: Date.now()
      });

      return {
        success: true,
        pid: this.processPid,
        args: args
      };

    } catch (error) {
      console.error('[CameraMonitoringService] Error starting monitoring:', error);
      this.isMonitoring = false;
      this.pythonProcess = null;
      this.processPid = null;

      const errorData = {
        error: true,
        error_type: 'startup_failed',
        message: error.message,
        timestamp: Date.now()
      };

      this.emit('error', errorData);
      this.stats.errors++;

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Stop camera monitoring by gracefully terminating Python subprocess.
   * 
   * @returns {Object} Result object with success status
   */
  stopMonitoring() {
    if (!this.isMonitoring || !this.pythonProcess) {
      console.warn('[CameraMonitoringService] Monitoring not active');
      return {
        success: false,
        error: 'Monitoring is not active'
      };
    }

    try {
      console.log('[CameraMonitoringService] Stopping monitoring (PID:', this.processPid, ')');

      // Send SIGTERM for graceful shutdown
      // Python process handles SIGTERM via signal handler
      const killed = this.pythonProcess.kill('SIGTERM');

      if (!killed) {
        console.warn('[CameraMonitoringService] SIGTERM failed, trying SIGKILL');
        // Fallback to SIGKILL if SIGTERM fails
        this.pythonProcess.kill('SIGKILL');
      }

      // Reset state immediately
      this.isMonitoring = false;
      const pid = this.processPid;
      this.processPid = null;

      // Emit stop event
      this.emit('stopped', {
        pid: pid,
        timestamp: Date.now(),
        uptime: this.startTime ? Date.now() - this.startTime : 0
      });

      // Note: Process exit will be handled by handleProcessExit
      // which will clean up the process reference

      return {
        success: true,
        message: 'Monitoring stopped'
      };

    } catch (error) {
      console.error('[CameraMonitoringService] Error stopping monitoring:', error);
      
      this.emit('error', {
        error: true,
        error_type: 'stop_failed',
        message: error.message,
        timestamp: Date.now()
      });

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Handle stdout data from Python process (JSON status updates).
   * 
   * @param {string} data - Raw stdout data
   */
  handleStdout(data) {
    // Append to buffer (may receive partial JSON lines)
    this.stdoutBuffer += data;

    // Split by newlines and process complete lines
    const lines = this.stdoutBuffer.split('\n');
    
    // Keep last line in buffer (may be incomplete)
    this.stdoutBuffer = lines.pop() || '';

    // Process each complete line
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue; // Skip empty lines

      try {
        // Parse JSON
        const status = JSON.parse(trimmedLine);
        
        // Update last status
        this.lastStatus = status;
        this.stats.statusUpdates++;

        // Emit status event for IPC forwarding
        this.emit('status', status);

        // Handle special status types
        if (status.type === 'ready') {
          console.log('[CameraMonitoringService] Python processor ready');
        } else if (status.type === 'shutdown') {
          console.log('[CameraMonitoringService] Python processor shutdown:', status.message);
        } else if (status.error === true) {
          // Error status
          console.error('[CameraMonitoringService] Python error:', status.error_type, status.message);
          this.emit('error', status);
          this.stats.errors++;
        }

      } catch (parseError) {
        // Not valid JSON - might be partial line or Python print statement
        console.warn('[CameraMonitoringService] Failed to parse JSON:', trimmedLine);
        console.warn('[CameraMonitoringService] Parse error:', parseError.message);
      }
    }
  }

  /**
   * Handle stderr data from Python process (Python logging).
   * 
   * @param {string} data - Raw stderr data
   */
  handleStderr(data) {
    // Append to buffer
    this.stderrBuffer += data;

    // Split by newlines and process complete lines
    const lines = this.stderrBuffer.split('\n');
    this.stderrBuffer = lines.pop() || '';

    // Process each complete line
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;

      // Emit stderr event for IPC forwarding (for debugging)
      this.emit('stderr', {
        message: trimmedLine,
        timestamp: Date.now()
      });

      // Log to console for debugging
      console.log('[CameraMonitoringService] Python stderr:', trimmedLine);
    }
  }

  /**
   * Handle Python process exit.
   * 
   * @param {number|null} code - Exit code
   * @param {string|null} signal - Exit signal
   */
  handleProcessExit(code, signal) {
    console.log('[CameraMonitoringService] Python process exited', {
      pid: this.processPid,
      code: code,
      signal: signal,
      uptime: this.startTime ? Date.now() - this.startTime : 0
    });

    const exitData = {
      pid: this.processPid,
      code: code,
      signal: signal,
      timestamp: Date.now(),
      uptime: this.startTime ? Date.now() - this.startTime : 0
    };

    // Emit exit event for IPC forwarding
    this.emit('exit', exitData);

    // Clean up process reference
    this.pythonProcess = null;
    this.isMonitoring = false;
    this.processPid = null;
    this.startTime = null;
    this.stdoutBuffer = '';
    this.stderrBuffer = '';

    // If exited unexpectedly (not SIGTERM), emit error
    if (code !== 0 && signal !== 'SIGTERM') {
      const errorData = {
        error: true,
        error_type: 'process_exited',
        message: `Python process exited unexpectedly with code ${code}`,
        code: code,
        signal: signal,
        timestamp: Date.now()
      };

      this.emit('error', errorData);
      this.stats.errors++;
    }
  }

  /**
   * Handle Python process spawn errors.
   * 
   * @param {Error} error - Process error
   */
  handleProcessError(error) {
    console.error('[CameraMonitoringService] Python process error:', error);

    const errorData = {
      error: true,
      error_type: 'process_error',
      message: error.message,
      timestamp: Date.now()
    };

    this.emit('error', errorData);
    this.stats.errors++;

    // Reset state
    this.pythonProcess = null;
    this.isMonitoring = false;
    this.processPid = null;
  }

  /**
   * Get current monitoring status.
   * 
   * @returns {Object} Status object
   */
  getStatus() {
    return {
      isMonitoring: this.isMonitoring,
      pid: this.processPid,
      startTime: this.startTime,
      uptime: this.startTime ? Date.now() - this.startTime : 0,
      lastStatus: this.lastStatus,
      stats: { ...this.stats }
    };
  }

  /**
   * Check if monitoring is active.
   * 
   * @returns {boolean} True if monitoring is active
   */
  isActive() {
    return this.isMonitoring && this.pythonProcess !== null;
  }
}

module.exports = CameraMonitoringService;

