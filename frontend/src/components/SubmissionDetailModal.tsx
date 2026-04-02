import React, { useState, useEffect } from 'react';
import './SubmissionDetailModal.css';

/* ─── Types ─────────────────────────────────────────────────────────────── */

interface TestResult {
  result_id: string;
  test_case_id: string;
  passed: number;
  score: number | null;
  actual_output: string;
  execution_time_ms: number;
  error_message: string | null;
  input_data: string;
  expected_output: string;
  description: string;
}

interface Submission {
  submission_id: string;
  question_id: string;
  source_code: string;
  language: string;
  passed_count: number;
  total_count: number;
  score: number;
  submitted_at: string;
  concept_passed: number;
  concept_details: string | null;
  hardcoded: number;
  hardcoded_reason: string | null;
  testResults: TestResult[];
}

interface QuestionDetail {
  question_id: string;
  title: string;
  marks: number;
  question_order: number;
  problem_type: string;
  required_concepts: string | null;
  reference_solution: string | null;
  time_limit_seconds: number | null;
  submissions: Submission[];
  bestSubmission: Submission | null;
}

interface StudentInfo {
  user_id: string;
  full_name: string;
  username: string;
}

interface SubmissionDetailModalProps {
  examId: string;
  examTitle: string;
  studentId: string;
  studentName: string;
  onClose: () => void;
}

/* ─── Helpers ───────────────────────────────────────────────────────────── */

function fmtTime(iso: string | null) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

function langLabel(lang: string) {
  const m: Record<string, string> = {
    cpp: 'C++', python: 'Python', java: 'Java', c: 'C', javascript: 'JS'
  };
  return m[(lang || '').toLowerCase()] || lang || '—';
}

/* ─── Star rating ────────────────────────────────────────────────────────
   Factors: score %, execution speed, concept compliance, hardcoding        */
function calcStars(sub: Submission, timeLimitSec: number | null): number {
  if (sub.hardcoded) return 0;
  const pct = sub.total_count > 0
    ? Math.round((sub.passed_count / sub.total_count) * 100) : 0;
  if (pct === 0) return 1;

  let stars = 1;
  if (pct >= 20)  stars = 2;
  if (pct >= 50)  stars = 3;
  if (pct >= 75)  stars = 4;
  if (pct >= 95)  stars = 5;

  // Concept penalty: -1 star
  if (!sub.concept_passed) stars = Math.max(1, stars - 1);

  // Speed bonus/penalty
  if (sub.testResults.length > 0) {
    const avgMs = sub.testResults.reduce((s, r) => s + (r.execution_time_ms || 0), 0)
                  / sub.testResults.length;
    const limitMs = (timeLimitSec || 2) * 1000;
    if (avgMs < limitMs * 0.25 && stars < 5) stars = Math.min(5, stars + 1); // fast bonus
    if (avgMs > limitMs * 0.80) stars = Math.max(1, stars - 1);              // slow penalty
  }

  return Math.max(0, Math.min(5, stars));
}

/* ─── Code efficiency analysis (static) ────────────────────────────────── */
interface EfficiencyReport {
  label: string;
  complexity: string;
  note: string;
  color: 'green' | 'yellow' | 'red';
}

function analyzeEfficiency(code: string, language: string): EfficiencyReport {
  if (!code) return { label: 'N/A', complexity: 'Unknown', note: 'No code submitted.', color: 'yellow' };

  const stripped = code
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/#.*$/gm, '');

  // Count for/while loops at different indent levels to estimate nesting depth
  const loopLines = stripped.split('\n').filter(l =>
    /\b(for|while)\b/.test(l) && !/\bdef\b/.test(l)
  );
  const maxIndent = loopLines.reduce((max, l) => {
    const indent = (l.match(/^(\s*)/)?.[1].length ?? 0);
    return Math.max(max, indent);
  }, 0);
  // Rough nesting depth from indentation (4 spaces per level)
  const nestDepth = Math.max(1, Math.round(maxIndent / 4));
  const loopCount = loopLines.length;

  // Detect common efficiency issues
  const hasBuiltinSort   = /\b(sort|sorted)\s*\(/.test(code);
  const hasManualSort    = /\bfor\b.+\bfor\b[\s\S]{0,200}\bif\b.+(>|<|>=|<=)/.test(stripped);
  const hasNestedLoop    = loopCount >= 2;
  const hasTripleNested  = nestDepth >= 3 || loopCount >= 3;
  const hasRecursion     = /\breturn\s+\w+\s*\(/.test(stripped);
  const hasUnnecessaryPass = /\bfor\b[\s\S]{0,100}\bfor\b[\s\S]{0,100}\bfor\b/.test(stripped); // 3+ loops
  const avgExecMs = 0; // not available here

  // Determine complexity label
  if (hasTripleNested) {
    return {
      label: 'High complexity',
      complexity: 'O(n³) or higher',
      note: 'Three or more nested loops detected. Consider reducing nesting or using a more efficient algorithm.',
      color: 'red'
    };
  }
  if (hasManualSort && !hasBuiltinSort) {
    return {
      label: 'Manual sort detected',
      complexity: 'O(n²)',
      note: 'Manual sorting loop detected (e.g. bubble sort). Built-in sort is faster for most cases.',
      color: 'yellow'
    };
  }
  if (hasNestedLoop) {
    return {
      label: 'Moderate complexity',
      complexity: 'O(n²)',
      note: 'Nested loops detected. This is acceptable for small inputs but may be slow for large datasets.',
      color: 'yellow'
    };
  }
  if (hasRecursion) {
    return {
      label: 'Recursive solution',
      complexity: 'Varies',
      note: 'Recursive approach used. Efficient if base cases are correct; watch for stack overflow on large inputs.',
      color: 'yellow'
    };
  }
  if (loopCount === 1) {
    return {
      label: 'Good efficiency',
      complexity: 'O(n)',
      note: 'Single loop — linear time complexity. Efficient solution.',
      color: 'green'
    };
  }
  if (loopCount === 0 && code.length < 200) {
    return {
      label: 'Constant / minimal',
      complexity: 'O(1)',
      note: 'No loops detected. Very efficient for this input size.',
      color: 'green'
    };
  }
  return {
    label: 'Acceptable',
    complexity: 'O(n)',
    note: 'Code structure looks reasonable. No obvious inefficiencies detected.',
    color: 'green'
  };
}

/* ─── Stars display ─────────────────────────────────────────────────────── */
function Stars({ count, max = 5 }: { count: number; max?: number }) {
  return (
    <span className="sdm-stars" aria-label={`${count} out of ${max} stars`}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={i < count ? 'star-filled' : 'star-empty'}>★</span>
      ))}
    </span>
  );
}

/* ─── Component ─────────────────────────────────────────────────────────── */

const SubmissionDetailModal: React.FC<SubmissionDetailModalProps> = ({
  examId, examTitle, studentId, studentName, onClose
}) => {
  const api = (window as any).electronAPI;

  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);
  const [student,   setStudent]   = useState<StudentInfo | null>(null);
  const [questions, setQuestions] = useState<QuestionDetail[]>([]);

  const [activeQ,   setActiveQ]   = useState<string | null>(null);
  const [activeSub, setActiveSub] = useState<string | null>(null);
  // 'passed' | 'failed' | 'all'
  const [tcFilter,  setTcFilter]  = useState<'passed' | 'failed' | 'all'>('all');

  useEffect(() => {
    (async () => {
      try {
        const res = await api.getTeacherStudentDetail(examId, studentId);
        if (res.success) {
          setStudent(res.student);
          setQuestions(res.questions || []);
          const first = (res.questions || []).find((q: QuestionDetail) => q.submissions.length > 0);
          if (first) {
            setActiveQ(first.question_id);
            if (first.bestSubmission) setActiveSub(first.bestSubmission.submission_id);
          }
        } else {
          setError(res.error || 'Failed to load');
        }
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [examId, studentId]);

  const totalEarned = questions.reduce((s, q) => s + (q.bestSubmission?.score ?? 0), 0);
  const totalMax    = questions.reduce((s, q) => s + (q.marks || 0), 0);
  const totalPct    = totalMax > 0 ? Math.round((totalEarned / totalMax) * 100) : 0;

  // Overall star rating based on best submissions across all questions
  const overallStars = (() => {
    const attempted = questions.filter(q => q.bestSubmission);
    if (!attempted.length) return 0;
    const avg = attempted.reduce((s, q) =>
      s + calcStars(q.bestSubmission!, q.time_limit_seconds), 0) / attempted.length;
    return Math.round(avg);
  })();

  return (
    <div className="sdm-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sdm-panel">

        {/* ── Header ── */}
        <div className="sdm-header">
          <div className="sdm-header-left">
            <h2 className="sdm-title">Submission Report</h2>
            <p className="sdm-subtitle">{examTitle}</p>
          </div>
          <div className="sdm-header-right">
            <button className="sdm-print-btn" onClick={() => window.print()}>Print / Export</button>
            <button className="sdm-close-btn" onClick={onClose}>✕</button>
          </div>
        </div>

        {loading && <div className="sdm-loading">Loading submissions…</div>}
        {error   && <div className="sdm-error">{error}</div>}

        {!loading && !error && (
          <>
            {/* ── Student summary ── */}
            <div className="sdm-student-card">
              <div className="sdm-student-info">
                <div className="sdm-avatar">{(studentName || 'S')[0].toUpperCase()}</div>
                <div>
                  <div className="sdm-student-name">{studentName}</div>
                  <div className="sdm-student-user">@{student?.username || '—'}</div>
                  <Stars count={overallStars} />
                  <div className="sdm-star-label">
                    {overallStars === 5 ? 'Excellent' :
                     overallStars === 4 ? 'Good' :
                     overallStars === 3 ? 'Average' :
                     overallStars === 2 ? 'Needs improvement' :
                     overallStars === 1 ? 'Poor' : 'Not submitted / Hardcoded'}
                  </div>
                </div>
              </div>
              <div className="sdm-overall">
                <div className={`sdm-overall-ring ${totalPct >= 80 ? 'ring-green' : totalPct >= 50 ? 'ring-yellow' : 'ring-red'}`}>
                  <span className="sdm-overall-pct">{totalPct}%</span>
                </div>
                <div className="sdm-overall-label">
                  <strong>{totalEarned}/{totalMax}</strong> marks<br />
                  <span className="sdm-q-count">
                    {questions.filter(q => q.submissions.length > 0).length}/{questions.length} attempted
                  </span>
                </div>
              </div>
            </div>

            {/* ── Per-question sections ── */}
            {questions.map(q => {
              const best    = q.bestSubmission;
              const bestPct = best && q.marks > 0
                ? Math.round((best.score / q.marks) * 100) : null;
              const isOpen  = activeQ === q.question_id;

              return (
                <div key={q.question_id} className="sdm-question-block">
                  <div
                    className={`sdm-q-header ${isOpen ? 'sdm-q-open' : ''}`}
                    onClick={() => setActiveQ(isOpen ? null : q.question_id)}
                  >
                    <div className="sdm-q-left">
                      <span className="sdm-q-num">Q{q.question_order}</span>
                      <span className="sdm-q-title">{q.title}</span>
                      {q.problem_type && <span className="sdm-type-tag">{q.problem_type}</span>}
                    </div>
                    <div className="sdm-q-right">
                      {best ? (
                        <>
                          <span className={`score-chip ${bestPct! >= 80 ? 'chip-green' : bestPct! >= 50 ? 'chip-yellow' : 'chip-red'}`}>
                            {bestPct}%
                          </span>
                          <span className="sdm-q-marks">{best.score}/{q.marks} marks</span>
                          <Stars count={calcStars(best, q.time_limit_seconds)} max={5} />
                          <span className="sdm-q-attempts">
                            {q.submissions.length} attempt{q.submissions.length > 1 ? 's' : ''}
                          </span>
                          {best.hardcoded ? <span className="sdm-flag-hc">HARDCODED</span> : null}
                          {!best.concept_passed && !best.hardcoded
                            ? <span className="sdm-flag-c">CONCEPT</span> : null}
                        </>
                      ) : (
                        <span className="sdm-not-attempted">Not attempted</span>
                      )}
                      <span className="sdm-chevron">{isOpen ? '▲' : '▼'}</span>
                    </div>
                  </div>

                  {isOpen && (
                    <div className="sdm-q-body">
                      {q.submissions.length === 0 ? (
                        <p className="sdm-empty-sub">No submissions for this question.</p>
                      ) : (
                        <>
                          {/* Attempt tabs */}
                          <div className="sdm-attempt-tabs">
                            {q.submissions.map((sub, idx) => {
                              const sp = q.marks > 0
                                ? Math.round((sub.score / q.marks) * 100) : 0;
                              const isBest = sub.submission_id === q.bestSubmission?.submission_id;
                              return (
                                <button
                                  key={sub.submission_id}
                                  className={`sdm-attempt-tab ${activeSub === sub.submission_id ? 'active' : ''}`}
                                  onClick={() => { setActiveSub(sub.submission_id); setTcFilter('all'); }}
                                >
                                  Attempt {idx + 1}
                                  {isBest && <span className="sdm-best-badge"> Best</span>}
                                  <span className={`sdm-tab-pct ${sp >= 80 ? 'pct-green' : sp >= 50 ? 'pct-yellow' : 'pct-red'}`}>
                                    {sp}%
                                  </span>
                                </button>
                              );
                            })}
                          </div>

                          {/* Active submission */}
                          {q.submissions
                            .filter(s => s.submission_id === activeSub)
                            .map(sub => {
                              const concepts = (() => {
                                try { return JSON.parse(sub.concept_details || '{}'); }
                                catch { return {}; }
                              })();
                              const subPct = q.marks > 0
                                ? Math.round((sub.score / q.marks) * 100) : 0;
                              const stars  = calcStars(sub, q.time_limit_seconds);
                              const eff    = analyzeEfficiency(sub.source_code, sub.language);
                              const allFailed = sub.testResults.length > 0 &&
                                sub.testResults.every(r => !r.passed);

                              const passedTCs = sub.testResults.filter(r => r.passed);
                              const failedTCs = sub.testResults.filter(r => !r.passed);
                              const shownTCs  =
                                tcFilter === 'passed' ? passedTCs :
                                tcFilter === 'failed' ? failedTCs :
                                sub.testResults;

                              const avgMs = sub.testResults.length
                                ? Math.round(sub.testResults.reduce(
                                    (s, r) => s + (r.execution_time_ms || 0), 0
                                  ) / sub.testResults.length)
                                : null;

                              return (
                                <div key={sub.submission_id} className="sdm-sub-detail">

                                  {/* Meta row */}
                                  <div className="sdm-sub-meta">
                                    <span><strong>Submitted:</strong> {fmtTime(sub.submitted_at)}</span>
                                    <span><strong>Language:</strong> {langLabel(sub.language)}</span>
                                    <span><strong>Tests:</strong> {sub.passed_count}/{sub.total_count} passed</span>
                                    <span><strong>Score:</strong> {sub.score}/{q.marks} ({subPct}%)</span>
                                    {avgMs !== null && (
                                      <span><strong>Avg time:</strong> {avgMs}ms</span>
                                    )}
                                  </div>

                                  {/* ── Performance panel ── */}
                                  <div className="sdm-perf-panel">
                                    <div className="sdm-perf-left">
                                      <div className="sdm-perf-title">Performance Rating</div>
                                      <Stars count={stars} />
                                      <div className="sdm-perf-label">
                                        {stars === 5 ? 'Excellent — full marks, fast code' :
                                         stars === 4 ? 'Good — minor issues' :
                                         stars === 3 ? 'Average — some test cases failed' :
                                         stars === 2 ? 'Needs improvement' :
                                         stars === 1 ? 'Poor — most tests failed' :
                                         'Rejected — hardcoded output'}
                                      </div>
                                    </div>
                                    <div className="sdm-perf-divider" />
                                    <div className="sdm-eff-block">
                                      <div className="sdm-perf-title">Code Efficiency</div>
                                      <span className={`sdm-eff-label sdm-eff-${eff.color}`}>
                                        {eff.label}
                                      </span>
                                      <div className="sdm-eff-complexity">
                                        Estimated: <strong>{eff.complexity}</strong>
                                      </div>
                                      <div className="sdm-eff-note">{eff.note}</div>
                                    </div>
                                  </div>

                                  {/* Alerts */}
                                  {sub.hardcoded ? (
                                    <div className="sdm-alert sdm-alert-danger">
                                      <strong>Hardcoding Detected</strong> —{' '}
                                      {sub.hardcoded_reason || 'Output appears hardcoded instead of computed.'}
                                    </div>
                                  ) : !sub.concept_passed && concepts.message ? (
                                    <div className="sdm-alert sdm-alert-warn">
                                      <strong>Concept Penalty:</strong> {concepts.message}
                                    </div>
                                  ) : null}

                                  {/* Concept chips */}
                                  {Object.keys(concepts).filter(k =>
                                    k !== 'message' && k !== 'complianceScore'
                                  ).length > 0 && (
                                    <div className="sdm-concept-row">
                                      <span className="sdm-concept-label">Concepts:</span>
                                      {Object.entries(concepts)
                                        .filter(([k]) => k !== 'message' && k !== 'complianceScore')
                                        .map(([concept, passed]) => (
                                          <span
                                            key={concept}
                                            className={`sdm-concept-chip ${passed ? 'cc-pass' : 'cc-fail'}`}
                                          >
                                            {passed ? '✓' : '✗'} {concept.replace(/_/g, ' ')}
                                          </span>
                                        ))}
                                    </div>
                                  )}

                                  {/* ── ALL FAILED: reference solution comparison ── */}
                                  {allFailed && q.reference_solution && (
                                    <div className="sdm-ref-block">
                                      <div className="sdm-ref-title">
                                        Reference Solution (standard answer)
                                      </div>
                                      <p className="sdm-ref-desc">
                                        All test cases failed. Below is the correct reference
                                        solution used to generate the expected outputs.
                                        Compare it with the student's code to identify mistakes.
                                      </p>
                                      <pre className="sdm-ref-code">{q.reference_solution}</pre>
                                    </div>
                                  )}

                                  {/* ── Test case section ── */}
                                  <div className="sdm-tc-section">
                                    <div className="sdm-tc-top-bar">
                                      <h4 className="sdm-tc-heading">
                                        Test Cases
                                        <span className="sdm-tc-summary">
                                          <span className="tc-pass-count">{passedTCs.length} passed</span>
                                          {failedTCs.length > 0 && (
                                            <span className="tc-fail-count">{failedTCs.length} failed</span>
                                          )}
                                        </span>
                                      </h4>
                                      {/* Filter tabs */}
                                      <div className="sdm-tc-filter">
                                        {(['all', 'passed', 'failed'] as const).map(f => (
                                          <button
                                            key={f}
                                            className={`sdm-tc-filter-btn ${tcFilter === f ? 'active' : ''}`}
                                            onClick={() => setTcFilter(f)}
                                          >
                                            {f === 'all'    ? `All (${sub.testResults.length})` :
                                             f === 'passed' ? `Passed (${passedTCs.length})` :
                                                              `Failed (${failedTCs.length})`}
                                          </button>
                                        ))}
                                      </div>
                                    </div>

                                    {shownTCs.length === 0 ? (
                                      <p className="sdm-empty-sub">
                                        {tcFilter === 'passed' ? 'No test cases passed.' :
                                         tcFilter === 'failed' ? 'No test cases failed.' :
                                         'No test case data.'}
                                      </p>
                                    ) : (
                                      <div className="sdm-tc-cards">
                                        {shownTCs.map((tc, i) => (
                                          <div
                                            key={tc.result_id}
                                            className={`sdm-tc-card ${tc.passed ? 'tcc-pass' : 'tcc-fail'}`}
                                          >
                                            {/* Card header */}
                                            <div className="sdm-tcc-header">
                                              <span className={`tc-badge ${tc.passed ? 'tc-badge-pass' : 'tc-badge-fail'}`}>
                                                {tc.passed ? '✓ PASS' : '✗ FAIL'}
                                              </span>
                                              <span className="sdm-tcc-desc">
                                                {tc.description || `Test Case ${i + 1}`}
                                              </span>
                                              {tc.execution_time_ms != null && (
                                                <span className="sdm-tcc-time">
                                                  {tc.execution_time_ms}ms
                                                </span>
                                              )}
                                            </div>

                                            {/* Card body — 3-column grid */}
                                            <div className="sdm-tcc-grid">
                                              <div className="sdm-tcc-col">
                                                <div className="sdm-tcc-col-label">Input</div>
                                                <pre className="tc-pre">{tc.input_data || '—'}</pre>
                                              </div>
                                              <div className="sdm-tcc-col">
                                                <div className="sdm-tcc-col-label">
                                                  Expected Output
                                                </div>
                                                <pre className="tc-pre tc-expected">
                                                  {tc.expected_output || '—'}
                                                </pre>
                                              </div>
                                              <div className="sdm-tcc-col">
                                                <div className="sdm-tcc-col-label">
                                                  {tc.passed ? 'Student Output' : 'Student Output (wrong)'}
                                                </div>
                                                <pre className={`tc-pre ${tc.passed ? '' : 'tc-wrong'}`}>
                                                  {tc.error_message
                                                    ? <span className="tc-error">{tc.error_message}</span>
                                                    : (tc.actual_output || '(empty)')}
                                                </pre>
                                              </div>
                                            </div>

                                            {/* Diff hint for failed cases */}
                                            {!tc.passed && !tc.error_message &&
                                              tc.expected_output && tc.actual_output && (
                                              <div className="sdm-diff-hint">
                                                <strong>Difference:</strong>{' '}
                                                {tc.expected_output.trim() === tc.actual_output.trim()
                                                  ? 'Outputs match after trimming — likely a whitespace or newline issue.'
                                                  : `Expected ${tc.expected_output.split('\n').length} line(s), got ${tc.actual_output.split('\n').length} line(s).`}
                                              </div>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>

                                  {/* Source code */}
                                  <details className="sdm-code-section">
                                    <summary className="sdm-code-summary">
                                      View Source Code ({langLabel(sub.language)})
                                    </summary>
                                    <pre className="sdm-code-block">{sub.source_code || '(empty)'}</pre>
                                  </details>

                                </div>
                              );
                            })}
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
};

export default SubmissionDetailModal;
