import React, { useEffect, useMemo, useState } from 'react';
import EvaluationDetailModal from './EvaluationDetailModal';
import './StudentScoresPanel.css';

interface Exam {
  examId: string;
  title: string;
}

interface QuestionMeta {
  question_id: string;
  title: string;
  marks: number;
  question_order: number;
}

interface QuestionScore {
  questionId: string;
  evaluationId: string | null;
  earnedPct: number | null;
  earned: number | null;
  maxMarks: number;
  attempts: number;
  hardcoded: boolean;
  conceptFailed: boolean;
  lastSubmitted: string | null;
}

interface StudentRow {
  studentId: string;
  studentName: string;
  username: string;
  scores: QuestionScore[];
  totalEarned: number;
  totalMax: number;
  totalPct: number;
}

interface StudentScoresPanelProps {
  exams: Exam[];
  onOpenProfile?: (studentId: string) => void;
}

function pctClass(pct: number | null): string {
  if (pct === null) return 'cell-none';
  if (pct >= 80) return 'cell-green';
  if (pct >= 50) return 'cell-yellow';
  return 'cell-red';
}

function totalClass(pct: number): string {
  if (pct >= 80) return 'total-green';
  if (pct >= 50) return 'total-yellow';
  return 'total-red';
}

const StudentScoresPanel: React.FC<StudentScoresPanelProps> = ({ exams, onOpenProfile }) => {
  const api = (window as any).electronAPI;
  const [selectedExamId, setSelectedExamId] = useState('');
  const [questions, setQuestions] = useState<QuestionMeta[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortCol, setSortCol] = useState<'name' | 'total' | number>('name');
  const [sortAsc, setSortAsc] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedEvaluationId, setSelectedEvaluationId] = useState<string | null>(null);

  const loadScores = async (examId: string) => {
    if (!examId || !api?.getExamStudentScores) return;
    try {
      setLoading(true);
      setError(null);
      const response = await api.getExamStudentScores(examId);
      if (!response.success) {
        setError(response.error || 'Failed to load scores');
        setQuestions([]);
        setStudents([]);
        return;
      }
      setQuestions(response.questions || []);
      setStudents(response.students || []);
    } catch (err: any) {
      setError(err?.message || 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!selectedExamId && exams.length > 0) {
      setSelectedExamId(exams[0].examId);
    }
  }, [selectedExamId, exams]);

  useEffect(() => {
    if (selectedExamId) {
      loadScores(selectedExamId);
    }
  }, [selectedExamId]);

  useEffect(() => {
    if (!api?.onDashboardUpdated || !selectedExamId) return;
    const unsubscribe = api.onDashboardUpdated((_event: any, data: any) => {
      if (data?.examId && data.examId !== selectedExamId) return;
      if (data?.type === 'examGraded' || data?.type === 'questionAdded' || data?.type === 'testCaseAdded') {
        loadScores(selectedExamId);
      }
    });
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [selectedExamId]);

  const displayed = useMemo(() => {
    return [...students]
      .filter(
        (student) =>
          student.studentName.toLowerCase().includes(search.toLowerCase()) ||
          student.username.toLowerCase().includes(search.toLowerCase())
      )
      .sort((a, b) => {
        let diff = 0;
        if (sortCol === 'name') diff = a.studentName.localeCompare(b.studentName);
        else if (sortCol === 'total') diff = a.totalPct - b.totalPct;
        else if (typeof sortCol === 'number') {
          diff = (a.scores[sortCol]?.earnedPct ?? -1) - (b.scores[sortCol]?.earnedPct ?? -1);
        }
        return sortAsc ? diff : -diff;
      });
  }, [students, search, sortCol, sortAsc]);

  const handleSort = (col: 'name' | 'total' | number) => {
    if (sortCol === col) setSortAsc((value) => !value);
    else {
      setSortCol(col);
      setSortAsc(false);
    }
  };

  const sortArrow = (col: 'name' | 'total' | number) => {
    if (sortCol !== col) return <span className="sort-arrow inactive">↕</span>;
    return <span className="sort-arrow">{sortAsc ? '↑' : '↓'}</span>;
  };

  const exportCSV = () => {
    const headers = [
      'Student',
      'Username',
      ...questions.map((question) => `Q${question.question_order}: ${question.title} (${question.marks})`),
      'Total %'
    ];

    const rows = displayed.map((student) => [
      student.studentName,
      student.username,
      ...student.scores.map((score) => (score.earned !== null ? `${score.earned}/${score.maxMarks}` : '-')),
      `${student.totalPct}%`
    ]);

    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    const examTitle = exams.find((exam) => exam.examId === selectedExamId)?.title || 'scores';
    anchor.href = url;
    anchor.download = `${examTitle.replace(/\s+/g, '_')}_scores.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const avgPct = students.length
    ? Math.round(students.reduce((sum, student) => sum + student.totalPct, 0) / students.length)
    : null;
  const highest = students.length ? Math.max(...students.map((student) => student.totalPct)) : null;
  const lowest = students.length ? Math.min(...students.map((student) => student.totalPct)) : null;
  const hardcodedCount = students.filter((student) => student.scores.some((score) => score.hardcoded)).length;

  return (
    <div className="ssp-root">
      <div className="ssp-toolbar">
        <div className="ssp-exam-select">
          <label>Select exam:</label>
          <select value={selectedExamId} onChange={(e) => setSelectedExamId(e.target.value)}>
            <option value="">-- choose an exam --</option>
            {exams.map((exam) => (
              <option key={exam.examId} value={exam.examId}>
                {exam.title}
              </option>
            ))}
          </select>
        </div>

        {students.length > 0 && (
          <>
            <input
              className="ssp-search"
              type="text"
              placeholder="Search student..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button className="ssp-export-btn" onClick={exportCSV}>
              Export CSV
            </button>
            <button className="ssp-refresh-btn" onClick={() => loadScores(selectedExamId)}>
              Refresh
            </button>
          </>
        )}
      </div>

      {loading && <div className="ssp-loading">Loading scores...</div>}
      {error && <div className="ssp-error">{error}</div>}

      {!loading && !error && students.length > 0 && (
        <>
          <div className="ssp-summary">
            <div className="ssp-summary-item">
              <span className="ssp-summary-label">Students submitted</span>
              <span className="ssp-summary-value">{students.length}</span>
            </div>
            <div className="ssp-summary-item">
              <span className="ssp-summary-label">Class average</span>
              <span className={`ssp-summary-value ${totalClass(avgPct || 0)}`}>{avgPct}%</span>
            </div>
            <div className="ssp-summary-item">
              <span className="ssp-summary-label">Highest</span>
              <span className={`ssp-summary-value ${totalClass(highest || 0)}`}>{highest}%</span>
            </div>
            <div className="ssp-summary-item">
              <span className="ssp-summary-label">Lowest</span>
              <span className={`ssp-summary-value ${totalClass(lowest || 0)}`}>{lowest}%</span>
            </div>
            {hardcodedCount > 0 && (
              <div className="ssp-summary-item ssp-flag-item">
                <span className="ssp-summary-label">Hardcoding flags</span>
                <span className="ssp-summary-value ssp-flag-val">{hardcodedCount}</span>
              </div>
            )}
          </div>

          <div className="ssp-table-wrap">
            <table className="ssp-table">
              <thead>
                <tr>
                  <th className="ssp-th-name" onClick={() => handleSort('name')}>
                    Student {sortArrow('name')}
                  </th>
                  {questions.map((question, index) => (
                    <th
                      key={question.question_id}
                      className="ssp-th-q"
                      onClick={() => handleSort(index)}
                      title={question.title}
                    >
                      Q{question.question_order}
                      <br />
                      <span className="ssp-th-marks">/{question.marks}</span>
                      {sortArrow(index)}
                    </th>
                  ))}
                  <th className="ssp-th-total" onClick={() => handleSort('total')}>
                    Total {sortArrow('total')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {displayed.map((student) => (
                  <tr key={student.studentId} className="ssp-row">
                    <td className="ssp-td-name">
                      <div className="ssp-student-name">{student.studentName}</div>
                      <div className="ssp-username">@{student.username}</div>
                      {onOpenProfile && (
                        <button className="ssp-detail-btn" onClick={() => onOpenProfile(student.studentId)}>
                          Open Profile
                        </button>
                      )}
                    </td>
                    {student.scores.map((score, index) => (
                      <td
                        key={index}
                        className={`ssp-td-score ${pctClass(score.earnedPct)} ${
                          score.evaluationId ? 'ssp-td-clickable' : ''
                        }`}
                        onClick={() => score.evaluationId && setSelectedEvaluationId(score.evaluationId)}
                        title={score.evaluationId ? 'Click to review this evaluation' : 'Not attempted'}
                      >
                        {score.earned === null ? (
                          <span className="ssp-not-attempted">-</span>
                        ) : (
                          <div className="ssp-score-cell">
                            <span className="ssp-score-num">
                              {score.earned}/{score.maxMarks}
                            </span>
                            <span className="ssp-score-pct">{score.earnedPct}%</span>
                            {score.hardcoded && <span className="ssp-flag">HC</span>}
                            {score.conceptFailed && !score.hardcoded && (
                              <span className="ssp-flag ssp-concept-flag">C</span>
                            )}
                            {score.attempts > 1 && <span className="ssp-attempts">x{score.attempts}</span>}
                          </div>
                        )}
                      </td>
                    ))}
                    <td className={`ssp-td-total ${totalClass(student.totalPct)}`}>
                      <div className="ssp-total-wrap">
                        <span className="ssp-total-marks">
                          {student.totalEarned}/{student.totalMax}
                        </span>
                        <span className="ssp-total-pct">{student.totalPct}%</span>
                        <div className="ssp-total-bar-bg">
                          <div
                            className={`ssp-total-bar-fill ${totalClass(student.totalPct)}`}
                            style={{ width: `${student.totalPct}%` }}
                          />
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="ssp-legend">
            <span className="leg leg-green">green</span> &gt;= 80% <span className="leg leg-yellow">yellow</span> 50-79%{' '}
            <span className="leg leg-red">red</span> &lt; 50% <span className="leg leg-none">-</span> not attempted{' '}
            <span className="ssp-flag">HC</span> hardcoding flag <span className="ssp-flag ssp-concept-flag">C</span>{' '}
            unmet requirement
          </p>
        </>
      )}

      {!selectedExamId && !loading && (
        <div className="ssp-placeholder">
          <div className="ssp-placeholder-icon">Scores</div>
          <p>Select an exam above to view student scores.</p>
        </div>
      )}

      {selectedEvaluationId && (
        <EvaluationDetailModal
          evaluationId={selectedEvaluationId}
          onClose={() => setSelectedEvaluationId(null)}
          onUpdated={() => selectedExamId && loadScores(selectedExamId)}
        />
      )}
    </div>
  );
};

export default StudentScoresPanel;
