import React from 'react';
import { QuestionStat } from '../../hooks/useDashboardData';

interface QuestionAccuracyProps {
  questions: QuestionStat[];
  exams: Array<{ examId: string; examTitle: string; createdAt: string }>;
  selectedExamId: string;
  onExamChange: (id: string) => void;
}

const DIFF_COLORS: Record<string, string> = {
  easy: '#4ade80',
  medium: '#f59e0b',
  hard: '#f87171',
};

const QuestionAccuracy: React.FC<QuestionAccuracyProps> = ({
  questions,
  exams,
  selectedExamId,
  onExamChange,
}) => {
  return (
    <div className="dash-panel">
      <div className="dash-panel-header">
        <span className="dash-panel-title">Per-Question Accuracy</span>
        <select
          className="dash-select"
          value={selectedExamId}
          onChange={e => onExamChange(e.target.value)}
        >
          {exams.length === 0 && <option value="">No exams</option>}
          {exams.map(ex => (
            <option key={ex.examId} value={ex.examId}>
              {ex.examTitle}
            </option>
          ))}
        </select>
      </div>

      <div className="dash-qa-list">
        {questions.length === 0 && (
          <div className="dash-empty-note">
            {selectedExamId
              ? 'No questions with test cases for this exam.'
              : 'Select an exam above.'}
          </div>
        )}
        {questions.map(q => {
          const pct = q.accuracyPercent;
          const barColor =
            pct >= 80
              ? '#4ade80'
              : pct >= 50
              ? '#f59e0b'
              : pct === 0 && q.testCaseCount === 0
              ? '#3d4260'
              : '#f87171';
          const diffColor = DIFF_COLORS[q.difficulty] ?? '#94a3b8';

          return (
            <div key={q.questionId} className="dash-qa-row">
              <div className="dash-qa-meta">
                <span className="dash-qa-title">{q.title}</span>
                <div className="dash-qa-badges">
                  <span className="dash-badge" style={{ color: diffColor, borderColor: diffColor }}>
                    {q.difficulty}
                  </span>
                  {q.requiredConcepts.slice(0, 3).map(c => (
                    <span key={c} className="dash-badge dash-badge-concept">{c}</span>
                  ))}
                </div>
              </div>
              <div className="dash-qa-bar-wrap">
                <div className="dash-qa-bar-bg">
                  <div
                    className="dash-qa-bar-fill"
                    style={{ width: `${pct}%`, background: barColor }}
                  />
                </div>
                <span className="dash-qa-pct" style={{ color: barColor }}>
                  {q.testCaseCount === 0 ? '—' : `${pct}%`}
                </span>
                <span className="dash-qa-counts">
                  {q.correctCount}/{q.testCaseCount} cases
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default QuestionAccuracy;
