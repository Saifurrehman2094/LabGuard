import React, { useState, useEffect } from 'react';
import WebStorageService from '../services/webStorage';
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

  // Check if running in Electron
  const isElectron = () => {
    return !!(window as any).electronAPI;
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

      if (isElectron()) {
        // Start monitoring
        const monitoringResult = await (window as any).electronAPI.startMonitoring(
          exam.exam_id,
          user.userId,
          exam.allowed_apps
        );

        if (!monitoringResult.success) {
          setError('Failed to start exam monitoring: ' + monitoringResult.error);
          return;
        }
      }

      // Create exam session
      const session: ExamSession = {
        examId: exam.exam_id,
        startTime: now,
        endTime: endTime,
        timeRemaining: Math.floor((endTime.getTime() - now.getTime()) / 1000),
        isActive: true
      };

      setCurrentSession(session);
      setActiveTab('session');
    } catch (err) {
      setError('Failed to start exam: ' + (err as Error).message);
    }
  };

  // End exam session
  const endExam = async () => {
    try {
      if (isElectron() && currentSession) {
        await (window as any).electronAPI.stopMonitoring();
      }

      setCurrentSession(null);
      setActiveTab('available');

      // Reload data
      await loadAvailableExams();
      await loadExamHistory();
    } catch (err) {
      console.error('Failed to end exam:', err);
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
            <div className="status-indicator active">
              <span className="status-dot"></span>
              Monitoring Active
            </div>
            <p>Your activity is being monitored. Please use only allowed applications.</p>
          </div>

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
                          <p><strong>Allowed Apps:</strong> {
                            (() => {
                              const apps = exam.allowed_apps || exam.allowedApps || [];
                              return Array.isArray(apps) && apps.length > 0 ? apps.join(', ') : 'None specified';
                            })()
                          }</p>
                        </div>

                        <div className="exam-actions">
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