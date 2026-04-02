interface ElectronAPI {
  // Authentication methods
  login: (credentials: { username: string; password: string }) => Promise<any>;
  logout: () => Promise<any>;
  getCurrentUser: () => Promise<any>;
  
  // 2FA and Face Recognition methods
  verifyFace: (sessionId: string, faceEmbedding: number[]) => Promise<any>;
  storeFaceEmbedding: (userId: string, embedding: number[], confidenceScore?: number) => Promise<any>;
  verifyFaceEmbedding: (userId: string, embedding: number[]) => Promise<any>;
  getFaceThreshold: () => Promise<any>;
  setFaceThreshold: (threshold: number) => Promise<any>;
  hasRegisteredFace: (userId: string) => Promise<any>;
  registerMultipleFaces: (userId: string, embeddings: number[][], confidenceScores?: number[]) => Promise<any>;
  
  // Exam management methods
  createExam: (examData: any) => Promise<any>;
  getExamsByTeacher: (teacherId: string) => Promise<any>;
  updateExam: (updateData: any) => Promise<any>;
  deleteExam: (examId: string) => Promise<any>;
  getAvailableExams: (studentId: string) => Promise<any>;
  getStudentExamHistory: (studentId: string) => Promise<any>;
  
  // Monitoring methods
  startMonitoring: (examId: string, studentId: string, allowedApps: string[]) => Promise<any>;
  stopMonitoring: () => Promise<any>;
  getMonitoringEvents: (examId: string) => Promise<any>;
  
  // File methods
  uploadPDF: (filePath: string, examId: string) => Promise<any>;
  openFileDialog: () => Promise<any>;
  
  // Device methods
  getDeviceId: () => Promise<any>;
  
  // Admin management methods
  getUsers: (filters?: any) => Promise<any>;
  createUser: (userData: any) => Promise<any>;
  bulkCreateUsers: (csvData: any[]) => Promise<any>;
  updateUser: (userId: string, updateData: any) => Promise<any>;
  deleteUser: (userId: string) => Promise<any>;
  getAuditLogs: (filters?: any) => Promise<any>;
  getFaceStats: () => Promise<any>;
  getSystemSettings: () => Promise<any>;
  updateSystemSettings: (settings: any) => Promise<any>;
  getSystemSetupStatus?: () => Promise<any>;
  getInitError?: () => Promise<{ hasError: boolean; message?: string }>;

  // Test Case Generation
  aiExtractQuestions?: (rawText: string) => Promise<{ success: boolean; questions?: any[]; error?: string }>;
  aiExtractQuestionAtIndex?: (rawText: string, index: number) => Promise<{ success: boolean; question?: { id: number; text: string } | null; error?: string }>;
  aiGenerateTestCases?: (questionText: string, language?: string, problemType?: string, requiredConcepts?: string[]) => Promise<{ success: boolean; testCases?: any[]; referenceSolution?: string; error?: string }>;
  aiAnalyzeRequirements?: (problemText: string) => Promise<{ success: boolean; requiredConcepts?: string[]; isPatternQuestion?: boolean; problemType?: string; error?: string }>;
  aiGenerateThreeSolutions?: (questionText: string, language?: string) => Promise<{ success: boolean; solutions?: Array<{ label: string; code: string }>; error?: string }>;
  aiIsConfigured?: () => Promise<{ configured: boolean }>;
  codeRun?: (params: { sourceCode: string; stdin: string; language?: string; timeLimit?: number }) => Promise<any>;
  codeRunTestCases?: (params: { sourceCode: string; testCases: any[]; language?: string; timeLimit?: number }) => Promise<any>;
  getProgrammingQuestions?: (examId: string) => Promise<any>;
  createProgrammingQuestion?: (examId: string, data: any) => Promise<any>;
  updateProgrammingQuestion?: (questionId: string, data: any) => Promise<any>;
  deleteProgrammingQuestion?: (questionId: string) => Promise<any>;
  getProgrammingTestCases?: (questionId: string) => Promise<any>;
  addProgrammingTestCase?: (questionId: string, data: any) => Promise<any>;
  updateProgrammingTestCase?: (testCaseId: string, data: any) => Promise<any>;
  deleteProgrammingTestCase?: (testCaseId: string) => Promise<any>;
  verifyTestCasesWithSolution?: (params: { questionId: string; sourceCode: string; language?: string }) => Promise<any>;
  submitProgrammingCode?: (examId: string, questionId: string, sourceCode: string, language: string) => Promise<any>;
  getCodeSubmissions?: (examId: string, studentId: string) => Promise<any>;
  getSubmissionResults?: (submissionId: string) => Promise<any>;

  // Camera monitoring methods
  camera: {
    startTest: (options?: any) => Promise<any>;
    stopTest: () => Promise<any>;
    getStatus: () => Promise<any>;
    onStatusUpdate: (callback: (data: any) => void) => () => void;
    onError: (callback: (error: any) => void) => () => void;
    onProcessExit: (callback: (data: any) => void) => () => void;
  };

  // Event listeners
  onMonitoringEvent: (callback: (...args: any[]) => void) => () => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};