import React, { useEffect, useState } from 'react';
import './CodeQuestionsTab.css';

interface ExamSummary {
  examId: string;
  title: string;
  pdfPath?: string;
}

interface Question {
  question_id?: string;
  exam_id?: string;
  title: string;
  description?: string;
  source_page?: number | null;
  max_score?: number;
  created_at?: string;
  // UI-only
  _tempId?: string;
}

interface TestCase {
  test_case_id?: string;
  question_id?: string;
  name: string;
  input?: string;
  expected_output?: string;
  is_hidden?: boolean;
  is_edge_case?: boolean;
  is_generated?: boolean;
  time_limit_ms?: number | null;
  memory_limit_kb?: number | null;
  weight?: number;
  metadata?: any;
  // UI-only flags
  _isNew?: boolean;
  _isDeleted?: boolean;
}

interface CodeQuestionsTabProps {
  exam: ExamSummary;
}

const CodeQuestionsTab: React.FC<CodeQuestionsTabProps> = ({ exam }) => {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const isElectron = () => !!(window as any).electronAPI;

  const loadQuestions = async () => {
    if (!isElectron()) return;
    try {
      setLoading(true);
      setError(null);
      const res = await (window as any).electronAPI.getQuestionsWithTestCases(exam.examId);
      if (!res.success) {
        setError(res.error || 'Failed to load questions');
        setQuestions([]);
        return;
      }
      const loaded: Question[] = (res.questions || []).map((q: any) => ({
        ...q
      }));
      setQuestions(loaded);
      if (loaded.length && !selectedQuestionId) {
        setSelectedQuestionId(loaded[0].question_id);
      }
    } catch (err: any) {
      console.error('Error loading questions:', err);
      setError('Failed to load questions. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadQuestions();
  }, [exam.examId]);

  const handleExtractFromPdf = async () => {
    if (!isElectron()) return;
    try {
      setExtracting(true);
      setError(null);
      setInfo(null);
      const res = await (window as any).electronAPI.extractQuestions(exam.examId);
      if (!res.success) {
        setError(res.error || 'Failed to extract questions from PDF');
        return;
      }
      const extracted = (res.questions || []).map((q: any, index: number) => ({
        title: q.title || `Question ${index + 1}`,
        description: q.description || '',
        source_page: q.page ?? null,
        max_score: 10,
        _tempId: q.tempId
      })) as Question[];
      setQuestions(extracted);
      setSelectedQuestionId(undefined);
      setInfo(
        'Questions extracted from PDF. Review and edit them, then click "Save Questions" to persist.'
      );
    } catch (err: any) {
      console.error('Error extracting questions:', err);
      setError('Failed to extract questions. You can still add questions manually.');
    } finally {
      setExtracting(false);
    }
  };

  const handleQuestionChange = (index: number, patch: Partial<Question>) => {
    setQuestions(prev => {
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
      return next;
    });
  };

  const handleAddQuestion = () => {
    const newQuestion: Question = {
      title: 'New Question',
      description: '',
      source_page: null,
      max_score: 10
    };
    setQuestions(prev => [...prev, newQuestion]);
    setSelectedQuestionId(undefined);
  };

  const handleDeleteQuestion = (index: number) => {
    setQuestions(prev => prev.filter((_, i) => i !== index));
    if (questions[index]?.question_id === selectedQuestionId) {
      setSelectedQuestionId(undefined);
    }
  };

  const handleSaveQuestions = async () => {
    if (!isElectron()) return;
    try {
      setSaving(true);
      setError(null);
      setInfo(null);
      const payload = questions.map(q => ({
        question_id: q.question_id,
        title: q.title,
        description: q.description,
        page: q.source_page,
        maxScore: q.max_score
      }));
      const res = await (window as any).electronAPI.saveQuestions(exam.examId, payload);
      if (!res.success) {
        setError(res.error || 'Failed to save questions');
        return;
      }
      const saved: Question[] = (res.questions || []).map((q: any) => ({ ...q }));
      setQuestions(saved);
      if (saved.length) {
        setSelectedQuestionId(saved[0].question_id);
      }
      setInfo('Questions saved successfully.');
    } catch (err: any) {
      console.error('Error saving questions:', err);
      setError('Failed to save questions. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const currentQuestion = questions.find(q => q.question_id === selectedQuestionId) || null;
  const currentQuestionIndex = currentQuestion
    ? questions.findIndex(q => q.question_id === currentQuestion.question_id)
    : -1;

  const ensureQuestionSelected = () => {
    if (!currentQuestion && questions.length > 0) {
      setSelectedQuestionId(questions[0].question_id);
      return questions[0];
    }
    return currentQuestion;
  };

  const handleGenerateTestCases = async (provider: 'gemini' | 'hf' = 'gemini') => {
    if (!isElectron()) return;
    const q = ensureQuestionSelected();
    if (!q || !q.question_id) {
      setError('Please save questions first, then select a question to generate test cases for.');
      return;
    }
    try {
      setGenerating(true);
      setError(null);
      setInfo(null);
      const res = await (window as any).electronAPI.generateTestCases(
        exam.examId,
        q.question_id,
        provider
      );
      if (!res.success) {
        const code = res.code || 'ERROR';
        if (code === 'NO_API_KEY' || code === 'UNAUTHORIZED' || code === 'RATE_LIMIT') {
          setError(
            (res.error as string) ||
              'LLM is not available right now. You can continue by adding test cases manually.'
          );
        } else {
          setError(
            (res.error as string) ||
              'Could not generate test cases. You can continue by adding test cases manually.'
          );
        }
        return;
      }
      const generated = (res.testCases || []) as any[];
      if (!Array.isArray(generated) || generated.length === 0) {
        setInfo('No test cases were returned by the LLM. You can add them manually.');
        return;
      }
      const mapped: TestCase[] = generated.map(tc => ({
        name: tc.name || 'Test case',
        input: tc.input || '',
        expected_output: tc.expectedOutput || tc.expected_output || '',
        is_hidden: !!(tc.isHidden ?? tc.is_hidden),
        is_edge_case: !!(tc.isEdgeCase ?? tc.is_edge_case),
        is_generated: true,
        time_limit_ms: tc.timeLimitMs ?? tc.time_limit_ms ?? null,
        memory_limit_kb: tc.memoryLimitKb ?? tc.memory_limit_kb ?? null,
        weight: tc.weight != null ? tc.weight : 1
      }));

      // Attach generated cases to question (in-memory; persist via save test cases)
      const idx = questions.findIndex(qq => qq.question_id === q.question_id);
      if (idx >= 0) {
        const existingForQ = (questions as any)[idx].testCases || [];
        const merged = [...existingForQ, ...mapped.map(tc => ({ ...tc, _isNew: true }))];
        setQuestions(prev => {
          const next = [...prev] as any;
          next[idx] = { ...next[idx], testCases: merged };
          return next;
        });
      }
      setInfo('AI-generated test cases added. Review and then click "Save Test Cases".');
    } catch (err: any) {
      console.error('Error generating test cases:', err);
      setError(
        'Failed to generate test cases. You can continue by adding and editing test cases manually.'
      );
    } finally {
      setGenerating(false);
    }
  };

  const getCurrentTestCases = (): TestCase[] => {
    const q = ensureQuestionSelected();
    if (!q) return [];
    const idx = questions.findIndex(qq => qq.question_id === q.question_id);
    if (idx < 0) return [];
    const anyQ: any = questions[idx] as any;
    return (anyQ.testCases || []) as TestCase[];
  };

  const updateTestCasesForCurrent = (updater: (prev: TestCase[]) => TestCase[]) => {
    const q = ensureQuestionSelected();
    if (!q) return;
    const idx = questions.findIndex(qq => qq.question_id === q.question_id);
    if (idx < 0) return;
    setQuestions(prev => {
      const next = [...prev] as any;
      const currentTc: TestCase[] = (next[idx].testCases || []) as TestCase[];
      next[idx] = { ...next[idx], testCases: updater(currentTc) };
      return next;
    });
  };

  const handleAddTestCase = () => {
    updateTestCasesForCurrent(prev => [
      ...prev,
      {
        name: 'New test case',
        input: '',
        expected_output: '',
        is_hidden: false,
        is_edge_case: false,
        is_generated: false,
        weight: 1,
        _isNew: true
      }
    ]);
  };

  const handleUpdateTestCase = (index: number, patch: Partial<TestCase>) => {
    updateTestCasesForCurrent(prev => {
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
      return next;
    });
  };

  const handleDeleteTestCase = (index: number) => {
    updateTestCasesForCurrent(prev => {
      const next = [...prev];
      const tc = next[index];
      if (tc && tc.test_case_id) {
        next[index] = { ...tc, _isDeleted: true };
      } else {
        next.splice(index, 1);
      }
      return next;
    });
  };

  const handleSaveTestCases = async () => {
    if (!isElectron()) return;
    const q = ensureQuestionSelected();
    if (!q || !q.question_id) {
      setError('Please save questions first, then select a question to save test cases for.');
      return;
    }
    try {
      setSaving(true);
      setError(null);
      setInfo(null);
      const tcs = getCurrentTestCases();
      const payload = tcs.map(tc => ({
        test_case_id: tc.test_case_id,
        name: tc.name,
        input: tc.input,
        expected_output: tc.expected_output,
        is_hidden: tc.is_hidden,
        is_edge_case: tc.is_edge_case,
        is_generated: tc.is_generated,
        time_limit_ms: tc.time_limit_ms,
        memory_limit_kb: tc.memory_limit_kb,
        weight: tc.weight,
        metadata: tc.metadata,
        op: tc._isDeleted ? 'delete' : tc.test_case_id ? 'update' : 'create'
      }));
      const res = await (window as any).electronAPI.upsertTestCases(q.question_id, payload);
      if (!res.success) {
        setError(res.error || 'Failed to save test cases');
        return;
      }
      const saved: TestCase[] = (res.testCases || []).map((tc: any) => ({
        ...tc
      }));
      // Replace on question
      const idx = questions.findIndex(qq => qq.question_id === q.question_id);
      if (idx >= 0) {
        setQuestions(prev => {
          const next = [...prev] as any;
          next[idx] = { ...next[idx], testCases: saved };
          return next;
        });
      }
      setInfo('Test cases saved successfully.');
    } catch (err: any) {
      console.error('Error saving test cases:', err);
      setError('Failed to save test cases. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const testCases = getCurrentTestCases();

  return (
    <div className="code-questions-tab">
      <div className="cq-header">
        <div className="cq-header-text">
          <h3>Code Questions for: {exam.title}</h3>
          <p className="cq-subtitle">
            Extract questions from the exam PDF, edit them, and manage test cases (manual or AI).
          </p>
        </div>
        <div className="cq-header-actions">
          <button
            className="btn-secondary"
            onClick={handleExtractFromPdf}
            disabled={extracting || loading}
          >
            {extracting ? 'Extracting…' : 'Extract from PDF'}
          </button>
          <button className="btn-secondary" onClick={handleAddQuestion} disabled={loading}>
            Add Question
          </button>
          <button className="btn-primary" onClick={handleSaveQuestions} disabled={saving || loading}>
            {saving ? 'Saving…' : 'Save Questions'}
          </button>
        </div>
      </div>

      {(error || info) && (
        <div className="cq-messages">
          {error && <div className="cq-error">{error}</div>}
          {info && !error && <div className="cq-info">{info}</div>}
        </div>
      )}

      <div className="cq-body">
        <div className="cq-questions-list">
          <div className="cq-list-header">
            <h4>Questions</h4>
            {loading && <span className="cq-loading">Loading…</span>}
          </div>
          {questions.length === 0 && !loading ? (
            <div className="cq-empty">
              <p>No questions yet.</p>
              <p>You can extract from PDF or add questions manually.</p>
            </div>
          ) : (
            <ul className="cq-question-items">
              {questions.map((q, index) => (
                <li
                  key={q.question_id || q._tempId || index}
                  className={`cq-question-item ${
                    q.question_id === selectedQuestionId ? 'active' : ''
                  }`}
                  onClick={() => setSelectedQuestionId(q.question_id)}
                >
                  <div className="cq-question-main">
                    <input
                      type="text"
                      value={q.title}
                      onChange={e => handleQuestionChange(index, { title: e.target.value })}
                      placeholder="Question title"
                    />
                    <button
                      className="cq-delete-btn"
                      type="button"
                      onClick={e => {
                        e.stopPropagation();
                        handleDeleteQuestion(index);
                      }}
                    >
                      ✕
                    </button>
                  </div>
                  <div className="cq-question-meta">
                    {q.source_page != null && <span>Page {q.source_page}</span>}
                    {q.max_score != null && <span>Max score: {q.max_score}</span>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="cq-details">
          {currentQuestion ? (
            <>
              <div className="cq-question-detail">
                <h4>Question Details</h4>
                <textarea
                  value={currentQuestion.description || ''}
                  onChange={e =>
                    handleQuestionChange(currentQuestionIndex, { description: e.target.value })
                  }
                  placeholder="Question description / problem statement"
                />
              </div>

              <div className="cq-testcases-header">
                <div>
                  <h4>Test Cases</h4>
                  <p className="cq-subtitle">
                    Generate with AI or manage manually. Hidden cases are not shown to students.
                  </p>
                </div>
                <div className="cq-header-actions">
                  <button
                    className="btn-secondary"
                    onClick={() => handleGenerateTestCases('gemini')}
                    disabled={generating || saving}
                  >
                    {generating ? 'Generating…' : 'Generate test cases (AI)'}
                  </button>
                  <button className="btn-secondary" onClick={handleAddTestCase} disabled={saving}>
                    Add Test Case
                  </button>
                  <button
                    className="btn-primary"
                    onClick={handleSaveTestCases}
                    disabled={saving || generating}
                  >
                    {saving ? 'Saving…' : 'Save Test Cases'}
                  </button>
                </div>
              </div>

              {testCases.length === 0 ? (
                <div className="cq-empty">
                  <p>No test cases yet.</p>
                  <p>Use AI generation or add them manually.</p>
                </div>
              ) : (
                <table className="cq-testcases-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Input (stdin)</th>
                      <th>Expected Output (stdout)</th>
                      <th>Flags</th>
                      <th>Weight</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {testCases
                      .filter(tc => !tc._isDeleted)
                      .map((tc, index) => (
                        <tr key={tc.test_case_id || index}>
                          <td>
                            <input
                              type="text"
                              value={tc.name}
                              onChange={e =>
                                handleUpdateTestCase(index, { name: e.target.value })
                              }
                            />
                          </td>
                          <td>
                            <textarea
                              value={tc.input || ''}
                              onChange={e =>
                                handleUpdateTestCase(index, { input: e.target.value })
                              }
                            />
                          </td>
                          <td>
                            <textarea
                              value={tc.expected_output || ''}
                              onChange={e =>
                                handleUpdateTestCase(index, { expected_output: e.target.value })
                              }
                            />
                          </td>
                          <td className="cq-flags-cell">
                            <label>
                              <input
                                type="checkbox"
                                checked={!!tc.is_hidden}
                                onChange={e =>
                                  handleUpdateTestCase(index, { is_hidden: e.target.checked })
                                }
                              />
                              Hidden
                            </label>
                            <label>
                              <input
                                type="checkbox"
                                checked={!!tc.is_edge_case}
                                onChange={e =>
                                  handleUpdateTestCase(index, { is_edge_case: e.target.checked })
                                }
                              />
                              Edge
                            </label>
                          </td>
                          <td>
                            <input
                              type="number"
                              min={0}
                              step={0.1}
                              value={tc.weight ?? 1}
                              onChange={e =>
                                handleUpdateTestCase(index, {
                                  weight: parseFloat(e.target.value) || 0
                                })
                              }
                            />
                          </td>
                          <td>
                            <button
                              className="cq-delete-btn"
                              type="button"
                              onClick={() => handleDeleteTestCase(index)}
                            >
                              ✕
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              )}
            </>
          ) : (
            <div className="cq-empty">
              <p>Select a question on the left to view and manage its details and test cases.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CodeQuestionsTab;

