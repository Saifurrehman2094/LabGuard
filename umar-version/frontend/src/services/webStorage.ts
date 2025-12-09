// Web storage service for development mode
interface User {
  userId: string;
  username: string;
  role: 'teacher' | 'student';
  fullName: string;
}

interface Exam {
  examId: string;
  teacherId: string;
  title: string;
  pdfPath?: string;
  startTime: string;
  endTime: string;
  allowedApps: string[];
  createdAt: string;
}

interface StudentExam {
  exam_id: string;
  teacher_id: string;
  title: string;
  start_time: string;
  end_time: string;
  allowed_apps: string[];
  teacher_name: string;
  created_at: string;
}

class WebStorageService {
  private static instance: WebStorageService;
  private readonly STORAGE_KEYS = {
    USERS: 'lab_guard_users',
    EXAMS: 'lab_guard_exams',
    INITIALIZED: 'lab_guard_initialized'
  };

  private constructor() {
    this.initializeDefaultData();
  }

  static getInstance(): WebStorageService {
    if (!WebStorageService.instance) {
      WebStorageService.instance = new WebStorageService();
    }
    return WebStorageService.instance;
  }

  private initializeDefaultData() {
    // Only initialize if not already done
    if (localStorage.getItem(this.STORAGE_KEYS.INITIALIZED)) {
      return;
    }

    // Initialize default users
    const defaultUsers: User[] = [
      {
        userId: 'teacher1-web',
        username: 'teacher1',
        role: 'teacher',
        fullName: 'Dr. John Smith'
      },
      {
        userId: 'teacher2-web',
        username: 'teacher2',
        role: 'teacher',
        fullName: 'Prof. Sarah Wilson'
      },
      {
        userId: 'student1-web',
        username: 'student1',
        role: 'student',
        fullName: 'Alice Johnson'
      },
      {
        userId: 'student2-web',
        username: 'student2',
        role: 'student',
        fullName: 'Bob Martinez'
      }
    ];

    // Initialize default exams
    const defaultExams: Exam[] = [
      {
        examId: 'exam-1-web',
        teacherId: 'teacher1-web',
        title: 'Mathematics Final Exam',
        pdfPath: '/mock/path/math-final.pdf',
        startTime: '2025-10-15T09:00:00',
        endTime: '2025-10-15T12:00:00',
        allowedApps: ['calc.exe', 'notepad.exe'],
        createdAt: '2025-10-10T10:00:00'
      },
      {
        examId: 'exam-2-web',
        teacherId: 'teacher1-web',
        title: 'Physics Midterm',
        pdfPath: '/mock/path/physics-midterm.pdf',
        startTime: '2025-10-20T14:00:00',
        endTime: '2025-10-20T16:00:00',
        allowedApps: ['calc.exe'],
        createdAt: '2025-10-11T15:30:00'
      },
      {
        examId: 'exam-3-web',
        teacherId: 'teacher2-web',
        title: 'Computer Science Quiz',
        pdfPath: undefined,
        startTime: '2025-10-25T10:00:00',
        endTime: '2025-10-25T11:30:00',
        allowedApps: ['Code.exe', 'chrome.exe'],
        createdAt: '2025-10-12T09:00:00'
      }
    ];

    localStorage.setItem(this.STORAGE_KEYS.USERS, JSON.stringify(defaultUsers));
    localStorage.setItem(this.STORAGE_KEYS.EXAMS, JSON.stringify(defaultExams));
    localStorage.setItem(this.STORAGE_KEYS.INITIALIZED, 'true');
  }

  // User authentication
  async login(username: string, _password: string): Promise<{ success: boolean; user?: User; error?: string }> {
    const users = this.getUsers();
    const user = users.find(u => u.username === username);
    
    if (!user) {
      return { success: false, error: 'Invalid username or password' };
    }

    // In development, accept any password
    return { success: true, user };
  }

  // Get all users
  private getUsers(): User[] {
    const usersJson = localStorage.getItem(this.STORAGE_KEYS.USERS);
    return usersJson ? JSON.parse(usersJson) : [];
  }

  // Get all exams
  private getExams(): Exam[] {
    const examsJson = localStorage.getItem(this.STORAGE_KEYS.EXAMS);
    return examsJson ? JSON.parse(examsJson) : [];
  }

  // Save exams
  private saveExams(exams: Exam[]): void {
    localStorage.setItem(this.STORAGE_KEYS.EXAMS, JSON.stringify(exams));
  }

  // Create exam
  async createExam(examData: {
    teacherId: string;
    title: string;
    courseId?: string;
    startTime: string;
    endTime: string;
    allowedApps: string[];
    pdfFile?: File | null;
  }): Promise<{ success: boolean; exam?: Exam; error?: string }> {
    try {
      const examId = `exam-${Date.now()}-web`;
      const pdfPath = examData.pdfFile ? `/mock/uploads/${examData.pdfFile.name}` : undefined;

      const newExam: Exam = {
        examId,
        teacherId: examData.teacherId,
        title: examData.title,
        pdfPath,
        startTime: examData.startTime,
        endTime: examData.endTime,
        allowedApps: examData.allowedApps,
        createdAt: new Date().toISOString()
      };

      const exams = this.getExams();
      exams.push(newExam);
      this.saveExams(exams);

      return { success: true, exam: newExam };
    } catch (error) {
      return { success: false, error: 'Failed to create exam' };
    }
  }

  // Get exams by teacher
  async getExamsByTeacher(teacherId: string): Promise<{ success: boolean; exams?: Exam[]; error?: string }> {
    try {
      const exams = this.getExams();
      const teacherExams = exams.filter(exam => exam.teacherId === teacherId);
      return { success: true, exams: teacherExams };
    } catch (error) {
      return { success: false, error: 'Failed to load exams' };
    }
  }

  // Update exam
  async updateExam(examId: string, updateData: Partial<Exam>): Promise<{ success: boolean; exam?: Exam; error?: string }> {
    try {
      const exams = this.getExams();
      const examIndex = exams.findIndex(exam => exam.examId === examId);
      
      if (examIndex === -1) {
        return { success: false, error: 'Exam not found' };
      }

      exams[examIndex] = { ...exams[examIndex], ...updateData };
      this.saveExams(exams);

      return { success: true, exam: exams[examIndex] };
    } catch (error) {
      return { success: false, error: 'Failed to update exam' };
    }
  }

  // Delete exam
  async deleteExam(examId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const exams = this.getExams();
      const filteredExams = exams.filter(exam => exam.examId !== examId);
      
      if (filteredExams.length === exams.length) {
        return { success: false, error: 'Exam not found' };
      }

      this.saveExams(filteredExams);
      return { success: true };
    } catch (error) {
      return { success: false, error: 'Failed to delete exam' };
    }
  }

  // Get available exams for students
  async getAvailableExams(_studentId: string): Promise<{ success: boolean; exams?: StudentExam[]; error?: string }> {
    try {
      const exams = this.getExams();
      const users = this.getUsers();
      const now = new Date();

      const availableExams: StudentExam[] = exams
        .filter(exam => new Date(exam.endTime) >= now)
        .map(exam => {
          const teacher = users.find(u => u.userId === exam.teacherId);
          return {
            exam_id: exam.examId,
            teacher_id: exam.teacherId,
            title: exam.title,
            start_time: exam.startTime,
            end_time: exam.endTime,
            allowed_apps: exam.allowedApps,
            teacher_name: teacher?.fullName || 'Unknown Teacher',
            created_at: exam.createdAt
          };
        })
        .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());

      return { success: true, exams: availableExams };
    } catch (error) {
      return { success: false, error: 'Failed to load available exams' };
    }
  }

  // Get student exam history
  async getStudentExamHistory(_studentId: string): Promise<{ success: boolean; exams?: StudentExam[]; error?: string }> {
    try {
      const exams = this.getExams();
      const users = this.getUsers();
      const now = new Date();

      // For demo purposes, return some completed exams
      const completedExams: StudentExam[] = exams
        .filter(exam => new Date(exam.endTime) < now)
        .map(exam => {
          const teacher = users.find(u => u.userId === exam.teacherId);
          return {
            exam_id: exam.examId,
            teacher_id: exam.teacherId,
            title: exam.title,
            start_time: exam.startTime,
            end_time: exam.endTime,
            allowed_apps: exam.allowedApps,
            teacher_name: teacher?.fullName || 'Unknown Teacher',
            created_at: exam.createdAt
          };
        })
        .sort((a, b) => new Date(b.end_time).getTime() - new Date(a.end_time).getTime());

      return { success: true, exams: completedExams };
    } catch (error) {
      return { success: false, error: 'Failed to load exam history' };
    }
  }

  // Clear all data (for testing)
  clearAllData(): void {
    localStorage.removeItem(this.STORAGE_KEYS.USERS);
    localStorage.removeItem(this.STORAGE_KEYS.EXAMS);
    localStorage.removeItem(this.STORAGE_KEYS.INITIALIZED);
  }
}

export default WebStorageService;