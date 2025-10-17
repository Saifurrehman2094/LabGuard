import React, { useState, useEffect } from 'react';
import ExamCreationForm from './ExamCreationForm';
import ExamList from './ExamList';
import ViolationReport from './ViolationReport';
import WebStorageService from '../services/webStorage';
import './TeacherDashboard.css';

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
  examId: string;
  teacherId: string;
  title: string;
  pdfPath?: string;
  startTime: string;
  endTime: string;
  allowedApps: string[];
  createdAt: string;
}

interface TeacherDashboardProps {
  user: User;
  onLogout: () => void;
}

const TeacherDashboard: React.FC<TeacherDashboardProps> = ({ user, onLogout }) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'create' | 'manage' | 'monitoring'>('overview');
  const [exams, setExams] = useState<Exam[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedExamForMonitoring, setSelectedExamForMonitoring] = useState<string>('');

  // Check if running in Electron
  const isElectron = () => {
    return !!(window as any).electronAPI;
  };

  // Load teacher's exams
  const loadExams = async () => {
    try {
      setIsLoading(true);
      setError(null);

      if (isElectron()) {
        const result = await (window as any).electronAPI.getExamsByTeacher(user.userId);
        if (result.success) {
          setExams(result.exams);
        } else {
          setError(result.error || 'Failed to load exams');
        }
      } else {
        // Development mode - use WebStorageService
        const webStorage = WebStorageService.getInstance();
        const result = await webStorage.getExamsByTeacher(user.userId);
        if (result.success) {
          setExams(result.exams || []);
        } else {
          setError(result.error || 'Failed to load exams');
        }
      }
    } catch (error) {
      console.error('Error loading exams:', error);
      setError('Failed to load exams. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Load exams on component mount
  useEffect(() => {
    loadExams();
  }, [user.userId]);

  // Handle exam creation success
  const handleExamCreated = (newExam: Exam) => {
    setExams(prev => [newExam, ...prev]);
    setActiveTab('manage');
  };

  // Handle exam update
  const handleExamUpdated = (updatedExam: Exam) => {
    setExams(prev => prev.map(exam =>
      exam.examId === updatedExam.examId ? updatedExam : exam
    ));
  };

  // Handle exam deletion
  const handleExamDeleted = (examId: string) => {
    setExams(prev => prev.filter(exam => exam.examId !== examId));
  };

  // Get exam statistics
  const getExamStats = () => {
    const now = new Date();
    const upcoming = exams.filter(exam => new Date(exam.startTime) > now);
    const active = exams.filter(exam =>
      new Date(exam.startTime) <= now && new Date(exam.endTime) > now
    );
    const completed = exams.filter(exam => new Date(exam.endTime) <= now);

    return { total: exams.length, upcoming: upcoming.length, active: active.length, completed: completed.length };
  };

  const stats = getExamStats();

  return (
    <div className="teacher-dashboard">
      {/* Header */}
      <div className="dashboard-header">
        <div className="header-content">
          <div className="user-info">
            <h1>Teacher Dashboard</h1>
            <p>Welcome back, {user.fullName}</p>
          </div>
          <button onClick={onLogout} className="logout-btn">
            Logout
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="dashboard-nav">
        <button
          className={`nav-tab ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        <button
          className={`nav-tab ${activeTab === 'create' ? 'active' : ''}`}
          onClick={() => setActiveTab('create')}
        >
          Create Exam
        </button>
        <button
          className={`nav-tab ${activeTab === 'manage' ? 'active' : ''}`}
          onClick={() => setActiveTab('manage')}
        >
          Manage Exams
        </button>
        <button
          className={`nav-tab ${activeTab === 'monitoring' ? 'active' : ''}`}
          onClick={() => setActiveTab('monitoring')}
        >
          Monitoring Reports
        </button>
      </div>

      {/* Content Area */}
      <div className="dashboard-content">
        {activeTab === 'overview' && (
          <div className="overview-tab">
            <div className="stats-grid">
              <div className="stat-card">
                <h3>Total Exams</h3>
                <div className="stat-number">{stats.total}</div>
              </div>
              <div className="stat-card">
                <h3>Upcoming</h3>
                <div className="stat-number">{stats.upcoming}</div>
              </div>
              <div className="stat-card">
                <h3>Active</h3>
                <div className="stat-number">{stats.active}</div>
              </div>
              <div className="stat-card">
                <h3>Completed</h3>
                <div className="stat-number">{stats.completed}</div>
              </div>
            </div>

            <div className="recent-exams">
              <h2>Recent Exams</h2>
              {isLoading ? (
                <div className="loading">Loading exams...</div>
              ) : error ? (
                <div className="error-message">
                  {error}
                  <button onClick={loadExams} className="retry-btn">Retry</button>
                </div>
              ) : exams.length === 0 ? (
                <div className="empty-state">
                  <p>No exams created yet.</p>
                  <button
                    onClick={() => setActiveTab('create')}
                    className="create-first-exam-btn"
                  >
                    Create Your First Exam
                  </button>
                </div>
              ) : (
                <div className="exam-preview-list">
                  {exams.slice(0, 3).map(exam => (
                    <div key={exam.examId} className="exam-preview-card">
                      <h3>{exam.title}</h3>
                      <p>Start: {new Date(exam.startTime).toLocaleString()}</p>
                      <p>Duration: {Math.round((new Date(exam.endTime).getTime() - new Date(exam.startTime).getTime()) / (1000 * 60))} minutes</p>
                      <p>Allowed Apps: {exam.allowedApps.length} applications</p>
                    </div>
                  ))}
                  {exams.length > 3 && (
                    <button
                      onClick={() => setActiveTab('manage')}
                      className="view-all-btn"
                    >
                      View All Exams ({exams.length})
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'create' && (
          <div className="create-tab">
            <h2>Create New Exam</h2>
            <ExamCreationForm
              user={user}
              onExamCreated={handleExamCreated}
            />
          </div>
        )}

        {activeTab === 'manage' && (
          <div className="manage-tab">
            <h2>Manage Exams</h2>
            {isLoading ? (
              <div className="loading">Loading exams...</div>
            ) : error ? (
              <div className="error-message">
                {error}
                <button onClick={loadExams} className="retry-btn">Retry</button>
              </div>
            ) : (
              <ExamList
                exams={exams}
                onExamUpdated={handleExamUpdated}
                onExamDeleted={handleExamDeleted}
                onRefresh={loadExams}
              />
            )}
          </div>
        )}

        {activeTab === 'monitoring' && (
          <div className="monitoring-tab">
            <div className="monitoring-header">
              <h2>Monitoring Reports</h2>
              <div className="exam-selector">
                <label htmlFor="exam-select">Select Exam:</label>
                <select
                  id="exam-select"
                  value={selectedExamForMonitoring}
                  onChange={(e) => setSelectedExamForMonitoring(e.target.value)}
                >
                  <option value="">Choose an exam to view monitoring results</option>
                  {exams
                    .filter(exam => new Date(exam.endTime) <= new Date()) // Only show completed exams
                    .map(exam => (
                      <option key={exam.examId} value={exam.examId}>
                        {exam.title} - {new Date(exam.startTime).toLocaleDateString()}
                      </option>
                    ))}
                </select>
              </div>
            </div>

            {selectedExamForMonitoring ? (
              <ViolationReport
                examId={selectedExamForMonitoring}
                examTitle={exams.find(e => e.examId === selectedExamForMonitoring)?.title || 'Unknown Exam'}
              />
            ) : (
              <div className="no-exam-selected">
                <div className="placeholder-content">
                  <div className="placeholder-icon">📊</div>
                  <h3>Select an Exam to View Monitoring Results</h3>
                  <p>Choose a completed exam from the dropdown above to view detailed violation reports and monitoring statistics.</p>
                  {exams.filter(exam => new Date(exam.endTime) <= new Date()).length === 0 && (
                    <p className="no-completed-exams">No completed exams available for monitoring reports.</p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default TeacherDashboard;