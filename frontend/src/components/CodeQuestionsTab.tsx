import React, { useEffect, useMemo, useState } from 'react';
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
  constraints_json?: any;
  created_at?: string;
  problem_type?: string;
  required_concepts?: string[];
  requirements_mode?: 'auto' | 'manual';
  concept_threshold?: number;
  is_pattern_question?: boolean;
  difficulty?: string;
  testCases?: TestCase[];
  _tempId?: string;
}

interface TestCase {
  test_case_id?: string;
  question_id?: string;
  name: string;
  description?: string;
  input?: string;
  expected_output?: string;
  is_hidden?: boolean;
  is_edge_case?: boolean;
  is_generated?: boolean;
  time_limit_ms?: number | null;
  memory_limit_kb?: number | null;
  weight?: number;
  metadata?: any;
  _isDeleted?: boolean;
}

interface CodeQuestionsTabProps {
  exam: ExamSummary;
}

const REQUIREMENT_OPTIONS = [
  { value: 'loops', label: 'Loops' },
  { value: 'do_while', label: 'Do-While' },
  { value: 'switch', label: 'Switch/Case' },
  { value: 'nested_loops', label: 'Nested Loops' },
  { value: 'conditionals', label: 'Conditionals' },
  { value: 'recursion', label: 'Recursion' },
  { value: 'arrays', label: '1D Arrays' },
  { value: 'arrays_2d', label: '2D Arrays' },
  { value: 'arrays_3d', label: '3D Arrays' },
  { value: 'pointers', label: 'Pointers' }
];

const PROBLEM_TYPES = [
  { value: 'basic_programming', label: 'Basic Programming' },
  { value: 'loops', label: 'Loops' },
  { value: 'conditionals', label: 'Conditionals' },
  { value: 'recursion', label: 'Recursion' },
  { value: 'arrays_1d', label: '1D Arrays' },
  { value: 'arrays_2d', label: '2D Arrays' },
  { value: 'arrays_3d', label: '3D Arrays' },
  { value: 'pointers', label: 'Pointers' },
  { value: 'patterns', label: 'Patterns' }
];

const DIFFICULTY_OPTIONS = ['easy', 'medium', 'hard'];

const ensureConstraints = (question: Question) => ({
  ...(question.constraints_json || {}),
  problem_type: question.problem_type || question.constraints_json?.problem_type || 'basic_programming',
  required_concepts: question.required_concepts || question.constraints_json?.required_concepts || [],
  requirements_mode: question.requirements_mode || question.constraints_json?.requirements_mode || 'auto',
  concept_threshold: question.concept_threshold ?? question.constraints_json?.concept_threshold ?? 99,
  is_pattern_question: question.is_pattern_question ?? question.constraints_json?.is_pattern_question ?? false,
  difficulty: question.difficulty || question.constraints_json?.difficulty || 'medium'
});

const normalizeTestCase = (testCase: any): TestCase => ({
  ...testCase,
  description:
    testCase?.description ||
    testCase?.metadata?.description ||
    testCase?.name ||
    'Covers a representative execution path.',
  metadata: {
    ...(testCase?.metadata || {}),
    description:
      testCase?.description ||
      testCase?.metadata?.description ||
      testCase?.name ||
      'Covers a representative execution path.'
  }
});

const normalizeQuestion = (question: any): Question => {
  const constraints = question?.constraints_json || {};
  return {
    ...question,
    constraints_json: constraints,
    problem_type: question?.problem_type || constraints.problem_type || 'basic_programming',
    required_concepts: question?.required_concepts || constraints.required_concepts || [],
    requirements_mode: question?.requirements_mode || constraints.requirements_mode || 'auto',
    concept_threshold: question?.concept_threshold ?? constraints.concept_threshold ?? 99,
    is_pattern_question: question?.is_pattern_question ?? constraints.is_pattern_question ?? false,
    difficulty: question?.difficulty || constraints.difficulty || 'medium',
    testCases: (question?.testCases || []).map(normalizeTestCase)
  };
};

const getQuestionSelectionId = (question: Question, index: number) =>
  question.question_id || question._tempId || `draft-${index}`;

const CodeQuestionsTab: React.FC<CodeQuestionsTabProps> = ({ exam }) => {
  const api = (window as any).electronAPI;
  const [questions, setQuestions] = useState<Question[]>([]);
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [analyzingRequirementId, setAnalyzingRequirementId] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const loadQuestions = async () => {
    if (!api?.getQuestionsWithTestCases) return;
    try {
      setLoading(true);
      setError(null);
      const res = await api.getQuestionsWithTestCases(exam.examId);
      if (!res.success) {
        setError(res.error || 'Failed to load questions');
        setQuestions([]);
        return;
      }
      const loaded = (res.questions || []).map(normalizeQuestion);
      setQuestions(loaded);
      if (loaded.length) {
        setSelectedQuestionId((current) => current || getQuestionSelectionId(loaded[0], 0));
      }
    } catch (err: any) {
      console.error('Error loading questions:', err);
      setError('Failed to load questions. Please try again.');
      setQuestions([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadQuestions();
  }, [exam.examId]);

  const currentQuestion = useMemo(
    () =>
      questions.find((question, index) => getQuestionSelectionId(question, index) === selectedQuestionId) || null,
    [questions, selectedQuestionId]
  );

  const currentQuestionIndex = currentQuestion
    ? questions.findIndex((question, index) => getQuestionSelectionId(question, index) === selectedQuestionId)
    : -1;

  const handleQuestionChange = (index: number, patch: Partial<Question>) => {
    setQuestions((previous) => {
      const next = [...previous];
      next[index] = normalizeQuestion({
        ...next[index],
        ...patch,
        constraints_json: patch.constraints_json ?? next[index].constraints_json
      });
      return next;
    });
  };

  const setQuestionRequirements = (index: number, patch: Partial<Question>) => {
    setQuestions((previous) => {
      const next = [...previous];
      const existing = next[index];
      const constraints = {
        ...ensureConstraints(existing),
        ...(patch.constraints_json || {}),
        ...(patch.problem_type !== undefined ? { problem_type: patch.problem_type } : {}),
        ...(patch.required_concepts !== undefined ? { required_concepts: patch.required_concepts } : {}),
        ...(patch.requirements_mode !== undefined ? { requirements_mode: patch.requirements_mode } : {}),
        ...(patch.concept_threshold !== undefined ? { concept_threshold: patch.concept_threshold } : {}),
        ...(patch.is_pattern_question !== undefined ? { is_pattern_question: patch.is_pattern_question } : {}),
        ...(patch.difficulty !== undefined ? { difficulty: patch.difficulty } : {})
      };
      next[index] = normalizeQuestion({ ...existing, ...patch, constraints_json: constraints });
      return next;
    });
  };

  const handleExtractFromPdf = async () => {
    if (!api?.extractQuestions) return;
    try {
      setExtracting(true);
      setError(null);
      setInfo(null);
      const res = await api.extractQuestions(exam.examId);
      if (!res.success) {
        setError(res.error || 'Failed to extract questions from PDF');
        return;
      }

      const extracted: Question[] = await Promise.all(
        (res.questions || []).map(async (question: any, index: number) => {
          const baseQuestion: Question = normalizeQuestion({
            title: question.title || `Question ${index + 1}`,
            description: question.description || '',
            source_page: question.page ?? null,
            max_score: 10,
            _tempId: question.tempId,
            testCases: []
          });

          if (!api?.aiAnalyzeRequirements || !baseQuestion.description) {
            return baseQuestion;
          }

          try {
            const analysis = await api.aiAnalyzeRequirements(
              [baseQuestion.title, baseQuestion.description].filter(Boolean).join('\n\n')
            );
            if (!analysis?.success) return baseQuestion;
            return normalizeQuestion({
              ...baseQuestion,
              problem_type: analysis.problemType || 'basic_programming',
              required_concepts: analysis.requiredConcepts || [],
              requirements_mode: 'auto',
              concept_threshold: 99,
              is_pattern_question: !!analysis.isPatternQuestion,
              constraints_json: {
                ...ensureConstraints(baseQuestion),
                problem_type: analysis.problemType || 'basic_programming',
                required_concepts: analysis.requiredConcepts || [],
                requirements_mode: 'auto',
                concept_threshold: 99,
                is_pattern_question: !!analysis.isPatternQuestion
              }
            });
          } catch {
            return baseQuestion;
          }
        })
      );

      setQuestions(extracted);
      setSelectedQuestionId(extracted.length ? getQuestionSelectionId(extracted[0], 0) : undefined);
      setInfo('Questions extracted and requirement suggestions generated. Review them, then save.');
    } catch (err: any) {
      console.error('Error extracting questions:', err);
      setError('Failed to extract questions. You can still add questions manually.');
    } finally {
      setExtracting(false);
    }
  };

  const handleSaveQuestions = async () => {
    if (!api?.saveQuestions) return;
    try {
      setSaving(true);
      setError(null);
      setInfo(null);
      const payload = questions.map((question) => ({
        question_id: question.question_id,
        title: question.title,
        description: question.description,
        page: question.source_page,
        maxScore: question.max_score,
        constraints_json: ensureConstraints(question),
        problem_type: question.problem_type,
        required_concepts: question.required_concepts,
        requirements_mode: question.requirements_mode,
        concept_threshold: question.concept_threshold,
        is_pattern_question: question.is_pattern_question,
        difficulty: question.difficulty
      }));
      const res = await api.saveQuestions(exam.examId, payload);
      if (!res.success) {
        setError(res.error || 'Failed to save questions');
        return;
      }
      const saved = (res.questions || []).map(normalizeQuestion);
      setQuestions(saved);
      if (saved.length) setSelectedQuestionId(getQuestionSelectionId(saved[0], 0));
      setInfo('Questions saved successfully.');
    } catch (err: any) {
      console.error('Error saving questions:', err);
      setError('Failed to save questions. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateRequirementSuggestions = async (question: Question) => {
    if (!api?.aiAnalyzeRequirements || !question.description) return;
    try {
      setAnalyzingRequirementId(question.question_id);
      setError(null);
      const res = await api.aiAnalyzeRequirements(
        [question.title, question.description].filter(Boolean).join('\n\n')
      );
      if (!res.success) {
        setError(res.error || 'Failed to analyze requirements.');
        return;
      }
      const index = questions.findIndex((item) => item === question);
      if (index >= 0) {
        setQuestionRequirements(index, {
          problem_type: res.problemType || 'basic_programming',
          required_concepts: res.requiredConcepts || [],
          requirements_mode: 'auto',
          concept_threshold: 99,
          is_pattern_question: !!res.isPatternQuestion
        });
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to analyze requirements.');
    } finally {
      setAnalyzingRequirementId(undefined);
    }
  };

  const handleAddQuestion = () => {
    const nextQuestion = normalizeQuestion({
      title: 'New Question',
      description: '',
      source_page: null,
      max_score: 10,
      constraints_json: ensureConstraints({
        title: '',
        problem_type: 'basic_programming',
        required_concepts: [],
        requirements_mode: 'auto',
        concept_threshold: 99,
        is_pattern_question: false,
        difficulty: 'medium'
      }),
      testCases: []
    });
    setQuestions((previous) => [...previous, nextQuestion]);
  };

  const handleDeleteQuestion = (index: number) => {
    setQuestions((previous) => previous.filter((_, currentIndex) => currentIndex !== index));
    if (getQuestionSelectionId(questions[index], index) === selectedQuestionId) {
      setSelectedQuestionId(undefined);
    }
  };

  const getCurrentTestCases = (): TestCase[] =>
    currentQuestion?.testCases?.filter((testCase) => !testCase._isDeleted) || [];

  const updateTestCasesForCurrent = (updater: (previous: TestCase[]) => TestCase[]) => {
    if (currentQuestionIndex < 0) return;
    setQuestions((previous) => {
      const next = [...previous];
      next[currentQuestionIndex] = {
        ...next[currentQuestionIndex],
        testCases: updater(next[currentQuestionIndex].testCases || []).map(normalizeTestCase)
      };
      return next;
    });
  };

  const handleGenerateTestCases = async () => {
    if (!api?.generateTestCases || !currentQuestion?.question_id) {
      setError('Please save questions first, then select a question to generate test cases for.');
      return;
    }
    try {
      setGenerating(true);
      setError(null);
      setInfo(null);
      const res = await api.generateTestCases(exam.examId, currentQuestion.question_id, 'auto');
      if (!res.success) {
        setError(res.error || 'Failed to generate test cases.');
        return;
      }
      const generated = (res.testCases || []).map(normalizeTestCase);
      updateTestCasesForCurrent((previous) => [...previous, ...generated]);
      setInfo('AI-generated test cases added. Review them, then save test cases.');
    } catch (err: any) {
      console.error('Error generating test cases:', err);
      setError('Failed to generate test cases. You can still add them manually.');
    } finally {
      setGenerating(false);
    }
  };

  const handleAddTestCase = () => {
    updateTestCasesForCurrent((previous) => [
      ...previous,
      normalizeTestCase({
        name: 'New test case',
        description: 'Describe what this test case is checking.',
        input: '',
        expected_output: '',
        is_hidden: false,
        is_edge_case: false,
        is_generated: false,
        weight: 1
      })
    ]);
  };

  const handleUpdateTestCase = (index: number, patch: Partial<TestCase>) => {
    updateTestCasesForCurrent((previous) => {
      const next = [...previous];
      const current = next[index];
      next[index] = normalizeTestCase({
        ...current,
        ...patch,
        metadata: {
          ...(current.metadata || {}),
          ...(patch.metadata || {}),
          ...(patch.description !== undefined ? { description: patch.description } : {})
        }
      });
      return next;
    });
  };

  const handleDeleteTestCase = (index: number) => {
    updateTestCasesForCurrent((previous) => {
      const next = [...previous];
      const current = next[index];
      if (current?.test_case_id) next[index] = { ...current, _isDeleted: true };
      else next.splice(index, 1);
      return next;
    });
  };

  const handleSaveTestCases = async () => {
    if (!api?.upsertTestCases || !currentQuestion?.question_id) {
      setError('Please save questions first, then select a question to save test cases for.');
      return;
    }
    try {
      setSaving(true);
      setError(null);
      setInfo(null);
      const payload = (currentQuestion.testCases || []).map((testCase) => ({
        test_case_id: testCase.test_case_id,
        name: testCase.name,
        description: testCase.description,
        input: testCase.input,
        expected_output: testCase.expected_output,
        is_hidden: testCase.is_hidden,
        is_edge_case: testCase.is_edge_case,
        is_generated: testCase.is_generated,
        time_limit_ms: testCase.time_limit_ms,
        memory_limit_kb: testCase.memory_limit_kb,
        weight: testCase.weight,
        metadata: {
          ...(testCase.metadata || {}),
          description: testCase.description
        },
        op: testCase._isDeleted ? 'delete' : testCase.test_case_id ? 'update' : 'create'
      }));
      const res = await api.upsertTestCases(currentQuestion.question_id, payload);
      if (!res.success) {
        setError(res.error || 'Failed to save test cases');
        return;
      }
      handleQuestionChange(currentQuestionIndex, {
        testCases: (res.testCases || []).map(normalizeTestCase)
      });
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
            Extract questions from the exam PDF, review AI-suggested requirements, and manage teacher-facing test cases.
          </p>
        </div>
        <div className="cq-header-actions">
          <button className="btn-secondary" onClick={handleExtractFromPdf} disabled={extracting || loading}>
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

      <div className="cq-body cq-body-grid">
        <div className="cq-questions-list">
          <div className="cq-list-header">
            <h4>Questions</h4>
            {loading && <span className="cq-loading">Loading…</span>}
          </div>
          {questions.length === 0 && !loading ? (
            <div className="cq-empty">
              <p>No questions yet.</p>
              <p>Extract from PDF or add questions manually.</p>
            </div>
          ) : (
            <ul className="cq-question-items">
              {questions.map((question, index) => (
                <li
                  key={question.question_id || question._tempId || index}
                  className={`cq-question-item ${question.question_id === selectedQuestionId ? 'active' : ''}`}
                  onClick={() => setSelectedQuestionId(question.question_id)}
                >
                  <div className="cq-question-main">
                    <input
                      type="text"
                      value={question.title}
                      onChange={(e) => handleQuestionChange(index, { title: e.target.value })}
                      placeholder="Question title"
                    />
                    <button
                      className="cq-delete-btn"
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteQuestion(index);
                      }}
                    >
                      ✕
                    </button>
                  </div>
                  <div className="cq-question-meta">
                    {question.source_page != null && <span>Page {question.source_page}</span>}
                    {question.max_score != null && <span>Max score: {question.max_score}</span>}
                  </div>
                  <div className="cq-badge-row">
                    <span className="cq-badge">{question.problem_type?.replace(/_/g, ' ')}</span>
                    {(question.required_concepts || []).slice(0, 2).map((concept) => (
                      <span key={concept} className="cq-badge cq-badge-muted">
                        {concept.replace(/_/g, ' ')}
                      </span>
                    ))}
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
                  onChange={(e) => handleQuestionChange(currentQuestionIndex, { description: e.target.value })}
                  placeholder="Question description / problem statement"
                />
              </div>

              <div className="cq-question-detail">
                <div className="cq-section-head">
                  <div>
                    <h4>Suggested Requirements</h4>
                    <p className="cq-subtitle">
                      Auto-detected from the problem text. Switch to manual mode if you want to override them.
                    </p>
                  </div>
                  <button
                    className="btn-secondary"
                    onClick={() => handleGenerateRequirementSuggestions(currentQuestion)}
                    disabled={analyzingRequirementId === currentQuestion.question_id}
                  >
                    {analyzingRequirementId === currentQuestion.question_id ? 'Analyzing…' : 'Analyze Again'}
                  </button>
                </div>

                <div className="cq-requirements-grid">
                  <label className="cq-constraint-item">
                    Problem type
                    <select
                      value={currentQuestion.problem_type || 'basic_programming'}
                      onChange={(e) => setQuestionRequirements(currentQuestionIndex, { problem_type: e.target.value })}
                    >
                      {PROBLEM_TYPES.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="cq-constraint-item">
                    Requirements mode
                    <select
                      value={currentQuestion.requirements_mode || 'auto'}
                      onChange={(e) =>
                        setQuestionRequirements(currentQuestionIndex, {
                          requirements_mode: e.target.value as 'auto' | 'manual'
                        })
                      }
                    >
                      <option value="auto">Auto</option>
                      <option value="manual">Manual</option>
                    </select>
                  </label>

                  <label className="cq-constraint-item">
                    Concept threshold
                    <select
                      value={currentQuestion.concept_threshold ?? 99}
                      onChange={(e) =>
                        setQuestionRequirements(currentQuestionIndex, {
                          concept_threshold: Number(e.target.value)
                        })
                      }
                    >
                      <option value={99}>99%</option>
                      <option value={90}>90%</option>
                      <option value={75}>75%</option>
                      <option value={50}>50%</option>
                    </select>
                  </label>

                  <label className="cq-constraint-item">
                    Difficulty
                    <select
                      value={currentQuestion.difficulty || 'medium'}
                      onChange={(e) => setQuestionRequirements(currentQuestionIndex, { difficulty: e.target.value })}
                    >
                      {DIFFICULTY_OPTIONS.map((difficulty) => (
                        <option key={difficulty} value={difficulty}>
                          {difficulty}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <label className="cq-pattern-toggle">
                  <input
                    type="checkbox"
                    checked={!!currentQuestion.is_pattern_question}
                    onChange={(e) =>
                      setQuestionRequirements(currentQuestionIndex, {
                        is_pattern_question: e.target.checked
                      })
                    }
                  />
                  Treat this as a pattern-printing question
                </label>

                <div className="cq-concepts-wrap">
                  {REQUIREMENT_OPTIONS.map((option) => (
                    <label key={option.value} className="cq-concept-check">
                      <input
                        type="checkbox"
                        checked={(currentQuestion.required_concepts || []).includes(option.value)}
                        disabled={currentQuestion.requirements_mode !== 'manual'}
                        onChange={() => {
                          const current = new Set(currentQuestion.required_concepts || []);
                          if (current.has(option.value)) current.delete(option.value);
                          else current.add(option.value);
                          setQuestionRequirements(currentQuestionIndex, {
                            required_concepts: Array.from(current)
                          });
                        }}
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
              </div>

              <div className="cq-question-detail">
                <h4>Teacher Constraints</h4>
                <p className="cq-subtitle">
                  These remain teacher-side evaluation signals and can coexist with the suggested requirements above.
                </p>
                {(() => {
                  const constraints = ensureConstraints(currentQuestion);
                  const requiredLoop = !!constraints.required_loop;
                  const requiredRecursion = !!constraints.required_recursion;
                  const maxLoopNesting = typeof constraints.max_loop_nesting === 'number' ? constraints.max_loop_nesting : 0;
                  const expectedComplexity =
                    typeof constraints.expected_complexity === 'string'
                      ? constraints.expected_complexity
                      : 'unspecified';
                  return (
                    <div className="cq-constraints-grid">
                      <label className="cq-constraint-item">
                        <input
                          type="checkbox"
                          checked={requiredLoop}
                          onChange={(e) =>
                            setQuestionRequirements(currentQuestionIndex, {
                              constraints_json: { ...constraints, required_loop: e.target.checked }
                            })
                          }
                        />
                        Require loop usage
                      </label>
                      <label className="cq-constraint-item">
                        <input
                          type="checkbox"
                          checked={requiredRecursion}
                          onChange={(e) =>
                            setQuestionRequirements(currentQuestionIndex, {
                              constraints_json: { ...constraints, required_recursion: e.target.checked }
                            })
                          }
                        />
                        Require recursion usage
                      </label>
                      <label className="cq-constraint-item">
                        Max loop nesting
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={maxLoopNesting}
                          onChange={(e) =>
                            setQuestionRequirements(currentQuestionIndex, {
                              constraints_json: { ...constraints, max_loop_nesting: Number(e.target.value) || 0 }
                            })
                          }
                        />
                      </label>
                      <label className="cq-constraint-item">
                        Expected complexity
                        <select
                          value={expectedComplexity}
                          onChange={(e) =>
                            setQuestionRequirements(currentQuestionIndex, {
                              constraints_json: { ...constraints, expected_complexity: e.target.value }
                            })
                          }
                        >
                          <option value="unspecified">Unspecified</option>
                          <option value="O(1)">O(1)</option>
                          <option value="O(log n)">O(log n)</option>
                          <option value="O(n)">O(n)</option>
                          <option value="O(n log n)">O(n log n)</option>
                          <option value="O(n^2)">O(n^2)</option>
                          <option value="O(n^3+)">O(n^3+)</option>
                        </select>
                      </label>
                    </div>
                  );
                })()}
              </div>
              <div className="cq-testcases-header">
                <div>
                  <h4>Test Cases</h4>
                  <p className="cq-subtitle">
                    Every saved test case carries a short description so teachers know what it is checking at review time.
                  </p>
                </div>
                <div className="cq-header-actions">
                  <button className="btn-secondary" onClick={handleGenerateTestCases} disabled={generating || saving}>
                    {generating ? 'Generating…' : 'Generate test cases (AI)'}
                  </button>
                  <button className="btn-secondary" onClick={handleAddTestCase} disabled={saving}>
                    Add Test Case
                  </button>
                  <button className="btn-primary" onClick={handleSaveTestCases} disabled={saving || generating}>
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
                      <th>Description</th>
                      <th>Input (stdin)</th>
                      <th>Expected Output (stdout)</th>
                      <th>Flags</th>
                      <th>Weight</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {testCases.map((testCase, index) => (
                      <tr key={testCase.test_case_id || index}>
                        <td>
                          <input
                            type="text"
                            value={testCase.name}
                            onChange={(e) => handleUpdateTestCase(index, { name: e.target.value })}
                          />
                        </td>
                        <td>
                          <textarea
                            value={testCase.description || ''}
                            onChange={(e) => handleUpdateTestCase(index, { description: e.target.value })}
                          />
                        </td>
                        <td>
                          <textarea
                            value={testCase.input || ''}
                            onChange={(e) => handleUpdateTestCase(index, { input: e.target.value })}
                          />
                        </td>
                        <td>
                          <textarea
                            value={testCase.expected_output || ''}
                            onChange={(e) => handleUpdateTestCase(index, { expected_output: e.target.value })}
                          />
                        </td>
                        <td className="cq-flags-cell">
                          <label>
                            <input
                              type="checkbox"
                              checked={!!testCase.is_hidden}
                              onChange={(e) => handleUpdateTestCase(index, { is_hidden: e.target.checked })}
                            />
                            Hidden
                          </label>
                          <label>
                            <input
                              type="checkbox"
                              checked={!!testCase.is_edge_case}
                              onChange={(e) => handleUpdateTestCase(index, { is_edge_case: e.target.checked })}
                            />
                            Edge
                          </label>
                        </td>
                        <td>
                          <input
                            type="number"
                            min={0}
                            step={0.1}
                            value={testCase.weight ?? 1}
                            onChange={(e) => handleUpdateTestCase(index, { weight: parseFloat(e.target.value) || 0 })}
                          />
                        </td>
                        <td>
                          <button className="cq-delete-btn" type="button" onClick={() => handleDeleteTestCase(index)}>
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
