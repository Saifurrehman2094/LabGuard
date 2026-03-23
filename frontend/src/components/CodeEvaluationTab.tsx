import React, { useEffect, useState } from 'react';
import './CodeEvaluationTab.css';

interface Exam {
  examId: string;
  title: string;
  startTime: string;
  endTime: string;
}

interface Evaluation {
  evaluation_id: string;
  submission_id: string;
  question_id: string;
  created_at: string;
  score: number;
  max_score: number;
  status: string;
  compile_exit_code?: number | null;
  compile_stdout?: string | null;
  compile_stderr?: string | null;
  error_summary?: string | null;
  manual_score?: number | null;
  final_score?: number;
}

interface TestCaseResult {
  result_id: string;
  evaluation_id: string;
  test_case_id: string;
  passed: boolean;
  execution_time_ms?: number | null;
  exit_code?: number | null;
  stdout?: string | null;
  stderr?: string | null;
}

interface SubmissionRow {
  submission_id: string;
  student_id: string;
  username: string;
  full_name: string;
  submitted_at: string;
  evaluations: Evaluation[];
  aggregates: {
    last_status: string | null;
    last_evaluated_at: string | null;
    total_auto_score: number;
    total_final_score: number;
    total_max_score: number;
  };
}

interface CodeEvaluationTabProps {
  exams: Exam[];
}

const CodeEvaluationTab: React.FC<CodeEvaluationTabProps> = ({ exams }) => {
  const [selectedExamId, setSelectedExamId] = useState<string>('');
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [detailEvaluation, setDetailEvaluation] = useState<Evaluation | null>(null);
  const [detailResults, setDetailResults] = useState<TestCaseResult[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [manualScoreInput, setManualScoreInput] = useState<string>('');

  const [runningAll, setRunningAll] = useState(false);
  const [runningSubmissionId, setRunningSubmissionId] = useState<string | null>(null);

  const isElectron = () => !!(window as any).electronAPI;

  const loadData = async (examId: string) => {
    if (!isElectron() || !examId) return;
    try {
      setLoading(true);
      setError(null);
      const res = await (window as any).electronAPI.getEvaluationsByExam(examId);
      if (!res.success) {
        setError(res.error || 'Failed to load evaluations');
        setSubmissions([]);
        return;
      }
      setSubmissions(res.data || []);
    } catch (err: any) {
      console.error('Error loading evaluations by exam:', err);
      setError('Failed to load evaluations. Please try again.');
      setSubmissions([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!selectedExamId && exams.length > 0) {
      const completed = exams.filter((e) => new Date(e.endTime) <= new Date());
      const initial = (completed[0] || exams[0]).examId;
      setSelectedExamId(initial);
      loadData(initial);
    }
  }, [exams]);

  const handleExamChange = (examId: string) => {
    setSelectedExamId(examId);
    setSubmissions([]);
    if (examId) {
      loadData(examId);
    }
  };

  const runAllEvaluations = async () => {
    if (!isElectron() || !selectedExamId) return;
    try {
      setRunningAll(true);
      setError(null);
      await (window as any).electronAPI.runEvaluationForExam(selectedExamId);
      await loadData(selectedExamId);
    } catch (err: any) {
      console.error('Error running evaluation for exam:', err);
      setError('Failed to run evaluation for all submissions.');
    } finally {
      setRunningAll(false);
    }
  };

  const runEvaluationForSubmission = async (submissionId: string) => {
    if (!isElectron() || !selectedExamId) return;
    try {
      setRunningSubmissionId(submissionId);
      setError(null);
      await (window as any).electronAPI.runEvaluationForSubmission(selectedExamId, submissionId);
      await loadData(selectedExamId);
    } catch (err: any) {
      console.error('Error running evaluation for submission:', err);
      setError('Failed to run evaluation for this submission.');
    } finally {
      setRunningSubmissionId(null);
    }
  };

  const openDetail = async (evaluationId: string) => {
    if (!isElectron()) return;
    try {
      setDetailLoading(true);
      setDetailError(null);
      const res = await (window as any).electronAPI.getEvaluationDetail(evaluationId);
      if (!res.success) {
        setDetailError(res.error || 'Failed to load evaluation detail');
        setDetailEvaluation(null);
        setDetailResults([]);
        return;
      }
      setDetailEvaluation(res.evaluation);
      setDetailResults(res.results || []);
      setManualScoreInput(
        res.evaluation.manual_score != null
          ? String(res.evaluation.manual_score)
          : res.evaluation.final_score != null
          ? String(res.evaluation.final_score)
          : ''
      );
    } catch (err: any) {
      console.error('Error loading evaluation detail:', err);
      setDetailError('Failed to load evaluation detail.');
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetail = () => {
    setDetailEvaluation(null);
    setDetailResults([]);
    setDetailError(null);
  };

  const formatDateTime = (value?: string | null) => {
    if (!value) return '-';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleString();
  };

  const formatScore = (value?: number | null) => {
    if (value == null) return '-';
    return value.toFixed(2);
  };

  const handleSaveManualScore = async () => {
    if (!isElectron() || !detailEvaluation) return;
    const raw = manualScoreInput.trim();
    const num = raw === '' ? null : Number(raw);
    if (raw !== '' && Number.isNaN(num)) {
      setDetailError('Manual score must be a number or empty.');
      return;
    }
    try {
      setDetailLoading(true);
      setDetailError(null);
      const res = await (window as any).electronAPI.updateEvaluationManualScore(
        detailEvaluation.evaluation_id,
        num
      );
      if (!res.success) {
        setDetailError(res.error || 'Failed to update manual score.');
        return;
      }
      setDetailEvaluation(res.evaluation);
      // Refresh table aggregates
      if (selectedExamId) {
        loadData(selectedExamId);
      }
    } catch (err: any) {
      console.error('Error updating manual score:', err);
      setDetailError('Failed to update manual score.');
    } finally {
      setDetailLoading(false);
    }
  };

  const selectedExam = exams.find((e) => e.examId === selectedExamId) || null;

  return (
    <div className="code-eval-tab">
      <div className="ce-header">
        <div>
          <h2>Code Evaluation</h2>
          <p className="ce-subtitle">
            View auto-graded scores per student and per question, and apply manual overrides.
          </p>
        </div>
        <div className="ce-exam-select">
          <label htmlFor="ce-exam">Exam</label>
          <select
            id="ce-exam"
            value={selectedExamId}
            onChange={(e) => handleExamChange(e.target.value)}
          >
            <option value="">Select an exam</option>
            {exams.map((exam) => (
              <option key={exam.examId} value={exam.examId}>
                {exam.title} ({new Date(exam.startTime).toLocaleDateString()})
              </option>
            ))}
          </select>
        </div>
      </div>

      {selectedExam && (
        <div className="ce-exam-meta">
          <span>
            Starts: <strong>{formatDateTime(selectedExam.startTime)}</strong>
          </span>
          <span>
            Ends: <strong>{formatDateTime(selectedExam.endTime)}</strong>
          </span>
        </div>
      )}

      {error && <div className="ce-error">{error}</div>}

      {loading ? (
        <div className="ce-loading">Loading evaluations…</div>
      ) : !selectedExamId ? (
        <div className="ce-empty">
          <p>Select an exam to view code evaluation results.</p>
        </div>
      ) : submissions.length === 0 ? (
        <div className="ce-empty">
          <p>No submissions found for this exam yet.</p>
        </div>
      ) : (
        <div className="ce-table-wrapper">
          <div className="ce-table-header-actions">
            <button
              className="ce-primary-btn"
              onClick={runAllEvaluations}
              disabled={runningAll}
            >
              {runningAll ? 'Running evaluations…' : 'Run evaluation for all submissions'}
            </button>
          </div>
          <table className="ce-table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Submission Time</th>
                <th>Last Status</th>
                <th>Overall Score (final/auto/max)</th>
                <th>Last Evaluated</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {submissions.map((sub) => {
                const aggr = sub.aggregates;
                return (
                  <tr key={sub.submission_id}>
                    <td>
                      <div className="ce-student">
                        <span className="ce-student-name">{sub.full_name}</span>
                        <span className="ce-student-username">@{sub.username}</span>
                      </div>
                    </td>
                    <td>{formatDateTime(sub.submitted_at)}</td>
                    <td>
                      <span className={`ce-status ce-status-${aggr.last_status || 'none'}`}>
                        {aggr.last_status || 'not evaluated'}
                      </span>
                    </td>
                    <td>
                      <div className="ce-scores">
                        <span>
                          Final: <strong>{formatScore(aggr.total_final_score)}</strong>
                        </span>
                        <span>
                          Auto: <strong>{formatScore(aggr.total_auto_score)}</strong>
                        </span>
                        <span>
                          Max: <strong>{formatScore(aggr.total_max_score)}</strong>
                        </span>
                      </div>
                    </td>
                    <td>{formatDateTime(aggr.last_evaluated_at)}</td>
                    <td>
                      <div className="ce-row-actions">
                        <button
                          className="ce-link-button"
                          onClick={() => runEvaluationForSubmission(sub.submission_id)}
                          disabled={!!runningSubmissionId && runningSubmissionId === sub.submission_id}
                        >
                          {runningSubmissionId === sub.submission_id
                            ? 'Running…'
                            : 'Run evaluation'}
                        </button>
                        {sub.evaluations.length > 0 ? (
                          <button
                            className="ce-link-button"
                            onClick={() =>
                              openDetail(sub.evaluations[sub.evaluations.length - 1].evaluation_id)
                            }
                          >
                            View details
                          </button>
                        ) : (
                          <span className="ce-muted">No evaluations</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {detailEvaluation && (
        <div className="ce-detail-overlay" onClick={closeDetail}>
          <div className="ce-detail-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ce-detail-header">
              <h3>Evaluation Detail</h3>
              <button className="ce-close-btn" onClick={closeDetail}>
                ×
              </button>
            </div>

            {detailError && <div className="ce-error">{detailError}</div>}

            {detailLoading ? (
              <div className="ce-loading">Loading…</div>
            ) : (
              <>
                <div className="ce-detail-meta">
                  <div>
                    <span>Status:</span>
                    <strong>{detailEvaluation.status}</strong>
                  </div>
                  <div>
                    <span>Score:</span>
                    <strong>
                      {formatScore(detailEvaluation.final_score ?? detailEvaluation.score)} /{' '}
                      {formatScore(detailEvaluation.max_score)}
                    </strong>
                  </div>
                  <div>
                    <span>Created:</span>
                    <strong>{formatDateTime(detailEvaluation.created_at)}</strong>
                  </div>
                </div>

                <div className="ce-manual-score">
                  <label>
                    Manual score override:
                    <input
                      type="number"
                      step={0.1}
                      value={manualScoreInput}
                      onChange={(e) => setManualScoreInput(e.target.value)}
                      disabled={detailLoading}
                    />
                  </label>
                  <button
                    className="ce-primary-btn"
                    onClick={handleSaveManualScore}
                    disabled={detailLoading}
                  >
                    Save manual score
                  </button>
                </div>

                <div className="ce-section">
                  <h4>Compile log</h4>
                  <div className="ce-log-grid">
                    <div>
                      <h5>stdout</h5>
                      <pre>{detailEvaluation.compile_stdout || '(empty)'}</pre>
                    </div>
                    <div>
                      <h5>stderr</h5>
                      <pre>{detailEvaluation.compile_stderr || '(empty)'}</pre>
                    </div>
                  </div>
                  {detailEvaluation.error_summary && (
                    <div style={{ marginTop: 12 }}>
                      <h5>Error summary</h5>
                      <pre className="ce-pre-small">{detailEvaluation.error_summary}</pre>
                    </div>
                  )}
                </div>

                <div className="ce-section">
                  <h4>Test case results</h4>
                  {detailResults.length === 0 ? (
                    <div className="ce-empty">No test case results found.</div>
                  ) : (
                    <table className="ce-results-table">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Passed</th>
                          <th>Exit code</th>
                          <th>Time (ms)</th>
                          <th>Stdout</th>
                          <th>Stderr</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detailResults.map((r, idx) => (
                          <tr key={r.result_id}>
                            <td>{idx + 1}</td>
                            <td>
                              <span
                                className={
                                  r.passed ? 'ce-badge ce-badge-pass' : 'ce-badge ce-badge-fail'
                                }
                              >
                                {r.passed ? 'PASS' : 'FAIL'}
                              </span>
                            </td>
                            <td>{r.exit_code != null ? r.exit_code : '-'}</td>
                            <td>{r.execution_time_ms != null ? r.execution_time_ms : '-'}</td>
                            <td>
                              <pre className="ce-pre-small">
                                {(r.stdout || '').slice(0, 120) ||
                                  (r.stdout === null ? '' : '(empty)')}
                              </pre>
                            </td>
                            <td>
                              <pre className="ce-pre-small">
                                {(r.stderr || '').slice(0, 120) ||
                                  (r.stderr === null ? '' : '(empty)')}
                              </pre>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default CodeEvaluationTab;

