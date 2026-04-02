/**
 * Student Analytics - TypeScript type definitions
 */

export interface StudentSummary {
  userId: string;
  name: string;
  email: string;
  examsAttempted: number;
  totalSubmissions: number;
  overallAvgScore: number;
  lastActive: string | null;
  isAtRisk?: boolean;
  atRiskConceptCount?: number;
}

export interface ConceptAttempt {
  passed: boolean;
  score: number;
  submittedAt: string;
  examTitle: string;
  questionTitle: string;
}

export interface ConceptStat {
  concept: string;
  totalAttempts: number;
  passedCount: number;
  failedCount: number;
  failRate: number;
  avgScore: number;
  lastSeen: string | null;
  trend: 'improving' | 'worsening' | 'neutral';
  consecutiveFailures: number;
  isAtRisk: boolean;
  attempts: ConceptAttempt[];
}

export interface ExamPerformance {
  examId: string;
  examTitle: string;
  examDate: string;
  questionsAttempted: number;
  avgScore: number;
  passedCount: number;
  failedCount: number;
  hardcodingFlags: number;
}

export interface SubmissionRecord {
  submission_id: string;
  exam_id: string;
  examTitle: string;
  question_id: string;
  questionTitle: string;
  required_concepts: string;
  difficulty: string;
  score: number;
  submitted_at: string;
  language: string;
  concept_passed: number;
  hardcoded: number;
  status: string;
}

export interface TestCaseResult {
  submission_id: string;
  test_case_id: string;
  description: string;
  input_data: string;
  expected_output: string;
  actual_output: string | null;
  passed: number;
  score: number;
  error_message: string | null;
}

export interface StudentProfile {
  student: StudentSummary;
  conceptStats: ConceptStat[];
  examPerformance: ExamPerformance[];
  atRiskConcepts: ConceptStat[];
  overallTrend: 'improving' | 'declining' | 'stable' | 'insufficient_data';
  submissions: SubmissionRecord[];
}

export interface AtRiskStudent {
  userId: string;
  name: string;
  email: string;
  atRiskConcepts: Array<{
    concept: string;
    consecutiveFailures: number;
    failRate: number;
  }>;
  lastActive: string | null;
}

export interface SubmissionDetail {
  submission: SubmissionRecord;
  testCaseResults: TestCaseResult[];
}

export interface ReportData {
  format: 'text' | 'json';
  content: string;
  filename: string;
}
