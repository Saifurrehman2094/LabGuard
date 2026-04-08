interface ElectronAPI {
  login: (credentials: { username: string; password: string }) => Promise<any>;
  logout: () => Promise<any>;
  getCurrentUser: () => Promise<any>;

  verifyFace: (sessionId: string, faceEmbedding: number[]) => Promise<any>;
  storeFaceEmbedding: (userId: string, embedding: number[], confidenceScore?: number) => Promise<any>;
  verifyFaceEmbedding: (userId: string, embedding: number[]) => Promise<any>;
  getFaceThreshold: () => Promise<any>;
  setFaceThreshold: (threshold: number) => Promise<any>;
  hasRegisteredFace: (userId: string) => Promise<any>;
  registerMultipleFaces: (userId: string, embeddings: number[][], confidenceScores?: number[]) => Promise<any>;

  createExam: (examData: any) => Promise<any>;
  getExamsByTeacher: (teacherId: string) => Promise<any>;
  getExamById: (examId: string) => Promise<any>;
  updateExam: (updateData: any) => Promise<any>;
  deleteExam: (examId: string) => Promise<any>;
  getAvailableExams: (studentId: string) => Promise<any>;
  getStudentExamHistory: (studentId: string) => Promise<any>;
  submitExam: (examId: string, filesData: any) => Promise<any>;
  getExamSubmission: (examId: string) => Promise<any>;
  unsubmitExam: (examId: string) => Promise<any>;
  extractQuestions: (examId: string) => Promise<any>;
  generateTestCases: (examId: string, questionId: string, llmProvider?: string) => Promise<any>;
  aiAnalyzeRequirements: (problemText: string) => Promise<any>;
  saveQuestions: (examId: string, questions: any[], deletedQuestionIds?: string[]) => Promise<any>;
  upsertTestCases: (questionId: string, testCases: any[]) => Promise<any>;
  getQuestionsWithTestCases: (examId: string) => Promise<any>;

  startMonitoring: (examId: string, studentId: string, allowedApps: string[]) => Promise<any>;
  stopMonitoring: () => Promise<any>;
  getMonitoringStatus: () => Promise<any>;
  getMonitoringEvents: (examId: string) => Promise<any>;
  getViolations: (examId: string) => Promise<any>;
  getIntegrityReviewData: (examId: string) => Promise<any>;
  getStudentViolations: (examId: string) => Promise<any>;

  uploadPDF: (filePath: string, examId: string) => Promise<any>;
  openFileDialog: (options?: any) => Promise<any>;
  getDeviceId: () => Promise<any>;

  getUsers: (filters?: any) => Promise<any>;
  createUser: (userData: any) => Promise<any>;
  bulkCreateUsers: (csvData: any[]) => Promise<any>;
  updateUser: (userId: string, updateData: any) => Promise<any>;
  deleteUser: (userId: string) => Promise<any>;
  getAuditLogs: (filters?: any) => Promise<any>;
  getFaceStats: () => Promise<any>;
  getSystemSettings: () => Promise<any>;
  updateSystemSettings: (settings: any) => Promise<any>;
  getSystemSetupStatus: () => Promise<any>;

  getSnapshotConfig: () => Promise<{
    success: boolean;
    config?: {
      enabled_violations: string[];
      cooldown_seconds: number;
      snapshots_enabled: boolean;
    };
    error?: string;
  }>;
  updateSnapshotConfig: (config: {
    enabled_violations?: string[];
    cooldown_seconds?: number;
    snapshots_enabled?: boolean;
  }) => Promise<{ success: boolean; message?: string; error?: string }>;

  camera: {
    startTest: (options?: any) => Promise<any>;
    stopTest: () => Promise<any>;
    getStatus: () => Promise<any>;
    onStatusUpdate: (callback: (data: any) => void) => () => void;
    onError: (callback: (error: any) => void) => () => void;
    onProcessExit: (callback: (data: any) => void) => () => void;
  };

  getScreenshot: (screenshotPath: string) => Promise<any>;
  downloadScreenshot: (screenshotPath: string) => Promise<any>;
  exportViolationReport: (reportData: any) => Promise<any>;
  viewPDF: (examId: string) => Promise<any>;
  getPDFData: (examId: string) => Promise<any>;
  phase1CodeEvalDbTest: () => Promise<any>;

  runEvaluation: (examId: string, submissionId: string, questionId: string, reRun?: boolean) => Promise<any>;
  runEvaluationForSubmission: (examId: string, submissionId: string) => Promise<any>;
  runEvaluationForExam: (examId: string) => Promise<any>;
  getEvaluationDetail: (evaluationId: string) => Promise<any>;
  getEvaluationsByExam: (examId: string) => Promise<any>;
  updateEvaluationManualScore: (evaluationId: string, manualScore: number | null) => Promise<any>;
  generateEvaluationSummary: (evaluationId: string, options?: any) => Promise<any>;
  getEvaluationAnalysisCapabilities: () => Promise<any>;

  getDashboardSummary: () => Promise<any>;
  getDashboardPapers: () => Promise<any>;
  getDashboardConcepts: () => Promise<any>;
  getDashboardQuestions: (examId: string) => Promise<any>;
  getDashboardPipeline: () => Promise<any>;
  getDashboardPlatforms: () => Promise<any>;
  getDashboardEventsRecent: (examId?: string | null) => Promise<any>;
  getDashboardSubmissionsRecent: (examId?: string | null) => Promise<any>;
  updateIntegrityCaseReview: (payload: { examId: string; studentId: string; isReviewed?: boolean; isSuspicious?: boolean; notes?: string }) => Promise<any>;
  onDashboardUpdated: (callback: (...args: any[]) => void) => () => void;

  studentsGetAll: (teacherId: string) => Promise<any>;
  studentsGetAtRisk: (teacherId: string) => Promise<any>;
  studentsGetProfile: (payload: any) => Promise<any>;
  studentsGenerateReport: (payload: any) => Promise<any>;
  getExamStudentScores: (examId: string) => Promise<any>;

  onMonitoringEvent: (callback: (...args: any[]) => void) => () => void;
  onMonitoringStatusChange?: (callback: (...args: any[]) => void) => () => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
