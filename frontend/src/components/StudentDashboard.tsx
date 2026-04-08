import React, { useEffect, useMemo, useState } from 'react';
import WebStorageService from '../services/webStorage';
import ExamPage from './ExamPage';
import ViolationsTab from './ViolationsTab';
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
  allowedApps?: string[];
  teacher_name: string;
  course_name?: string;
  course_code?: string;
  created_at: string;
}

interface StudentDashboardProps {
  user: User;
  onLogout: () => void;
}

const StudentDashboard: React.FC<StudentDashboardProps> = ({ user, onLogout }) => {
  const [availableExams, setAvailableExams] = useState<Exam[]>([]);
  const [examHistory, setExamHistory] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'available' | 'violations' | 'exam'>('available');
  const [selectedExam, setSelectedExam] = useState<Exam | null>(null);

  const isElectron = () => !!(window as any).electronAPI;

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

  const loadExamHistory = async () => {
    try {
      if (isElectron()) {
        const result = await (window as any).electronAPI.getStudentExamHistory(user.userId);
        if (result.success) {
          setExamHistory(result.exams || []);
        }
      } else {
        const webStorage = WebStorageService.getInstance();
        const result = await webStorage.getStudentExamHistory(user.userId);
        if (result.success) {
          setExamHistory(result.exams || []);
        }
      }
    } catch (err) {
      console.error('Failed to load exam history:', err);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([loadAvailableExams(), loadExamHistory()]);
      setLoading(false);
    };
    loadData();
  }, [user.userId]);

  const formatDateTime = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getExamStatus = (exam: Exam): 'upcoming' | 'active' | 'ended' => {
    const now = new Date();
    const startTime = new Date(exam.start_time);
    const endTime = new Date(exam.end_time);
    if (now < startTime) return 'upcoming';
    if (now > endTime) return 'ended';
    return 'active';
  };

  const overview = useMemo(() => {
    const active = availableExams.filter((e) => getExamStatus(e) === 'active').length;
    const upcoming = availableExams.filter((e) => getExamStatus(e) === 'upcoming').length;
    const completed = examHistory.filter((e: any) => e.status === 'submitted').length;
    return { active, upcoming, completed };
  }, [availableExams, examHistory]);

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
            <h1>Student Workspace</h1>
            <p>{user.fullName}</p>
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

      <div className="dashboard-content">
        {activeTab !== 'exam' && (
          <section className="student-overview-grid">
            <article className="overview-tile"><p>Active now</p><h3>{overview.active}</h3></article>
            <article className="overview-tile"><p>Upcoming</p><h3>{overview.upcoming}</h3></article>
            <article className="overview-tile"><p>Completed</p><h3>{overview.completed}</h3></article>
          </section>
        )}

        {activeTab !== 'exam' && (
          <nav className="dashboard-tabs">
            <button className={`tab ${activeTab === 'available' ? 'active' : ''}`} onClick={() => setActiveTab('available')}>
              Active Exams
            </button>
            <button className={`tab ${activeTab === 'violations' ? 'active' : ''}`} onClick={() => setActiveTab('violations')}>
              My Violations
            </button>
          </nav>
        )}

        <div className="tab-content">
          {activeTab === 'available' && (
            <div className="available-exams">
              <h2>Enrolled Exams</h2>
              {availableExams.length === 0 ? (
                <div className="no-exams"><p>No active or upcoming exams right now.</p></div>
              ) : (
                <div className="exam-grid">
                  {availableExams.map((exam) => (
                    <div
                      key={exam.exam_id}
                      className={`exam-card ${getExamStatus(exam)} clickable`}
                      onClick={() => {
                        setSelectedExam(exam);
                        setActiveTab('exam');
                      }}
                    >
                      <div className="exam-header">
                        <h3>{exam.title}</h3>
                        <span className={`exam-status ${getExamStatus(exam)}`}>{getExamStatus(exam)}</span>
                      </div>
                      <div className="exam-details">
                        <p><strong>Course:</strong> {exam.course_code} - {exam.course_name}</p>
                        <p><strong>Teacher:</strong> {exam.teacher_name}</p>
                        <p><strong>Start:</strong> {formatDateTime(exam.start_time)}</p>
                        <p><strong>End:</strong> {formatDateTime(exam.end_time)}</p>
                        <p><strong>Question Paper:</strong> {exam.pdf_path ? 'Available' : 'Not uploaded yet'}</p>
                      </div>
                      <div className="exam-card-footer"><span className="click-hint">Open workspace →</span></div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'violations' && <ViolationsTab user={user} />}

          {activeTab === 'exam' && selectedExam && (
            <ExamPage
              exam={selectedExam}
              user={user}
              onBack={() => {
                setSelectedExam(null);
                setActiveTab('available');
                loadAvailableExams();
                loadExamHistory();
              }}
              onExamStarted={() => {}}
              onExamEnded={() => {
                loadAvailableExams();
                loadExamHistory();
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default StudentDashboard;
