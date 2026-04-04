import React, { useEffect, useMemo, useState } from 'react';
import './CodeEvaluationTab.css';
import './EvaluationDetailModal.css';

interface EvaluationDetailModalProps {
  evaluationId: string;
  onClose: () => void;
  onUpdated?: () => void;
}

const REQUIREMENT_LABELS: Record<string, string> = {
  loop_required_but_missing: 'Required loop usage not detected',
  recursion_required_but_missing: 'Required recursion not detected',
  loop_nesting_exceeds_limit: 'Loop nesting exceeds configured limit'
};

const formatDateTime = (value?: string | null) => {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
};

const formatScore = (value?: number | null) => {
  if (value == null) return '-';
  return Number(value).toFixed(2);
};

const formatRequirement = (value: string) => REQUIREMENT_LABELS[value] || value.replace(/_/g, ' ');

const getConfidenceBadgeClass = (confidence?: string | null) => {
  const value = String(confidence || '').toLowerCase();
  if (value === 'high') return 'ce-pill ce-pill-good';
  if (value === 'medium') return 'ce-pill ce-pill-warn';
  return 'ce-pill ce-pill-muted';
};

const getSuspicionBadgeClass = (level?: string | null) => {
  const value = String(level || '').toLowerCase();
  if (value === 'high') return 'ce-pill ce-pill-bad';
  if (value === 'medium') return 'ce-pill ce-pill-warn';
  return 'ce-pill ce-pill-good';
};

const EvaluationDetailModal: React.FC<EvaluationDetailModalProps> = ({
  evaluationId,
  onClose,
  onUpdated
}) => {
  const api = (window as any).electronAPI;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<any>(null);
  const [manualScoreInput, setManualScoreInput] = useState('');
  const [generatingSummary, setGeneratingSummary] = useState(false);
  const [analysisCapabilities, setAnalysisCapabilities] = useState<any>(null);
  const [resultFilter, setResultFilter] = useState<'all' | 'passed' | 'failed' | 'hidden'>('all');

  const loadDetail = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.getEvaluationDetail(evaluationId);
      if (!res.success) {
        setError(res.error || 'Failed to load evaluation detail');
        setPayload(null);
        return;
      }
      setPayload(res);
      const evaluation = res.evaluation;
      setManualScoreInput(
        evaluation?.manual_score != null
          ? String(evaluation.manual_score)
          : evaluation?.final_score != null
          ? String(evaluation.final_score)
          : ''
      );

      const capRes = await api.getEvaluationAnalysisCapabilities();
      if (capRes?.success) {
        setAnalysisCapabilities(capRes.capabilities || null);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load evaluation detail');
      setPayload(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDetail();
  }, [evaluationId]);

  const evaluation = payload?.evaluation;
  const results = payload?.results || [];
  const question = payload?.question;
  const exam = payload?.exam;
  const submission = payload?.submission;

  const filteredResults = useMemo(() => {
    return results.filter((result: any) => {
      if (resultFilter === 'passed') return !!result.passed;
      if (resultFilter === 'failed') return !result.passed;
      if (resultFilter === 'hidden') return !!result.is_hidden;
      return true;
    });
  }, [results, resultFilter]);

  const resultCounts = useMemo(() => {
    const passed = results.filter((item: any) => !!item.passed).length;
    const hidden = results.filter((item: any) => !!item.is_hidden).length;
    return {
      passed,
      failed: results.length - passed,
      hidden
    };
  }, [results]);

  const passRate = results.length > 0 ? Math.round((resultCounts.passed / results.length) * 100) : 0;
  const runtimeAvg = results.length
    ? Math.round(
        results.reduce((sum: number, result: any) => sum + Number(result.execution_time_ms || 0), 0) /
          results.length
      )
    : 0;
  const unmetRequirements = Array.isArray(evaluation?.requirement_checks_json?.unmet_requirements)
    ? evaluation.requirement_checks_json.unmet_requirements
    : [];
  const requiredConcepts = Array.isArray(question?.required_concepts) ? question.required_concepts : [];

  const handleSaveManualScore = async () => {
    const raw = manualScoreInput.trim();
    const num = raw === '' ? null : Number(raw);
    if (raw !== '' && Number.isNaN(num)) {
      setError('Manual score must be a number or empty.');
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const res = await api.updateEvaluationManualScore(evaluationId, num);
      if (!res.success) {
        setError(res.error || 'Failed to update manual score.');
        return;
      }
      await loadDetail();
      onUpdated?.();
    } catch (err: any) {
      setError(err?.message || 'Failed to update manual score.');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateSummary = async () => {
    try {
      setGeneratingSummary(true);
      setError(null);
      const res = await api.generateEvaluationSummary(evaluationId, { mode: 'balanced' });
      if (!res.success) {
        setError(res.error || 'Failed to generate AI summary.');
        return;
      }
      await loadDetail();
    } catch (err: any) {
      setError(err?.message || 'Failed to generate AI summary.');
    } finally {
      setGeneratingSummary(false);
    }
  };

  return (
    <div className="ce-detail-overlay" onClick={onClose}>
      <div className="ce-detail-modal edm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ce-detail-header">
          <div>
            <h3>Evaluation Review</h3>
            <p className="ce-subtitle">
              {exam?.title || 'Exam'} {question?.title ? `• ${question.title}` : ''}
            </p>
          </div>
          <button className="ce-close-btn" onClick={onClose}>
            ×
          </button>
        </div>

        {error && <div className="ce-error">{error}</div>}

        {loading ? (
          <div className="ce-loading">Loading…</div>
        ) : !evaluation ? (
          <div className="ce-empty">Evaluation detail is not available.</div>
        ) : (
          <>
            <div className="edm-summary-grid">
              <div className="edm-summary-card">
                <span className="edm-label">Student</span>
                <strong>{submission?.full_name || 'Unknown student'}</strong>
                <span className="edm-sub">@{submission?.username || 'unknown'}</span>
              </div>
              <div className="edm-summary-card">
                <span className="edm-label">Status</span>
                <span className={`ce-status ce-status-${evaluation.status || 'none'}`}>
                  {evaluation.status || 'not evaluated'}
                </span>
                <span className="edm-sub">Created {formatDateTime(evaluation.created_at)}</span>
              </div>
              <div className="edm-summary-card">
                <span className="edm-label">Score</span>
                <strong>
                  {formatScore(evaluation.final_score ?? evaluation.score)} /{' '}
                  {formatScore(evaluation.max_score)}
                </strong>
                <span className="edm-sub">Auto {formatScore(evaluation.score)}</span>
              </div>
              <div className="edm-summary-card">
                <span className="edm-label">Question Marks</span>
                <strong>{formatScore(question?.max_score ?? null)}</strong>
                <span className="edm-sub">Source page {question?.source_page ?? '-'}</span>
              </div>
            </div>

            <div className="ce-manual-score edm-manual-score">
              <label>
                Manual score override:
                <input
                  type="number"
                  step={0.1}
                  value={manualScoreInput}
                  onChange={(e) => setManualScoreInput(e.target.value)}
                  disabled={loading}
                />
              </label>
              <button className="ce-primary-btn" onClick={handleSaveManualScore} disabled={loading}>
                Save manual score
              </button>
            </div>

            <div className="edm-card-grid">
              <div className="edm-info-card">
                <h4>Grading Snapshot</h4>
                <div className="edm-kpi-grid">
                  <div>
                    <span className="edm-label">Pass rate</span>
                    <strong>{passRate}%</strong>
                  </div>
                  <div>
                    <span className="edm-label">Passed cases</span>
                    <strong>{resultCounts.passed}</strong>
                  </div>
                  <div>
                    <span className="edm-label">Failed cases</span>
                    <strong>{resultCounts.failed}</strong>
                  </div>
                  <div>
                    <span className="edm-label">Hidden cases</span>
                    <strong>{resultCounts.hidden}</strong>
                  </div>
                  <div>
                    <span className="edm-label">Avg runtime</span>
                    <strong>{runtimeAvg} ms</strong>
                  </div>
                  <div>
                    <span className="edm-label">Compile state</span>
                    <strong>{evaluation.compile_exit_code === 0 ? 'Compiled' : 'Review logs'}</strong>
                  </div>
                </div>
              </div>

              <div className="edm-info-card">
                <h4>Requirements & Complexity</h4>
                <div className="ce-category-list">
                  <div className="ce-category-row">
                    <span className="ce-category-name">Detected loop usage</span>
                    <span
                      className={`ce-pill ${
                        evaluation.requirement_checks_json?.checks?.loop_detected
                          ? 'ce-pill-good'
                          : 'ce-pill-bad'
                      }`}
                    >
                      {evaluation.requirement_checks_json?.checks?.loop_detected ? 'Yes' : 'No'}
                    </span>
                  </div>
                  <div className="ce-category-row">
                    <span className="ce-category-name">Detected recursion</span>
                    <span
                      className={`ce-pill ${
                        evaluation.requirement_checks_json?.checks?.recursion_detected
                          ? 'ce-pill-good'
                          : 'ce-pill-bad'
                      }`}
                    >
                      {evaluation.requirement_checks_json?.checks?.recursion_detected ? 'Yes' : 'No'}
                    </span>
                  </div>
                  <div className="ce-category-row">
                    <span className="ce-category-name">Expected complexity</span>
                    <span className="ce-pill ce-pill-muted">
                      {evaluation.requirement_checks_json?.complexity?.expected || 'unspecified'}
                    </span>
                  </div>
                  <div className="ce-category-row">
                    <span className="ce-category-name">Estimated complexity</span>
                    <span className="ce-pill ce-pill-muted">
                      {evaluation.requirement_checks_json?.complexity?.estimated || '-'}
                    </span>
                  </div>
                  <div className="ce-category-row">
                    <span className="ce-category-name">Complexity target met</span>
                    <span
                      className={`ce-pill ${
                        evaluation.requirement_checks_json?.complexity?.met === true
                          ? 'ce-pill-good'
                          : evaluation.requirement_checks_json?.complexity?.met === false
                          ? 'ce-pill-bad'
                          : 'ce-pill-muted'
                      }`}
                    >
                      {evaluation.requirement_checks_json?.complexity?.met === true
                        ? 'Yes'
                        : evaluation.requirement_checks_json?.complexity?.met === false
                        ? 'No'
                        : 'N/A'}
                    </span>
                  </div>
                </div>

                {requiredConcepts.length > 0 && (
                  <div className="ce-tags-wrap edm-tags-top">
                    {requiredConcepts.map((concept: string) => (
                      <span key={concept} className="ce-pill ce-pill-muted">
                        {concept.replace(/_/g, ' ')}
                      </span>
                    ))}
                  </div>
                )}

                {unmetRequirements.length > 0 && (
                  <div className="edm-alert-box edm-alert-warn">
                    <strong>Unmet requirements</strong>
                    <ul>
                      {unmetRequirements.map((item: string) => (
                        <li key={item}>{formatRequirement(item)}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <div className="edm-info-card">
                <h4>Hardcoding & Analyzer Mode</h4>
                <div className="ce-category-row">
                  <span className="ce-category-name">Hardcoding suspicion</span>
                  <span className={getSuspicionBadgeClass(evaluation.hardcoding_flags_json?.suspicion_level)}>
                    {evaluation.hardcoding_flags_json?.suspicion_level || 'low'}
                  </span>
                </div>
                <div className="ce-tags-wrap edm-tags-top">
                  {(evaluation.hardcoding_flags_json?.reasons || []).map((reason: string) => (
                    <span key={reason} className="ce-pill ce-pill-warn">
                      {reason}
                    </span>
                  ))}
                  {(!evaluation.hardcoding_flags_json?.reasons ||
                    evaluation.hardcoding_flags_json?.reasons.length === 0) && (
                    <span className="ce-muted">No suspicious patterns flagged</span>
                  )}
                </div>
                <div className="edm-divider" />
                <div className="ce-category-row">
                  <span className="ce-category-name">AST recursion mode</span>
                  <span
                    className={`ce-pill ${
                      analysisCapabilities?.recursion_ast_available ? 'ce-pill-good' : 'ce-pill-warn'
                    }`}
                  >
                    {analysisCapabilities?.recursion_ast_available ? 'Available' : 'Fallback only'}
                  </span>
                </div>
                <div className="ce-muted">
                  {analysisCapabilities?.recursion_ast_available
                    ? `Using ${analysisCapabilities?.clang_binary || 'clang'} for recursion detection.`
                    : 'Clang AST is unavailable, so recursion detection uses the heuristic fallback.'}
                </div>
              </div>
            </div>

            <div className="ce-section">
              <div className="edm-section-head">
                <div>
                  <h4>Test Case Review</h4>
                  <p className="ce-subtitle">
                    Review result descriptions, runtime, expected output, actual output, and stderr in one place.
                  </p>
                </div>
                <div className="edm-filter-row">
                  {(['all', 'passed', 'failed', 'hidden'] as const).map((filter) => (
                    <button
                      key={filter}
                      type="button"
                      className={`edm-filter-btn ${resultFilter === filter ? 'active' : ''}`}
                      onClick={() => setResultFilter(filter)}
                    >
                      {filter}
                    </button>
                  ))}
                </div>
              </div>

              {filteredResults.length === 0 ? (
                <div className="ce-empty">No test case results match this filter.</div>
              ) : (
                <div className="edm-results-list">
                  {filteredResults.map((result: any, index: number) => (
                    <div key={result.result_id} className="edm-result-card">
                      <div className="edm-result-top">
                        <div>
                          <strong>
                            Case {index + 1}: {result.name || result.description || 'Test case'}
                          </strong>
                          <div className="ce-muted">{result.description || 'No description provided.'}</div>
                        </div>
                        <div className="edm-result-badges">
                          <span className={result.passed ? 'ce-badge ce-badge-pass' : 'ce-badge ce-badge-fail'}>
                            {result.passed ? 'PASS' : 'FAIL'}
                          </span>
                          {result.is_hidden && <span className="ce-pill ce-pill-muted">Hidden</span>}
                          {result.is_edge_case && <span className="ce-pill ce-pill-warn">Edge</span>}
                          <span className="ce-pill ce-pill-muted">{result.execution_time_ms ?? '-'} ms</span>
                          <span className="ce-pill ce-pill-muted">Exit {result.exit_code ?? '-'}</span>
                        </div>
                      </div>

                      <div className="edm-io-grid">
                        <div>
                          <span className="edm-label">Input</span>
                          <pre className="ce-pre-small">{result.input || '(empty)'}</pre>
                        </div>
                        <div>
                          <span className="edm-label">Expected output</span>
                          <pre className="ce-pre-small">{result.expected_output || '(empty)'}</pre>
                        </div>
                        <div>
                          <span className="edm-label">Actual output</span>
                          <pre className="ce-pre-small">{result.stdout || '(empty)'}</pre>
                        </div>
                        <div>
                          <span className="edm-label">stderr</span>
                          <pre className="ce-pre-small">{result.stderr || '(empty)'}</pre>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="edm-two-col">
              <div className="ce-section">
                <h4>Compile & Debug Logs</h4>
                <div className="ce-log-grid">
                  <div>
                    <h5>stdout</h5>
                    <pre>{evaluation.compile_stdout || '(empty)'}</pre>
                  </div>
                  <div>
                    <h5>stderr</h5>
                    <pre>{evaluation.compile_stderr || '(empty)'}</pre>
                  </div>
                </div>
                {evaluation.error_summary && (
                  <div className="edm-alert-box edm-alert-bad">
                    <strong>Error summary</strong>
                    <pre className="ce-pre-small">{evaluation.error_summary}</pre>
                  </div>
                )}
              </div>

              <div className="ce-section">
                <h4>AI-Assisted Summary</h4>
                <p className="ce-subtitle">
                  Teacher assist only. Final marks remain teacher-decided.
                </p>
                <button className="ce-primary-btn" onClick={handleGenerateSummary} disabled={generatingSummary}>
                  {generatingSummary ? 'Generating summary…' : 'Generate summary'}
                </button>
                <div className="edm-ai-box">
                  <pre className="ce-pre-small">{evaluation.ai_summary_text || 'No summary generated yet.'}</pre>
                  <div className="ce-muted">
                    Confidence:{' '}
                    <span className={getConfidenceBadgeClass(evaluation.ai_summary_confidence)}>
                      {evaluation.ai_summary_confidence || 'low'}
                    </span>{' '}
                    | Updated {formatDateTime(evaluation.ai_summary_updated_at || null)}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default EvaluationDetailModal;
