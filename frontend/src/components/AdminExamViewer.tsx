import React, { useState, useEffect } from 'react';
import ExamSubmissionsViewer from './ExamSubmissionsViewer';
import PDFViewer from './PDFViewer';
import './AdminExamViewer.css';

interface Exam {
  examId: string;
  teacherId: string;
  courseId?: string;
  title: string;
  pdfPath?: string;
  startTime: string;
  endTime: string;
  allowedApps: string[];
  createdAt: string;
  teacherName?: string;
  courseName?: string;
  courseCode?: string;
}

interface AdminExamViewerProps {
  currentUser: any;
}

const AdminExamViewer: React.FC<AdminExamViewerProps> = ({ currentUser }) => {
  const [allExams, setAllExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<'all' | 'upcoming' | 'active' | 'completed'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedExamForSubmissions, setSelectedExamForSubmissions] = useState<Exam | null>(null);
  const [showSubmissionsViewer, setShowSubmissionsViewer] = useState(false);
  const [selectedExamForPDF, setSelectedExamForPDF] = useState<Exam | null>(null);
  const [showPDFViewer, setShowPDFViewer] = useState(false);

  const isElectron = () => !!(window as any).electronAPI;

  // Load all exams from all teachers
  const loadAllExams = async () => {
    try {
      setLoading(true);
      setError(null);

      if (!isElectron()) {
        setError('Admin exam viewing is only available in desktop mode');
        setLoading(false);
        return;
      }

      // Get all exams (admin has access to all)
      const result = await (window as any).electronAPI.getAllExams();
      
      if (result.success) {
        setAllExams(result.exams || []);
      } else {
        setError(result.error || 'Failed to load exams');
      }

      setLoading(false);
    } catch (err) {
      console.error('Error loading exams:', err);
      setError('Failed to load exams: ' + (err as Error).message);
      setLoading(false);
    }
  };

  // Auto-refresh every 10 seconds
  useEffect(() => {
    loadAllExams();
    const interval = setInterval(loadAllExams, 10000);
    return () => clearInterval(interval);
  }, []);

  // Get exam status
  const getExamStatus = (exam: Exam): 'upcoming' | 'active' | 'completed' => {
    const now = new Date();
    const startTime = new Date(exam.startTime);
    const endTime = new Date(exam.endTime);

    if (now < startTime) return 'upcoming';
    if (now >= startTime && now < endTime) return 'active';
    return 'completed';
  };

  // Filter exams
  const getFilteredExams = () => {
    let filtered = allExams;

    // Apply status filter
    if (filterStatus !== 'all') {
      filtered = filtered.filter(exam => getExamStatus(exam) === filterStatus);
    }

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(exam =>
        exam.title.toLowerCase().includes(query) ||
        exam.teacherName?.toLowerCase().includes(query) ||
        exam.courseName?.toLowerCase().includes(query) ||
        exam.courseCode?.toLowerCase().includes(query)
      );
    }

    return filtered;
  };

  // Format date
  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleString();
  };

  // Format duration
  const formatDuration = (startTime: string, endTime: string): string => {
    const start = new Date(startTime);
    const end = new Date(endTime);
    const durationMinutes = (end.getTime() - start.getTime()) / (1000 * 60);

    if (durationMinutes < 60) {
      return `${Math.round(durationMinutes)} min`;
    } else {
      const hours = Math.floor(durationMinutes / 60);
      const minutes = Math.round(durationMinutes % 60);
      return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
    }
  };

  const filteredExams = getFilteredExams();
  const stats = {
    total: allExams.length,
    upcoming: allExams.filter(e => getExamStatus(e) === 'upcoming').length,
    active: allExams.filter(e => getExamStatus(e) === 'active').length,
    completed: allExams.filter(e => getExamStatus(e) === 'completed').length
  };

  if (loading) {
    return (
      <div className="admin-exam-viewer">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Loading all exams...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-exam-viewer">
      {/* Submissions Viewer Modal */}
      {showSubmissionsViewer && selectedExamForSubmissions && (
        <ExamSubmissionsViewer
          examId={selectedExamForSubmissions.examId}
          examTitle={selectedExamForSubmissions.title}
          onClose={() => {
            setShowSubmissionsViewer(false);
            setSelectedExamForSubmissions(null);
          }}
        />
      )}

      {/* PDF Viewer Modal */}
      {showPDFViewer && selectedExamForPDF && (
        <PDFViewer
          examId={selectedExamForPDF.examId}
          examTitle={selectedExamForPDF.title}
          onClose={() => {
            setShowPDFViewer(false);
            setSelectedExamForPDF(null);
          }}
        />
      )}

      <div className="admin-exam-header">
        <h2>📚 All Exams (Admin View)</h2>
        <p>View and monitor all exams from all teachers</p>
      </div>

      {error && (
        <div className="error-message">
          <span>⚠️ {error}</span>
          <button onClick={() => setError(null)} className="close-error">×</button>
        </div>
      )}

      {/* Statistics */}
      <div className="exam-stats">
        <div className="stat-card">
          <div className="stat-value">{stats.total}</div>
          <div className="stat-label">Total Exams</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.upcoming}</div>
          <div className="stat-label">Upcoming</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.active}</div>
          <div className="stat-label">Active Now</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.completed}</div>
          <div className="stat-label">Completed</div>
        </div>
      </div>

      {/* Controls */}
      <div className="exam-controls">
        <div className="filter-group">
          <label>Filter:</label>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as any)}
          >
            <option value="all">All Exams ({allExams.length})</option>
            <option value="upcoming">Upcoming ({stats.upcoming})</option>
            <option value="active">Active ({stats.active})</option>
            <option value="completed">Completed ({stats.completed})</option>
          </select>
        </div>

        <div className="search-group">
          <input
            type="text"
            placeholder="Search by exam, teacher, or course..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input"
          />
        </div>

        <button onClick={loadAllExams} className="refresh-btn" title="Refresh">
          🔄 Refresh
        </button>
      </div>

      {/* Exams List */}
      <div className="exams-list">
        {filteredExams.length === 0 ? (
          <div className="empty-state">
            <p>No exams found matching your filters.</p>
          </div>
        ) : (
          <div className="exam-cards">
            {filteredExams.map(exam => {
              const status = getExamStatus(exam);
              
              return (
                <div key={exam.examId} className={`exam-card ${status}`}>
                  <div className="exam-card-header">
                    <div className="exam-title-section">
                      <h3>{exam.title}</h3>
                      <span className={`status-badge ${status}`}>
                        {status === 'upcoming' && '🔒 Upcoming'}
                        {status === 'active' && '🟢 Active'}
                        {status === 'completed' && '✅ Completed'}
                      </span>
                    </div>
                  </div>

                  <div className="exam-card-content">
                    <div className="exam-info">
                      <div className="info-row">
                        <strong>Teacher:</strong> {exam.teacherName || 'Unknown'}
                      </div>
                      <div className="info-row">
                        <strong>Course:</strong> {exam.courseCode ? `${exam.courseCode} - ${exam.courseName}` : 'No course'}
                      </div>
                      <div className="info-row">
                        <strong>Start:</strong> {formatDate(exam.startTime)}
                      </div>
                      <div className="info-row">
                        <strong>End:</strong> {formatDate(exam.endTime)}
                      </div>
                      <div className="info-row">
                        <strong>Duration:</strong> {formatDuration(exam.startTime, exam.endTime)}
                      </div>
                      <div className="info-row">
                        <strong>Allowed Apps:</strong> {exam.allowedApps.length} applications
                      </div>
                      {exam.pdfPath && (
                        <div className="info-row">
                          <strong>Question Paper:</strong> 📄 PDF Available
                        </div>
                      )}
                      <div className="info-row">
                        <strong>Created:</strong> {formatDate(exam.createdAt)}
                      </div>
                    </div>
                  </div>

                  <div className="exam-card-actions">
                    <button
                      onClick={() => {
                        setSelectedExamForSubmissions(exam);
                        setShowSubmissionsViewer(true);
                      }}
                      className="submissions-btn"
                      title="View student submissions"
                    >
                      📄 View Submissions
                    </button>
                    {exam.pdfPath && (
                      <button
                        onClick={() => {
                          setSelectedExamForPDF(exam);
                          setShowPDFViewer(true);
                        }}
                        className="pdf-btn"
                        title="View question paper"
                      >
                        📑 View PDF
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="auto-refresh-note">
        🔄 Auto-refreshing every 10 seconds
      </div>
    </div>
  );
};

export default AdminExamViewer;
