import React from 'react';
import { useStudentAnalytics } from '../../hooks/useStudentAnalytics';
import StudentsList from './StudentsList';
import StudentProfile from './StudentProfile';
import './StudentsPage.css';

interface StudentsPageProps {
  teacherId: string;
}

const StudentsPage: React.FC<StudentsPageProps> = ({ teacherId }) => {
  const {
    students,
    selectedStudentId,
    setSelectedStudentId,
    studentProfile,
    atRiskStudents,
    isLoadingStudents,
    isLoadingProfile,
    lastUpdated,
    refresh,
    generateReport,
    error
  } = useStudentAnalytics(teacherId);

  const atRiskCount = atRiskStudents.length;

  return (
    <div className="students-page">
      {/* Header */}
      <div className="students-page-header">
        <div className="header-left">
          <h1>Student Performance Analytics</h1>
          {lastUpdated && (
            <span className="last-updated">
              Last updated {new Date(lastUpdated).toLocaleTimeString()}
            </span>
          )}
        </div>

        <button className="refresh-btn" onClick={refresh} disabled={isLoadingStudents}>
          {isLoadingStudents ? (
            <>
              <span className="spinner" />
              Refreshing...
            </>
          ) : (
            <>
              <span className="refresh-icon">↻</span>
              Refresh
            </>
          )}
        </button>
      </div>

      {/* Error message */}
      {error && <div className="error-banner">{error}</div>}

      {/* Main content */}
      <div className="students-page-content">
        <div className="students-list-pane">
          <StudentsList
            students={students}
            atRiskCount={atRiskCount}
            selectedStudentId={selectedStudentId}
            onSelectStudent={setSelectedStudentId}
            isLoading={isLoadingStudents}
          />
        </div>

        <div className="students-profile-pane">
          <StudentProfile
            profile={studentProfile}
            isLoading={isLoadingProfile}
            onGenerateReport={generateReport}
            onBack={() => setSelectedStudentId(null)}
          />
        </div>
      </div>
    </div>
  );
};

export default StudentsPage;
