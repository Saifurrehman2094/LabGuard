import React, { useState } from 'react';
import ExamEditModal from './ExamEditModal';
import PDFViewer from './PDFViewer';
import './ExamList.css';

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

interface ExamListProps {
  exams: Exam[];
  onExamUpdated: (exam: Exam) => void;
  onExamDeleted: (examId: string) => void;
  onRefresh: () => void;
}

const ExamList: React.FC<ExamListProps> = ({
  exams,
  onExamUpdated,
  onExamDeleted,
  onRefresh
}) => {
  const [editingExam, setEditingExam] = useState<Exam | null>(null);
  const [deletingExam, setDeletingExam] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'startTime' | 'title' | 'createdAt'>('startTime');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [filterStatus, setFilterStatus] = useState<'all' | 'upcoming' | 'active' | 'completed'>('all');
  const [showPDFViewer, setShowPDFViewer] = useState(false);
  const [selectedExamForPDF, setSelectedExamForPDF] = useState<Exam | null>(null);

  // Check if running in Electron
  const isElectron = () => {
    return !!(window as any).electronAPI;
  };

  // Get exam status
  const getExamStatus = (exam: Exam): 'upcoming' | 'active' | 'completed' => {
    const now = new Date();
    const startTime = new Date(exam.startTime);
    const endTime = new Date(exam.endTime);

    if (now < startTime) return 'upcoming';
    if (now >= startTime && now < endTime) return 'active';
    return 'completed';
  };

  // Filter and sort exams
  const getFilteredAndSortedExams = () => {
    let filtered = exams;

    // Apply status filter
    if (filterStatus !== 'all') {
      filtered = exams.filter(exam => getExamStatus(exam) === filterStatus);
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let aValue: string | Date;
      let bValue: string | Date;

      switch (sortBy) {
        case 'startTime':
          aValue = new Date(a.startTime);
          bValue = new Date(b.startTime);
          break;
        case 'title':
          aValue = a.title.toLowerCase();
          bValue = b.title.toLowerCase();
          break;
        case 'createdAt':
          aValue = new Date(a.createdAt);
          bValue = new Date(b.createdAt);
          break;
        default:
          aValue = new Date(a.startTime);
          bValue = new Date(b.startTime);
      }

      if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  };

  // Handle sort change
  const handleSortChange = (newSortBy: typeof sortBy) => {
    if (sortBy === newSortBy) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(newSortBy);
      setSortOrder('asc');
    }
  };

  // Handle exam deletion
  const handleDeleteExam = async (examId: string) => {
    try {
      setDeletingExam(examId);

      if (isElectron()) {
        const result = await (window as any).electronAPI.deleteExam(examId);
        if (result.success) {
          onExamDeleted(examId);
        } else {
          alert(result.error || 'Failed to delete exam');
        }
      } else {
        // Development mode - simulate deletion
        await new Promise(resolve => setTimeout(resolve, 500));
        onExamDeleted(examId);
      }
    } catch (error) {
      console.error('Error deleting exam:', error);
      alert('Failed to delete exam. Please try again.');
    } finally {
      setDeletingExam(null);
    }
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

  const scheduleLine = (iso: string) => {
    const d = new Date(iso);
    return {
      date: d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }),
      time: d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }),
    };
  };

  const filteredExams = getFilteredAndSortedExams();

  return (
    <div className="exam-list">
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

      {/* Controls */}
      <div className="exam-list-controls">
        <div className="filter-controls">
          <label>Filter by status:</label>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as any)}
          >
            <option value="all">All Exams</option>
            <option value="upcoming">Upcoming</option>
            <option value="active">Active</option>
            <option value="completed">Completed</option>
          </select>
        </div>

        <div className="sort-controls">
          <label>Sort by:</label>
          <button
            className={`sort-btn ${sortBy === 'startTime' ? 'active' : ''}`}
            onClick={() => handleSortChange('startTime')}
          >
            Start Time {sortBy === 'startTime' && (sortOrder === 'asc' ? '↑' : '↓')}
          </button>
          <button
            className={`sort-btn ${sortBy === 'title' ? 'active' : ''}`}
            onClick={() => handleSortChange('title')}
          >
            Title {sortBy === 'title' && (sortOrder === 'asc' ? '↑' : '↓')}
          </button>
          <button
            className={`sort-btn ${sortBy === 'createdAt' ? 'active' : ''}`}
            onClick={() => handleSortChange('createdAt')}
          >
            Created {sortBy === 'createdAt' && (sortOrder === 'asc' ? '↑' : '↓')}
          </button>
        </div>

        <button onClick={onRefresh} className="refresh-btn">
          Refresh
        </button>
      </div>

      {/* Exam List */}
      {filteredExams.length === 0 ? (
        <div className="empty-state">
          {filterStatus === 'all' ? (
            <p>No exams found.</p>
          ) : (
            <p>No {filterStatus} exams found.</p>
          )}
        </div>
      ) : (
        <div className="exam-cards">
          {filteredExams.map(exam => {
            const status = getExamStatus(exam);
            const isDeleting = deletingExam === exam.examId;

            const start = scheduleLine(exam.startTime);
            const end = scheduleLine(exam.endTime);

            return (
              <article
                key={exam.examId}
                className={`exam-card exam-card--status-${status} ${isDeleting ? 'deleting' : ''}`}
                data-status={status}
              >
                <header className="exam-card-header">
                  <div className="exam-card-title-block">
                    <h3>{exam.title}</h3>
                    <p className="exam-card-sub">
                      {formatDuration(exam.startTime, exam.endTime)}
                      <span className="exam-card-sub-sep" aria-hidden>
                        ·
                      </span>
                      {exam.allowedApps.length} allowed app{exam.allowedApps.length === 1 ? '' : 's'}
                    </p>
                  </div>
                  <span className={`status-pill status-pill--${status}`}>
                    <span className="status-pill-dot" aria-hidden />
                    {status === 'upcoming' && 'Upcoming'}
                    {status === 'active' && 'Live'}
                    {status === 'completed' && 'Ended'}
                  </span>
                </header>

                <div className="exam-card-schedule" aria-label="Exam window">
                  <div className="schedule-point">
                    <span className="schedule-kicker">Opens</span>
                    <span className="schedule-date">{start.date}</span>
                    <span className="schedule-time">{start.time}</span>
                  </div>
                  <div className="schedule-bridge" aria-hidden>
                    <span className="schedule-bridge-line" />
                  </div>
                  <div className="schedule-point schedule-point--end">
                    <span className="schedule-kicker">Closes</span>
                    <span className="schedule-date">{end.date}</span>
                    <span className="schedule-time">{end.time}</span>
                  </div>
                </div>

                <div className="exam-card-toolbar">
                  <span className="toolbar-meta">
                    Created {new Date(exam.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                  {exam.pdfPath ? (
                    <button
                      type="button"
                      className="toolbar-pdf"
                      onClick={() => {
                        setSelectedExamForPDF(exam);
                        setShowPDFViewer(true);
                      }}
                      title="Open question paper"
                    >
                      View PDF
                    </button>
                  ) : (
                    <span className="toolbar-meta toolbar-meta--muted">No PDF</span>
                  )}
                </div>

                <section className="exam-card-apps" aria-label="Allowed applications">
                  <div className="app-tags">
                    {exam.allowedApps.length === 0 ? (
                      <span className="app-tag app-tag--empty">No app whitelist</span>
                    ) : (
                      <>
                        {exam.allowedApps.slice(0, 4).map((app) => (
                          <span key={app} className="app-tag">
                            {app}
                          </span>
                        ))}
                        {exam.allowedApps.length > 4 && (
                          <span className="app-tag app-tag--more">+{exam.allowedApps.length - 4}</span>
                        )}
                      </>
                    )}
                  </div>
                </section>

                <footer className="exam-card-footer">
                  <button
                    type="button"
                    onClick={() => setEditingExam(exam)}
                    className="exam-card-btn exam-card-btn--edit"
                    disabled={isDeleting}
                  >
                    Edit exam
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(`Are you sure you want to delete "${exam.title}"?`)) {
                        handleDeleteExam(exam.examId);
                      }
                    }}
                    className="exam-card-btn exam-card-btn--delete"
                    disabled={isDeleting}
                  >
                    {isDeleting ? 'Removing…' : 'Delete'}
                  </button>
                </footer>
              </article>
            );
          })}
        </div>
      )}

      {/* Edit Modal */}
      {editingExam && (
        <ExamEditModal
          exam={editingExam}
          onClose={() => setEditingExam(null)}
          onExamUpdated={(updatedExam) => {
            onExamUpdated(updatedExam);
            setEditingExam(null);
          }}
        />
      )}
    </div>
  );
};

export default ExamList;