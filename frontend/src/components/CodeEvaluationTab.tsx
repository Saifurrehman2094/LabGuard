import React, { useEffect, useState } from 'react';
import EvaluationDetailModal from './EvaluationDetailModal';
import './CodeEvaluationTab.css';

interface Exam {
  examId: string;
  title: string;
  startTime: string;
  endTime: string;
}

interface EvaluationSummary {
  evaluation_id: string;
  question_id: string;
  created_at: string;
  status: string;
}

interface SubmissionRow {
  submission_id: string;
  student_id: string;
  username: string;
  full_name: string;
  submitted_at: string;
  evaluations: EvaluationSummary[];
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
  initialExamId?: string;
}

const CodeEvaluationTab: React.FC<CodeEvaluationTabProps> = ({ exams, initialExamId }) => {
  const [selectedExamId, setSelectedExamId] = useState('');
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runningAll, setRunningAll] = useState(false);
  const [runningSubmissionId, setRunningSubmissionId] = useState<string | null>(null);
  const [detailEvaluationId, setDetailEvaluationId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'completed' | 'partial' | 'failed_compile'>('pending');
  const [searchQuery, setSearchQuery] = useState('');

  const isElectron = () => !!(window as any).electronAPI;

  const loadData = async (examId: string) => {
    if (!isElectron() || !examId) return;
    try {
      setLoading(true);
      setError(null);
      const response = await (window as any).electronAPI.getEvaluationsByExam(examId);
      if (!response.success) {
        setError(response.error || 'Failed to load evaluations');
        setSubmissions([]);
        return;
      }
      setSubmissions(response.data || []);
    } catch (err: any) {
      console.error('Error loading evaluations by exam:', err);
      setError('Failed to load evaluations. Please try again.');
      setSubmissions([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialExamId && initialExamId !== selectedExamId) {
      setSelectedExamId(initialExamId);
      loadData(initialExamId);
      return;
    }
    if (!selectedExamId && exams.length > 0) {
      const completed = exams.filter((exam) => new Date(exam.endTime) <= new Date());
      const initialExamId = (completed[0] || exams[0]).examId;
      setSelectedExamId(initialExamId);
      loadData(initialExamId);
    }
  }, [exams, selectedExamId, initialExamId]);

  useEffect(() => {
    const api = (window as any).electronAPI;
    if (!api?.onDashboardUpdated) return;

    const unsubscribe = api.onDashboardUpdated((_event: any, data: any) => {
      if (!selectedExamId) return;
      if (data?.type === 'examGraded' || data?.type === 'testCaseAdded' || data?.type === 'questionAdded') {
        if (!data.examId || data.examId === selectedExamId) {
          loadData(selectedExamId);
        }
      }
    });

    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [selectedExamId]);

  const handleExamChange = (examId: string) => {
    setSelectedExamId(examId);
    setDetailEvaluationId(null);
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
      const result = await (window as any).electronAPI.runEvaluationForExam(selectedExamId);
      if (!result?.success) {
        setError(result?.error || 'Failed to run evaluation for all submissions.');
        return;
      }
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
      const result = await (window as any).electronAPI.runEvaluationForSubmission(selectedExamId, submissionId);
      if (!result?.success) {
        setError(result?.error || 'Failed to run evaluation for this submission.');
        return;
      }
      await loadData(selectedExamId);
    } catch (err: any) {
      console.error('Error running evaluation for submission:', err);
      setError('Failed to run evaluation for this submission.');
    } finally {
      setRunningSubmissionId(null);
    }
  };

  const formatDateTime = (value?: string | null) => {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString();
  };

  const formatScore = (value?: number | null) => {
    if (value == null) return '-';
    return value.toFixed(2);
  };

  const selectedExam = exams.find((exam) => exam.examId === selectedExamId) || null;
  const getStatusGroup = (status?: string | null) => {
    const normalized = String(status || '').toLowerCase();
    if (!normalized || normalized === 'not_evaluated' || normalized === 'pending') return 'pending';
    if (normalized === 'failed_compile') return 'failed_compile';
    if (normalized === 'partial') return 'partial';
    if (normalized === 'completed') return 'completed';
    return 'pending';
  };
  const summary = submissions.reduce(
    (acc, submission) => {
      const group = getStatusGroup(submission.aggregates?.last_status);
      acc.total += 1;
      acc[group] += 1;
      return acc;
    },
    { total: 0, pending: 0, completed: 0, partial: 0, failed_compile: 0 }
  );
  const filteredSubmissions = submissions.filter((submission) => {
    const statusMatches =
      statusFilter === 'all' ? true : getStatusGroup(submission.aggregates?.last_status) === statusFilter;
    if (!statusMatches) return false;
    const query = searchQuery.trim().toLowerCase();
    if (!query) return true;
    return (
      submission.full_name?.toLowerCase().includes(query) ||
      submission.username?.toLowerCase().includes(query)
    );
  });

  return (
    <div className="code-eval-tab">
      <div className="ce-header">
        <div>
          <h2>Submissions & Evaluation</h2>
          <p className="ce-subtitle">
            Filter by exam, review submissions, and finalize scores quickly.
          </p>
        </div>
        <div className="ce-exam-select">
          <label htmlFor="ce-exam">Exam</label>
          <select id="ce-exam" value={selectedExamId} onChange={(e) => handleExamChange(e.target.value)}>
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
        <div className="ce-loading">Loading evaluations...</div>
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
          <div className="ce-summary-row" role="group" aria-label="Evaluation summary">
            <span className="ce-summary-pill">Total {summary.total}</span>
            <span className="ce-summary-pill">Pending {summary.pending}</span>
            <span className="ce-summary-pill">Completed {summary.completed}</span>
            <span className="ce-summary-pill">Partial {summary.partial}</span>
            <span className="ce-summary-pill">Compile failed {summary.failed_compile}</span>
          </div>
          <div className="ce-toolbar">
            <div className="ce-filter-chip-row">
              <button type="button" className={`ce-filter-chip ${statusFilter === 'pending' ? 'active' : ''}`} onClick={() => setStatusFilter('pending')}>
                Pending
              </button>
              <button type="button" className={`ce-filter-chip ${statusFilter === 'partial' ? 'active' : ''}`} onClick={() => setStatusFilter('partial')}>
                Partial
              </button>
              <button type="button" className={`ce-filter-chip ${statusFilter === 'completed' ? 'active' : ''}`} onClick={() => setStatusFilter('completed')}>
                Completed
              </button>
              <button type="button" className={`ce-filter-chip ${statusFilter === 'failed_compile' ? 'active' : ''}`} onClick={() => setStatusFilter('failed_compile')}>
                Compile Failed
              </button>
              <button type="button" className={`ce-filter-chip ${statusFilter === 'all' ? 'active' : ''}`} onClick={() => setStatusFilter('all')}>
                All
              </button>
            </div>
            <div className="ce-toolbar-actions">
              <input
                type="text"
                className="ce-search-input"
                placeholder="Search student"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <button className="ce-primary-btn" onClick={runAllEvaluations} disabled={runningAll}>
                {runningAll ? 'Running…' : `Run all (${summary.pending} pending)`}
              </button>
            </div>
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
              {filteredSubmissions.map((submission) => {
                const aggregates = submission.aggregates;
                const latestEvaluation = submission.evaluations.length
                  ? submission.evaluations[submission.evaluations.length - 1]
                  : null;

                return (
                  <tr key={submission.submission_id}>
                    <td>
                      <div className="ce-student">
                        <span className="ce-student-name">{submission.full_name}</span>
                        <span className="ce-student-username">@{submission.username}</span>
                      </div>
                    </td>
                    <td>{formatDateTime(submission.submitted_at)}</td>
                    <td>
                      <span className={`ce-status ce-status-${aggregates.last_status || 'none'}`}>
                        {aggregates.last_status || 'not evaluated'}
                      </span>
                    </td>
                    <td>
                      <div className="ce-scores">
                        <span>
                          Final: <strong>{formatScore(aggregates.total_final_score)}</strong>
                        </span>
                        <span>
                          Auto: <strong>{formatScore(aggregates.total_auto_score)}</strong>
                        </span>
                        <span>
                          Max: <strong>{formatScore(aggregates.total_max_score)}</strong>
                        </span>
                      </div>
                    </td>
                    <td>{formatDateTime(aggregates.last_evaluated_at)}</td>
                    <td>
                      <div className="ce-row-actions">
                        <button
                          className="ce-link-button"
                          onClick={() => runEvaluationForSubmission(submission.submission_id)}
                          disabled={runningSubmissionId === submission.submission_id}
                        >
                          {runningSubmissionId === submission.submission_id ? 'Running...' : 'Run evaluation'}
                        </button>
                        {latestEvaluation ? (
                          <button
                            className="ce-link-button"
                            onClick={() => setDetailEvaluationId(latestEvaluation.evaluation_id)}
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
          {filteredSubmissions.length === 0 && (
            <div className="ce-empty ce-inline-empty">
              <p>No submissions match this filter.</p>
            </div>
          )}
        </div>
      )}

      {detailEvaluationId && (
        <EvaluationDetailModal
          evaluationId={detailEvaluationId}
          onClose={() => setDetailEvaluationId(null)}
          onUpdated={() => {
            if (selectedExamId) loadData(selectedExamId);
          }}
        />
      )}
    </div>
  );
};

export default CodeEvaluationTab;
