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
  getStudentsForEnrollment: () => ipcRenderer.invoke('course:getStudentsForEnrollment'),
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
  getStudentExamSession: (examId) => ipcRenderer.invoke('exam:get-student-session', examId),

  // Monitoring methods
  startMonitoring: (examId, studentId, allowedApps) =>
    ipcRenderer.invoke('monitoring:start', examId, studentId, allowedApps),
  stopMonitoring: () => ipcRenderer.invoke('monitoring:stop'),
  getMonitoringStatus: () => ipcRenderer.invoke('monitoring:get-status'),
  getMonitoringEvents: (examId) => ipcRenderer.invoke('monitoring:getEvents', examId),
  getViolations: (examId) => ipcRenderer.invoke('monitoring:get-violations', examId),
  getStudentViolations: (examId) => ipcRenderer.invoke('monitoring:get-student-violations', examId),

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

  // System methods
  getSystemSetupStatus: () => ipcRenderer.invoke('system:get-setup-status'),
  getInitError: () => ipcRenderer.invoke('system:get-init-error'),

  // PDF methods
  viewPDF: (examId) => ipcRenderer.invoke('pdf:view', examId),
  getPDFData: (examId) => ipcRenderer.invoke('pdf:get-data', examId),

  // Test Case Generation - AI & Code Execution
  aiExtractQuestions: (rawText) => ipcRenderer.invoke('ai:extract-questions', rawText),
  aiExtractQuestionAtIndex: (rawText, index) => ipcRenderer.invoke('ai:extract-question-at-index', rawText, index),
  aiGenerateTestCases: (questionText, language, problemType, requiredConcepts) => ipcRenderer.invoke('ai:generate-test-cases', questionText, language, problemType, requiredConcepts),
  aiAnalyzeRequirements: (problemText) => ipcRenderer.invoke('ai:analyze-requirements', problemText),
  aiGenerateThreeSolutions: (questionText, language) => ipcRenderer.invoke('ai:generate-three-solutions', questionText, language),
  aiIsConfigured: () => ipcRenderer.invoke('ai:is-configured'),
  aiFixPatternTestCases: (questionId) => ipcRenderer.invoke('ai:fix-pattern-test-cases', questionId),
  codeRun: (params) => ipcRenderer.invoke('code:run', params),
  codeRunTestCases: (params) => ipcRenderer.invoke('code:run-test-cases', params),
  getProgrammingQuestions: (examId) => ipcRenderer.invoke('programming:get-questions', examId),
  createProgrammingQuestion: (examId, data) => ipcRenderer.invoke('programming:create-question', examId, data),
  updateProgrammingQuestion: (questionId, data) => ipcRenderer.invoke('programming:update-question', questionId, data),
  deleteProgrammingQuestion: (questionId) => ipcRenderer.invoke('programming:delete-question', questionId),
  getProgrammingTestCases: (questionId) => ipcRenderer.invoke('programming:get-test-cases', questionId),
  addProgrammingTestCase: (questionId, data) => ipcRenderer.invoke('programming:add-test-case', questionId, data),
  updateProgrammingTestCase: (testCaseId, data) => ipcRenderer.invoke('programming:update-test-case', testCaseId, data),
  deleteProgrammingTestCase: (testCaseId) => ipcRenderer.invoke('programming:delete-test-case', testCaseId),
  verifyTestCasesWithSolution: (params) => ipcRenderer.invoke('code:verify-test-cases-with-solution', params),
  submitProgrammingCode: (examId, questionId, sourceCode, language) =>
    ipcRenderer.invoke('programming:submit-code', examId, questionId, sourceCode, language),
  getCodeSubmissions: (examId, studentId) => ipcRenderer.invoke('programming:get-submissions', examId, studentId),
  getSubmissionResults: (submissionId) => ipcRenderer.invoke('programming:get-submission-results', submissionId),
  getExamStudentScores: (examId) => ipcRenderer.invoke('programming:get-exam-scores', examId),

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

  // Exam update event — fired by teacher saving edits; resets student timers
  onExamUpdated: (callback) => {
    const handler = (event, data) => callback(data.examId);
    ipcRenderer.on('exam-updated', handler);
    return () => ipcRenderer.removeListener('exam-updated', handler);
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