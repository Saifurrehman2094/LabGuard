import React from 'react';
import { useStudentAnalytics } from '../../hooks/useStudentAnalytics';
import StudentsList from './StudentsList';
import StudentProfile from './StudentProfile';
import './StudentsPage.css';

interface StudentsPageProps {
  teacherId: string;
  initialStudentId?: string | null;
}

const StudentsPage: React.FC<StudentsPageProps> = ({ teacherId, initialStudentId = null }) => {
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

  React.useEffect(() => {
    if (initialStudentId) {
      setSelectedStudentId(initialStudentId);
    }
  }, [initialStudentId, setSelectedStudentId]);

  return (
    <div className="students-page">
      <div className="students-page-header">
        <div className="header-left">
          <h1>Student Performance Analytics</h1>
          {lastUpdated && (
            <span className="last-updated">Last updated {new Date(lastUpdated).toLocaleTimeString()}</span>
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
              <span className="refresh-icon">&#8635;</span>
              Refresh
            </>
          )}
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="students-page-content">
        <div className="students-list-pane">
          <StudentsList
            students={students}
            atRiskCount={atRiskStudents.length}
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
