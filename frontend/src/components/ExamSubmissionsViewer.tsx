import React, { useState, useEffect } from 'react';
import './ExamSubmissionsViewer.css';

interface Submission {
  studentId: string;
  fileName: string;
  filePath: string;
  fileSize: number;
  uploadedAt: number;
}

interface SubmissionStats {
  totalStudents: number;
  submittedCount: number;
  notSubmittedCount: number;
  totalFiles: number;
  totalSize: number;
}

interface StudentSubmission {
  studentId: string;
  studentName: string;
  studentUsername: string;
  hasSubmitted: boolean;
  submittedAt?: string;
  files: Submission[];
}

interface ExamSubmissionsViewerProps {
  examId: string;
  examTitle: string;
  onClose: () => void;
}

const ExamSubmissionsViewer: React.FC<ExamSubmissionsViewerProps> = ({
  examId,
  examTitle,
  onClose
}) => {
  const [submissions, setSubmissions] = useState<StudentSubmission[]>([]);
  const [stats, setStats] = useState<SubmissionStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<'all' | 'submitted' | 'pending'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const isElectron = () => !!(window as any).electronAPI;

  // Load submissions data
  const loadSubmissions = async () => {
    try {
      setError(null);

      if (!isElectron()) {
        setError('Submission viewing is only available in desktop mode');
        setLoading(false);
        return;
      }

      // Get all enrolled students for this exam
      const examResult = await (window as any).electronAPI.getExamById(examId);
      if (!examResult.success || !examResult.exam) {
        setError('Failed to load exam details');
        setLoading(false);
        return;
      }

      const courseId = examResult.exam.courseId;
      
      // Get enrolled students
      const studentsResult = await (window as any).electronAPI.getEnrolledStudents(courseId);
      if (!studentsResult.success) {
        setError('Failed to load enrolled students');
        setLoading(false);
        return;
      }

      const enrolledStudents = studentsResult.students || [];

      // Get all submission files
      const filesResult = await (window as any).electronAPI.getAllSubmissionFiles(examId);
      const allFiles = filesResult.success ? filesResult.files || [] : [];

      // Get submission records from database
      const submissionsResult = await (window as any).electronAPI.getExamSubmissions(examId);
      const submissionRecords = submissionsResult.success ? submissionsResult.submissions || [] : [];

      // Build student submission data
      const studentSubmissions: StudentSubmission[] = enrolledStudents.map((student: any) => {
        const studentFiles = allFiles.filter((f: Submission) => f.studentId === student.user_id);
        const submissionRecord = submissionRecords.find((s: any) => s.student_id === student.user_id);

        return {
          studentId: student.user_id,
          studentName: student.full_name,
          studentUsername: student.username,
          hasSubmitted: !!submissionRecord,
          submittedAt: submissionRecord?.submitted_at,
          files: studentFiles
        };
      });

      setSubmissions(studentSubmissions);

      // Get statistics
      const statsResult = await (window as any).electronAPI.getSubmissionStats(examId);
      if (statsResult.success) {
        setStats(statsResult.stats);
      }

      setLoading(false);
    } catch (err) {
      console.error('Error loading submissions:', err);
      setError('Failed to load submissions: ' + (err as Error).message);
      setLoading(false);
    }
  };

  // Auto-refresh every 5 seconds for real-time updates
  useEffect(() => {
    loadSubmissions();
    const interval = setInterval(loadSubmissions, 5000);
    return () => clearInterval(interval);
  }, [examId]);

  // Listen for real-time submission events
  useEffect(() => {
    if (!isElectron()) return;

    const handleNewSubmission = (data: any) => {
      if (data.examId === examId) {
        console.log('New submission received:', data);
        loadSubmissions(); // Reload data
      }
    };

    const removeListener = (window as any).electronAPI?.onNewSubmission?.(handleNewSubmission);

    return () => {
      if (removeListener) removeListener();
    };
  }, [examId]);

  // Download file
  const handleDownloadFile = async (filePath: string, fileName: string) => {
    try {
      if (!isElectron()) return;

      const result = await (window as any).electronAPI.openFile(filePath);
      if (!result.success) {
        alert('Failed to open file: ' + result.error);
      }
    } catch (err) {
      console.error('Error opening file:', err);
      alert('Failed to open file');
    }
  };

  // Format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  // Format date
  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleString();
  };

  // Filter submissions
  const getFilteredSubmissions = () => {
    let filtered = submissions;

    // Apply status filter
    if (filterStatus === 'submitted') {
      filtered = filtered.filter(s => s.hasSubmitted);
    } else if (filterStatus === 'pending') {
      filtered = filtered.filter(s => !s.hasSubmitted);
    }

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(s =>
        s.studentName.toLowerCase().includes(query) ||
        s.studentUsername.toLowerCase().includes(query)
      );
    }

    return filtered;
  };

  const filteredSubmissions = getFilteredSubmissions();

  if (loading) {
    return (
      <div className="submissions-viewer-overlay">
        <div className="submissions-viewer-modal">
          <div className="loading-container">
            <div className="loading-spinner"></div>
            <p>Loading submissions...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="submissions-viewer-overlay">
      <div className="submissions-viewer-modal">
        {/* Header */}
        <div className="submissions-header">
          <div className="header-title">
            <h2>📄 Exam Submissions</h2>
            <p className="exam-title">{examTitle}</p>
          </div>
          <button onClick={onClose} className="close-btn">×</button>
        </div>

        {error && (
          <div className="error-message">
            <span>⚠️ {error}</span>
          </div>
        )}

        {/* Statistics */}
        {stats && (
          <div className="submission-stats">
            <div className="stat-card">
              <div className="stat-value">{stats.submittedCount}/{stats.totalStudents}</div>
              <div className="stat-label">Students Submitted</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{stats.totalFiles}</div>
              <div className="stat-label">Total Files</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{formatFileSize(stats.totalSize)}</div>
              <div className="stat-label">Total Size</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{stats.notSubmittedCount}</div>
              <div className="stat-label">Pending</div>
            </div>
          </div>
        )}

        {/* Controls */}
        <div className="submissions-controls">
          <div className="filter-group">
            <label>Filter:</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as any)}
            >
              <option value="all">All Students ({submissions.length})</option>
              <option value="submitted">Submitted ({submissions.filter(s => s.hasSubmitted).length})</option>
              <option value="pending">Pending ({submissions.filter(s => !s.hasSubmitted).length})</option>
            </select>
          </div>

          <div className="search-group">
            <input
              type="text"
              placeholder="Search by name or username..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-input"
            />
          </div>

          <button onClick={loadSubmissions} className="refresh-btn" title="Refresh">
            🔄 Refresh
          </button>
        </div>

        {/* Submissions List */}
        <div className="submissions-list">
          {filteredSubmissions.length === 0 ? (
            <div className="empty-state">
              <p>No students found matching your filters.</p>
            </div>
          ) : (
            filteredSubmissions.map(student => (
              <div
                key={student.studentId}
                className={`submission-card ${student.hasSubmitted ? 'submitted' : 'pending'}`}
              >
                <div className="student-info">
                  <div className="student-header">
                    <h3>{student.studentName}</h3>
                    <span className={`status-badge ${student.hasSubmitted ? 'submitted' : 'pending'}`}>
                      {student.hasSubmitted ? '✅ Submitted' : '⏳ Pending'}
                    </span>
                  </div>
                  <p className="student-username">@{student.studentUsername}</p>
                  {student.submittedAt && (
                    <p className="submission-time">
                      Submitted: {formatDate(student.submittedAt)}
                    </p>
                  )}
                </div>

                {student.files.length > 0 ? (
                  <div className="files-section">
                    <h4>Uploaded Files ({student.files.length})</h4>
                    <div className="files-list">
                      {student.files.map((file, index) => (
                        <div key={index} className="file-item">
                          <div className="file-info">
                            <span className="file-icon">📎</span>
                            <div className="file-details">
                              <span className="file-name">{file.fileName}</span>
                              <span className="file-meta">
                                {formatFileSize(file.fileSize)} • {new Date(file.uploadedAt).toLocaleString()}
                              </span>
                            </div>
                          </div>
                          <button
                            onClick={() => handleDownloadFile(file.filePath, file.fileName)}
                            className="download-btn"
                            title="Open file"
                          >
                            📥 Open
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="no-files">
                    <p>No files uploaded yet</p>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="submissions-footer">
          <p className="auto-refresh-note">🔄 Auto-refreshing every 5 seconds</p>
          <button onClick={onClose} className="close-footer-btn">Close</button>
        </div>
      </div>
    </div>
  );
};

export default ExamSubmissionsViewer;
