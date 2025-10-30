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

  // Exam management methods
  createExam: (examData) => ipcRenderer.invoke('exam:create', examData),
  getExamsByTeacher: (teacherId) => ipcRenderer.invoke('exam:getByTeacher', teacherId),
  updateExam: (updateData) => ipcRenderer.invoke('exam:update', updateData),
  deleteExam: (examId) => ipcRenderer.invoke('exam:delete', examId),
  getAvailableExams: (studentId) => ipcRenderer.invoke('db:getAvailableExams', studentId),
  getStudentExamHistory: (studentId) => ipcRenderer.invoke('db:getStudentExamHistory', studentId),

  // Monitoring methods
  startMonitoring: (examId, studentId, allowedApps) =>
    ipcRenderer.invoke('monitoring:start', examId, studentId, allowedApps),
  stopMonitoring: () => ipcRenderer.invoke('monitoring:stop'),
  getMonitoringEvents: (examId) => ipcRenderer.invoke('monitoring:getEvents', examId),

  // File methods
  uploadPDF: (filePath, examId) => ipcRenderer.invoke('file:uploadPDF', filePath, examId),
  openFileDialog: () => ipcRenderer.invoke('file:openDialog'),

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

  // PDF methods
  viewPDF: (examId) => ipcRenderer.invoke('pdf:view', examId),

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