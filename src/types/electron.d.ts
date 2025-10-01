// Type definitions for Electron API exposed through preload script

export interface ElectronAPI {
  // Authentication methods
  login: (credentials: { username: string; password: string }) => Promise<{ token: string; user: any }>;
  logout: () => Promise<void>;
  getCurrentUser: () => Promise<any>;
  
  // Database methods
  createExam: (examData: any) => Promise<any>;
  getExams: (userId: string, role: string) => Promise<any[]>;
  getAvailableExams: (studentId: string) => Promise<any[]>;
  
  // Monitoring methods
  startMonitoring: (examId: string, studentId: string, allowedApps: string[]) => Promise<void>;
  stopMonitoring: () => Promise<void>;
  getMonitoringEvents: (examId: string) => Promise<any[]>;
  
  // File methods
  uploadPDF: (filePath: string, examId: string) => Promise<string>;
  openFileDialog: () => Promise<string>;
  
  // Device methods
  getDeviceId: () => Promise<string>;
  
  // Event listeners
  onMonitoringEvent: (callback: (event: any, data: any) => void) => () => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}