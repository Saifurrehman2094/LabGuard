import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import './CameraLogWindow.css';

// TypeScript interfaces for camera status data (matches Python output)
interface CameraStatus {
  type?: string;
  timestamp: number;
  violations?: {
    phone_violation?: boolean;
    multiple_persons?: boolean;
    no_face_detected?: boolean;
    not_facing_screen?: boolean;
    not_looking_at_screen?: boolean;
  };
  detections?: {
    phone?: {
      detected: boolean;
      confidence: number;
    };
    persons?: {
      count: number;
    };
  };
  error?: boolean | string;
  error_type?: string;
  message?: string;
}

interface ViolationEvent {
  id: string;
  timestamp: Date;
  type: string;
  message: string;
  severity: 'warning' | 'error' | 'info';
}

interface CameraLogWindowProps {
  isActive: boolean;
}

const CameraLogWindow: React.FC<CameraLogWindowProps> = ({ isActive }) => {
  const [violations, setViolations] = useState<ViolationEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showDetailedLogs, setShowDetailedLogs] = useState(false);

  // Refs for cleanup
  const unsubscribeStatusRef = useRef<(() => void) | null>(null);
  const unsubscribeErrorRef = useRef<(() => void) | null>(null);
  const unsubscribeExitRef = useRef<(() => void) | null>(null);

  // Track last violation times to prevent flooding
  const lastViolationTimeRef = useRef<Record<string, number>>({});

  // Check if running in Electron
  const isElectron = useCallback(() => {
    return typeof window !== 'undefined' &&
      (window as any).electronAPI &&
      (window as any).electronAPI.camera &&
      typeof (window as any).electronAPI.camera.startTest === 'function';
  }, []);

  // Calculate statistics from violations
  const stats = useMemo(() => {
    const phoneCount = violations.filter(v => v.type === 'phone').length;
    const personCount = violations.filter(v => v.type === 'person').length;
    const faceCount = violations.filter(v => v.type === 'face').length;
    const postureCount = violations.filter(v => v.type === 'posture').length;
    const gazeCount = violations.filter(v => v.type === 'gaze').length;
    const errorCount = violations.filter(v => v.type === 'error').length;
    const systemCount = violations.filter(v => v.type === 'system').length;

    return {
      phone: phoneCount,
      multiplePersons: personCount,
      noFace: faceCount,
      notFacing: postureCount,
      notLooking: gazeCount,
      errors: errorCount,
      system: systemCount,
      total: violations.length
    };
  }, [violations]);

  // Add violation to log with debouncing
  const addViolation = useCallback((type: string, message: string, severity: ViolationEvent['severity'] = 'warning') => {
    // Debounce same type of violations (5 second cooldown, except for system messages)
    const now = Date.now();
    const lastTime = lastViolationTimeRef.current[type] || 0;
    const cooldown = type === 'system' ? 0 : 5000; // No cooldown for system messages
    
    if (now - lastTime < cooldown) {
      return; // Skip if same type was logged recently
    }
    lastViolationTimeRef.current[type] = now;

    const newViolation: ViolationEvent = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      type,
      message,
      severity
    };
    setViolations(prev => [newViolation, ...prev].slice(0, 100)); // Keep last 100
  }, []);

  // Handle status updates from Python processor
  const handleStatusUpdate = useCallback((status: CameraStatus) => {
    // Check for violations from Python processor
    const violations = status.violations;
    if (violations) {
      // Phone violation
      if (violations.phone_violation) {
        const confidence = status.detections?.phone?.confidence || 0;
        addViolation('phone', `Phone detected (${(confidence * 100).toFixed(0)}% confidence)`, 'error');
      }

      // Multiple persons
      if (violations.multiple_persons) {
        const count = status.detections?.persons?.count || 0;
        addViolation('person', `Multiple persons detected: ${count}`, 'error');
      }

      // No face detected
      if (violations.no_face_detected) {
        addViolation('face', 'No face detected', 'warning');
      }

      // Not facing screen
      if (violations.not_facing_screen) {
        addViolation('posture', 'Not facing screen', 'warning');
      }

      // Not looking at screen
      if (violations.not_looking_at_screen) {
        addViolation('gaze', 'Not looking at screen', 'warning');
      }
    }

    // Handle error status
    if (status.error) {
      const errorMsg = typeof status.error === 'string' ? status.error : (status.message || 'Unknown error');
      setError(errorMsg);
      addViolation('error', errorMsg, 'error');
    }

    // Handle ready and shutdown messages
    if (status.type === 'ready') {
      addViolation('system', 'Camera monitoring started', 'info');
    } else if (status.type === 'shutdown') {
      addViolation('system', status.message || 'Camera monitoring stopped', 'info');
    }
  }, [addViolation]);

  // Handle errors from Python processor (filter out non-error stderr messages)
  const handleError = useCallback((errorData: any) => {
    const errorMessage = errorData?.message || errorData?.error || 'Unknown error';
    
    // Filter out non-error messages from stderr
    const lowerMessage = errorMessage.toLowerCase();
    
    // Skip INFO messages
    if (lowerMessage.includes(' - info - ') || lowerMessage.includes('- info -')) {
      return;
    }
    
    // Skip frame processing time warnings
    if (lowerMessage.includes('frame processing took') && lowerMessage.includes('max:')) {
      return;
    }
    
    // Skip TensorFlow/MediaPipe initialization messages
    if (lowerMessage.includes('tensorflow lite') || 
        lowerMessage.includes('xnnpack') ||
        lowerMessage.includes('inference_feedback_manager') ||
        lowerMessage.includes('landmark_projection_calculator') ||
        lowerMessage.includes('absl::initializelog')) {
      return;
    }
    
    // Skip Python frozen runpy warnings
    if (lowerMessage.includes('<frozen runpy>') || lowerMessage.includes('unpredictable behaviour')) {
      return;
    }
    
    // Only show actual ERROR level messages
    if (lowerMessage.includes(' - error - ') || 
        lowerMessage.includes('exception') || 
        lowerMessage.includes('traceback')) {
      if (errorMessage.length > 10 && !lowerMessage.includes('warning')) {
        setError(errorMessage);
        addViolation('error', errorMessage, 'error');
      }
    }
  }, [addViolation]);

  // Handle process exit
  const handleProcessExit = useCallback((exitData: any) => {
    if (exitData.code !== 0 && exitData.signal !== 'SIGTERM') {
      setError(`Camera process exited unexpectedly (code: ${exitData.code})`);
      addViolation('system', `Process exited with code ${exitData.code}`, 'error');
    } else {
      addViolation('system', 'Monitoring stopped', 'info');
    }
  }, [addViolation]);

  // Setup event listeners
  useEffect(() => {
    if (!isElectron() || !isActive) return;

    const api = (window as any).electronAPI.camera;

    // Subscribe to status updates
    unsubscribeStatusRef.current = api.onStatusUpdate(handleStatusUpdate);
    unsubscribeErrorRef.current = api.onError(handleError);
    unsubscribeExitRef.current = api.onProcessExit(handleProcessExit);

    // Cleanup on unmount or when inactive
    return () => {
      if (unsubscribeStatusRef.current) {
        unsubscribeStatusRef.current();
      }
      if (unsubscribeErrorRef.current) {
        unsubscribeErrorRef.current();
      }
      if (unsubscribeExitRef.current) {
        unsubscribeExitRef.current();
      }
    };
  }, [isElectron, isActive, handleStatusUpdate, handleError, handleProcessExit]);

  // Clear violations log
  const handleClearLog = () => {
    setViolations([]);
    setError(null);
  };

  // Format timestamp
  const formatTimestamp = (date: Date): string => {
    return date.toLocaleTimeString('en-US', { 
      hour12: false, 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit' 
    });
  };

  if (!isActive) {
    return null;
  }

  return (
    <div className="camera-log-window">
      <div className="camera-log-header">
        <div className="log-header-title">
          <span className="log-icon">📹</span>
          <h3>Camera Monitoring</h3>
        </div>
        <div className="log-header-actions">
          <button 
            className="toggle-logs-btn"
            onClick={() => setShowDetailedLogs(!showDetailedLogs)}
            disabled={violations.length === 0}
          >
            {showDetailedLogs ? '📋 Hide Logs' : '📋 View Logs'}
          </button>
          {showDetailedLogs && (
            <button 
              className="clear-log-button" 
              onClick={handleClearLog}
              disabled={violations.length === 0}
              title="Clear log"
            >
              Clear
            </button>
          )}
        </div>
      </div>
      
      {error && (
        <div className="log-error-banner">
          <span className="error-icon">⚠️</span>
          <span className="error-text">{error}</span>
        </div>
      )}

      {/* Statistics Summary */}
      <div className="camera-stats-summary">
        <div className="stats-grid">
          <div className="stat-card stat-error">
            <div className="stat-icon">📱</div>
            <div className="stat-content">
              <div className="stat-value">{stats.phone}</div>
              <div className="stat-label">Phone Detection</div>
            </div>
          </div>
          <div className="stat-card stat-error">
            <div className="stat-icon">👥</div>
            <div className="stat-content">
              <div className="stat-value">{stats.multiplePersons}</div>
              <div className="stat-label">Multiple Persons</div>
            </div>
          </div>
          <div className="stat-card stat-warning">
            <div className="stat-icon">👤</div>
            <div className="stat-content">
              <div className="stat-value">{stats.noFace}</div>
              <div className="stat-label">No Face Detected</div>
            </div>
          </div>
          <div className="stat-card stat-warning">
            <div className="stat-icon">↩️</div>
            <div className="stat-content">
              <div className="stat-value">{stats.notFacing}</div>
              <div className="stat-label">Not Facing Screen</div>
            </div>
          </div>
          <div className="stat-card stat-warning">
            <div className="stat-icon">👁️</div>
            <div className="stat-content">
              <div className="stat-value">{stats.notLooking}</div>
              <div className="stat-label">Not Looking at Screen</div>
            </div>
          </div>
        </div>
      </div>

      {/* Detailed Logs (Collapsible) */}
      {showDetailedLogs && (
        <div className="camera-log-list">
          {violations.length === 0 ? (
            <p className="no-violations">No events recorded</p>
          ) : (
            violations.map(violation => (
              <div 
                key={violation.id} 
                className={`log-item ${violation.severity}`}
              >
                <span className="log-time">{formatTimestamp(violation.timestamp)}</span>
                <span className="log-type">[{violation.type}]</span>
                <span className="log-message">{violation.message}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default CameraLogWindow;
