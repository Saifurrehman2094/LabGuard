import React from 'react';
import { ExamPerformance } from '../../types/studentAnalytics';
import './ExamTimeline.css';

interface ExamTimelineProps {
  exams: ExamPerformance[];
}

const ExamTimeline: React.FC<ExamTimelineProps> = ({ exams }) => {
  const getScoreColor = (score: number): string => {
    if (score >= 80) return '#22c55e';
    if (score >= 60) return '#f59e0b';
    return '#ef4444';
  };

  return (
    <div className="exam-timeline">
      {exams.map((exam, idx) => (
        <div key={exam.examId} className="timeline-item">
          {/* Connector line */}
          {idx < exams.length - 1 && <div className="timeline-connector" />}

          {/* Score circle */}
          <div className="timeline-node">
            <div
              className="timeline-score-circle"
              style={{ backgroundColor: getScoreColor(exam.avgScore) }}
            >
              {Math.round(exam.avgScore)}%
            </div>
          </div>

          {/* Exam details */}
          <div className="timeline-content">
            <h3 className="timeline-title">{exam.examTitle}</h3>
            <p className="timeline-date">{new Date(exam.examDate).toLocaleDateString()}</p>

            <div className="timeline-stats">
              <div className="stat">
                <span className="stat-label">Questions</span>
                <span className="stat-value">{exam.questionsAttempted}</span>
              </div>
              <div className="stat">
                <span className="stat-label">Passed</span>
                <span className="stat-value passed">{exam.passedCount}</span>
              </div>
              <div className="stat">
                <span className="stat-label">Failed</span>
                <span className="stat-value failed">{exam.failedCount}</span>
              </div>
              {exam.hardcodingFlags > 0 && (
                <div className="stat warning">
                  <span className="stat-label">Hardcoding</span>
                  <span className="stat-value">{exam.hardcodingFlags}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default ExamTimeline;
