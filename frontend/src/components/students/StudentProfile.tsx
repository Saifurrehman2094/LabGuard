import React from 'react';
import { StudentProfile as StudentProfileType } from '../../types/studentAnalytics';
import ConceptHeatmap from './ConceptHeatmap';
import AtRiskPanel from './AtRiskPanel';
import ReportGenerator from './ReportGenerator';
import ExamTimeline from './ExamTimeline';
import './StudentProfile.css';

interface StudentProfileProps {
  profile: StudentProfileType | null;
  isLoading: boolean;
  onGenerateReport: (studentId: string, format: 'text' | 'json') => Promise<void>;
  onBack: () => void;
}

const StudentProfile: React.FC<StudentProfileProps> = ({
  profile,
  isLoading,
  onGenerateReport,
  onBack
}) => {
  if (isLoading) {
    return (
      <div className="student-profile">
        <div className="profile-loading">Loading profile...</div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="student-profile">
        <div className="profile-empty">Select a student to view their profile</div>
      </div>
    );
  }

  const { student, conceptStats, examPerformance, atRiskConcepts, overallTrend, submissions } = profile;

  const getTrendIndicator = (trend: string): string => {
    if (trend === 'improving') return '↑';
    if (trend === 'declining') return '↓';
    return '→';
  };

  const getTrendLabel = (trend: string): string => {
    if (trend === 'improving') return 'Improving';
    if (trend === 'declining') return 'Declining';
    if (trend === 'stable') return 'Stable';
    return 'Insufficient data';
  };

  return (
    <div className="student-profile">
      <div className="profile-breadcrumb">
        <button onClick={onBack} className="breadcrumb-back">
          ← Students
        </button>
        <span className="breadcrumb-separator">/</span>
        <span className="breadcrumb-current">{student.name}</span>
      </div>

      <div className="profile-container">
        <div className="profile-left">
          <div className="student-header-card">
            <div className="student-header-avatar">
              {student.name
                .split(' ')
                .map((part) => part[0])
                .join('')
                .toUpperCase()
                .slice(0, 2)}
            </div>

            <div className="student-header-content">
              <h1 className="student-header-name">{student.name}</h1>
              <p className="student-header-email">{student.email}</p>

              <div className="student-stats">
                <div className="stat-item">
                  <span className="stat-label">Overall Score</span>
                  <span className="stat-value">{student.overallAvgScore}%</span>
                </div>
                <div className="stat-divider" />
                <div className="stat-item">
                  <span className="stat-label">Trend</span>
                  <span className={`stat-value trend-${overallTrend}`}>
                    {getTrendIndicator(overallTrend)} {getTrendLabel(overallTrend)}
                  </span>
                </div>
                <div className="stat-divider" />
                <div className="stat-item">
                  <span className="stat-label">Exams</span>
                  <span className="stat-value">{student.examsAttempted}</span>
                </div>
              </div>
            </div>

            <div className="student-header-action">
              <ReportGenerator studentId={student.userId} onGenerateReport={onGenerateReport} />
            </div>
          </div>

          {examPerformance.length > 0 && (
            <div className="profile-section">
              <h2 className="section-title">Exam Timeline</h2>
              <ExamTimeline exams={examPerformance} />
            </div>
          )}
        </div>

        <div className="profile-right">
          {atRiskConcepts.length > 0 && <AtRiskPanel concepts={atRiskConcepts} />}

          <div className="profile-section">
            <h2 className="section-title">Concept Performance</h2>
            {conceptStats.length > 0 ? (
              <ConceptHeatmap concepts={conceptStats} />
            ) : (
              <div className="empty-message">No concept data available</div>
            )}
          </div>

          {submissions.length > 0 && (
            <div className="profile-section">
              <h2 className="section-title">Recent Submissions</h2>
              <div className="submissions-table">
                <div className="table-header">
                  <div className="col-question">Question</div>
                  <div className="col-exam">Exam</div>
                  <div className="col-score">Score</div>
                  <div className="col-status">Status</div>
                  <div className="col-date">Date</div>
                </div>

                {submissions.slice(-10).map((submission, index) => (
                  <div key={submission.submission_id || index} className="table-row">
                    <div className="col-question">
                      <div className="question-name">{submission.questionTitle}</div>
                    </div>
                    <div className="col-exam">{submission.examTitle}</div>
                    <div className="col-score">
                      <span
                        className={`score-badge ${
                          submission.score >= 80 ? 'pass' : submission.score >= 60 ? 'partial' : 'fail'
                        }`}
                      >
                        {submission.score}%
                      </span>
                    </div>
                    <div className="col-status">
                      <span className={`status-badge ${submission.concept_passed ? 'passed' : 'failed'}`}>
                        {submission.concept_passed ? 'Pass' : 'Fail'}
                      </span>
                    </div>
                    <div className="col-date">{new Date(submission.submitted_at).toLocaleDateString()}</div>
                  </div>
                ))}
              </div>

              {submissions.length > 10 && (
                <div className="more-submissions">... and {submissions.length - 10} more submissions</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default StudentProfile;
