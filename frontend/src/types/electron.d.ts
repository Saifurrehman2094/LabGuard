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
  
  // Event listeners
  onMonitoringEvent: (callback: (...args: any[]) => void) => () => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};