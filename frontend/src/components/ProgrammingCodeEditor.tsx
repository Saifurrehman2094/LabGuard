import React, { useState, useEffect } from 'react';
import './ProgrammingCodeEditor.css';

interface ProgrammingQuestion {
  question_id: string;
  title: string;
  problem_text: string;
  sample_input?: string;
  sample_output?: string;
  language: string;
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
  actualOutput: string | null;
  executionTimeMs: number | null;
  error?: string;
}

const LANGUAGES = [
  { value: 'python', label: 'Python' },
  { value: 'cpp', label: 'C++' },
  { value: 'java', label: 'Java' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'c', label: 'C' }
];

const DEFAULT_CODE: Record<string, string> = {
  python: '# Write your solution here\nn = int(input())\nprint(n * n)',
  cpp: '#include <iostream>\nusing namespace std;\n\nint main() {\n    int n;\n    cin >> n;\n    cout << n * n << endl;\n    return 0;\n}',
  java: 'import java.util.Scanner;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        int n = sc.nextInt();\n        System.out.println(n * n);\n    }\n}',
  javascript: "const readline = require('readline');\nconst rl = readline.createInterface({ input: process.stdin });\nrl.on('line', (line) => {\n    const n = parseInt(line);\n    console.log(n * n);\n});",
  c: '#include <stdio.h>\n\nint main() {\n    int n;\n    scanf("%d", &n);\n    printf("%d\\n", n * n);\n    return 0;\n}'
};

interface ProgrammingCodeEditorProps {
  examId: string;
  studentId: string;
  questions: ProgrammingQuestion[];
  onLoadTestCases: (questionId: string) => Promise<TestCase[]>;
}

const ProgrammingCodeEditor: React.FC<ProgrammingCodeEditorProps> = ({
  examId,
  studentId,
  questions,
  onLoadTestCases
}) => {
  const [selectedQuestion, setSelectedQuestion] = useState<ProgrammingQuestion | null>(questions[0] || null);
  const [sourceCode, setSourceCode] = useState<string>(DEFAULT_CODE.python);
  const [language, setLanguage] = useState<string>('python');
  const [running, setRunning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [runResults, setRunResults] = useState<RunResult[] | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);
  const [testCases, setTestCases] = useState<TestCase[]>([]);

  const api = (window as any).electronAPI;

  useEffect(() => {
    if (questions.length > 0 && !selectedQuestion) {
      setSelectedQuestion(questions[0]);
    }
  }, [questions]);

  useEffect(() => {
    if (selectedQuestion) {
      setSourceCode(DEFAULT_CODE[language] || DEFAULT_CODE.python);
      loadTestCasesForQuestion(selectedQuestion.question_id);
    }
  }, [selectedQuestion?.question_id]);

  useEffect(() => {
    if (selectedQuestion) {
      setSourceCode(DEFAULT_CODE[language] || DEFAULT_CODE.python);
    }
  }, [language]);

  const loadTestCasesForQuestion = async (questionId: string) => {
    const tcs = await onLoadTestCases(questionId);
    setTestCases(tcs);
  };

  const handleRun = async () => {
    if (!selectedQuestion || !api?.codeRunTestCases) return;
    if (testCases.length === 0) {
      setRunError('No test cases for this question. Teacher must add test cases.');
      return;
    }
    setRunning(true);
    setRunError(null);
    setRunResults(null);
    try {
      const runTestCases = testCases.map(tc => ({
        testCaseId: tc.test_case_id,
        input: tc.input_data,
        expectedOutput: tc.expected_output
      }));
      const r = await api.codeRunTestCases({
        sourceCode,
        testCases: runTestCases,
        language,
        timeLimit: 2
      });
      if (r.success) {
        setRunResults(r.results || []);
      } else {
        setRunError(r.error || 'Run failed');
      }
    } catch (err) {
      setRunError((err as Error).message);
    } finally {
      setRunning(false);
    }
  };

  const handleSubmit = async () => {
    if (!selectedQuestion || !api?.submitProgrammingCode) return;
    setSubmitting(true);
    setSubmitMessage(null);
    try {
      const r = await api.submitProgrammingCode(examId, selectedQuestion.question_id, sourceCode, language);
      if (r.success) {
        setSubmitMessage(`Submitted! Passed ${r.passedCount}/${r.totalCount} test cases.`);
      } else {
        setSubmitMessage('Submit failed: ' + (r.error || 'Unknown error'));
      }
    } catch (err) {
      setSubmitMessage('Submit failed: ' + (err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  if (questions.length === 0) return null;

  return (
    <div className="programming-code-editor">
      <div className="prog-editor-header">
        <h3>💻 Programming Questions</h3>
      </div>

      <div className="prog-editor-layout">
        <div className="prog-questions-sidebar">
          {questions.map((q, idx) => (
            <button
              key={q.question_id}
              className={`prog-q-tab ${selectedQuestion?.question_id === q.question_id ? 'active' : ''}`}
              onClick={() => setSelectedQuestion(q)}
            >
              Q{idx + 1}: {q.title}
            </button>
          ))}
        </div>

        <div className="prog-editor-main">
          {selectedQuestion && (
            <>
              <div className="prog-question-view">
                <h4>{selectedQuestion.title}</h4>
                <pre className="prog-problem-text">{selectedQuestion.problem_text}</pre>
                {selectedQuestion.sample_input && (
                  <div className="prog-sample">
                    <strong>Sample Input:</strong>
                    <pre>{selectedQuestion.sample_input}</pre>
                  </div>
                )}
                {selectedQuestion.sample_output && (
                  <div className="prog-sample">
                    <strong>Sample Output:</strong>
                    <pre>{selectedQuestion.sample_output}</pre>
                  </div>
                )}
              </div>

              <div className="prog-editor-controls">
                <label>
                  Language:
                  <select value={language} onChange={e => setLanguage(e.target.value)}>
                    {LANGUAGES.map(l => (
                      <option key={l.value} value={l.value}>{l.label}</option>
                    ))}
                  </select>
                </label>
                <div className="prog-editor-actions">
                  <button
                    onClick={handleRun}
                    disabled={running || testCases.length === 0}
                    className="btn-run"
                  >
                    {running ? 'Running...' : '▶ Run'}
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={submitting}
                    className="btn-submit"
                  >
                    {submitting ? 'Submitting...' : 'Submit'}
                  </button>
                </div>
              </div>

              <div className="prog-code-area">
                <textarea
                  value={sourceCode}
                  onChange={e => setSourceCode(e.target.value)}
                  placeholder="Write your code here..."
                  spellCheck={false}
                />
              </div>

              {runError && <div className="prog-run-error">{runError}</div>}
              {submitMessage && (
                <div className={`prog-submit-msg ${submitMessage.includes('Passed') ? 'success' : 'error'}`}>
                  {submitMessage}
                </div>
              )}

              {runResults && runResults.length > 0 && (
                <div className="prog-results">
                  <h4>Test Results</h4>
                  <div className="prog-score-ring">
                    <span className="score-text">
                      {runResults.filter(r => r.passed).length}/{runResults.length}
                    </span>
                  </div>
                  <div className="prog-results-list">
                    {runResults.map((r, i) => (
                      <div key={i} className={`prog-result-item ${r.passed ? 'passed' : 'failed'}`}>
                        <span className="result-icon">{r.passed ? '✓' : '✗'}</span>
                        <div className="result-details">
                          {r.error && <div className="result-error">{r.error}</div>}
                          {r.actualOutput != null && (
                            <div className="result-output">
                              <strong>Output:</strong> <code>{r.actualOutput}</code>
                            </div>
                          )}
                          {r.executionTimeMs != null && (
                            <span className="result-time">{r.executionTimeMs}ms</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProgrammingCodeEditor;
