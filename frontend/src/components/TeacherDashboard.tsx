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

type TeacherTabId = 'overview' | 'exams' | 'testCaseStudio' | 'submissions' | 'integrity';

const teacherInitials = (fullName: string): string => {
  const trimmed = fullName.trim();
  if (!trimmed) return '?';
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const first = parts[0]?.[0] || '';
    const last = parts[parts.length - 1]?.[0] || '';
    return `${first}${last}`.toUpperCase();
  }
  return trimmed.slice(0, 2).toUpperCase();
};

const TeacherNavIcon: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="teacher-sidebar__icon" aria-hidden>
    {children}
  </span>
);

const ICON_OVERVIEW = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
    <rect x="3" y="3" width="7" height="7" />
    <rect x="14" y="3" width="7" height="4" />
    <rect x="14" y="10" width="7" height="11" />
    <rect x="3" y="14" width="7" height="7" />
  </svg>
);
const ICON_EXAMS = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
  </svg>
);
const ICON_STUDIO = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
    <polyline points="16 18 22 12 16 6" />
    <polyline points="8 6 2 12 8 18" />
  </svg>
);
const ICON_SUBMISSIONS = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
    <line x1="10" y1="9" x2="8" y2="9" />
  </svg>
);
const ICON_INTEGRITY = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <path d="M9 12l2 2 4-4" />
  </svg>
);
const ICON_LOGOUT = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);

const TEACHER_NAV: { id: TeacherTabId; label: string; hint: string; icon: React.ReactNode }[] = [
  { id: 'overview', label: 'Overview', hint: 'Queue and exam pulse', icon: ICON_OVERVIEW },
  { id: 'exams', label: 'Exam Setup', hint: 'Create and manage exams', icon: ICON_EXAMS },
  { id: 'testCaseStudio', label: 'Test Case Studio', hint: 'Question requirements', icon: ICON_STUDIO },
  { id: 'submissions', label: 'Submissions', hint: 'Evaluate and grade', icon: ICON_SUBMISSIONS },
  { id: 'integrity', label: 'Integrity Review', hint: 'Evidence-based review', icon: ICON_INTEGRITY }
];

const TeacherDashboard: React.FC<TeacherDashboardProps> = ({ user, onLogout }) => {
  const [activeTab, setActiveTab] = useState<TeacherTabId>('overview');
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
    <div className="teacher-dashboard teacher-dashboard--shell">
      <aside className="teacher-dashboard__sidebar" aria-label="Teacher navigation">
        <div className="teacher-sidebar__brand">
          <span className="teacher-sidebar__logo-mark" aria-hidden>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 10v6M2 10l10-5 10 5-10 5-10-5z" />
              <path d="M6 12v5c0 1.3 2.7 3 6 3s6-1.7 6-3v-5" />
            </svg>
          </span>
          <div className="teacher-sidebar__brand-text">
            <span className="teacher-sidebar__product">LabGuard</span>
            <span className="teacher-sidebar__product-tag">Teacher</span>
          </div>
        </div>
        <nav className="teacher-sidebar__nav" aria-label="Teacher sections">
          {TEACHER_NAV.map(({ id, label, hint, icon }) => (
            <button
              key={id}
              type="button"
              className={`teacher-sidebar__link${activeTab === id ? ' teacher-sidebar__link--active' : ''}`}
              onClick={() => setActiveTab(id)}
              aria-current={activeTab === id ? 'page' : undefined}
            >
              <TeacherNavIcon>{icon}</TeacherNavIcon>
              <span className="teacher-sidebar__link-copy">
                <span className="teacher-sidebar__link-label">{label}</span>
                <span className="teacher-sidebar__link-hint">{hint}</span>
              </span>
            </button>
          ))}
        </nav>
        <div className="teacher-sidebar__footer">
          <div className="teacher-sidebar__user">
            <span className="teacher-sidebar__avatar" aria-hidden>
              {teacherInitials(user.fullName)}
            </span>
            <div className="teacher-sidebar__user-meta">
              <span className="teacher-sidebar__user-name">{user.fullName}</span>
              <span className="teacher-sidebar__user-role">Course teacher</span>
            </div>
          </div>
          <button type="button" onClick={onLogout} className="teacher-sidebar__logout">
            {ICON_LOGOUT}
            <span>Logout</span>
          </button>
        </div>
      </aside>
      <div className="teacher-dashboard__main lg-atmosphere-bg">
        <header className="teacher-main-header">
          <div className="teacher-main-header__title">
            <h1>Teacher Dashboard</h1>
            <p>Keep grading fair, evidence-led, and easy to review.</p>
          </div>
          <div className="teacher-context-bar">
            <label htmlFor="teacher-exam-select">Current exam</label>
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
                Review flagged
              </button>
            </div>
          </div>
        </header>

        <main className="dashboard-content teacher-dashboard-content">
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
        </main>
      </div>
    </div>
  );
};

export default TeacherDashboard;
