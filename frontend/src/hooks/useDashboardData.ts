import { useState, useEffect, useCallback } from 'react';

export interface DashboardSummary {
  totalQuestions: number;
  totalTestCases: number;
  avgCasesPerQuestion: number;
  totalExams: number;
  totalSubmissions: number;
  hardcodingFlags: number;
  verifiedCorrect: number;
  accuracyRate: number;
}

export interface PaperStat {
  examId: string;
  examTitle: string;
  questionCount: number;
  testCaseCount: number;
  correctCases: number;
  wrongCases: number;
  easyCount: number;
  mediumCount: number;
  hardCount: number;
  createdAt: string;
}

export interface ConceptStat {
  concept: string;
  count: number;
}

export interface QuestionStat {
  questionId: string;
  title: string;
  testCaseCount: number;
  correctCount: number;
  accuracyPercent: number;
  requiredConcepts: string[];
  difficulty: string;
  platform: string;
}

export interface PipelineConfig {
  primaryModel: string;
  primaryProvider: string;
  fallbackModel: string;
  fallbackProvider: string;
  temperature: number;
  maxTokens: number;
  casesPerPrompt: number;
  judge0PythonId: number;
  judge0CppId: number;
  memoryLimitMB: number;
  judge0Endpoint: string;
  groqConfigured: boolean;
  geminiConfigured: boolean;
}

export interface PlatformStat {
  platform: string;
  count: number;
  percentage: number;
}

export interface RecentEvent {
  id: string;
  examId: string;
  studentId: string;
  timestamp: string;
  event_type: string;
  window_title?: string;
  is_violation: number;
  student_name?: string;
  exam_title?: string;
}

export interface RecentSubmission {
  submission_id: string;
  exam_id: string;
  question_id: string;
  student_id: string;
  score: number;
  passed_count: number;
  total_count: number;
  hardcoded: number;
  concept_passed: number;
  submitted_at: string;
  language: string;
  student_name: string;
  username: string;
  question_title: string;
  exam_title: string;
}

export interface DashboardData {
  summary: DashboardSummary | null;
  papers: PaperStat[];
  concepts: ConceptStat[];
  questions: QuestionStat[];
  pipeline: PipelineConfig | null;
  platforms: PlatformStat[];
  events: RecentEvent[];
  submissions: RecentSubmission[];
}

export interface UseDashboardDataReturn {
  data: DashboardData;
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  refresh: () => void;
  selectedExamId: string;
  setSelectedExamId: (id: string) => void;
}

const eAPI = () => (window as any).electronAPI;

async function ipcFetch<T>(method: string, ...args: any[]): Promise<T | null> {
  try {
    const api = eAPI();
    if (!api || typeof api[method] !== 'function') return null;
    const res = await api[method](...args);
    if (res && res.success) return res.data as T;
    return null;
  } catch {
    return null;
  }
}

const EMPTY_DATA: DashboardData = {
  summary: null,
  papers: [],
  concepts: [],
  questions: [],
  pipeline: null,
  platforms: [],
  events: [],
  submissions: [],
};

export function useDashboardData(intervalMs = 10000): UseDashboardDataReturn {
  const [data, setData] = useState<DashboardData>(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [selectedExamId, setSelectedExamId] = useState('');

  const fetchCore = useCallback(async () => {
    try {
      const [summary, papers, concepts, platforms, pipeline, events, submissions] =
        await Promise.all([
          ipcFetch<DashboardSummary>('getDashboardSummary'),
          ipcFetch<PaperStat[]>('getDashboardPapers'),
          ipcFetch<ConceptStat[]>('getDashboardConcepts'),
          ipcFetch<PlatformStat[]>('getDashboardPlatforms'),
          ipcFetch<PipelineConfig>('getDashboardPipeline'),
          ipcFetch<RecentEvent[]>('getDashboardEventsRecent'),
          ipcFetch<RecentSubmission[]>('getDashboardSubmissionsRecent'),
        ]);

      setData(prev => ({
        summary: summary ?? prev.summary,
        papers: papers ?? prev.papers,
        concepts: concepts ?? prev.concepts,
        questions: prev.questions,
        pipeline: pipeline ?? prev.pipeline,
        platforms: platforms ?? prev.platforms,
        events: events ?? prev.events,
        submissions: submissions ?? prev.submissions,
      }));
      setLastUpdated(new Date());
      setError(null);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to fetch dashboard data');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchQuestions = useCallback(async (examId: string) => {
    if (!examId) return;
    const questions = await ipcFetch<QuestionStat[]>('getDashboardQuestions', examId);
    if (questions) setData(prev => ({ ...prev, questions }));
  }, []);

  const handleDashboardUpdate = useCallback(async (event: any, data: any) => {
    // Selectively refresh only affected data based on event type
    try {
      switch (data.type) {
        case 'questionAdded':
        case 'testCaseAdded':
          // Refresh summary and papers (question/test case count changed)
          const [summary, papers] = await Promise.all([
            ipcFetch<DashboardSummary>('getDashboardSummary'),
            ipcFetch<PaperStat[]>('getDashboardPapers'),
          ]);
          setData(prev => ({
            ...prev,
            summary: summary ?? prev.summary,
            papers: papers ?? prev.papers,
          }));
          // If currently selected exam was updated, refresh questions
          if (data.examId === selectedExamId) {
            const questions = await ipcFetch<QuestionStat[]>('getDashboardQuestions', data.examId);
            if (questions) setData(prev => ({ ...prev, questions }));
          }
          break;

        case 'submissionAdded':
          // Refresh submissions and events
          const [submissions, events] = await Promise.all([
            ipcFetch<RecentSubmission[]>('getDashboardSubmissionsRecent'),
            ipcFetch<RecentEvent[]>('getDashboardEventsRecent'),
          ]);
          setData(prev => ({
            ...prev,
            submissions: submissions ?? prev.submissions,
            events: events ?? prev.events,
          }));
          break;

        case 'examCreated':
          // Refresh papers list (new exam added)
          const newPapers = await ipcFetch<PaperStat[]>('getDashboardPapers');
          if (newPapers) setData(prev => ({ ...prev, papers: newPapers }));
          break;
      }
      setLastUpdated(new Date());
    } catch (err) {
      console.warn('Dashboard update event error:', err);
    }
  }, [selectedExamId]);

  // Initial load + polling
  useEffect(() => {
    fetchCore();
    const timer = setInterval(fetchCore, intervalMs);
    return () => clearInterval(timer);
  }, [fetchCore, intervalMs]);

  // Listen for real-time updates from backend
  useEffect(() => {
    const api = eAPI();
    if (!api?.onDashboardUpdated) return;

    const unsubscribe = api.onDashboardUpdated(handleDashboardUpdate);
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [handleDashboardUpdate]);

  // Auto-select first exam
  useEffect(() => {
    if (!selectedExamId && data.papers.length > 0) {
      setSelectedExamId(data.papers[0].examId);
    }
  }, [data.papers, selectedExamId]);

  // Fetch per-question data when exam changes
  useEffect(() => {
    if (selectedExamId) fetchQuestions(selectedExamId);
  }, [selectedExamId, fetchQuestions]);

  return {
    data,
    loading,
    error,
    lastUpdated,
    refresh: fetchCore,
    selectedExamId,
    setSelectedExamId,
  };
}
