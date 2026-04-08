import React, { useState, useEffect, useCallback } from 'react';
import ExamCreationForm from './ExamCreationForm';
import ExamList from './ExamList';
import ViolationReport from './ViolationReport';
import CodeEvaluationTab from './CodeEvaluationTab';
import CodeQuestionsTab from './CodeQuestionsTab';
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
  const [activeTab, setActiveTab] = useState<'overview' | 'exams' | 'testCaseStudio' | 'submissions' | 'integrity'>('overview');
  const [exams, setExams] = useState<Exam[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedExamId, setSelectedExamId] = useState<string>('');
  const [showCreateExamForm, setShowCreateExamForm] = useState(false);
  const [pendingEvaluations, setPendingEvaluations] = useState(0);
  const [flaggedIntegrityCases, setFlaggedIntegrityCases] = useState(0);
  const [recentSubmissions, setRecentSubmissions] = useState<any[]>([]);
  const [recentFlaggedEvents, setRecentFlaggedEvents] = useState<any[]>([]);
  const loadTeacherOverviewMetrics = useCallback(async () => {
    if (!isElectron() || !selectedExamId) {
      setPendingEvaluations(0);
      setFlaggedIntegrityCases(0);
      setRecentSubmissions([]);
      setRecentFlaggedEvents([]);
      return;
    }

    try {
      const [evaluationsRes, integrityRes, recentSubmissionsRes, recentEventsRes] = await Promise.all([
        (window as any).electronAPI.getEvaluationsByExam(selectedExamId),
        (window as any).electronAPI.getIntegrityReviewData?.(selectedExamId),
        (window as any).electronAPI.getDashboardSubmissionsRecent?.(selectedExamId),
        (window as any).electronAPI.getDashboardEventsRecent?.(selectedExamId)
      ]);

      const evaluationRows = evaluationsRes?.success ? evaluationsRes.data || [] : [];
      const pendingCount = evaluationRows.filter((row: any) => {
        if (row?.aggregates?.is_pending === true) return true;
        const pendingQuestions = Number(row?.aggregates?.pending_questions ?? 0);
        if (pendingQuestions > 0) return true;
        const status = String(row?.aggregates?.last_status || '').toLowerCase();
        return !status || status === 'not_evaluated' || status === 'pending' || status === 'partial';
      }).length;
      setPendingEvaluations(pendingCount);

      const studentsWithIncidents = integrityRes?.success ? (integrityRes.students || []) : [];
      const flaggedCount = studentsWithIncidents.filter((s: any) => !s?.isReviewed).length;
      setFlaggedIntegrityCases(flaggedCount);

      const recentSubs = recentSubmissionsRes?.success
        ? (recentSubmissionsRes.submissions || recentSubmissionsRes.data || []).slice(0, 5)
        : [];
      const recentEvents = recentEventsRes?.success
        ? (recentEventsRes.events || recentEventsRes.data || []).slice(0, 5)
        : [];

      setRecentSubmissions(recentSubs);
      setRecentFlaggedEvents(recentEvents);
    } catch (metricsError) {
      console.warn('Failed loading teacher overview metrics:', metricsError);
      setPendingEvaluations(0);
      setFlaggedIntegrityCases(0);
      setRecentSubmissions([]);
      setRecentFlaggedEvents([]);
    }
  }, [selectedExamId]);


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

  useEffect(() => {
    if (!selectedExamId && exams.length > 0) {
      setSelectedExamId(exams[0].examId);
    }
  }, [exams, selectedExamId]);

  useEffect(() => {
    loadTeacherOverviewMetrics();
  }, [loadTeacherOverviewMetrics]);

  useEffect(() => {
    if (!isElectron() || !(window as any).electronAPI?.onDashboardUpdated) return;
    const unsubscribe = (window as any).electronAPI.onDashboardUpdated(() => {
      loadTeacherOverviewMetrics();
    });
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [loadTeacherOverviewMetrics]);

  useEffect(() => {
    if (!isElectron() || !selectedExamId) return;
    const intervalId = window.setInterval(() => {
      loadTeacherOverviewMetrics();
    }, 10000);
    return () => window.clearInterval(intervalId);
  }, [selectedExamId, loadTeacherOverviewMetrics]);

  // Handle exam creation success
  const handleExamCreated = (newExam: Exam) => {
    setExams(prev => [newExam, ...prev]);
    setSelectedExamId(newExam.examId);
    setActiveTab('exams');
    setShowCreateExamForm(false);
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
    if (selectedExamId === examId) {
      setSelectedExamId('');
    }
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
  const selectedExam = exams.find(exam => exam.examId === selectedExamId);
  const completedExams = exams.filter(exam => new Date(exam.endTime) <= new Date());
  const formatDateTime = (value: string) => new Date(value).toLocaleString();

  return (
    <div className="teacher-dashboard">
      <div className="dashboard-header">
        <div className="header-content">
          <div className="user-info">
            <h1>Teacher Dashboard</h1>
            <p>Welcome back, {user.fullName}. Focus on grading and integrity review.</p>
          </div>
          <button onClick={onLogout} className="logout-btn">
            Logout
          </button>
        </div>
      </div>

      <div className="dashboard-nav">
        <button
          className={`nav-tab ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        <button
          className={`nav-tab ${activeTab === 'exams' ? 'active' : ''}`}
          onClick={() => setActiveTab('exams')}
        >
          Exams
        </button>
        <button
          className={`nav-tab ${activeTab === 'testCaseStudio' ? 'active' : ''}`}
          onClick={() => setActiveTab('testCaseStudio')}
        >
          Test Case Studio
        </button>
        <button
          className={`nav-tab ${activeTab === 'submissions' ? 'active' : ''}`}
          onClick={() => setActiveTab('submissions')}
        >
          Submissions & Evaluation
        </button>
        <button
          className={`nav-tab ${activeTab === 'integrity' ? 'active' : ''}`}
          onClick={() => setActiveTab('integrity')}
        >
          Integrity Review
        </button>
      </div>

      <div className="teacher-context-bar">
        <label htmlFor="teacher-exam-select">Exam</label>
        <select
          id="teacher-exam-select"
          value={selectedExamId}
          onChange={(e) => setSelectedExamId(e.target.value)}
        >
          <option value="">Select an exam</option>
          {exams.map((exam) => (
            <option key={exam.examId} value={exam.examId}>
              {exam.title} ({new Date(exam.startTime).toLocaleDateString()})
            </option>
          ))}
        </select>
        <div className="teacher-context-actions">
          <button type="button" className="mini-btn" onClick={() => setActiveTab('exams')}>
            Create exam
          </button>
          <button type="button" className="mini-btn" onClick={() => setActiveTab('submissions')}>
            Continue grading
          </button>
          <button type="button" className="mini-btn danger" onClick={() => setActiveTab('integrity')}>
            Review flagged cases
          </button>
        </div>
      </div>

      <div className="dashboard-content">
        {activeTab === 'overview' && (
          <div className="overview-tab">
            <div className="stats-grid">
              <div className="stat-card">
                <h3>Total Exams</h3>
                <div className="stat-number">{stats.total}</div>
              </div>
              <div className="stat-card">
                <h3>Active Exams</h3>
                <div className="stat-number">{stats.active}</div>
              </div>
              <div className="stat-card">
                <h3>Pending Evaluations</h3>
                <div className="stat-number">{pendingEvaluations}</div>
              </div>
              <div className="stat-card">
                <h3>Flagged Integrity Cases</h3>
                <div className="stat-number">{flaggedIntegrityCases}</div>
              </div>
            </div>

            <div className="overview-panels">
              <div className="recent-exams">
                <h2>Recent submissions</h2>
                {recentSubmissions.length === 0 ? (
                  <div className="empty-state compact">
                    <p>No recent submissions available.</p>
                  </div>
                ) : (
                  <div className="activity-list">
                    {recentSubmissions.map((submission, idx) => (
                      <div className="activity-item" key={submission.submission_id || idx}>
                        <strong>{submission.full_name || submission.student_name || 'Student submission'}</strong>
                        <span>{formatDateTime(submission.submitted_at || submission.created_at || new Date().toISOString())}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="recent-exams">
                <h2>Recent flagged incidents</h2>
                {recentFlaggedEvents.length === 0 ? (
                  <div className="empty-state compact">
                    <p>No recent incidents.</p>
                  </div>
                ) : (
                  <div className="activity-list">
                    {recentFlaggedEvents.map((event, idx) => (
                      <div className="activity-item" key={event.event_id || idx}>
                        <strong>{event.event_type || event.type || event.violation_type || 'Integrity event'}</strong>
                        <span>{formatDateTime(event.created_at || event.timestamp || new Date().toISOString())}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'exams' && (
          <div className="manage-tab">
            <div className="section-header">
              <h2>Exams</h2>
              <button className="btn-primary" onClick={() => setShowCreateExamForm((prev) => !prev)}>
                {showCreateExamForm ? 'Hide create form' : 'Create exam'}
              </button>
            </div>
            {showCreateExamForm && (
              <div className="create-exam-panel">
                <ExamCreationForm
                  user={user}
                  onExamCreated={handleExamCreated}
                />
              </div>
            )}
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

        {activeTab === 'testCaseStudio' && (
          <div className="monitoring-tab">
            <h2>Test Case Studio</h2>
            {!selectedExam ? (
              <div className="no-exam-selected">
                <div className="placeholder-content">
                  <h3>Select an exam to build requirements and test cases</h3>
                  <p>Pick an exam from the selector above to open the studio.</p>
                </div>
              </div>
            ) : (
              <CodeQuestionsTab exam={{ examId: selectedExam.examId, title: selectedExam.title, pdfPath: selectedExam.pdfPath }} />
            )}
          </div>
        )}

        {activeTab === 'submissions' && (
          <div className="code-eval-tab-wrapper">
            <CodeEvaluationTab exams={exams} initialExamId={selectedExamId} />
          </div>
        )}

        {activeTab === 'integrity' && (
          <div className="monitoring-tab">
            <h2>Integrity Review</h2>
            {completedExams.length === 0 ? (
              <div className="no-exam-selected">
                <div className="placeholder-content">
                  <h3>No completed exams available</h3>
                  <p>Integrity review is available after an exam ends.</p>
                </div>
              </div>
            ) : !selectedExamId ? (
              <div className="no-exam-selected">
                <div className="placeholder-content">
                  <h3>Select an exam to review flagged incidents</h3>
                  <p>Choose an exam from the selector above.</p>
                </div>
              </div>
            ) : (
              <ViolationReport
                examId={selectedExamId}
                examTitle={selectedExam?.title || 'Selected exam'}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default TeacherDashboard;
