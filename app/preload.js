const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Authentication methods
  login: (credentials) => ipcRenderer.invoke('auth:login', credentials),
  logout: () => ipcRenderer.invoke('auth:logout'),
  getCurrentUser: () => ipcRenderer.invoke('auth:getCurrentUser'),
  
  // Exam management methods
  createExam: (examData) => ipcRenderer.invoke('exam:create', examData),
  getExamsByTeacher: (teacherId) => ipcRenderer.invoke('exam:getByTeacher', teacherId),
  updateExam: (updateData) => ipcRenderer.invoke('exam:update', updateData),
  deleteExam: (examId) => ipcRenderer.invoke('exam:delete', examId),
  getAvailableExams: (studentId) => ipcRenderer.invoke('db:getAvailableExams', studentId),
  
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
  
  // Event listeners
  onMonitoringEvent: (callback) => {
    ipcRenderer.on('monitoring:event', callback);
    return () => ipcRenderer.removeListener('monitoring:event', callback);
  }
});

// Security: Remove any global Node.js APIs that might have been exposed
delete window.require;
delete window.exports;
delete window.module;