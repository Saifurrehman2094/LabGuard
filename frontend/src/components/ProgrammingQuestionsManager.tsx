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
  required_concepts?: string;
  concept_threshold?: number;
  is_pattern_question?: number;
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

/** Truncate a raw value to maxLen chars for compact display */
function tcTruncate(raw: string | undefined, maxLen: number): string {
  // Use trimEnd() not trim() — leading spaces must be preserved for indented
  // patterns like diamonds where the first row starts with spaces.
  const s = (raw ?? '').trimEnd() || '(empty)';
  return s.length > maxLen ? s.slice(0, maxLen) + '…' : s;
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
  const [problemTypeByQuestion, setProblemTypeByQuestion] = useState<Record<string, string>>({});
  const [requiredConceptsByQuestion, setRequiredConceptsByQuestion] = useState<Record<string, string[]>>({});
  const [conceptThresholdByQuestion, setConceptThresholdByQuestion] = useState<Record<string, number>>({});
  const [isPatternQuestionByQuestion, setIsPatternQuestionByQuestion] = useState<Record<string, boolean>>({});
  const [requirementsModeByQuestion, setRequirementsModeByQuestion] = useState<Record<string, 'auto' | 'manual'>>({});
  const [analyzingRequirementsFor, setAnalyzingRequirementsFor] = useState<string | null>(null);
  const [treatAsSingleQuestion, setTreatAsSingleQuestion] = useState(false);
  const [replaceExistingOnExtract, setReplaceExistingOnExtract] = useState(true);

  const SUPPORTED_LANGUAGES = [
    { value: 'python', label: 'Python' },
    { value: 'cpp', label: 'C++' },
    { value: 'c', label: 'C' },
    { value: 'java', label: 'Java' },
    { value: 'javascript', label: 'JavaScript' }
  ];

  const PROBLEM_TYPES = [
    { value: 'basic_programming', label: 'Basic Programming' },
    { value: 'loops',             label: 'Loops (for / while / do-while)' },
    { value: 'conditionals',      label: 'Conditionals (if/else / switch)' },
    { value: 'recursion',         label: 'Recursion' },
    { value: 'arrays_1d',         label: '1D Arrays' },
    { value: 'arrays_2d',         label: '2D Arrays / Matrix' },
    { value: 'arrays_3d',         label: '3D Arrays' },
    { value: 'pointers',          label: 'Pointers (C/C++)' },
    { value: 'patterns',          label: 'Pattern Printing' },
    { value: 'algorithm',         label: 'Algorithm (sorting/searching)' },
    { value: 'data_structure',    label: 'Data Structure (BST/Graph/etc.)' },
  ];

  const FUNDAMENTAL_CONCEPTS = [
    { value: 'loops',        label: 'Loops (for/while)' },
    { value: 'do_while',     label: 'Do-While Loop' },
    { value: 'switch',       label: 'Switch/Case' },
    { value: 'nested_loops', label: 'Nested Loops' },
    { value: 'conditionals', label: 'Conditionals (if/else)' },
    { value: 'recursion',    label: 'Recursion' },
    { value: 'arrays',       label: '1D Arrays' },
    { value: 'arrays_2d',    label: '2D Arrays / Matrix' },
    { value: 'arrays_3d',    label: '3D Arrays' },
    { value: 'pointers',     label: 'Pointers (C/C++)' },
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
        const conceptsMap: Record<string, string[]> = {};
        const thresholdMap: Record<string, number> = {};
        const patternMap: Record<string, boolean> = {};
        const refSolMap: Record<string, string> = {};
        for (const q of r.questions) {
          loadTestCases(q.question_id);
          try {
            conceptsMap[q.question_id] = q.required_concepts
              ? (typeof q.required_concepts === 'string' ? JSON.parse(q.required_concepts) : q.required_concepts)
              : [];
          } catch { conceptsMap[q.question_id] = []; }
          thresholdMap[q.question_id] = q.concept_threshold ?? 99;
          patternMap[q.question_id] = !!(q.is_pattern_question);
          if (q.reference_solution?.trim()) refSolMap[q.question_id] = q.reference_solution;
        }
        setRequiredConceptsByQuestion(conceptsMap);
        setConceptThresholdByQuestion(thresholdMap);
        setIsPatternQuestionByQuestion(patternMap);
        setReferenceSolutionByQuestion(prev => ({ ...prev, ...refSolMap }));
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

  /** Auto-analyze problem requirements (concepts, pattern, problem type) and save to question */
  const runAutoAnalyzeAndSave = async (questionId: string, problemText: string): Promise<{ ok: boolean; problemType?: string; requiredConcepts?: string[] }> => {
    if (!api?.aiAnalyzeRequirements || !aiConfigured) return { ok: false };
    try {
      setAnalyzingRequirementsFor(questionId);
      const r = await api.aiAnalyzeRequirements(problemText);
      if (!r.success) return { ok: false };
      const concepts = r.requiredConcepts || [];
      const isPattern = !!r.isPatternQuestion;
      const pType = r.problemType || 'basic_programming';
      setRequiredConceptsByQuestion(prev => ({ ...prev, [questionId]: concepts }));
      setIsPatternQuestionByQuestion(prev => ({ ...prev, [questionId]: isPattern }));
      setProblemTypeByQuestion(prev => ({ ...prev, [questionId]: pType }));
      await api.updateProgrammingQuestion(questionId, {
        requiredConcepts: concepts,
        conceptThreshold: 99,
        isPatternQuestion: isPattern
      });
      return { ok: true, problemType: pType, requiredConcepts: concepts };
    } catch {
      return { ok: false };
    } finally {
      setAnalyzingRequirementsFor(null);
    }
  };

  /** Auto-generate 3 best solutions for a question silently (no error shown to user on failure) */
  const autoGenerateThreeSolutions = async (question: ProgrammingQuestion) => {
    if (!api?.aiGenerateThreeSolutions || !aiConfigured) return;
    try {
      const lang = referenceLanguageByQuestion[question.question_id] ?? question.language ?? 'python';
      const r = await api.aiGenerateThreeSolutions(question.problem_text, lang);
      if (r.success && Array.isArray(r.solutions) && r.solutions.length > 0) {
        setThreeSolutionsByQuestion(prev => ({ ...prev, [question.question_id]: r.solutions }));
        setSelectedSolutionTab(prev => ({ ...prev, [question.question_id]: 0 }));
      }
    } catch (_) {
      // Silent fail — teacher can manually regenerate via the "Generate solutions" button
    }
  };

  /** Auto-generate test cases for a question and save to DB (execution-verified via reference solution) */
  const autoGenerateTestCases = async (question: ProgrammingQuestion): Promise<{ added: TestCase[]; referenceSolution: string }> => {
    if (!api?.aiGenerateTestCases || !aiConfigured) return { added: [], referenceSolution: '' };
    const qId = question.question_id;
    const lang = referenceLanguageByQuestion[qId] ?? question.language ?? 'python';
    let problemType = problemTypeByQuestion[qId] ?? 'basic_programming';
    let concepts = requiredConceptsByQuestion[qId] || [];
    const mode = requirementsModeByQuestion[qId] ?? 'auto';
    // Auto-analyze first when in auto mode (ensures requirements + problemType for test case generation)
    if (mode === 'auto' && api.aiAnalyzeRequirements) {
      const { ok, problemType: pType, requiredConcepts: analyzedConcepts } = await runAutoAnalyzeAndSave(qId, question.problem_text);
      if (ok && pType) problemType = pType;
      if (ok && analyzedConcepts) concepts = analyzedConcepts;
    }
    const r = await api.aiGenerateTestCases(question.problem_text, lang, problemType, concepts);
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
    if (!api?.createProgrammingQuestion) return;
    if (!treatAsSingleQuestion && (!api?.aiExtractQuestionAtIndex && !api?.aiExtractQuestions) || !aiConfigured) {
      setError('AI not configured. Add GROQ_API_KEY or GEMINI_API_KEY to .env and restart.');
      return;
    }
    try {
      setProcessing(true);
      setError(null);

      if (replaceExistingOnExtract && questions.length > 0 && api?.deleteProgrammingQuestion) {
        setProcessingStatus('Replacing existing questions...');
        for (const q of questions) {
          if (q.question_id) await api.deleteProgrammingQuestion(q.question_id);
        }
        setQuestions([]);
        setTestCasesByQuestion({});
        setReferenceSolutionByQuestion({});
        setThreeSolutionsByQuestion(prev => { const next = { ...prev }; questions.forEach(q => { if (q.question_id) delete next[q.question_id]; }); return next; });
        setLastAddedQuestionId(null);
      }

      if (treatAsSingleQuestion) {
        setProcessingStatus('Adding as single question...');
        const createR = await api.createProgrammingQuestion(exam.examId, {
          title: `Question ${questions.length + 1}`,
          problemText: content,
          language: 'python',
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
          problem_text: content,
          language: 'python',
          time_limit_seconds: 2,
          sort_order: questions.length
        };
        setQuestions(prev => [...prev, newQ]);
        setProcessingStatus('Generating test cases...');
        const { added: tcs, referenceSolution } = aiConfigured ? await autoGenerateTestCases(newQ) : { added: [], referenceSolution: '' };
        setTestCasesByQuestion(prev => ({ ...prev, [qId]: tcs }));
        if (referenceSolution) {
          setReferenceSolutionByQuestion(prev => ({ ...prev, [qId]: referenceSolution }));
          api?.updateProgrammingQuestion?.(qId, { referenceSolution });
        }
        setProcessingStatus('Generating 3 best solutions...');
        await autoGenerateThreeSolutions(newQ);
        setLastAddedQuestionId(qId);
        setQuestionFilter('latest');
        setShowTestCasesView(true);
        setExpandedQuestion(qId);
        setRawText('');
        setProcessingStatus('');
        return;
      }

      const baseOrder = replaceExistingOnExtract ? 0 : questions.length;

      if (api?.aiExtractQuestionAtIndex) {
        let i = 0;
        while (i < 15) {
          setProcessingStatus(i === 0 ? 'Extracting question 1...' : `Extracting question ${i + 1}...`);
          const r = await api.aiExtractQuestionAtIndex(content, i);
          const eq = r.question;
          if (!r.success || !eq?.text?.trim()) break;

          const qText = eq.text.trim();
          setProcessingStatus(`Adding question ${i + 1}...`);
          const createR = await api.createProgrammingQuestion(exam.examId, {
            title: `Question ${eq.id || baseOrder + i + 1}`,
            problemText: qText,
            language: 'python',
            timeLimitSeconds: 2
          });
          if (!createR.success || !createR.question) break;

          const qId = createR.question.questionId || createR.question.question_id;
          const newQ: ProgrammingQuestion = {
            question_id: qId,
            exam_id: exam.examId,
            title: createR.question.title || `Question ${baseOrder + i + 1}`,
            problem_text: qText,
            language: 'python',
            time_limit_seconds: 2,
            sort_order: baseOrder + i
          };
          setQuestions(prev => [...prev, newQ]);
          setShowTestCasesView(true);
          setLastAddedQuestionId(qId);
          setQuestionFilter('latest');
          setExpandedQuestion(qId);

          setProcessingStatus(`Generating test cases for Q${i + 1}...`);
          const { added: tcs, referenceSolution } = await autoGenerateTestCases(newQ);
          setTestCasesByQuestion(prev => ({ ...prev, [qId]: tcs }));
          if (referenceSolution) {
            setReferenceSolutionByQuestion(prev => ({ ...prev, [qId]: referenceSolution }));
            api?.updateProgrammingQuestion?.(qId, { referenceSolution });
          }
          setProcessingStatus(`Generating 3 solutions for Q${i + 1}...`);
          await autoGenerateThreeSolutions(newQ);

          i++;
        }
        if (i === 0) setError('No questions extracted. Try clearer exam text or check scenario-based if it\'s one question.');
      } else {
        setProcessingStatus('Extracting questions...');
        const r = await api!.aiExtractQuestions!(content);
        if (!r.success || !Array.isArray(r.questions) || r.questions.length === 0) {
          setError(r.error || 'No questions extracted. Try clearer exam text.');
          setProcessing(false);
          setProcessingStatus('');
          return;
        }
        const extracted = r.questions as ExtractedQuestion[];
        for (let i = 0; i < Math.min(extracted.length, 15); i++) {
          const eq = extracted[i];
          const qText = typeof eq === 'object' && 'text' in eq ? eq.text : String(eq);
          if (!qText.trim()) continue;

          setProcessingStatus(`Adding question ${i + 1}/${extracted.length}...`);
          const createR = await api!.createProgrammingQuestion!(exam.examId, {
            title: `Question ${eq.id || baseOrder + i + 1}`,
            problemText: qText,
            language: 'python',
            timeLimitSeconds: 2
          });
          if (!createR.success || !createR.question) continue;

          const qId = createR.question.questionId || createR.question.question_id;
          const newQ: ProgrammingQuestion = {
            question_id: qId,
            exam_id: exam.examId,
            title: createR.question.title || `Question ${baseOrder + i + 1}`,
            problem_text: qText,
            language: 'python',
            time_limit_seconds: 2,
            sort_order: baseOrder + i
          };
          setQuestions(prev => [...prev, newQ]);
          setShowTestCasesView(true);
          setLastAddedQuestionId(qId);
          setQuestionFilter('latest');
          setExpandedQuestion(qId);

          setProcessingStatus(`Generating test cases for Q${i + 1}/${extracted.length}...`);
          const { added: tcs, referenceSolution } = await autoGenerateTestCases(newQ);
          setTestCasesByQuestion(prev => ({ ...prev, [qId]: tcs }));
          if (referenceSolution) {
            setReferenceSolutionByQuestion(prev => ({ ...prev, [qId]: referenceSolution }));
            api?.updateProgrammingQuestion?.(qId, { referenceSolution });
          }
          setProcessingStatus(`Generating 3 solutions for Q${i + 1}/${extracted.length}...`);
          await autoGenerateThreeSolutions(newQ);
        }
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
        if (referenceSolution) {
          setReferenceSolutionByQuestion(prev => ({ ...prev, [qId]: referenceSolution }));
          api?.updateProgrammingQuestion?.(qId, { referenceSolution });
        }
        await autoGenerateThreeSolutions(newQ);
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
      setError('AI not configured. Add GROQ_API_KEY or GEMINI_API_KEY in .env');
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
      if (referenceSolution) {
        setReferenceSolutionByQuestion(prev => ({ ...prev, [question.question_id]: referenceSolution }));
        api?.updateProgrammingQuestion?.(question.question_id, { referenceSolution });
      }
      setReferenceLanguageByQuestion(prev => ({ ...prev, [question.question_id]: referenceLanguageByQuestion[question.question_id] ?? question.language ?? 'python' }));
    } catch (err) {
      setError('Test case generation failed: ' + (err as Error).message);
    } finally {
      setGeneratingForQuestion(null);
    }
  };

  const handleGenerateThreeSolutions = async (question: ProgrammingQuestion) => {
    if (!api?.aiGenerateThreeSolutions || !aiConfigured) {
      setError('AI not configured. Add GROQ_API_KEY or GEMINI_API_KEY in .env');
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

  const handleUpdateConceptSettings = async (questionId: string, concepts: string[], threshold: number, isPattern: boolean) => {
    if (!api?.updateProgrammingQuestion) return;
    try {
      await api.updateProgrammingQuestion(questionId, {
        requiredConcepts: concepts,
        conceptThreshold: threshold,
        isPatternQuestion: isPattern
      });
    } catch (err) {
      setError('Failed to save concept settings');
    }
  };

  const toggleConcept = (questionId: string, concept: string) => {
    const current = requiredConceptsByQuestion[questionId] || [];
    const next = current.includes(concept) ? current.filter(c => c !== concept) : [...current, concept];
    setRequiredConceptsByQuestion(prev => ({ ...prev, [questionId]: next }));
    handleUpdateConceptSettings(questionId, next, conceptThresholdByQuestion[questionId] ?? 99, isPatternQuestionByQuestion[questionId] ?? false);
  };

  const handlePatternQuestionChange = (questionId: string, checked: boolean) => {
    setIsPatternQuestionByQuestion(prev => ({ ...prev, [questionId]: checked }));
    handleUpdateConceptSettings(questionId, requiredConceptsByQuestion[questionId] || [], conceptThresholdByQuestion[questionId] ?? 99, checked);
  };

  const handleConceptThresholdChange = (questionId: string, value: number) => {
    setConceptThresholdByQuestion(prev => ({ ...prev, [questionId]: value }));
    handleUpdateConceptSettings(questionId, requiredConceptsByQuestion[questionId] || [], value, isPatternQuestionByQuestion[questionId] ?? false);
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
        setReferenceSolutionByQuestion(prev => ({ ...prev, [questionId]: sourceCode }));
        if (api.updateProgrammingQuestion) {
          await api.updateProgrammingQuestion(questionId, { referenceSolution: sourceCode });
        }
      } else {
        setError(r.error || 'Verification failed');
      }
    } catch (err) {
      setError('Verification failed: ' + (err as Error).message);
    } finally {
      setVerifyingForQuestion(null);
    }
  };

  const handleClearAllQuestions = async () => {
    if (!window.confirm(`Clear all ${questions.length} questions for this exam? This cannot be undone.`)) return;
    if (!api?.deleteProgrammingQuestion) return;
    try {
      for (const q of questions) {
        if (q.question_id) await api.deleteProgrammingQuestion(q.question_id);
      }
      setQuestions([]);
      setTestCasesByQuestion({});
      setReferenceSolutionByQuestion({});
      setThreeSolutionsByQuestion(prev => { const next = { ...prev }; questions.forEach(q => { if (q.question_id) delete next[q.question_id]; }); return next; });
      setLastAddedQuestionId(null);
      setQuestionFilter('all');
      setExpandedQuestion(null);
    } catch {
      setError('Failed to clear questions');
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

  const handleAddTestCaseManually = async (questionId: string, inputOnly = false) => {
    const input = prompt('Input (stdin):');
    if (input === null) return;
    const expected = inputOnly ? '' : (prompt('Expected output:') ?? '');
    if (!inputOnly && expected === null) return;
    if (!api?.addProgrammingTestCase) return;
    try {
      const r = await api.addProgrammingTestCase(questionId, {
        input: input || '',
        expectedOutput: expected,
        description: inputOnly ? 'Manual (fill expected later)' : 'Manual'
      });
      if (r.success && r.testCase) {
        const newTc: TestCase = {
          test_case_id: r.testCase.testCaseId || r.testCase.test_case_id,
          input_data: input || '',
          expected_output: expected,
          description: inputOnly ? 'Manual (fill expected later)' : 'Manual'
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
                Add <code>GROQ_API_KEY</code> or <code>GEMINI_API_KEY</code> to <code>.env</code> for automatic question extraction and test case generation.
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
                  <>
                    <label className="prog-checkbox-row">
                      <input type="checkbox" checked={treatAsSingleQuestion} onChange={e => setTreatAsSingleQuestion(e.target.checked)} />
                      <span>Check this box if the problem is a scenario-based question</span>
                    </label>
                    <button onClick={handleProcessSelectedFile} disabled={processing || (!treatAsSingleQuestion && !aiConfigured)} className="btn btn-primary">
                      {processing ? processingStatus || 'Processing...' : 'Generate'}
                    </button>
                  </>
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
                  <label className="prog-checkbox-row">
                    <input type="checkbox" checked={treatAsSingleQuestion} onChange={e => setTreatAsSingleQuestion(e.target.checked)} />
                    <span>Check this box if the problem is a scenario-based question</span>
                  </label>
                  <button onClick={() => handleExtractAndGenerate()} disabled={processing || (!treatAsSingleQuestion && !aiConfigured) || rawText.trim().length < 20} className="btn btn-primary">
                    {processing ? processingStatus || 'Processing...' : 'Generate'}
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
                <label className="prog-checkbox-row">
                  <input type="checkbox" checked={treatAsSingleQuestion} onChange={e => setTreatAsSingleQuestion(e.target.checked)} />
                  <span>Check this box if the problem is a scenario-based question</span>
                </label>
                <button onClick={handleExtractFromExamPDF} disabled={processing || (!treatAsSingleQuestion && !aiConfigured)} className="btn btn-primary">
                  {processing ? processingStatus || 'Extracting...' : 'Generate'}
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
                        title="Show recently generated test cases"
                      >
                        Recent
                      </button>
                      <button
                        type="button"
                        className={`prog-filter-btn ${questionFilter === 'all' ? 'active' : ''}`}
                        onClick={() => setQuestionFilter('all')}
                        title="Show all questions"
                      >
                        All questions
                      </button>
                      <button
                        type="button"
                        className="prog-filter-btn prog-clear-all"
                        onClick={handleClearAllQuestions}
                        title="Remove all questions for this exam (start fresh)"
                      >
                        Clear all
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
                        <select
                          className="prog-type-select"
                          value={problemTypeByQuestion[q.question_id] ?? 'basic_programming'}
                          onChange={e => setProblemTypeByQuestion(prev => ({ ...prev, [q.question_id]: e.target.value }))}
                          title="Basic Programming (default). Use Algorithm/Data Structure/OOP for advanced problems."
                        >
                          {PROBLEM_TYPES.map(t => (
                            <option key={t.value} value={t.value}>{t.label}</option>
                          ))}
                        </select>
                        <div className="prog-concepts-section" title="Requirements auto-detected from problem; use dropdown to edit manually">
                          <div className="prog-requirements-row">
                            <span className="prog-concepts-label">Requirements:</span>
                            <select
                              className="prog-requirements-mode-select"
                              value={requirementsModeByQuestion[q.question_id] ?? 'auto'}
                              onChange={e => setRequirementsModeByQuestion(prev => ({ ...prev, [q.question_id]: (e.target.value as 'auto' | 'manual') }))}
                              title="Auto: system analyzes problem. Edit: manual selection"
                            >
                              <option value="auto">Auto-detected</option>
                              <option value="manual">Edit manually</option>
                            </select>
                            {(requirementsModeByQuestion[q.question_id] ?? 'auto') === 'auto' ? (
                              <span className="prog-requirements-summary">
                                {analyzingRequirementsFor === q.question_id ? 'Analyzing...' : (
                                  (() => {
                                    const concepts = requiredConceptsByQuestion[q.question_id] || [];
                                    const isPattern = isPatternQuestionByQuestion[q.question_id];
                                    const labels = concepts.map(v => FUNDAMENTAL_CONCEPTS.find(c => c.value === v)?.label || v);
                                    if (isPattern) labels.push('Pattern');
                                    return labels.length ? labels.join(', ') : 'Click Generate to auto-detect';
                                  })()
                                )}
                              </span>
                            ) : (
                              <div className="prog-manual-concepts">
                                {FUNDAMENTAL_CONCEPTS.map(c => (
                                  <label key={c.value} className="prog-concept-check">
                                    <input
                                      type="checkbox"
                                      checked={(requiredConceptsByQuestion[q.question_id] || []).includes(c.value)}
                                      onChange={() => toggleConcept(q.question_id, c.value)}
                                    />
                                    {c.label}
                                  </label>
                                ))}
                                <label className="prog-concept-check prog-pattern-check">
                                  <input
                                    type="checkbox"
                                    checked={isPatternQuestionByQuestion[q.question_id] ?? false}
                                    onChange={e => handlePatternQuestionChange(q.question_id, e.target.checked)}
                                  />
                                  Pattern
                                </label>
                                <label className="prog-threshold-label">
                                  Threshold:
                                  <select
                                    value={conceptThresholdByQuestion[q.question_id] ?? 99}
                                    onChange={e => handleConceptThresholdChange(q.question_id, parseInt(e.target.value, 10))}
                                    title="% of required concepts that must be used"
                                  >
                                    <option value={99}>99%</option>
                                    <option value={90}>90%</option>
                                    <option value={75}>75%</option>
                                    <option value={50}>50%</option>
                                  </select>
                                </label>
                              </div>
                            )}
                          </div>
                        </div>
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
                        <button
                          onClick={() => handleAddTestCaseManually(q.question_id, true)}
                          className="btn btn-secondary btn-sm"
                          title="Add input only, then use Fill expected outputs with your solution"
                        >
                          Add input only
                        </button>
                        {((referenceSolutionByQuestion[q.question_id] || (threeSolutionsByQuestion[q.question_id] || []).length > 0)) &&
                          (testCasesByQuestion[q.question_id] || []).some(tc => !(tc.expected_output || '').trim()) &&
                          (testCasesByQuestion[q.question_id] || []).length > 0 && (
                          <button
                            onClick={() => {
                              const threeSol = (threeSolutionsByQuestion[q.question_id] || [])[selectedSolutionTab[q.question_id] ?? 0];
                              const codeToUse = threeSol?.code || referenceSolutionByQuestion[q.question_id] || '';
                              if (codeToUse) handleVerifyWithSolution(
                                q.question_id,
                                codeToUse,
                                referenceLanguageByQuestion[q.question_id] ?? q.language ?? 'python'
                              );
                            }}
                            disabled={verifyingForQuestion === q.question_id}
                            className="btn btn-secondary btn-sm"
                            title="Run selected solution to fill empty expected outputs"
                          >
                            {verifyingForQuestion === q.question_id ? 'Filling...' : 'Fill expected outputs'}
                          </button>
                        )}
                      </div>
                      <div className="prog-three-solutions">
                        <div className="prog-three-solutions-header">
                          <label>Solutions</label>
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
                            {loadingThreeSolutionsFor === q.question_id ? 'Generating...' : 'Generate solution'}
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
                          <>
                            <pre className="prog-solution-code">
                              {(threeSolutionsByQuestion[q.question_id] || [])[selectedSolutionTab[q.question_id] ?? 0]?.code || ''}
                            </pre>
                            {(testCasesByQuestion[q.question_id] || []).some(tc => !(tc.expected_output || '').trim()) && (
                              <p className="prog-solutions-hint">
                                <strong>Scenario-based questions:</strong> If expected outputs are empty, this solution will be used when you click &quot;Fill expected outputs&quot; above. Ensure the selected solution matches your test input format.
                              </p>
                            )}
                          </>
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
                                    <td><pre className="tc-cell-pre">{tcTruncate(tc.input_data, 120)}</pre></td>
                                    <td><pre className="tc-cell-pre">{tcTruncate(tc.expected_output, 200)}</pre></td>
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
                                        <pre className="tc-pre">{(tc.input_data || '').trimEnd() || '(empty)'}</pre>
                                      </div>
                                      <div className="tc-row">
                                        <strong>Expected:</strong>
                                        <pre className="tc-pre">{(tc.expected_output || '').trimEnd() || '(empty)'}</pre>
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
