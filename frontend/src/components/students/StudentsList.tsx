import React, { useMemo, useState } from 'react';
import { StudentSummary } from '../../types/studentAnalytics';
import './StudentsList.css';

interface StudentsListProps {
  students: StudentSummary[];
  atRiskCount: number;
  selectedStudentId: string | null;
  onSelectStudent: (studentId: string | null) => void;
  isLoading: boolean;
}

type SortField = 'name' | 'score' | 'lastActive' | 'atRisk';

const StudentsList: React.FC<StudentsListProps> = ({
  students,
  atRiskCount,
  selectedStudentId,
  onSelectStudent,
  isLoading
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<SortField>('name');
  const [showOnlyAtRisk, setShowOnlyAtRisk] = useState(false);

  const filteredStudents = useMemo(() => {
    const filtered = students.filter((student) => {
      const matchesSearch =
        student.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        student.email.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesAtRisk = !showOnlyAtRisk || student.isAtRisk;
      return matchesSearch && matchesAtRisk;
    });

    filtered.sort((a, b) => {
      switch (sortField) {
        case 'score':
          return b.overallAvgScore - a.overallAvgScore;
        case 'lastActive': {
          const aDate = a.lastActive ? new Date(a.lastActive) : new Date(0);
          const bDate = b.lastActive ? new Date(b.lastActive) : new Date(0);
          return bDate.getTime() - aDate.getTime();
        }
        case 'atRisk': {
          const aRisk = a.atRiskConceptCount || 0;
          const bRisk = b.atRiskConceptCount || 0;
          return bRisk - aRisk || a.name.localeCompare(b.name);
        }
        case 'name':
        default:
          return a.name.localeCompare(b.name);
      }
    });

    return filtered;
  }, [students, searchTerm, sortField, showOnlyAtRisk]);

  const getScoreColor = (score: number): string => {
    if (score >= 80) return '#22c55e';
    if (score >= 60) return '#f59e0b';
    return '#ef4444';
  };

  const getRelativeTime = (dateString: string | null): string => {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMins = Math.floor(diffMs / (1000 * 60));

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  if (isLoading) {
    return (
      <div className="students-list">
        <div className="list-loading">Loading students...</div>
      </div>
    );
  }

  if (students.length === 0) {
    return (
      <div className="students-list">
        <div className="list-empty">No students have submitted to your exams yet</div>
      </div>
    );
  }

  return (
    <div className="students-list">
      <div className="list-header">
        <div className="list-title">
          <h2>Students</h2>
          <span className="list-count">
            {filteredStudents.length} of {students.length}
          </span>
        </div>

        {atRiskCount > 0 && (
          <button
            className={`at-risk-card ${showOnlyAtRisk ? 'active' : ''}`}
            onClick={() => setShowOnlyAtRisk(!showOnlyAtRisk)}
          >
            <span className="at-risk-icon">!</span>
            <span className="at-risk-label">At-Risk Students</span>
            <span className="at-risk-count">{atRiskCount}</span>
          </button>
        )}
      </div>

      <div className="list-controls">
        <input
          type="text"
          className="search-input"
          placeholder="Search by name or email..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />

        <div className="sort-buttons">
          {(['name', 'score', 'lastActive', 'atRisk'] as const).map((field) => (
            <button
              key={field}
              className={`sort-btn ${sortField === field ? 'active' : ''}`}
              onClick={() => setSortField(field)}
            >
              {field === 'name' && 'Name'}
              {field === 'score' && 'Score ↓'}
              {field === 'lastActive' && 'Latest'}
              {field === 'atRisk' && 'At-Risk'}
            </button>
          ))}
        </div>
      </div>

      <div className="list-items">
        {filteredStudents.length === 0 ? (
          <div className="list-empty">No students match your search</div>
        ) : (
          filteredStudents.map((student) => (
            <div
              key={student.userId}
              className={`student-row ${selectedStudentId === student.userId ? 'selected' : ''}`}
              onClick={() => onSelectStudent(student.userId)}
            >
              <div className="student-avatar">
                {student.name
                  .split(' ')
                  .map((part) => part[0])
                  .join('')
                  .toUpperCase()
                  .slice(0, 2)}
              </div>

              <div className="student-info">
                <div className="student-name">{student.name}</div>
                <div className="student-email">{student.email}</div>
              </div>

              <div className="student-score">
                <div className="score-circle" style={{ backgroundColor: getScoreColor(student.overallAvgScore) }}>
                  {Math.round(student.overallAvgScore)}%
                </div>
              </div>

              <div className="student-exams">
                <div className="exam-count-badge">{student.examsAttempted}</div>
                <div className="exam-count-label">exams</div>
              </div>

              {student.isAtRisk && student.atRiskConceptCount && student.atRiskConceptCount > 0 && (
                <div className="at-risk-badge">! {student.atRiskConceptCount}</div>
              )}

              <div className="student-last-active">{getRelativeTime(student.lastActive)}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default StudentsList;
