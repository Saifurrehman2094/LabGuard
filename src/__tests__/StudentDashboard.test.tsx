import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import StudentDashboard from '../components/StudentDashboard';

// Mock user data
const mockUser = {
  userId: 'student1',
  username: 'student1',
  role: 'student' as const,
  fullName: 'Alice Johnson',
  token: 'mock-token',
  deviceId: 'device123'
};

// Mock exam data
const mockAvailableExams = [
  {
    exam_id: '1',
    teacher_id: 'teacher1',
    title: 'Mathematics Final Exam',
    start_time: new Date(Date.now() - 60000).toISOString(), // Started 1 minute ago
    end_time: new Date(Date.now() + 3600000).toISOString(), // Ends in 1 hour
    allowed_apps: ['Calculator', 'Notepad'],
    teacher_name: 'Dr. John Smith',
    created_at: new Date().toISOString()
  },
  {
    exam_id: '2',
    teacher_id: 'teacher2',
    title: 'Computer Science Quiz',
    start_time: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
    end_time: new Date(Date.now() + 90000000).toISOString(), // Tomorrow + 1 hour
    allowed_apps: ['Visual Studio Code', 'Chrome'],
    teacher_name: 'Prof. Sarah Wilson',
    created_at: new Date().toISOString()
  }
];

const mockExamHistory = [
  {
    exam_id: '3',
    teacher_id: 'teacher1',
    title: 'Physics Midterm',
    start_time: new Date(Date.now() - 86400000).toISOString(), // Yesterday
    end_time: new Date(Date.now() - 82800000).toISOString(), // Yesterday + 1 hour
    allowed_apps: ['Calculator'],
    teacher_name: 'Dr. John Smith',
    created_at: new Date(Date.now() - 86400000).toISOString()
  }
];

// Mock Electron API
const mockElectronAPI = {
  getAvailableExams: jest.fn(),
  getStudentExamHistory: jest.fn(),
  startMonitoring: jest.fn(),
  stopMonitoring: jest.fn()
};

// Mock window.electronAPI
Object.defineProperty(window, 'electronAPI', {
  value: mockElectronAPI,
  writable: true
});

describe('StudentDashboard', () => {
  const mockOnLogout = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockElectronAPI.getAvailableExams.mockResolvedValue({
      success: true,
      exams: mockAvailableExams
    });
    mockElectronAPI.getStudentExamHistory.mockResolvedValue({
      success: true,
      exams: mockExamHistory
    });
    mockElectronAPI.startMonitoring.mockResolvedValue({
      success: true,
      message: 'Monitoring started successfully'
    });
    mockElectronAPI.stopMonitoring.mockResolvedValue({
      success: true,
      message: 'Monitoring stopped successfully'
    });
  });

  test('renders student dashboard with user information', async () => {
    render(<StudentDashboard user={mockUser} onLogout={mockOnLogout} />);
    
    await waitFor(() => {
      expect(screen.getByText('Student Dashboard')).toBeInTheDocument();
      expect(screen.getByText('Welcome, Alice Johnson!')).toBeInTheDocument();
      expect(screen.getByText('Device: device123')).toBeInTheDocument();
    });
  });

  test('displays available exams correctly', async () => {
    render(<StudentDashboard user={mockUser} onLogout={mockOnLogout} />);
    
    await waitFor(() => {
      expect(screen.getByText('Mathematics Final Exam')).toBeInTheDocument();
      expect(screen.getByText('Computer Science Quiz')).toBeInTheDocument();
      expect(screen.getByText('Dr. John Smith')).toBeInTheDocument();
      expect(screen.getByText('Prof. Sarah Wilson')).toBeInTheDocument();
    });
  });

  test('shows exam history when history tab is clicked', async () => {
    render(<StudentDashboard user={mockUser} onLogout={mockOnLogout} />);
    
    await waitFor(() => {
      expect(screen.getByText('Available Exams (2)')).toBeInTheDocument();
    });

    // Click on history tab
    fireEvent.click(screen.getByText('Exam History (1)'));
    
    await waitFor(() => {
      expect(screen.getByText('Physics Midterm')).toBeInTheDocument();
    });
  });

  test('allows starting an active exam', async () => {
    render(<StudentDashboard user={mockUser} onLogout={mockOnLogout} />);
    
    await waitFor(() => {
      const startButtons = screen.getAllByText('Start Exam');
      expect(startButtons).toHaveLength(1); // Only the active exam should have a start button
    });

    // Click start exam button
    const startButton = screen.getByText('Start Exam');
    fireEvent.click(startButton);

    await waitFor(() => {
      expect(mockElectronAPI.startMonitoring).toHaveBeenCalledWith(
        '1',
        'student1',
        ['Calculator', 'Notepad']
      );
    });
  });

  test('shows exam session when exam is started', async () => {
    render(<StudentDashboard user={mockUser} onLogout={mockOnLogout} />);
    
    await waitFor(() => {
      const startButton = screen.getByText('Start Exam');
      fireEvent.click(startButton);
    });

    await waitFor(() => {
      expect(screen.getByText('Exam in Progress')).toBeInTheDocument();
      expect(screen.getByText('Monitoring Active')).toBeInTheDocument();
      expect(screen.getByText('End Exam')).toBeInTheDocument();
    });
  });

  test('allows ending an exam session', async () => {
    render(<StudentDashboard user={mockUser} onLogout={mockOnLogout} />);
    
    // Start exam first
    await waitFor(() => {
      const startButton = screen.getByText('Start Exam');
      fireEvent.click(startButton);
    });

    // Wait for exam session to appear
    await waitFor(() => {
      expect(screen.getByText('End Exam')).toBeInTheDocument();
    });

    // Click end exam button
    fireEvent.click(screen.getByText('End Exam'));

    await waitFor(() => {
      expect(mockElectronAPI.stopMonitoring).toHaveBeenCalled();
      expect(screen.getByText('Available Exams')).toBeInTheDocument();
    });
  });

  test('displays error message when API calls fail', async () => {
    mockElectronAPI.getAvailableExams.mockResolvedValue({
      success: false,
      error: 'Failed to load exams'
    });

    render(<StudentDashboard user={mockUser} onLogout={mockOnLogout} />);
    
    await waitFor(() => {
      expect(screen.getByText('⚠️ Failed to load exams')).toBeInTheDocument();
    });
  });

  test('shows no exams message when no exams available', async () => {
    mockElectronAPI.getAvailableExams.mockResolvedValue({
      success: true,
      exams: []
    });

    render(<StudentDashboard user={mockUser} onLogout={mockOnLogout} />);
    
    await waitFor(() => {
      expect(screen.getByText('No exams available at this time.')).toBeInTheDocument();
    });
  });

  test('calls logout function when logout button is clicked', async () => {
    render(<StudentDashboard user={mockUser} onLogout={mockOnLogout} />);
    
    await waitFor(() => {
      const logoutButton = screen.getByText('Logout');
      fireEvent.click(logoutButton);
      expect(mockOnLogout).toHaveBeenCalled();
    });
  });

  test('displays exam status correctly', async () => {
    // Mock exam with different statuses
    const mixedExams = [
      {
        ...mockAvailableExams[0],
        start_time: new Date(Date.now() - 60000).toISOString(), // Started 1 minute ago
        end_time: new Date(Date.now() + 3600000).toISOString() // Ends in 1 hour
      },
      {
        ...mockAvailableExams[1],
        start_time: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
        end_time: new Date(Date.now() + 90000000).toISOString() // Tomorrow + 1 hour
      }
    ];

    mockElectronAPI.getAvailableExams.mockResolvedValue({
      success: true,
      exams: mixedExams
    });

    render(<StudentDashboard user={mockUser} onLogout={mockOnLogout} />);
    
    await waitFor(() => {
      expect(screen.getByText('active')).toBeInTheDocument();
      expect(screen.getByText('upcoming')).toBeInTheDocument();
    });
  });

  test('prevents starting exam outside time window', async () => {
    // Mock exam that hasn't started yet
    const futureExam = {
      ...mockAvailableExams[0],
      start_time: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
      end_time: new Date(Date.now() + 90000000).toISOString() // Tomorrow + 1 hour
    };

    mockElectronAPI.getAvailableExams.mockResolvedValue({
      success: true,
      exams: [futureExam]
    });

    render(<StudentDashboard user={mockUser} onLogout={mockOnLogout} />);
    
    await waitFor(() => {
      const disabledButton = screen.getByText('Not Started');
      expect(disabledButton).toBeDisabled();
    });
  });
});