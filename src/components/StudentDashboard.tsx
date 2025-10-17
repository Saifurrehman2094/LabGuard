import React, { useState, useEffect } from 'react';
import WebStorageService from '../services/webStorage';
import WarningPanel from './WarningPanel';
import './StudentDashboard.css';

interface User {
  userId: string;
  username: string;
  role: 'admin' | 'teacher' | 'student';
  fullName: string;
  token?: string;
  deviceId?: string;
  faceVerified?: boolean;
}

interface Exam {
  exam_id: string;
  teacher_id: string;
  title: string;
  pdf_path?: string;
  start_time: string;
  end_time: string;
  allowed_apps: string[];
  allowedApps?: string[]; // Optional for backward compatibility
  teacher_name: string;
  created_at: string;
}

interface ExamSession {
  examId: string;
  startTime: Date;
  endTime: Date;
  timeRemaining: number;
  isActive: boolean;
  isMonitoringActive: boolean;
}

interface StudentDashboardProps {
  user: User;
  onLogout: () => void;
}

const StudentDashboard: React.FC<StudentDashboardProps> = ({ user, onLogout }) => {
  const [availableExams, setAvailableExams] = useState<Exam[]>([]);
  const [examHistory, setExamHistory] = useState<Exam[]>([]);
  const [currentSession, setCurrentSession] = useState<ExamSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'available' | 'history' | 'session'>('available');
  const [monitoringStatus, setMonitoringStatus] = useState<{
    isActive: boolean;
    hasPermissions: boolean;
    errorMessage?: string;
  }>({ isActive: false, hasPermissions: true });

  // Check if running in Electron
  const isElectron = () => {
    return !!(window as any).electronAPI;
  };

  // Get monitoring status display text
  const getMonitoringStatusText = () => {
    if (!currentSession) return '';

    if (!isElectron()) {
      return 'Monitoring not available (web mode)';
    }

    if (monitoringStatus.isActive) {
      return 'Monitoring Active - Your activity is being tracked';
    }

    if (monitoringStatus.errorMessage) {
      if (monitoringStatus.errorMessage === 'Starting monitoring...') {
        return 'Starting monitoring system...';
      }
      return `Monitoring Error: ${monitoringStatus.errorMessage}`;
    }

    return 'Monitoring Inactive';
  };

  // Check if exam can proceed without monitoring
  const canProceedWithoutMonitoring = () => {
    // In development/web mode, allow exams without monitoring
    if (!isElectron()) return true;

    // In production, monitoring is required but exam can continue with warnings
    return true;
  };

  // Load available exams
  const loadAvailableExams = async () => {
    try {
      if (isElectron()) {
        const result = await (window as any).electronAPI.getAvailableExams(user.userId);
        if (result.success) {
          setAvailableExams(result.exams || []);
        } else {
          setError(result.error || 'Failed to load available exams');
        }
      } else {
        // Development mode - use WebStorageService
        const webStorage = WebStorageService.getInstance();
        const result = await webStorage.getAvailableExams(user.userId);
        if (result.success) {
          setAvailableExams(result.exams || []);
        } else {
          setError(result.error || 'Failed to load available exams');
        }
      }
    } catch (err) {
      setError('Failed to load exams: ' + (err as Error).message);
    }
  };

  // Load exam history
  const loadExamHistory = async () => {
    try {
      if (isElectron()) {
        const result = await (window as any).electronAPI.getStudentExamHistory(user.userId);
        if (result.success) {
          setExamHistory(result.exams || []);
        } else {
          console.error('Failed to load exam history:', result.error);
        }
      } else {
        // Development mode - use WebStorageService
        const webStorage = WebStorageService.getInstance();
        const result = await webStorage.getStudentExamHistory(user.userId);
        if (result.success) {
          setExamHistory(result.exams || []);
        } else {
          console.error('Failed to load exam history:', result.error);
        }
      }
    } catch (err) {
      console.error('Failed to load exam history:', err);
    }
  };

  // View PDF function
  const viewPDF = async (exam: Exam) => {
    try {
      if (!exam.pdf_path) {
        setError('No PDF available for this exam');
        return;
      }

      setError(null); // Clear any previous errors

      if (isElectron()) {
        // Use Electron API to open PDF with system default application
        const result = await (window as any).electronAPI.viewPDF(exam.exam_id);

        if (!result.success) {
          setError(result.error || 'Failed to open PDF');
        }
        // If successful, PDF will open in default system application
      } else {
        // In web mode, try to open the PDF (limited functionality)
        const pdfUrl = exam.pdf_path.startsWith('/') ? exam.pdf_path : `/${exam.pdf_path}`;
        window.open(pdfUrl, '_blank');
      }
    } catch (error) {
      console.error('Error viewing PDF:', error);
      setError('Failed to open PDF. Please try again.');
    }
  };

  // Start exam session
  const startExam = async (exam: Exam) => {
    try {
      setError(null);

      // Check if exam can be started (within time window)
      const now = new Date();
      const startTime = new Date(exam.start_time);
      const endTime = new Date(exam.end_time);

      if (now < startTime) {
        setError('Exam has not started yet');
        return;
      }

      if (now > endTime) {
        setError('Exam has already ended');
        return;
      }

      // Create initial exam session (monitoring will be started separately)
      const session: ExamSession = {
        examId: exam.exam_id,
        startTime: now,
        endTime: endTime,
        timeRemaining: Math.floor((endTime.getTime() - now.getTime()) / 1000),
        isActive: true,
        isMonitoringActive: false
      };

      setCurrentSession(session);
      setActiveTab('session');

      // Initialize monitoring if in Electron environment
      if (isElectron()) {
        // Set monitoring status to indicate we're starting
        setMonitoringStatus({
          isActive: false,
          hasPermissions: true,
          errorMessage: 'Starting monitoring...'
        });

        try {
          // Start monitoring with proper allowed apps list
          const allowedApps = exam.allowed_apps || exam.allowedApps || [];
          const monitoringResult = await (window as any).electronAPI.startMonitoring(
            exam.exam_id,
            user.userId,
            allowedApps
          );

          if (!monitoringResult.success) {
            setError('Failed to start exam monitoring: ' + monitoringResult.error);
            setMonitoringStatus({
              isActive: false,
              hasPermissions: false,
              errorMessage: monitoringResult.error
            });
            // Don't return here - allow exam to continue without monitoring
          } else {
            // Monitoring started successfully - status will be updated by event handler
            console.log('Monitoring started successfully for exam:', exam.exam_id);
          }
        } catch (monitoringError) {
          console.error('Error starting monitoring:', monitoringError);
          setError('Failed to initialize monitoring: ' + (monitoringError as Error).message);
          setMonitoringStatus({
            isActive: false,
            hasPermissions: false,
            errorMessage: (monitoringError as Error).message
          });
        }
      }
    } catch (err) {
      setError('Failed to start exam: ' + (err as Error).message);
    }
  };

  // End exam session
  const endExam = async () => {
    try {
      // Stop monitoring if it's active
      if (isElectron() && currentSession) {
        try {
          const stopResult = await (window as any).electronAPI.stopMonitoring();
          if (!stopResult.success) {
            console.error('Failed to stop monitoring:', stopResult.error);
            // Don't block exam ending due to monitoring stop failure
          } else {
            console.log('Monitoring stopped successfully for exam:', currentSession.examId);
          }
        } catch (stopError) {
          console.error('Error stopping monitoring:', stopError);
          // Don't block exam ending due to monitoring stop error
        }
      }

      // Clear session and monitoring state
      setCurrentSession(null);
      setMonitoringStatus({ isActive: false, hasPermissions: true });
      setActiveTab('available');

      // Clear any errors
      setError(null);

      // Reload data to reflect any changes
      await loadAvailableExams();
      await loadExamHistory();
    } catch (err) {
      console.error('Failed to end exam:', err);
      setError('Failed to properly end exam: ' + (err as Error).message);
    }
  };

  // Timer effect for active session
  useEffect(() => {
    if (!currentSession || !currentSession.isActive) return;

    const timer = setInterval(() => {
      const now = new Date();
      const timeRemaining = Math.floor((currentSession.endTime.getTime() - now.getTime()) / 1000);

      if (timeRemaining <= 0) {
        // Exam time is up
        endExam();
        return;
      }

      setCurrentSession(prev => prev ? { ...prev, timeRemaining } : null);
    }, 1000);

    return () => clearInterval(timer);
  }, [currentSession]);

  // Monitoring status event handler
  useEffect(() => {
    if (!isElectron() || !currentSession) return;

    const handleMonitoringStatusChange = (event: any, statusData: any) => {
      switch (statusData.type) {
        case 'started':
          setMonitoringStatus({
            isActive: true,
            hasPermissions: true
          });
          // Update session to reflect monitoring is active
          setCurrentSession(prev => prev ? { ...prev, isMonitoringActive: true } : null);
          break;

        case 'stopped':
          setMonitoringStatus({
            isActive: false,
            hasPermissions: true
          });
          // Update session to reflect monitoring is stopped
          setCurrentSession(prev => prev ? { ...prev, isMonitoringActive: false } : null);
          break;

        case 'error':
          setMonitoringStatus({
            isActive: false,
            hasPermissions: true,
            errorMessage: statusData.data.message || 'Monitoring error occurred'
          });
          setError('Monitoring error: ' + (statusData.data.message || 'Unknown error'));
          break;

        case 'critical_error':
          setMonitoringStatus({
            isActive: false,
            hasPermissions: false,
            errorMessage: statusData.data.message || 'Critical monitoring error'
          });
          setError('Critical monitoring error: ' + (statusData.data.message || 'Unknown error'));
          break;

        case 'restarted':
          setMonitoringStatus({
            isActive: true,
            hasPermissions: true
          });
          setError(null); // Clear any previous errors
          break;

        default:
          break;
      }
    };

    // Set up monitoring status event listener
    const removeStatusListener = (window as any).electronAPI.onMonitoringStatusChange(handleMonitoringStatusChange);

    return () => {
      if (removeStatusListener) {
        removeStatusListener();
      }
    };
  }, [currentSession]);

  // Load data on component mount
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([loadAvailableExams(), loadExamHistory()]);
      setLoading(false);
    };

    loadData();
  }, [user.userId]);

  // Format time remaining
  const formatTimeRemaining = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  // Format date/time
  const formatDateTime = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  // Check if exam can be started
  const canStartExam = (exam: Exam): boolean => {
    const now = new Date();
    const startTime = new Date(exam.start_time);
    const endTime = new Date(exam.end_time);

    return now >= startTime && now <= endTime;
  };

  // Get exam status
  const getExamStatus = (exam: Exam): string => {
    const now = new Date();
    const startTime = new Date(exam.start_time);
    const endTime = new Date(exam.end_time);

    if (now < startTime) return 'upcoming';
    if (now > endTime) return 'ended';
    return 'active';
  };

  if (loading) {
    return (
      <div className="student-dashboard">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="student-dashboard">
      <header className="dashboard-header">
        <div className="header-content">
          <div className="user-info">
            <h1>Student Dashboard</h1>
            <p>Welcome, {user.fullName}!</p>
            {user.deviceId && <p className="device-info">Device: {user.deviceId}</p>}
          </div>
          <button onClick={onLogout} className="logout-btn">
            Logout
          </button>
        </div>
      </header>

      {error && (
        <div className="error-message">
          <span>⚠️ {error}</span>
          <button onClick={() => setError(null)} className="close-error">×</button>
        </div>
      )}

      {currentSession && currentSession.isActive ? (
        <div className="exam-session">
          <div className="session-header">
            <h2>Exam in Progress</h2>
            <div className="session-timer">
              <span className="timer-label">Time Remaining:</span>
              <span className="timer-value">{formatTimeRemaining(currentSession.timeRemaining)}</span>
            </div>
          </div>

          <div className="session-info">
            <p><strong>Exam ID:</strong> {currentSession.examId}</p>
            <p><strong>Started:</strong> {formatDateTime(currentSession.startTime.toISOString())}</p>
            <p><strong>Ends:</strong> {formatDateTime(currentSession.endTime.toISOString())}</p>
          </div>

          <div className="session-status">
            <div className={`status-indicator ${monitoringStatus.isActive ? 'active' : 'inactive'}`}>
              <span className="status-dot"></span>
              {getMonitoringStatusText()}
            </div>

            {monitoringStatus.isActive ? (
              <div className="monitoring-active-info">
                <p>✅ Your activity is being monitored for academic integrity.</p>
                <p>Please use only the allowed applications listed in the exam details.</p>
              </div>
            ) : (
              <div className="monitoring-warning">
                {monitoringStatus.errorMessage && monitoringStatus.errorMessage !== 'Starting monitoring...' ? (
                  <>
                    <p>⚠️ Monitoring system encountered an issue:</p>
                    <p className="error-details">{monitoringStatus.errorMessage}</p>
                    {canProceedWithoutMonitoring() ? (
                      <p>You may continue with the exam, but violations may not be tracked.</p>
                    ) : (
                      <p>Please contact your instructor for assistance.</p>
                    )}
                  </>
                ) : monitoringStatus.errorMessage === 'Starting monitoring...' ? (
                  <p>🔄 Initializing monitoring system...</p>
                ) : (
                  <p>ℹ️ Monitoring is not currently active.</p>
                )}
              </div>
            )}
          </div>

          {/* Warning Panel for violation display */}
          {currentSession.isMonitoringActive && (
            <WarningPanel
              examId={currentSession.examId}
              studentId={user.userId}
              isMonitoringActive={monitoringStatus.isActive}
            />
          )}

          <div className="session-actions">
            <button onClick={endExam} className="end-exam-btn">
              End Exam
            </button>
          </div>
        </div>
      ) : (
        <div className="dashboard-content">
          <nav className="dashboard-tabs">
            <button
              className={`tab ${activeTab === 'available' ? 'active' : ''}`}
              onClick={() => setActiveTab('available')}
            >
              Available Exams ({availableExams.length})
            </button>
            <button
              className={`tab ${activeTab === 'history' ? 'active' : ''}`}
              onClick={() => setActiveTab('history')}
            >
              Exam History ({examHistory.length})
            </button>
          </nav>

          <div className="tab-content">
            {activeTab === 'available' && (
              <div className="available-exams">
                <h2>Available Exams</h2>
                {availableExams.length === 0 ? (
                  <div className="no-exams">
                    <p>No exams available at this time.</p>
                  </div>
                ) : (
                  <div className="exam-grid">
                    {availableExams.map((exam) => (
                      <div key={exam.exam_id} className={`exam-card ${getExamStatus(exam)}`}>
                        <div className="exam-header">
                          <h3>{exam.title}</h3>
                          <span className={`exam-status ${getExamStatus(exam)}`}>
                            {getExamStatus(exam)}
                          </span>
                        </div>

                        <div className="exam-details">
                          <p><strong>Teacher:</strong> {exam.teacher_name}</p>
                          <p><strong>Start:</strong> {formatDateTime(exam.start_time)}</p>
                          <p><strong>End:</strong> {formatDateTime(exam.end_time)}</p>
                          <p><strong>Question Paper:</strong> {exam.pdf_path ? '📄 PDF Available' : 'No PDF uploaded'}</p>
                          <p><strong>Allowed Apps:</strong> {
                            (() => {
                              const apps = exam.allowed_apps || exam.allowedApps || [];
                              return Array.isArray(apps) && apps.length > 0 ? apps.join(', ') : 'None specified';
                            })()
                          }</p>
                        </div>

                        <div className="exam-actions">
                          {exam.pdf_path && (
                            <button
                              onClick={() => viewPDF(exam)}
                              className="view-pdf-btn"
                              title="View exam question paper"
                            >
                              📄 View PDF
                            </button>
                          )}
                          {canStartExam(exam) ? (
                            <button
                              onClick={() => startExam(exam)}
                              className="start-exam-btn"
                            >
                              Start Exam
                            </button>
                          ) : (
                            <button className="start-exam-btn disabled" disabled>
                              {getExamStatus(exam) === 'upcoming' ? 'Not Started' : 'Ended'}
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'history' && (
              <div className="exam-history">
                <h2>Exam History</h2>
                {examHistory.length === 0 ? (
                  <div className="no-exams">
                    <p>No completed exams yet.</p>
                  </div>
                ) : (
                  <div className="history-list">
                    {examHistory.map((exam) => (
                      <div key={exam.exam_id} className="history-item">
                        <div className="history-header">
                          <h3>{exam.title}</h3>
                          <span className="completion-date">
                            Completed: {formatDateTime(exam.end_time)}
                          </span>
                        </div>

                        <div className="history-details">
                          <p><strong>Teacher:</strong> {exam.teacher_name}</p>
                          <p><strong>Duration:</strong> {formatDateTime(exam.start_time)} - {formatDateTime(exam.end_time)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default StudentDashboard;