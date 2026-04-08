const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Authentication methods
  login: (credentials) => ipcRenderer.invoke('auth:login', credentials),
  logout: () => ipcRenderer.invoke('auth:logout'),
  getCurrentUser: () => ipcRenderer.invoke('auth:getCurrentUser'),

  // 2FA and Face Recognition methods
  verifyFace: (sessionId, faceEmbedding) => ipcRenderer.invoke('auth:verify-face', sessionId, faceEmbedding),
  storeFaceEmbedding: (userId, embedding, confidenceScore) =>
    ipcRenderer.invoke('face:store-embedding', userId, embedding, confidenceScore),
  verifyFaceEmbedding: (userId, embedding) => ipcRenderer.invoke('face:verify-embedding', userId, embedding),
  getFaceThreshold: () => ipcRenderer.invoke('face:get-threshold'),
  setFaceThreshold: (threshold) => ipcRenderer.invoke('face:set-threshold', threshold),
  hasRegisteredFace: (userId) => ipcRenderer.invoke('face:has-registered', userId),
  registerMultipleFaces: (userId, embeddings, confidenceScores) =>
    ipcRenderer.invoke('face:register-multiple', userId, embeddings, confidenceScores),

  // Course management methods
  createCourse: (courseData) => ipcRenderer.invoke('course:create', courseData),
  getCoursesByTeacher: (teacherId) => ipcRenderer.invoke('course:getByTeacher', teacherId),
  enrollStudent: (courseId, studentId) => ipcRenderer.invoke('course:enroll', courseId, studentId),
  getEnrolledStudents: (courseId) => ipcRenderer.invoke('course:getEnrolled', courseId),
  getStudentCourses: (studentId) => ipcRenderer.invoke('course:getStudentCourses', studentId),
  unenrollStudent: (courseId, studentId) => ipcRenderer.invoke('course:unenroll', courseId, studentId),
  getAllCourses: () => ipcRenderer.invoke('course:getAllCourses'),
  selfEnrollInCourse: (courseId) => ipcRenderer.invoke('course:selfEnroll', courseId),

  // Exam management methods
  createExam: (examData) => ipcRenderer.invoke('exam:create', examData),
  getExamsByTeacher: (teacherId) => ipcRenderer.invoke('exam:getByTeacher', teacherId),
  getExamById: (examId) => ipcRenderer.invoke('exam:getById', examId),
  updateExam: (updateData) => ipcRenderer.invoke('exam:update', updateData),
  deleteExam: (examId) => ipcRenderer.invoke('exam:delete', examId),
  getAvailableExams: (studentId) => ipcRenderer.invoke('db:getAvailableExams', studentId),
  getStudentExamHistory: (studentId) => ipcRenderer.invoke('db:getStudentExamHistory', studentId),
  submitExam: (examId, filesData) => ipcRenderer.invoke('exam:submit', examId, filesData),
  getExamSubmission: (examId) => ipcRenderer.invoke('exam:get-submission', examId),
  unsubmitExam: (examId) => ipcRenderer.invoke('exam:unsubmit', examId),
  extractQuestions: (examId) => ipcRenderer.invoke('exam:extract-questions', examId),
  generateTestCases: (examId, questionId, llmProvider) =>
    ipcRenderer.invoke('exam:generate-testcases', examId, questionId, llmProvider),
  aiAnalyzeRequirements: (problemText) => ipcRenderer.invoke('ai:analyze-requirements', problemText),
  saveQuestions: (examId, questions, deletedQuestionIds = []) =>
    ipcRenderer.invoke('exam:save-questions', examId, questions, deletedQuestionIds),
  upsertTestCases: (questionId, testCases) =>
    ipcRenderer.invoke('exam:upsert-testcases', questionId, testCases),
  getQuestionsWithTestCases: (examId) =>
    ipcRenderer.invoke('exam:get-questions-with-testcases', examId),

  // Monitoring methods
  startMonitoring: (examId, studentId, allowedApps) =>
    ipcRenderer.invoke('monitoring:start', examId, studentId, allowedApps),
  stopMonitoring: () => ipcRenderer.invoke('monitoring:stop'),
  getMonitoringStatus: () => ipcRenderer.invoke('monitoring:get-status'),
  getMonitoringEvents: (examId) => ipcRenderer.invoke('monitoring:getEvents', examId),
  getViolations: (examId) => ipcRenderer.invoke('monitoring:get-violations', examId),
  getIntegrityReviewData: (examId) => ipcRenderer.invoke('monitoring:get-integrity-review-data', examId),
  getStudentViolations: (examId) => ipcRenderer.invoke('monitoring:get-student-violations', examId),

  // Camera monitoring (Python pipeline)
  camera: {
    startTest: (options) => ipcRenderer.invoke('camera:start-test', options),
    stopTest: () => ipcRenderer.invoke('camera:stop-test'),
    getStatus: () => ipcRenderer.invoke('camera:get-status'),
    onStatusUpdate: (callback) => {
      if (typeof callback !== 'function') {
        return () => {};
      }
      const handler = (_event, data) => callback(data);
      ipcRenderer.on('camera:status-update', handler);
      return () => {
        ipcRenderer.removeListener('camera:status-update', handler);
      };
    },
    onError: (callback) => {
      if (typeof callback !== 'function') {
        return () => {};
      }
      const handler = (_event, error) => callback(error);
      ipcRenderer.on('camera:error', handler);
      ipcRenderer.on('camera:stderr', handler);
      return () => {
        ipcRenderer.removeListener('camera:error', handler);
        ipcRenderer.removeListener('camera:stderr', handler);
      };
    },
    onProcessExit: (callback) => {
      if (typeof callback !== 'function') {
        return () => {};
      }
      const handler = (_event, data) => callback(data);
      ipcRenderer.on('camera:process-exit', handler);
      return () => {
        ipcRenderer.removeListener('camera:process-exit', handler);
      };
    }
  },

  // Screenshot and report methods
  getScreenshot: (screenshotPath) => ipcRenderer.invoke('screenshot:get', screenshotPath),
  downloadScreenshot: (screenshotPath) => ipcRenderer.invoke('screenshot:download', screenshotPath),
  exportViolationReport: (reportData) => ipcRenderer.invoke('report:export-violations', reportData),

  // File methods
  uploadPDF: (filePath, examId) => ipcRenderer.invoke('file:uploadPDF', filePath, examId),
  openFileDialog: (options) => ipcRenderer.invoke('file:open-dialog', options),

  // Device methods
  getDeviceId: () => ipcRenderer.invoke('device:getId'),

  // Admin management methods
  getUsers: (filters) => ipcRenderer.invoke('admin:get-users', filters),
  createUser: (userData) => ipcRenderer.invoke('admin:create-user', userData),
  bulkCreateUsers: (csvData) => ipcRenderer.invoke('admin:bulk-create-users', csvData),
  updateUser: (userId, updateData) => ipcRenderer.invoke('admin:update-user', userId, updateData),
  deleteUser: (userId) => ipcRenderer.invoke('admin:delete-user', userId),
  getAuditLogs: (filters) => ipcRenderer.invoke('admin:get-audit-logs', filters),
  getFaceStats: () => ipcRenderer.invoke('admin:get-face-stats'),
  getSystemSettings: () => ipcRenderer.invoke('admin:get-system-settings'),
  updateSystemSettings: (settings) => ipcRenderer.invoke('admin:update-system-settings', settings),

  // Snapshot configuration methods (admin)
  getSnapshotConfig: () => ipcRenderer.invoke('admin:get-snapshot-config'),
  updateSnapshotConfig: (config) => ipcRenderer.invoke('admin:update-snapshot-config', config),

  // System methods
  getSystemSetupStatus: () => ipcRenderer.invoke('system:get-setup-status'),

  // PDF methods
  viewPDF: (examId) => ipcRenderer.invoke('pdf:view', examId),
  getPDFData: (examId) => ipcRenderer.invoke('pdf:get-data', examId),

  // Dev: Phase 1 Code Eval DB test (T2, T3)
  phase1CodeEvalDbTest: () => ipcRenderer.invoke('code-eval:phase1-db-test'),

  // Code evaluation (Phase 6)
  runEvaluation: (examId, submissionId, questionId, reRun) =>
    ipcRenderer.invoke('evaluation:run', examId, submissionId, questionId, reRun),
  runEvaluationForSubmission: (examId, submissionId) =>
    ipcRenderer.invoke('evaluation:run-for-submission', examId, submissionId),
  runEvaluationForExam: (examId) =>
    ipcRenderer.invoke('evaluation:run-for-exam', examId),
  getEvaluationDetail: (evaluationId) =>
    ipcRenderer.invoke('evaluation:get-detail', evaluationId),
  getEvaluationsByExam: (examId) =>
    ipcRenderer.invoke('evaluation:get-by-exam', examId),
  updateEvaluationManualScore: (evaluationId, manualScore) =>
    ipcRenderer.invoke('evaluation:update-manual-score', evaluationId, manualScore),
  generateEvaluationSummary: (evaluationId, options) =>
    ipcRenderer.invoke('evaluation:generate-summary', evaluationId, options),
  getEvaluationAnalysisCapabilities: () =>
    ipcRenderer.invoke('evaluation:get-analysis-capabilities'),

  // Teacher analytics dashboard
  getDashboardSummary: () => ipcRenderer.invoke('dashboard:summary'),
  getDashboardPapers: () => ipcRenderer.invoke('dashboard:papers'),
  getDashboardConcepts: () => ipcRenderer.invoke('dashboard:concepts'),
  getDashboardQuestions: (examId) => ipcRenderer.invoke('dashboard:questions', examId),
  getDashboardPipeline: () => ipcRenderer.invoke('dashboard:pipeline'),
  getDashboardPlatforms: () => ipcRenderer.invoke('dashboard:platforms'),
  getDashboardEventsRecent: (examId) => ipcRenderer.invoke('dashboard:events-recent', examId),
  getDashboardSubmissionsRecent: (examId) => ipcRenderer.invoke('dashboard:submissions-recent', examId),
  updateIntegrityCaseReview: (payload) => ipcRenderer.invoke('monitoring:update-integrity-case-review', payload),

  // Student analytics
  studentsGetAll: (teacherId) => ipcRenderer.invoke('students:getAll', teacherId),
  studentsGetAtRisk: (teacherId) => ipcRenderer.invoke('students:getAtRisk', teacherId),
  studentsGetProfile: (payload) => ipcRenderer.invoke('students:getProfile', payload),
  studentsGenerateReport: (payload) => ipcRenderer.invoke('students:generateReport', payload),
  getExamStudentScores: (examId) => ipcRenderer.invoke('students:getExamScores', examId),
  onDashboardUpdated: (callback) => {
    const handler = (event, data) => callback(event, data);
    ipcRenderer.on('dashboard:updated', handler);
    return () => ipcRenderer.removeListener('dashboard:updated', handler);
  },

  // Event listeners
  onMonitoringEvent: (callback) => {
    // Handle violation events for WarningPanel
    const violationStartHandler = (event, data) => callback(event, { type: 'violation_start', violation: data });
    const violationEndHandler = (event, data) => callback(event, { type: 'violation_end', violation: data });
    const violationUpdateHandler = (event, data) => callback(event, { type: 'violation_update', violation: data });

    ipcRenderer.on('monitoring:violation-started', violationStartHandler);
    ipcRenderer.on('monitoring:violation-ended', violationEndHandler);
    ipcRenderer.on('monitoring:application-changed', violationUpdateHandler);

    return () => {
      ipcRenderer.removeListener('monitoring:violation-started', violationStartHandler);
      ipcRenderer.removeListener('monitoring:violation-ended', violationEndHandler);
      ipcRenderer.removeListener('monitoring:application-changed', violationUpdateHandler);
    };
  },

  // Monitoring status event listeners
  onMonitoringStatusChange: (callback) => {
    const startedHandler = (event, data) => callback(event, { type: 'started', data });
    const stoppedHandler = (event, data) => callback(event, { type: 'stopped', data });
    const errorHandler = (event, data) => callback(event, { type: 'error', data });
    const criticalErrorHandler = (event, data) => callback(event, { type: 'critical_error', data });
    const restartedHandler = (event, data) => callback(event, { type: 'restarted', data });

    ipcRenderer.on('monitoring:started', startedHandler);
    ipcRenderer.on('monitoring:stopped', stoppedHandler);
    ipcRenderer.on('monitoring:error', errorHandler);
    ipcRenderer.on('monitoring:critical-error', criticalErrorHandler);
    ipcRenderer.on('monitoring:service-restarted', restartedHandler);

    return () => {
      ipcRenderer.removeListener('monitoring:started', startedHandler);
      ipcRenderer.removeListener('monitoring:stopped', stoppedHandler);
      ipcRenderer.removeListener('monitoring:error', errorHandler);
      ipcRenderer.removeListener('monitoring:critical-error', criticalErrorHandler);
      ipcRenderer.removeListener('monitoring:service-restarted', restartedHandler);
    };
  }
});

// Security: Remove any global Node.js APIs that might have been exposed
delete window.require;
delete window.exports;
delete window.module;
