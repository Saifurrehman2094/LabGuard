import React, { useState, useEffect, useCallback, useRef } from 'react';
import SubmissionDetailModal from './SubmissionDetailModal';
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
  earnedPct: number | null;   // 0-100, null = not attempted
  earned: number | null;       // actual marks, null = not attempted
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

const StudentScoresPanel: React.FC<StudentScoresPanelProps> = ({ exams }) => {
  const api = (window as any).electronAPI;

  const [selectedExamId, setSelectedExamId] = useState('');
  const [questions, setQuestions]       = useState<QuestionMeta[]>([]);
  const [students,  setStudents]        = useState<StudentRow[]>([]);
  const [loading,   setLoading]         = useState(false);
  const [error,     setError]           = useState<string | null>(null);
  const [sortCol,   setSortCol]         = useState<'name' | 'total' | number>('name');
  const [sortAsc,   setSortAsc]         = useState(true);
  const [search,    setSearch]          = useState('');
  // Modal state
  const [modalStudent, setModalStudent] = useState<{ studentId: string; studentName: string } | null>(null);

  // Live feed — recent submissions broadcast by main process
  const [liveFeed, setLiveFeed]     = useState<Array<{
    studentName: string; studentId: string; score: number; maxMarks: number;
    passedCount: number; totalCount: number; hardcoded: boolean;
    conceptPassed: boolean; submittedAt: string;
  }>>([]);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [liveFlash,   setLiveFlash]   = useState(false);   // brief highlight on new event
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectedExamIdRef = useRef(selectedExamId);

  const loadScores = useCallback(async (examId: string) => {
    if (!examId || !api) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.getExamStudentScores(examId);
      if (res.success) {
        setQuestions(res.questions || []);
        setStudents(res.students  || []);
      } else {
        setError(res.error || 'Failed to load scores');
      }
    } catch (e: any) {
      setError(e.message || 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [api]);

  // keep ref in sync so the listener always sees the current exam
  useEffect(() => { selectedExamIdRef.current = selectedExamId; }, [selectedExamId]);

  useEffect(() => {
    if (selectedExamId) { loadScores(selectedExamId); setLastRefresh(new Date()); }
  }, [selectedExamId, loadScores]);

  // Listen for real-time student submission events from main process
  useEffect(() => {
    if (!api?.onStudentSubmitted) return;
    const handler = (data: any) => {
      // Only react if it's for the exam we're currently viewing
      if (data.examId && data.examId !== selectedExamIdRef.current) return;

      // Add to live feed (keep last 50)
      setLiveFeed(prev => [data, ...prev].slice(0, 50));

      // Flash indicator
      setLiveFlash(true);
      if (flashTimer.current) clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setLiveFlash(false), 2000);

      // Auto-refresh the score table
      if (selectedExamIdRef.current) {
        loadScores(selectedExamIdRef.current);
        setLastRefresh(new Date());
      }
    };
    api.onStudentSubmitted(handler);
    // Note: Electron's ipcRenderer.on does not return an unsubscribe fn via contextBridge;
    // the listener is cleaned up when the component unmounts naturally.
  }, [api, loadScores]);

  // Sort + filter
  const displayed = [...students]
    .filter(s =>
      s.studentName.toLowerCase().includes(search.toLowerCase()) ||
      s.username.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => {
      let diff = 0;
      if (sortCol === 'name') {
        diff = a.studentName.localeCompare(b.studentName);
      } else if (sortCol === 'total') {
        diff = a.totalPct - b.totalPct;
      } else if (typeof sortCol === 'number') {
        const ai = a.scores[sortCol]?.earnedPct ?? -1;
        const bi = b.scores[sortCol]?.earnedPct ?? -1;
        diff = ai - bi;
      }
      return sortAsc ? diff : -diff;
    });

  const handleSort = (col: 'name' | 'total' | number) => {
    if (sortCol === col) setSortAsc(a => !a);
    else { setSortCol(col); setSortAsc(false); } // default desc for scores
  };

  const sortArrow = (col: 'name' | 'total' | number) => {
    if (sortCol !== col) return <span className="sort-arrow inactive">↕</span>;
    return <span className="sort-arrow">{sortAsc ? '↑' : '↓'}</span>;
  };

  // CSV export
  const exportCSV = () => {
    const headers = ['Student', 'Username', ...questions.map(q => `Q${q.question_order}: ${q.title} (${q.marks})`), 'Total %'];
    const rows = displayed.map(s => [
      s.studentName,
      s.username,
      ...s.scores.map(sc => sc.earned !== null ? `${sc.earned}/${sc.maxMarks}` : '-'),
      `${s.totalPct}%`
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const examTitle = exams.find(e => e.examId === selectedExamId)?.title || 'scores';
    a.href = url;
    a.download = `${examTitle.replace(/\s+/g, '_')}_scores.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const examTitle = exams.find(e => e.examId === selectedExamId)?.title;

  // Summary stats
  const avgPct = students.length
    ? Math.round(students.reduce((s, r) => s + r.totalPct, 0) / students.length)
    : null;
  const highest = students.length ? Math.max(...students.map(s => s.totalPct)) : null;
  const lowest  = students.length ? Math.min(...students.map(s => s.totalPct)) : null;
  const hardcodedCount = students.filter(s => s.scores.some(sc => sc.hardcoded)).length;

  return (
    <div className="ssp-root">
      <div className="ssp-toolbar">
        <div className="ssp-exam-select">
          <label>Select exam:</label>
          <select value={selectedExamId} onChange={e => setSelectedExamId(e.target.value)}>
            <option value="">-- choose an exam --</option>
            {exams.map(ex => (
              <option key={ex.examId} value={ex.examId}>{ex.title}</option>
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
              onChange={e => setSearch(e.target.value)}
            />
            <button className="ssp-export-btn" onClick={exportCSV} title="Download as CSV">
              Export CSV
            </button>
            <button className="ssp-refresh-btn" onClick={() => loadScores(selectedExamId)}>
              Refresh
            </button>
          </>
        )}
      </div>

      {/* ── Live activity feed ── */}
      {selectedExamId && (
        <div className={`ssp-live-bar ${liveFlash ? 'ssp-live-flash' : ''}`}>
          <span className="ssp-live-dot" />
          <span className="ssp-live-label">Live</span>
          {lastRefresh && (
            <span className="ssp-last-refresh">Last updated {lastRefresh.toLocaleTimeString()}</span>
          )}
          {liveFeed.length > 0 && (
            <div className="ssp-feed-scroll">
              {liveFeed.map((ev, i) => {
                const pct = ev.maxMarks > 0 ? Math.round((ev.score / ev.maxMarks) * 100) : 0;
                return (
                  <span
                    key={i}
                    className={`ssp-feed-chip ${ev.hardcoded ? 'feed-hc' : pct >= 80 ? 'feed-green' : pct >= 50 ? 'feed-yellow' : 'feed-red'}`}
                    title={`${ev.studentName} — ${new Date(ev.submittedAt).toLocaleTimeString()}`}
                  >
                    {ev.studentName.split(' ')[0]}
                    {ev.hardcoded ? ' ⚠ HC' : ` ${pct}%`}
                    &nbsp;({ev.passedCount}/{ev.totalCount})
                  </span>
                );
              })}
            </div>
          )}
          {liveFeed.length === 0 && (
            <span className="ssp-feed-empty">Waiting for submissions…</span>
          )}
        </div>
      )}

      {loading && <div className="ssp-loading">Loading scores...</div>}
      {error   && <div className="ssp-error">{error}</div>}

      {!loading && !error && selectedExamId && students.length === 0 && (
        <div className="ssp-empty">No submissions found for this exam yet.</div>
      )}

      {!loading && !error && students.length > 0 && (
        <>
          {/* Summary bar */}
          <div className="ssp-summary">
            <div className="ssp-summary-item">
              <span className="ssp-summary-label">Students submitted</span>
              <span className="ssp-summary-value">{students.length}</span>
            </div>
            <div className="ssp-summary-item">
              <span className="ssp-summary-label">Class average</span>
              <span className={`ssp-summary-value ${totalClass(avgPct!)}`}>{avgPct}%</span>
            </div>
            <div className="ssp-summary-item">
              <span className="ssp-summary-label">Highest</span>
              <span className={`ssp-summary-value ${totalClass(highest!)}`}>{highest}%</span>
            </div>
            <div className="ssp-summary-item">
              <span className="ssp-summary-label">Lowest</span>
              <span className={`ssp-summary-value ${totalClass(lowest!)}`}>{lowest}%</span>
            </div>
            {hardcodedCount > 0 && (
              <div className="ssp-summary-item ssp-flag-item">
                <span className="ssp-summary-label">Hardcoding flags</span>
                <span className="ssp-summary-value ssp-flag-val">{hardcodedCount}</span>
              </div>
            )}
          </div>

          {/* Score table */}
          <div className="ssp-table-wrap">
            <table className="ssp-table">
              <thead>
                <tr>
                  <th className="ssp-th-name" onClick={() => handleSort('name')}>
                    Student {sortArrow('name')}
                  </th>
                  {questions.map((q, i) => (
                    <th key={q.question_id} className="ssp-th-q" onClick={() => handleSort(i)}
                        title={q.title}>
                      Q{q.question_order}<br />
                      <span className="ssp-th-marks">/{q.marks}</span>
                      {sortArrow(i)}
                    </th>
                  ))}
                  <th className="ssp-th-total" onClick={() => handleSort('total')}>
                    Total {sortArrow('total')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {displayed.map(student => (
                  <tr key={student.studentId} className="ssp-row">
                    <td className="ssp-td-name">
                      <div className="ssp-student-name">{student.studentName}</div>
                      <div className="ssp-username">@{student.username}</div>
                      <button
                        className="ssp-detail-btn"
                        onClick={() => setModalStudent({ studentId: student.studentId, studentName: student.studentName })}
                      >
                        View Report
                      </button>
                    </td>
                    {student.scores.map((sc, i) => (
                      <td
                        key={i}
                        className={`ssp-td-score ${pctClass(sc.earnedPct)} ssp-td-clickable`}
                        onClick={() => setModalStudent({ studentId: student.studentId, studentName: student.studentName })}
                        title="Click to view submission detail"
                      >
                        {sc.earned === null ? (
                          <span className="ssp-not-attempted">—</span>
                        ) : (
                          <div className="ssp-score-cell">
                            <span className="ssp-score-num">
                              {sc.earned}/{sc.maxMarks}
                            </span>
                            <span className="ssp-score-pct">{sc.earnedPct}%</span>
                            {sc.hardcoded && (
                              <span className="ssp-flag" title="Hardcoding detected">HC</span>
                            )}
                            {sc.conceptFailed && !sc.hardcoded && (
                              <span className="ssp-flag ssp-concept-flag" title="Missing required concept">C</span>
                            )}
                            {sc.attempts > 1 && (
                              <span className="ssp-attempts" title={`${sc.attempts} attempts`}>
                                ×{sc.attempts}
                              </span>
                            )}
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
            <span className="leg leg-green">green</span> ≥ 80% &nbsp;
            <span className="leg leg-yellow">yellow</span> 50–79% &nbsp;
            <span className="leg leg-red">red</span> &lt; 50% &nbsp;
            <span className="leg leg-none">—</span> not attempted &nbsp;
            <span className="ssp-flag">HC</span> hardcoding flag &nbsp;
            <span className="ssp-flag ssp-concept-flag">C</span> concept penalty
          </p>
        </>
      )}

      {!selectedExamId && !loading && (
        <div className="ssp-placeholder">
          <div className="ssp-placeholder-icon">📊</div>
          <p>Select an exam above to view student scores.</p>
        </div>
      )}

      {/* Submission detail modal */}
      {modalStudent && selectedExamId && (
        <SubmissionDetailModal
          examId={selectedExamId}
          examTitle={exams.find(e => e.examId === selectedExamId)?.title || 'Exam'}
          studentId={modalStudent.studentId}
          studentName={modalStudent.studentName}
          onClose={() => setModalStudent(null)}
        />
      )}
    </div>
  );
};

export default StudentScoresPanel;
