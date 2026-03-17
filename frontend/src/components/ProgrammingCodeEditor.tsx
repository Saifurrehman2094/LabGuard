import React, { useState, useEffect, useRef, useCallback } from 'react';
import './ProgrammingCodeEditor.css';

interface ProgrammingQuestion {
  question_id: string;
  title: string;
  problem_text: string;
  sample_input?: string;
  sample_output?: string;
  language: string;
  max_marks?: number;
}

interface TestCase {
  test_case_id: string;
  input_data: string;
  expected_output: string;
  description?: string;
}

interface RunResult {
  testCaseId: string;
  passed: boolean;
  score?: number;
  actualOutput: string | null;
  executionTimeMs: number | null;
  error?: string;
}

interface QuestionSubmission {
  score: number;
  maxMarks: number;
  passedCount: number;
  totalCount: number;
  conceptPassed?: boolean;
  conceptMessage?: string;
  hardcoded?: boolean;
}

const LANGUAGES = [
  { value: 'python', label: 'Python' },
  { value: 'cpp', label: 'C++' },
  { value: 'java', label: 'Java' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'c', label: 'C' }
];

const DEFAULT_STARTERS: Record<string, string> = {
  python: '# Write your solution here\n',
  cpp: '#include <iostream>\nusing namespace std;\n\nint main() {\n    // Write your solution here\n    return 0;\n}',
  java: 'import java.util.Scanner;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        // Write your solution here\n    }\n}',
  javascript: "const lines = [];\nprocess.stdin.on('data', d => lines.push(...d.toString().split('\\n')));\nprocess.stdin.on('end', () => {\n    // Write your solution here\n});",
  c: '#include <stdio.h>\n\nint main() {\n    // Write your solution here\n    return 0;\n}'
};

interface ProgrammingCodeEditorProps {
  examId: string;
  studentId: string;
  questions: ProgrammingQuestion[];
  onLoadTestCases: (questionId: string) => Promise<TestCase[]>;
  refreshVersion?: number;
}

const ProgrammingCodeEditor: React.FC<ProgrammingCodeEditorProps> = ({
  examId,
  studentId,
  questions,
  onLoadTestCases,
  refreshVersion = 0
}) => {
  const [activeIdx, setActiveIdx] = useState(0);
  // Per-question code and language - persists when switching tabs
  const [codeByQuestion, setCodeByQuestion] = useState<Record<string, string>>({});
  const [langByQuestion, setLangByQuestion] = useState<Record<string, string>>({});
  // Test cases cached per question
  const [testCasesByQuestion, setTestCasesByQuestion] = useState<Record<string, TestCase[]>>({});
  // Run state
  const [running, setRunning] = useState(false);
  const [runResults, setRunResults] = useState<Record<string, RunResult[]>>({});
  const [runError, setRunError] = useState<string | null>(null);
  // Submit state
  const [submitting, setSubmitting] = useState(false);
  const [submissions, setSubmissions] = useState<Record<string, QuestionSubmission>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Cooldown: seconds remaining after each submit (30s anti-spam)
  const [submitCooldown, setSubmitCooldown] = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const api = (window as any).electronAPI;
  const selectedQuestion = questions[activeIdx] || null;
  const qId = selectedQuestion?.question_id || '';
  const isFirstMount = useRef(true);

  // Current code / language for active question
  const currentCode = codeByQuestion[qId] ?? DEFAULT_STARTERS[langByQuestion[qId] || selectedQuestion?.language || 'python'] ?? '';
  const currentLang = langByQuestion[qId] || selectedQuestion?.language || 'python';

  // Load test cases when switching to a question
  useEffect(() => {
    if (!qId) return;
    if (testCasesByQuestion[qId] !== undefined) return; // already loaded
    onLoadTestCases(qId).then(tcs => {
      setTestCasesByQuestion(prev => ({ ...prev, [qId]: tcs }));
    });
  }, [qId]);

  // When teacher updates exam (refreshVersion bumps), clear test case cache so they reload fresh
  useEffect(() => {
    if (isFirstMount.current) { isFirstMount.current = false; return; }
    // Clear cached test cases for all questions — they'll reload on next view
    setTestCasesByQuestion({});
    setRunResults({});
    // Reload test cases for the currently visible question immediately
    if (qId) {
      onLoadTestCases(qId).then(tcs => {
        setTestCasesByQuestion(prev => ({ ...prev, [qId]: tcs }));
      });
    }
  }, [refreshVersion]);

  const setCode = (code: string) => setCodeByQuestion(prev => ({ ...prev, [qId]: code }));
  const setLang = (lang: string) => {
    setLangByQuestion(prev => ({ ...prev, [qId]: lang }));
    // Only reset code if student hasn't written anything yet
    if (!codeByQuestion[qId] || codeByQuestion[qId] === (DEFAULT_STARTERS[currentLang] ?? '')) {
      setCodeByQuestion(prev => ({ ...prev, [qId]: DEFAULT_STARTERS[lang] ?? '' }));
    }
  };

  const testCases = testCasesByQuestion[qId] || [];
  const currentRunResults = runResults[qId] || null;

  const handleRun = async () => {
    if (!selectedQuestion || !api?.codeRunTestCases) return;
    if (testCases.length === 0) {
      setRunError('No test cases for this question.');
      return;
    }
    setRunning(true);
    setRunError(null);
    try {
      const r = await api.codeRunTestCases({
        sourceCode: currentCode,
        testCases: testCases.map(tc => ({
          testCaseId: tc.test_case_id,
          input: tc.input_data,
          expectedOutput: tc.expected_output
        })),
        language: currentLang,
        timeLimit: 3
      });
      if (r.success) {
        setRunResults(prev => ({ ...prev, [qId]: r.results || [] }));
      } else {
        setRunError(r.error || 'Run failed');
      }
    } catch (err) {
      setRunError((err as Error).message);
    } finally {
      setRunning(false);
    }
  };

  const startCooldown = () => {
    if (cooldownRef.current) clearInterval(cooldownRef.current);
    setSubmitCooldown(30);
    cooldownRef.current = setInterval(() => {
      setSubmitCooldown(prev => {
        if (prev <= 1) {
          clearInterval(cooldownRef.current!);
          cooldownRef.current = null;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleSubmit = async () => {
    if (!selectedQuestion || !api?.submitProgrammingCode) return;
    if (submitCooldown > 0) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const r = await api.submitProgrammingCode(examId, qId, currentCode, currentLang);
      if (r.success) {
        const maxMarks = r.maxMarks ?? selectedQuestion.max_marks ?? 20;
        setSubmissions(prev => ({
          ...prev,
          [qId]: {
            score: r.score ?? 0,
            maxMarks,
            passedCount: r.passedCount ?? 0,
            totalCount: r.totalCount ?? testCases.length,
            conceptPassed: r.conceptPassed,
            conceptMessage: r.conceptMessage,
            hardcoded: !!(r.hardcoded)
          }
        }));
        startCooldown();
      } else {
        setSubmitError('Submit failed: ' + (r.error || 'Unknown error'));
      }
    } catch (err) {
      setSubmitError('Submit failed: ' + (err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  // Total score across all submitted questions
  const totalScore = Object.values(submissions).reduce((s, sub) => s + sub.score, 0);
  const totalMax = questions.reduce((s, q) => s + (submissions[q.question_id]?.maxMarks ?? q.max_marks ?? 20), 0);
  const submittedCount = Object.keys(submissions).length;
  const totalPct = totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : 0;
  // Show breakdown banner only after at least one submission
  const hasAnySubmission = submittedCount > 0;

  if (questions.length === 0) return null;

  return (
    <div className="pce-root">
      {/* Header with total score and animated progress ring */}
      <div className="pce-header">
        <span className="pce-title">Programming Questions</span>
        <div className="pce-total-score">
          <div
            className="pce-ring-wrap"
            style={{ '--pce-ring-pct': `${totalPct}%` } as React.CSSProperties}
          >
            <svg className="pce-ring-svg" viewBox="0 0 36 36">
              <circle className="pce-ring-bg" cx="18" cy="18" r="15.9" />
              <circle
                className="pce-ring-fill"
                cx="18" cy="18" r="15.9"
                strokeDasharray={`${totalPct} ${100 - totalPct}`}
                strokeDashoffset="25"
              />
            </svg>
            <span className="pce-ring-label">{totalPct}%</span>
          </div>
          <div className="pce-total-text">
            <span className="pce-total-val">{totalScore} / {totalMax}</span>
            <span className="pce-total-sub">{submittedCount}/{questions.length} submitted</span>
          </div>
        </div>
      </div>

      {/* Per-question score breakdown banner — visible once at least one submitted */}
      {hasAnySubmission && (
        <div className="pce-breakdown">
          {questions.map((q, idx) => {
            const sub = submissions[q.question_id];
            if (!sub) return null;
            const pct = sub.maxMarks > 0 ? (sub.score / sub.maxMarks) * 100 : 0;
            const color = pct >= 80 ? 'green' : pct >= 50 ? 'yellow' : 'red';
            return (
              <span key={q.question_id} className={`pce-breakdown-pill pce-pill-${color}`}>
                Q{idx + 1}: {sub.score}/{sub.maxMarks}
              </span>
            );
          })}
          <span className="pce-breakdown-total">Total: {totalScore}/{totalMax}</span>
        </div>
      )}

      {/* Question tabs */}
      <div className="pce-tabs">
        {questions.map((q, idx) => {
          const sub = submissions[q.question_id];
          const hasRun = runResults[q.question_id];
          return (
            <button
              key={q.question_id}
              className={`pce-tab ${activeIdx === idx ? 'active' : ''} ${sub ? 'submitted' : ''}`}
              onClick={() => { setActiveIdx(idx); setRunError(null); setSubmitError(null); }}
            >
              <span className="pce-tab-label">Q{idx + 1}</span>
              {sub ? (
                <span className="pce-tab-score">{sub.score}/{sub.maxMarks}</span>
              ) : hasRun ? (
                <span className="pce-tab-dot run" title="Tested" />
              ) : null}
            </button>
          );
        })}
      </div>

      {selectedQuestion && (
        <div className="pce-body">
          {/* Left: Problem statement */}
          <div className="pce-problem">
            <div className="pce-problem-title">Q{activeIdx + 1}: {selectedQuestion.title}</div>
            <pre className="pce-problem-text">{selectedQuestion.problem_text}</pre>
            {selectedQuestion.sample_input && (
              <div className="pce-sample">
                <span className="pce-sample-label">Sample Input</span>
                <pre>{selectedQuestion.sample_input}</pre>
              </div>
            )}
            {selectedQuestion.sample_output && (
              <div className="pce-sample">
                <span className="pce-sample-label">Sample Output</span>
                <pre>{selectedQuestion.sample_output}</pre>
              </div>
            )}
          </div>

          {/* Right: Editor + results */}
          <div className="pce-editor-col">
            {/* Language + actions bar */}
            <div className="pce-controls">
              <div className="pce-lang-wrap">
                <span className="pce-lang-label">Language</span>
                <select
                  value={currentLang}
                  onChange={e => setLang(e.target.value)}
                  className="pce-lang-select"
                >
                  {LANGUAGES.map(l => (
                    <option key={l.value} value={l.value}>{l.label}</option>
                  ))}
                </select>
              </div>
              <div className="pce-actions">
                <button
                  onClick={handleRun}
                  disabled={running || submitting || testCases.length === 0}
                  className="pce-btn pce-btn-run"
                  title={testCases.length === 0 ? 'No test cases available' : 'Run against test cases'}
                >
                  {running ? (
                    <><span className="pce-spinner" /> Running...</>
                  ) : '▶ Run'}
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={submitting || running || submitCooldown > 0}
                  className="pce-btn pce-btn-submit"
                  title={submitCooldown > 0 ? `Wait ${submitCooldown}s before resubmitting` : ''}
                >
                  {submitting ? (
                    <><span className="pce-spinner" /> Submitting...</>
                  ) : submitCooldown > 0 ? (
                    `Resubmit in ${submitCooldown}s`
                  ) : submissions[qId] ? 'Re-Submit' : 'Submit'}
                </button>
              </div>
            </div>

            {/* Code editor */}
            <div className="pce-editor-wrap">
              <textarea
                className="pce-textarea"
                value={currentCode}
                onChange={e => setCode(e.target.value)}
                placeholder="Write or paste your code here..."
                spellCheck={false}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
              />
            </div>

            {/* Errors */}
            {runError && <div className="pce-alert error">{runError}</div>}
            {submitError && <div className="pce-alert error">{submitError}</div>}

            {/* Submission result - score only, no test case details */}
            {submissions[qId] && (() => {
              const sub = submissions[qId];
              const subPct = sub.maxMarks > 0 ? Math.round((sub.score / sub.maxMarks) * 100) : 0;
              const scoreColor = subPct >= 80 ? 'green' : subPct >= 50 ? 'yellow' : 'red';
              return (
                <div className="pce-submit-result">
                  <div className={`pce-submit-score-box pce-score-${scoreColor}`}>
                    <span className="pce-submit-score">{sub.score}</span>
                    <span className="pce-submit-max">/ {sub.maxMarks}</span>
                  </div>
                  <div className="pce-submit-detail">
                    {sub.hardcoded ? (
                      <div className="pce-submit-reject">
                        Submission rejected: solution does not meet code quality requirements.
                      </div>
                    ) : (
                      <div className="pce-submit-label">Submitted successfully</div>
                    )}
                    {!sub.hardcoded && sub.conceptPassed === false && (
                      <div className="pce-concept-warn">
                        Note: Some required programming concepts were not detected in your solution.
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Run feedback - score bar only, no test case details */}
            {currentRunResults && currentRunResults.length > 0 && !submissions[qId] && (
              <div className="pce-run-summary">
                {(() => {
                  const passed = currentRunResults.filter(r => r.passed).length;
                  const total = currentRunResults.length;
                  const pct = Math.round((passed / total) * 100);
                  // Check for runtime errors
                  const hasError = currentRunResults.some(r => r.error);
                  return (
                    <>
                      <div className="pce-run-bar-wrap">
                        <div className="pce-run-bar" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="pce-run-bar-label">
                        {hasError ? 'Runtime error in your code — check syntax and logic' : `${pct}% score on test run`}
                      </span>
                    </>
                  );
                })()}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ProgrammingCodeEditor;
