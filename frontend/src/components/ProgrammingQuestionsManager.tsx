import React, { useState, useEffect, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import mammoth from 'mammoth';
import './ProgrammingQuestionsManager.css';

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

interface Exam {
  examId: string;
  title: string;
  pdfPath?: string;
}

interface ProgrammingQuestion {
  question_id: string;
  exam_id: string;
  title: string;
  problem_text: string;
  sample_input?: string;
  sample_output?: string;
  language: string;
  time_limit_seconds: number;
  sort_order: number;
}

interface TestCase {
  test_case_id?: string;
  question_id?: string;
  input_data: string;
  expected_output: string;
  description?: string;
  is_sample?: number;
}

interface ExtractedQuestion {
  id: number;
  text: string;
}

interface ProgrammingQuestionsManagerProps {
  exam: Exam;
  onClose: () => void;
}

/** Extract text from a File (PDF or Word) */
async function extractTextFromFile(file: File): Promise<string> {
  const ext = file.name.toLowerCase().split('.').pop() || '';
  const buffer = await file.arrayBuffer();

  if (ext === 'pdf') {
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
    let text = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const strings = content.items.map((item: any) => item.str || '').join(' ');
      text += strings + '\n';
    }
    return text.trim();
  }

  if (ext === 'docx' || ext === 'doc') {
    const result = await mammoth.extractRawText({ arrayBuffer: buffer });
    return (result.value || '').trim();
  }

  throw new Error('Unsupported format. Use PDF or Word (.docx, .doc).');
}

const ProgrammingQuestionsManager: React.FC<ProgrammingQuestionsManagerProps> = ({ exam, onClose }) => {
  const [questions, setQuestions] = useState<ProgrammingQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rawText, setRawText] = useState('');
  const [processing, setProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState('');
  const [aiConfigured, setAiConfigured] = useState(false);
  const [expandedQuestion, setExpandedQuestion] = useState<string | null>(null);
  const [testCasesByQuestion, setTestCasesByQuestion] = useState<Record<string, TestCase[]>>({});
  const [generatingForQuestion, setGeneratingForQuestion] = useState<string | null>(null);
  const [addingQuestion, setAddingQuestion] = useState(false);
  const [newQuestionText, setNewQuestionText] = useState('');
  const [newQuestionLanguage, setNewQuestionLanguage] = useState('python');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showCreateOptions, setShowCreateOptions] = useState(false);
  const [showTestCasesView, setShowTestCasesView] = useState(false);
  const [activeOption, setActiveOption] = useState<'upload' | 'paste' | 'exam' | null>(null);
  const [referenceSolutionByQuestion, setReferenceSolutionByQuestion] = useState<Record<string, string>>({});
  const [referenceLanguageByQuestion, setReferenceLanguageByQuestion] = useState<Record<string, string>>({});
  const [verifyingForQuestion, setVerifyingForQuestion] = useState<string | null>(null);
  const [testCaseViewMode, setTestCaseViewMode] = useState<'table' | 'cards'>('table');
  const [expandedTestCase, setExpandedTestCase] = useState<string | null>(null);
  const [lastAddedQuestionId, setLastAddedQuestionId] = useState<string | null>(null);
  const [questionFilter, setQuestionFilter] = useState<'latest' | 'all'>('all');
  const [threeSolutionsByQuestion, setThreeSolutionsByQuestion] = useState<Record<string, Array<{ label: string; code: string }>>>({});
  const [loadingThreeSolutionsFor, setLoadingThreeSolutionsFor] = useState<string | null>(null);
  const [selectedSolutionTab, setSelectedSolutionTab] = useState<Record<string, number>>({});

  const SUPPORTED_LANGUAGES = [
    { value: 'python', label: 'Python' },
    { value: 'cpp', label: 'C++' },
    { value: 'c', label: 'C' },
    { value: 'java', label: 'Java' },
    { value: 'javascript', label: 'JavaScript' }
  ];

  const api = (window as any).electronAPI;
  const isElectron = () => !!api;

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  useEffect(() => {
    loadQuestions();
    checkAiConfigured();
  }, [exam.examId]);

  const checkAiConfigured = async () => {
    if (!isElectron() || !api.aiIsConfigured) return;
    try {
      const r = await api.aiIsConfigured();
      setAiConfigured(r?.configured ?? false);
    } catch {
      setAiConfigured(false);
    }
  };

  const loadQuestions = async () => {
    if (!isElectron() || !api.getProgrammingQuestions) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const r = await api.getProgrammingQuestions(exam.examId);
      if (r.success && Array.isArray(r.questions)) {
        setQuestions(r.questions);
        for (const q of r.questions) {
          loadTestCases(q.question_id);
        }
      } else {
        setQuestions([]);
      }
    } catch (err) {
      setError('Failed to load questions');
      setQuestions([]);
    } finally {
      setLoading(false);
    }
  };

  const loadTestCases = async (questionId: string) => {
    if (!api.getProgrammingTestCases) return;
    try {
      const r = await api.getProgrammingTestCases(questionId);
      if (r.success && Array.isArray(r.testCases)) {
        setTestCasesByQuestion(prev => ({
          ...prev,
          [questionId]: r.testCases.map((tc: any) => ({
            test_case_id: tc.test_case_id,
            question_id: tc.question_id,
            input_data: tc.input_data || '',
            expected_output: tc.expected_output || '',
            description: tc.description,
            is_sample: tc.is_sample
          }))
        }));
      }
    } catch {
      // ignore
    }
  };

  /** Auto-generate test cases for a question and save to DB (execution-verified via reference solution) */
  const autoGenerateTestCases = async (question: ProgrammingQuestion): Promise<{ added: TestCase[]; referenceSolution: string }> => {
    if (!api?.aiGenerateTestCases || !aiConfigured) return { added: [], referenceSolution: '' };
    const lang = referenceLanguageByQuestion[question.question_id] ?? question.language ?? 'python';
    const r = await api.aiGenerateTestCases(question.problem_text, lang);
    if (!r.success) {
      setError(r.error || 'Test case generation failed');
      return { added: [], referenceSolution: r.referenceSolution || '' };
    }
    if (!Array.isArray(r.testCases) || r.testCases.length === 0) {
      setError('AI returned no test cases. Try "Generate Test Cases" again or add manually.');
      return { added: [], referenceSolution: r.referenceSolution || '' };
    }
    const added: TestCase[] = [];
    for (const tc of r.testCases) {
      const addR = await api.addProgrammingTestCase(question.question_id, {
        input: tc.input ?? '',
        expectedOutput: tc.expectedOutput ?? '',
        description: tc.description ?? ''
      });
      if (addR.success && addR.testCase) {
        const newTc: TestCase = {
          test_case_id: addR.testCase.testCaseId || addR.testCase.test_case_id,
          input_data: tc.input ?? '',
          expected_output: tc.expectedOutput ?? '',
          description: tc.description ?? ''
        };
        added.push(newTc);
      }
    }
    return { added, referenceSolution: r.referenceSolution || '' };
  };

  const extractTextFromExamPDF = async (): Promise<string> => {
    if (!exam.pdfPath || !api?.getPDFData) return '';
    const result = await api.getPDFData(exam.examId);
    if (!result.success || !result.data) return '';
    const binaryString = atob(result.data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const pdf = await pdfjsLib.getDocument({ data: bytes.buffer }).promise;
    let text = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const strings = content.items.map((item: any) => item.str || '').join(' ');
      text += strings + '\n';
    }
    return text.trim();
  };

  /** Option 1: Select document (PDF/Word) - show file first, then process on button click */
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setError(null);
    }
    e.target.value = '';
  };

  const handleProcessSelectedFile = async () => {
    if (!selectedFile) return;
    try {
      setProcessing(true);
      setProcessingStatus('Extracting text from document...');
      setError(null);
      const text = await extractTextFromFile(selectedFile);
      setRawText(text || 'Could not extract text.');
      setProcessingStatus('');
      if (text.length >= 20 && aiConfigured) {
        await handleExtractAndGenerate(text);
        setSelectedFile(null);
      }
    } catch (err) {
      setError('Failed to extract: ' + (err as Error).message);
    } finally {
      setProcessing(false);
      setProcessingStatus('');
    }
  };

  /** Option 2: Extract from exam's attached PDF */
  const handleExtractFromExamPDF = async () => {
    if (!exam.pdfPath) {
      setError('No PDF attached to this exam. Upload a document or paste text instead.');
      return;
    }
    try {
      setProcessing(true);
      setProcessingStatus('Extracting from exam PDF...');
      setError(null);
      const text = await extractTextFromExamPDF();
      setRawText(text || 'Could not extract text.');
      setProcessingStatus('');
      if (text.length >= 20 && aiConfigured) {
        await handleExtractAndGenerate(text);
      }
    } catch (err) {
      setError('Failed to extract from PDF');
    } finally {
      setProcessing(false);
      setProcessingStatus('');
    }
  };

  /** Extract questions from text and auto-generate test cases for each */
  const handleExtractAndGenerate = async (text?: string) => {
    const content = (text || rawText).trim();
    if (content.length < 20) {
      setError('Please provide exam text (upload document or paste) first.');
      return;
    }
    if (!api?.aiExtractQuestions || !aiConfigured) {
      setError('AI not configured. Add GROQ_API_KEY to .env and restart.');
      return;
    }
    try {
      setProcessing(true);
      setProcessingStatus('Extracting questions...');
      setError(null);
      const r = await api.aiExtractQuestions(content);
      if (!r.success || !Array.isArray(r.questions) || r.questions.length === 0) {
        setError(r.error || 'No questions extracted. Try clearer exam text.');
        setProcessing(false);
        setProcessingStatus('');
        return;
      }

      const extracted = r.questions as ExtractedQuestion[];
      let lastQId: string | null = null;
      for (let i = 0; i < extracted.length; i++) {
        const eq = extracted[i];
        const qText = typeof eq === 'object' && 'text' in eq ? eq.text : String(eq);
        if (!qText.trim()) continue;

        setProcessingStatus(`Adding question ${i + 1}/${extracted.length}...`);
        const createR = await api.createProgrammingQuestion(exam.examId, {
          title: `Question ${eq.id || questions.length + i + 1}`,
          problemText: qText,
          language: 'python',
          timeLimitSeconds: 2
        });
        if (!createR.success || !createR.question) continue;

        const qId = createR.question.questionId || createR.question.question_id;
        lastQId = qId;
        const newQ: ProgrammingQuestion = {
          question_id: qId,
          exam_id: exam.examId,
          title: createR.question.title || `Question ${questions.length + i + 1}`,
          problem_text: qText,
          language: 'python',
          time_limit_seconds: 2,
          sort_order: questions.length + i
        };
        setQuestions(prev => [...prev, newQ]);

        setProcessingStatus(`Generating test cases for Q${i + 1}...`);
        const { added: tcs, referenceSolution } = await autoGenerateTestCases(newQ);
        setTestCasesByQuestion(prev => ({ ...prev, [qId]: tcs }));
        if (referenceSolution) setReferenceSolutionByQuestion(prev => ({ ...prev, [qId]: referenceSolution }));
      }

      if (lastQId) {
        setLastAddedQuestionId(lastQId);
        setQuestionFilter('latest');
        setShowTestCasesView(true);
        setExpandedQuestion(lastQId);
      }
      setRawText('');
      setProcessingStatus('');
    } catch (err) {
      setError('AI extraction failed: ' + (err as Error).message);
    } finally {
      setProcessing(false);
      setProcessingStatus('');
    }
  };

  /** Option 3: Paste single question → add + auto-generate test cases */
  const handlePasteAndAdd = async () => {
    const text = newQuestionText.trim();
    if (!text || !api?.createProgrammingQuestion) return;
    try {
      setAddingQuestion(true);
      setError(null);
      const createR = await api.createProgrammingQuestion(exam.examId, {
        title: `Question ${questions.length + 1}`,
        problemText: text,
        language: newQuestionLanguage,
        timeLimitSeconds: 2
      });
      if (!createR.success || !createR.question) {
        setError('Failed to add question');
        return;
      }

      const qId = createR.question.questionId || createR.question.question_id;
      const newQ: ProgrammingQuestion = {
        question_id: qId,
        exam_id: exam.examId,
        title: createR.question.title || `Question ${questions.length + 1}`,
        problem_text: text,
        language: newQuestionLanguage,
        time_limit_seconds: 2,
        sort_order: questions.length
      };
      setQuestions(prev => [...prev, newQ]);
      setNewQuestionText('');
      setReferenceLanguageByQuestion(prev => ({ ...prev, [qId]: newQuestionLanguage }));
      setLastAddedQuestionId(qId);
      setQuestionFilter('latest');
      setShowTestCasesView(true);
      setExpandedQuestion(qId);

      if (aiConfigured) {
        const { added: tcs, referenceSolution } = await autoGenerateTestCases(newQ);
        setTestCasesByQuestion(prev => ({ ...prev, [qId]: tcs }));
        if (referenceSolution) setReferenceSolutionByQuestion(prev => ({ ...prev, [qId]: referenceSolution }));
      } else {
        setTestCasesByQuestion(prev => ({ ...prev, [qId]: [] }));
      }
    } catch (err) {
      setError('Failed: ' + (err as Error).message);
    } finally {
      setAddingQuestion(false);
    }
  };

  const handleGenerateTestCases = async (question: ProgrammingQuestion) => {
    if (!api?.aiGenerateTestCases || !aiConfigured) {
      setError('AI not configured. Add GROQ_API_KEY in .env');
      return;
    }
    try {
      setGeneratingForQuestion(question.question_id);
      setError(null);
      const { added: tcs, referenceSolution } = await autoGenerateTestCases(question);
      setTestCasesByQuestion(prev => ({
        ...prev,
        [question.question_id]: [...(prev[question.question_id] || []), ...tcs]
      }));
      if (referenceSolution) setReferenceSolutionByQuestion(prev => ({ ...prev, [question.question_id]: referenceSolution }));
      setReferenceLanguageByQuestion(prev => ({ ...prev, [question.question_id]: referenceLanguageByQuestion[question.question_id] ?? question.language ?? 'python' }));
    } catch (err) {
      setError('Test case generation failed: ' + (err as Error).message);
    } finally {
      setGeneratingForQuestion(null);
    }
  };

  const handleGenerateThreeSolutions = async (question: ProgrammingQuestion) => {
    if (!api?.aiGenerateThreeSolutions || !aiConfigured) {
      setError('AI not configured. Add GROQ_API_KEY in .env');
      return;
    }
    try {
      setLoadingThreeSolutionsFor(question.question_id);
      setError(null);
      const lang = referenceLanguageByQuestion[question.question_id] ?? question.language ?? 'python';
      const r = await api.aiGenerateThreeSolutions(question.problem_text, lang);
      if (r.success && Array.isArray(r.solutions) && r.solutions.length > 0) {
        setThreeSolutionsByQuestion(prev => ({ ...prev, [question.question_id]: r.solutions }));
        setSelectedSolutionTab(prev => ({ ...prev, [question.question_id]: 0 }));
      } else {
        setError(r.error || 'Could not generate solutions');
      }
    } catch (err) {
      setError('Failed to generate solutions: ' + (err as Error).message);
    } finally {
      setLoadingThreeSolutionsFor(null);
    }
  };

  const handleVerifyWithSolution = async (questionId: string, sourceCode: string, language: string) => {
    if (!api?.verifyTestCasesWithSolution || !sourceCode.trim()) return;
    try {
      setVerifyingForQuestion(questionId);
      setError(null);
      const r = await api.verifyTestCasesWithSolution({ questionId, sourceCode, language: language || 'python' });
      if (r.success && Array.isArray(r.testCases)) {
        setTestCasesByQuestion(prev => ({
          ...prev,
          [questionId]: r.testCases.map((tc: any) => ({
            test_case_id: tc.test_case_id,
            question_id: tc.question_id,
            input_data: tc.input_data || '',
            expected_output: tc.expected_output || '',
            description: tc.description,
            is_sample: tc.is_sample
          }))
        }));
      } else {
        setError(r.error || 'Verification failed');
      }
    } catch (err) {
      setError('Verification failed: ' + (err as Error).message);
    } finally {
      setVerifyingForQuestion(null);
    }
  };

  const handleDeleteQuestion = async (questionId: string) => {
    if (!window.confirm('Delete this question and all its test cases?')) return;
    if (!api?.deleteProgrammingQuestion) return;
    try {
      await api.deleteProgrammingQuestion(questionId);
      setQuestions(prev => prev.filter(q => q.question_id !== questionId));
      setTestCasesByQuestion(prev => {
        const next = { ...prev };
        delete next[questionId];
        return next;
      });
      if (lastAddedQuestionId === questionId) {
        setLastAddedQuestionId(null);
        setQuestionFilter('all');
      }
      if (expandedQuestion === questionId) setExpandedQuestion(null);
    } catch {
      setError('Failed to delete question');
    }
  };

  const handleDeleteTestCase = async (questionId: string, testCaseId: string) => {
    if (!api?.deleteProgrammingTestCase) return;
    try {
      await api.deleteProgrammingTestCase(testCaseId);
      setTestCasesByQuestion(prev => ({
        ...prev,
        [questionId]: (prev[questionId] || []).filter(tc => tc.test_case_id !== testCaseId)
      }));
    } catch {
      setError('Failed to delete test case');
    }
  };

  const handleAddTestCaseManually = async (questionId: string) => {
    const input = prompt('Input (stdin):');
    if (input === null) return;
    const expected = prompt('Expected output:');
    if (expected === null) return;
    if (!api?.addProgrammingTestCase) return;
    try {
      const r = await api.addProgrammingTestCase(questionId, {
        input: input || '',
        expectedOutput: expected || '',
        description: 'Manual'
      });
      if (r.success && r.testCase) {
        const newTc: TestCase = {
          test_case_id: r.testCase.testCaseId || r.testCase.test_case_id,
          input_data: input || '',
          expected_output: expected || '',
          description: 'Manual'
        };
        setTestCasesByQuestion(prev => ({
          ...prev,
          [questionId]: [...(prev[questionId] || []), newTc]
        }));
      }
    } catch {
      setError('Failed to add test case');
    }
  };

  if (!isElectron()) {
    return (
      <div className="prog-questions-modal-overlay" onClick={onClose}>
        <div className="prog-questions-modal" onClick={e => e.stopPropagation()}>
          <div className="prog-questions-header">
            <h2>Programming Questions</h2>
            <button onClick={onClose} className="close-btn">×</button>
          </div>
          <p className="prog-questions-notice">Programming questions require the Electron app. Run via npm run dev.</p>
        </div>
      </div>
    );
  }

  const totalTestCases = Object.values(testCasesByQuestion).reduce((sum, tcs) => sum + tcs.length, 0);

  return (
    <div className="prog-questions-modal-overlay" onClick={onClose}>
      <div className={`prog-questions-modal ${!showCreateOptions ? 'prog-modal-welcome' : ''}`} onClick={e => e.stopPropagation()}>
        <div className="prog-questions-header">
          <h2>Programming Questions — {exam.title}</h2>
          <button onClick={onClose} className="close-btn">×</button>
        </div>

        {!showCreateOptions ? (
          /* Step 1: Welcome screen */
          <div className="prog-welcome-screen">
            <div className="prog-welcome-card">
              <div className="prog-welcome-icon">📝</div>
              <h3>Create test cases for this exam</h3>
              <p>Add programming questions and auto-generate test cases for student submissions.</p>
              <button
                className="prog-welcome-cta"
                onClick={() => setShowCreateOptions(true)}
              >
                Click here to create test cases
              </button>
              {questions.length > 0 && (
                <button
                  className="prog-view-existing"
                  onClick={() => {
                    setShowCreateOptions(true);
                    setShowTestCasesView(true);
                  }}
                >
                  View generated test cases ({questions.length} questions, {totalTestCases} cases)
                </button>
              )}
            </div>
          </div>
        ) : (
          <>
            {!aiConfigured && (
              <div className="prog-questions-warning">
                Add <code>GROQ_API_KEY</code> to <code>.env</code> for automatic question extraction and test case generation.
              </div>
            )}


            {/* Step 2: Three option cards */}
            <div className="prog-options-grid">
              <div
                className={`prog-option-card ${activeOption === 'upload' ? 'active' : ''}`}
                onClick={() => setActiveOption(activeOption === 'upload' ? null : 'upload')}
              >
                <span className="prog-option-icon">📄</span>
                <h4>Upload PDF or Word</h4>
                <p>Select a document to extract questions and generate test cases.</p>
              </div>
              <div
                className={`prog-option-card ${activeOption === 'paste' ? 'active' : ''}`}
                onClick={() => setActiveOption(activeOption === 'paste' ? null : 'paste')}
              >
                <span className="prog-option-icon">📋</span>
                <h4>Paste problem statement</h4>
                <p>Paste exam text or a single question. Test cases will be generated.</p>
              </div>
              {exam.pdfPath && (
                <div
                  className={`prog-option-card ${activeOption === 'exam' ? 'active' : ''}`}
                  onClick={() => setActiveOption(activeOption === 'exam' ? null : 'exam')}
                >
                  <span className="prog-option-icon">📑</span>
                  <h4>Use exam PDF</h4>
                  <p>Extract from the PDF already attached to this exam.</p>
                </div>
              )}
            </div>

            {/* Expanded content for selected option */}
            {activeOption === 'upload' && (
              <div className="prog-option-expanded">
                <div className="prog-upload-row">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.docx,.doc"
                    onChange={handleFileSelect}
                    className="prog-file-input"
                    disabled={processing}
                  />
                  <button type="button" onClick={() => fileInputRef.current?.click()} className="btn btn-secondary" disabled={processing}>
                    📄 Choose File
                  </button>
                  {selectedFile && (
                    <div className="prog-selected-file">
                      <span className="file-icon">📄</span>
                      <div className="file-info">
                        <strong>{selectedFile.name}</strong>
                        <span className="file-size">({(selectedFile.size / 1024).toFixed(1)} KB)</span>
                      </div>
                      <button type="button" onClick={() => setSelectedFile(null)} className="btn-clear-file" title="Remove">×</button>
                    </div>
                  )}
                </div>
                {selectedFile && (
                  <button onClick={handleProcessSelectedFile} disabled={processing || !aiConfigured} className="btn btn-primary">
                    {processing ? processingStatus || 'Processing...' : 'Extract & Generate Test Cases'}
                  </button>
                )}
              </div>
            )}

            {activeOption === 'paste' && (
              <div className="prog-option-expanded">
                <textarea
                  placeholder="Paste exam text with multiple questions, or paste a single question..."
                  value={rawText}
                  onChange={e => setRawText(e.target.value)}
                  rows={5}
                />
                <div className="prog-paste-actions">
                  <button onClick={() => handleExtractAndGenerate()} disabled={processing || !aiConfigured || rawText.trim().length < 20} className="btn btn-primary">
                    {processing ? processingStatus || 'Processing...' : 'Extract & Generate Test Cases'}
                  </button>
                  <span className="prog-paste-divider">or</span>
                  <div className="prog-single-question">
                    <textarea placeholder="Paste a single question..." value={newQuestionText} onChange={e => setNewQuestionText(e.target.value)} rows={3} />
                    <div className="prog-single-question-row">
                      <select
                        className="prog-lang-select"
                        value={newQuestionLanguage}
                        onChange={e => setNewQuestionLanguage(e.target.value)}
                      >
                        {SUPPORTED_LANGUAGES.map(l => (
                          <option key={l.value} value={l.value}>{l.label}</option>
                        ))}
                      </select>
                      <button onClick={handlePasteAndAdd} disabled={addingQuestion || !newQuestionText.trim()} className="btn btn-secondary">
                        {addingQuestion ? 'Adding...' : aiConfigured ? 'Add Question & Generate' : 'Add Question'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeOption === 'exam' && exam.pdfPath && (
              <div className="prog-option-expanded">
                <button onClick={handleExtractFromExamPDF} disabled={processing} className="btn btn-primary">
                  {processing ? processingStatus || 'Extracting...' : 'Extract from exam PDF & Generate Test Cases'}
                </button>
              </div>
            )}

            {error && <div className="prog-questions-error">{error}</div>}

            {/* View generated test cases - collapsible */}
            <div className="prog-view-test-cases">
              <button
                className={`prog-view-tc-trigger ${showTestCasesView ? 'expanded' : ''}`}
                onClick={() => setShowTestCasesView(!showTestCasesView)}
              >
                <span>View generated test cases</span>
                {questions.length > 0 && (
                  <span className="prog-tc-badge">{questions.length} questions · {totalTestCases} cases</span>
                )}
                <span className="prog-trigger-arrow">{showTestCasesView ? '▼' : '▶'}</span>
              </button>
              {showTestCasesView && (
                <div className="prog-questions-list-inner">
                  {questions.length > 0 && (
                    <div className="prog-question-filter-bar">
                      <span className="prog-filter-label">Show:</span>
                      <button
                        type="button"
                        className={`prog-filter-btn ${questionFilter === 'latest' ? 'active' : ''}`}
                        onClick={() => {
                          setQuestionFilter('latest');
                          if (lastAddedQuestionId) setExpandedQuestion(lastAddedQuestionId);
                        }}
                        disabled={!lastAddedQuestionId || !questions.some(q => q.question_id === lastAddedQuestionId)}
                        title="Show only the most recently added question"
                      >
                        Latest only
                      </button>
                      <button
                        type="button"
                        className={`prog-filter-btn ${questionFilter === 'all' ? 'active' : ''}`}
                        onClick={() => setQuestionFilter('all')}
                        title="Show all questions"
                      >
                        All questions
                      </button>
                    </div>
                  )}
                  {loading ? (
                    <p>Loading...</p>
                  ) : questions.length === 0 ? (
                    <p className="prog-questions-empty">No questions yet. Use one of the options above to create them.</p>
                  ) : (
                    <div className="prog-questions-items">
                      {questions
                        .filter(q => questionFilter === 'all' || q.question_id === lastAddedQuestionId)
                        .map((q, idx) => (
                <div key={q.question_id} className="prog-question-card">
                  <div
                    className="prog-question-header"
                    onClick={() => setExpandedQuestion(expandedQuestion === q.question_id ? null : q.question_id)}
                  >
                    <span className="prog-question-num">Q{idx + 1}</span>
                    <span className="prog-question-title">{q.title}</span>
                    <span className="prog-question-meta">
                      {(testCasesByQuestion[q.question_id] || []).length} test cases
                    </span>
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        handleDeleteQuestion(q.question_id);
                      }}
                      className="btn-delete-small"
                      title="Delete question"
                    >
                      ×
                    </button>
                  </div>
                  {expandedQuestion === q.question_id && (
                    <div className="prog-question-body">
                      <pre className="prog-question-text">{q.problem_text}</pre>
                      <div className="prog-question-actions">
                        <button
                          onClick={() => handleGenerateTestCases(q)}
                          disabled={!aiConfigured || generatingForQuestion === q.question_id}
                          className="btn btn-primary btn-sm"
                        >
                          {generatingForQuestion === q.question_id ? 'Generating...' : 'Generate Test Cases'}
                        </button>
                        <button
                          onClick={() => handleAddTestCaseManually(q.question_id)}
                          className="btn btn-secondary btn-sm"
                        >
                          Add Test Case
                        </button>
                        {referenceSolutionByQuestion[q.question_id] &&
                          (testCasesByQuestion[q.question_id] || []).some(tc => !(tc.expected_output || '').trim()) &&
                          (testCasesByQuestion[q.question_id] || []).length > 0 && (
                          <button
                            onClick={() => handleVerifyWithSolution(
                              q.question_id,
                              referenceSolutionByQuestion[q.question_id],
                              referenceLanguageByQuestion[q.question_id] ?? q.language ?? 'python'
                            )}
                            disabled={verifyingForQuestion === q.question_id}
                            className="btn btn-secondary btn-sm"
                            title="Run reference solution to fill empty expected outputs"
                          >
                            {verifyingForQuestion === q.question_id ? 'Filling...' : 'Fill expected outputs'}
                          </button>
                        )}
                      </div>
                      <div className="prog-three-solutions">
                        <div className="prog-three-solutions-header">
                          <label>3 best solutions</label>
                          <select
                            className="prog-lang-select"
                            value={referenceLanguageByQuestion[q.question_id] ?? q.language ?? 'python'}
                            onChange={e => setReferenceLanguageByQuestion(prev => ({ ...prev, [q.question_id]: e.target.value }))}
                          >
                            {SUPPORTED_LANGUAGES.map(l => (
                              <option key={l.value} value={l.value}>{l.label}</option>
                            ))}
                          </select>
                          <button
                            onClick={() => handleGenerateThreeSolutions(q)}
                            disabled={!aiConfigured || loadingThreeSolutionsFor === q.question_id}
                            className="btn btn-primary btn-sm"
                          >
                            {loadingThreeSolutionsFor === q.question_id ? 'Generating...' : 'Generate 3 solutions'}
                          </button>
                        </div>
                        {(threeSolutionsByQuestion[q.question_id] || []).length > 0 && (
                          <div className="prog-solutions-tabs">
                            {(threeSolutionsByQuestion[q.question_id] || []).map((sol, i) => (
                              <button
                                key={i}
                                type="button"
                                className={`prog-solution-tab ${(selectedSolutionTab[q.question_id] ?? 0) === i ? 'active' : ''}`}
                                onClick={() => setSelectedSolutionTab(prev => ({ ...prev, [q.question_id]: i }))}
                              >
                                {sol.label || `Solution ${i + 1}`}
                              </button>
                            ))}
                          </div>
                        )}
                        {(threeSolutionsByQuestion[q.question_id] || []).length > 0 && (
                          <pre className="prog-solution-code">
                            {(threeSolutionsByQuestion[q.question_id] || [])[selectedSolutionTab[q.question_id] ?? 0]?.code || ''}
                          </pre>
                        )}
                        {(threeSolutionsByQuestion[q.question_id] || []).length === 0 && !loadingThreeSolutionsFor && (
                          <p className="prog-solutions-hint">Click &quot;Generate 3 solutions&quot; to get 3 different approaches (efficient, readable, alternative).</p>
                        )}
                      </div>
                      <div className="prog-test-cases-section">
                        <div className="prog-test-cases-header">
                          <span className="prog-tc-count">{(testCasesByQuestion[q.question_id] || []).length} test cases</span>
                          <div className="prog-view-toggle">
                            <button
                              type="button"
                              className={`prog-view-btn ${testCaseViewMode === 'table' ? 'active' : ''}`}
                              onClick={() => setTestCaseViewMode('table')}
                              title="Table view"
                            >
                              Table
                            </button>
                            <button
                              type="button"
                              className={`prog-view-btn ${testCaseViewMode === 'cards' ? 'active' : ''}`}
                              onClick={() => setTestCaseViewMode('cards')}
                              title="Card view"
                            >
                              Cards
                            </button>
                          </div>
                        </div>
                        {testCaseViewMode === 'table' ? (
                          <div className="prog-test-cases-table-wrap">
                            <table className="prog-test-cases-table">
                              <thead>
                                <tr>
                                  <th>#</th>
                                  <th>Input</th>
                                  <th>Expected</th>
                                  <th>Description</th>
                                  <th></th>
                                </tr>
                              </thead>
                              <tbody>
                                {(testCasesByQuestion[q.question_id] || []).map((tc, i) => (
                                  <tr key={tc.test_case_id || i}>
                                    <td className="tc-num">{i + 1}</td>
                                    <td><code className="tc-cell">{(tc.input_data || '(empty)').slice(0, 60)}{(tc.input_data || '').length > 60 ? '…' : ''}</code></td>
                                    <td><code className="tc-cell">{(tc.expected_output || '(empty)').slice(0, 40)}{(tc.expected_output || '').length > 40 ? '…' : ''}</code></td>
                                    <td className="tc-desc">{tc.description || '—'}</td>
                                    <td>
                                      {tc.test_case_id && (
                                        <button
                                          onClick={() => handleDeleteTestCase(q.question_id, tc.test_case_id!)}
                                          className="btn-delete-tc"
                                          title="Remove"
                                        >
                                          ×
                                        </button>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <div className="prog-test-cases prog-test-cases-cards">
                            {(testCasesByQuestion[q.question_id] || []).map((tc, i) => {
                              const tcId = `${q.question_id}-${tc.test_case_id || i}`;
                              const isExpanded = expandedTestCase === tcId;
                              return (
                                <div key={tc.test_case_id || i} className={`prog-test-case prog-test-case-card ${isExpanded ? 'expanded' : ''}`}>
                                  <div
                                    className="prog-test-case-header"
                                    onClick={() => setExpandedTestCase(isExpanded ? null : tcId)}
                                  >
                                    <span className="tc-num">Test {i + 1}</span>
                                    <span className="tc-preview">{tc.description || (tc.input_data || '(empty)').slice(0, 30)}</span>
                                    <span className="tc-chevron">{isExpanded ? '▼' : '▶'}</span>
                                  </div>
                                  {isExpanded && (
                                    <div className="prog-test-case-body">
                                      <div className="tc-row">
                                        <strong>Input:</strong>
                                        <code>{tc.input_data || '(empty)'}</code>
                                      </div>
                                      <div className="tc-row">
                                        <strong>Expected:</strong>
                                        <code>{tc.expected_output || '(empty)'}</code>
                                      </div>
                                      {tc.description && (
                                        <div className="tc-row">
                                          <strong>Desc:</strong>
                                          <span>{tc.description}</span>
                                        </div>
                                      )}
                                      {tc.test_case_id && (
                                        <button
                                          onClick={() => handleDeleteTestCase(q.question_id, tc.test_case_id!)}
                                          className="btn-delete-tc"
                                        >
                                          Remove
                                        </button>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ProgrammingQuestionsManager;
