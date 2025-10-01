import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import TeacherDashboard from '../components/TeacherDashboard';
import ExamCreationForm from '../components/ExamCreationForm';
import ExamList from '../components/ExamList';

// Mock user data
const mockTeacher = {
  userId: 'teacher-123',
  username: 'teacher1',
  role: 'teacher' as const,
  fullName: 'Dr. John Smith',
  token: 'mock-token',
  deviceId: 'device-123'
};

// Mock exam data
const mockExams = [
  {
    examId: 'exam-1',
    teacherId: 'teacher-123',
    title: 'Midterm Exam - Computer Science',
    pdfPath: '/mock/path/midterm.pdf',
    startTime: '2024-10-20T09:00:00',
    endTime: '2024-10-20T11:00:00',
    allowedApps: ['notepad.exe', 'calculator.exe'],
    createdAt: '2024-10-15T10:00:00'
  },
  {
    examId: 'exam-2',
    teacherId: 'teacher-123',
    title: 'Final Exam - Database Systems',
    pdfPath: '/mock/path/final.pdf',
    startTime: '2024-10-25T14:00:00',
    endTime: '2024-10-25T17:00:00',
    allowedApps: ['notepad.exe', 'mysql-workbench.exe'],
    createdAt: '2024-10-16T15:30:00'
  }
];

// Mock Electron API
const mockElectronAPI = {
  getExamsByTeacher: jest.fn(),
  createExam: jest.fn(),
  updateExam: jest.fn(),
  deleteExam: jest.fn()
};

// Setup global mock
beforeAll(() => {
  (global as any).window = {
    electronAPI: mockElectronAPI
  };
});

describe('Teacher Dashboard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockElectronAPI.getExamsByTeacher.mockResolvedValue({
      success: true,
      exams: mockExams
    });
  });

  test('renders teacher dashboard with user info', async () => {
    const mockLogout = jest.fn();
    
    render(<TeacherDashboard user={mockTeacher} onLogout={mockLogout} />);
    
    expect(screen.getByText('Teacher Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Welcome back, Dr. John Smith')).toBeInTheDocument();
    expect(screen.getByText('Logout')).toBeInTheDocument();
  });

  test('displays exam statistics correctly', async () => {
    const mockLogout = jest.fn();
    
    render(<TeacherDashboard user={mockTeacher} onLogout={mockLogout} />);
    
    await waitFor(() => {
      const totalExamsCard = screen.getByText('Total Exams').closest('.stat-card');
      expect(totalExamsCard?.querySelector('.stat-number')).toHaveTextContent('2');
    });
  });

  test('switches between tabs correctly', async () => {
    const mockLogout = jest.fn();
    
    render(<TeacherDashboard user={mockTeacher} onLogout={mockLogout} />);
    
    // Check initial tab
    expect(screen.getByText('Overview')).toHaveClass('active');
    
    // Switch to create tab
    const createTabButton = screen.getAllByText('Create Exam')[0]; // Get the tab button, not the form button
    fireEvent.click(createTabButton);
    expect(createTabButton).toHaveClass('active');
    expect(screen.getByText('Create New Exam')).toBeInTheDocument();
    
    // Switch to manage tab - use role to be more specific
    const manageTabButton = screen.getByRole('button', { name: 'Manage Exams' });
    fireEvent.click(manageTabButton);
    expect(manageTabButton).toHaveClass('active');
  });

  test('calls logout function when logout button is clicked', () => {
    const mockLogout = jest.fn();
    
    render(<TeacherDashboard user={mockTeacher} onLogout={mockLogout} />);
    
    fireEvent.click(screen.getByText('Logout'));
    expect(mockLogout).toHaveBeenCalledTimes(1);
  });
});

describe('Exam Creation Form', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders exam creation form with all fields', () => {
    const mockOnExamCreated = jest.fn();
    
    render(<ExamCreationForm user={mockTeacher} onExamCreated={mockOnExamCreated} />);
    
    expect(screen.getByLabelText(/exam title/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/start time/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/end time/i)).toBeInTheDocument();
    expect(screen.getByText(/allowed applications/i)).toBeInTheDocument();
    expect(screen.getByText('Create Exam')).toBeInTheDocument();
  });

  test('validates required fields', async () => {
    const mockOnExamCreated = jest.fn();
    
    render(<ExamCreationForm user={mockTeacher} onExamCreated={mockOnExamCreated} />);
    
    // Try to submit empty form
    fireEvent.click(screen.getByText('Create Exam'));
    
    await waitFor(() => {
      expect(screen.getByText('Exam title is required')).toBeInTheDocument();
      expect(screen.getByText('Start time is required')).toBeInTheDocument();
      expect(screen.getByText('End time is required')).toBeInTheDocument();
    });
    
    expect(mockOnExamCreated).not.toHaveBeenCalled();
  });

  test('validates time constraints', async () => {
    const mockOnExamCreated = jest.fn();
    
    render(<ExamCreationForm user={mockTeacher} onExamCreated={mockOnExamCreated} />);
    
    // Fill form with invalid times
    fireEvent.change(screen.getByLabelText(/exam title/i), {
      target: { value: 'Test Exam' }
    });
    
    const now = new Date();
    const pastTime = new Date(now.getTime() - 60000).toISOString().slice(0, 16);
    const startTime = new Date(now.getTime() + 60000).toISOString().slice(0, 16);
    
    fireEvent.change(screen.getByLabelText(/start time/i), {
      target: { value: pastTime }
    });
    fireEvent.change(screen.getByLabelText(/end time/i), {
      target: { value: startTime }
    });
    
    fireEvent.click(screen.getByText('Create Exam'));
    
    await waitFor(() => {
      expect(screen.getByText('Start time must be in the future')).toBeInTheDocument();
    });
  });

  test('handles allowed applications selection', () => {
    const mockOnExamCreated = jest.fn();
    
    render(<ExamCreationForm user={mockTeacher} onExamCreated={mockOnExamCreated} />);
    
    // Check that notepad is selected by default
    const notepadCheckbox = screen.getByRole('checkbox', { name: /notepad/i });
    expect(notepadCheckbox).toBeChecked();
    
    // Select calculator
    const calculatorCheckbox = screen.getByRole('checkbox', { name: /calculator/i });
    fireEvent.click(calculatorCheckbox);
    expect(calculatorCheckbox).toBeChecked();
  });

  test('submits form with valid data in development mode', async () => {
    const mockOnExamCreated = jest.fn();
    
    render(<ExamCreationForm user={mockTeacher} onExamCreated={mockOnExamCreated} />);
    
    // Fill form with valid data
    fireEvent.change(screen.getByLabelText(/exam title/i), {
      target: { value: 'Test Exam' }
    });
    
    // Use future dates that are definitely in the future
    const now = new Date();
    const startTime = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 16); // 1 day from now
    const endTime = new Date(now.getTime() + 25 * 60 * 60 * 1000).toISOString().slice(0, 16); // 25 hours from now
    
    fireEvent.change(screen.getByLabelText(/start time/i), {
      target: { value: startTime }
    });
    fireEvent.change(screen.getByLabelText(/end time/i), {
      target: { value: endTime }
    });
    
    fireEvent.click(screen.getByText('Create Exam'));
    
    // In development mode, the form should simulate exam creation
    await waitFor(() => {
      expect(mockOnExamCreated).toHaveBeenCalledWith(expect.objectContaining({
        title: 'Test Exam',
        startTime,
        endTime,
        allowedApps: ['notepad.exe']
      }));
    }, { timeout: 2000 });
  });
});

describe('Exam List', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders exam list with exam cards', () => {
    const mockOnExamUpdated = jest.fn();
    const mockOnExamDeleted = jest.fn();
    const mockOnRefresh = jest.fn();
    
    render(
      <ExamList 
        exams={mockExams}
        onExamUpdated={mockOnExamUpdated}
        onExamDeleted={mockOnExamDeleted}
        onRefresh={mockOnRefresh}
      />
    );
    
    expect(screen.getByText('Midterm Exam - Computer Science')).toBeInTheDocument();
    expect(screen.getByText('Final Exam - Database Systems')).toBeInTheDocument();
  });

  test('displays exam information correctly', () => {
    const mockOnExamUpdated = jest.fn();
    const mockOnExamDeleted = jest.fn();
    const mockOnRefresh = jest.fn();
    
    render(
      <ExamList 
        exams={mockExams}
        onExamUpdated={mockOnExamUpdated}
        onExamDeleted={mockOnExamDeleted}
        onRefresh={mockOnRefresh}
      />
    );
    
    // Check exam details - use getAllByText for multiple elements
    expect(screen.getAllByText(/2 applications/)[0]).toBeInTheDocument();
    expect(screen.getAllByText('notepad.exe')[0]).toBeInTheDocument();
    expect(screen.getByText('calculator.exe')).toBeInTheDocument();
  });

  test('filters exams by status', () => {
    const mockOnExamUpdated = jest.fn();
    const mockOnExamDeleted = jest.fn();
    const mockOnRefresh = jest.fn();
    
    render(
      <ExamList 
        exams={mockExams}
        onExamUpdated={mockOnExamUpdated}
        onExamDeleted={mockOnExamDeleted}
        onRefresh={mockOnRefresh}
      />
    );
    
    // Change filter to completed
    const filterSelect = screen.getByDisplayValue('All Exams');
    fireEvent.change(filterSelect, { target: { value: 'completed' } });
    
    // Should show completed exams (both mock exams are in the past)
    expect(screen.getByText('Midterm Exam - Computer Science')).toBeInTheDocument();
  });

  test('sorts exams correctly', () => {
    const mockOnExamUpdated = jest.fn();
    const mockOnExamDeleted = jest.fn();
    const mockOnRefresh = jest.fn();
    
    render(
      <ExamList 
        exams={mockExams}
        onExamUpdated={mockOnExamUpdated}
        onExamDeleted={mockOnExamDeleted}
        onRefresh={mockOnRefresh}
      />
    );
    
    // Click title sort button
    fireEvent.click(screen.getByText('Title'));
    
    // Should sort by title - check the exam titles specifically
    const examTitles = screen.getAllByRole('heading', { level: 3 });
    expect(examTitles[0]).toHaveTextContent('Final Exam - Database Systems');
  });

  test('handles exam deletion', async () => {
    const mockOnExamUpdated = jest.fn();
    const mockOnExamDeleted = jest.fn();
    const mockOnRefresh = jest.fn();
    
    mockElectronAPI.deleteExam.mockResolvedValue({ success: true });
    
    // Mock window.confirm
    const originalConfirm = window.confirm;
    window.confirm = jest.fn(() => true);
    
    render(
      <ExamList 
        exams={mockExams}
        onExamUpdated={mockOnExamUpdated}
        onExamDeleted={mockOnExamDeleted}
        onRefresh={mockOnRefresh}
      />
    );
    
    // Click delete button for first exam
    const deleteButtons = screen.getAllByText('Delete');
    fireEvent.click(deleteButtons[0]);
    
    await waitFor(() => {
      expect(mockOnExamDeleted).toHaveBeenCalledWith('exam-1');
    });
    
    // Restore window.confirm
    window.confirm = originalConfirm;
  });

  test('calls refresh function', () => {
    const mockOnExamUpdated = jest.fn();
    const mockOnExamDeleted = jest.fn();
    const mockOnRefresh = jest.fn();
    
    render(
      <ExamList 
        exams={mockExams}
        onExamUpdated={mockOnExamUpdated}
        onExamDeleted={mockOnExamDeleted}
        onRefresh={mockOnRefresh}
      />
    );
    
    fireEvent.click(screen.getByText('Refresh'));
    expect(mockOnRefresh).toHaveBeenCalledTimes(1);
  });

  test('shows empty state when no exams', () => {
    const mockOnExamUpdated = jest.fn();
    const mockOnExamDeleted = jest.fn();
    const mockOnRefresh = jest.fn();
    
    render(
      <ExamList 
        exams={[]}
        onExamUpdated={mockOnExamUpdated}
        onExamDeleted={mockOnExamDeleted}
        onRefresh={mockOnRefresh}
      />
    );
    
    expect(screen.getByText('No exams found.')).toBeInTheDocument();
  });
});

describe('Integration Tests', () => {
  test('teacher dashboard loads and displays exam statistics', async () => {
    const mockLogout = jest.fn();
    
    render(<TeacherDashboard user={mockTeacher} onLogout={mockLogout} />);
    
    // Wait for initial load - use more specific selector
    await waitFor(() => {
      const totalExamsCard = screen.getByText('Total Exams').closest('.stat-card');
      expect(totalExamsCard?.querySelector('.stat-number')).toHaveTextContent('2');
    });
    
    // Check that other stats are displayed
    expect(screen.getByText('Upcoming')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
  });

  test('exam creation form validates and shows errors', async () => {
    const mockOnExamCreated = jest.fn();
    
    render(<ExamCreationForm user={mockTeacher} onExamCreated={mockOnExamCreated} />);
    
    // Try to submit empty form
    fireEvent.click(screen.getByText('Create Exam'));
    
    await waitFor(() => {
      expect(screen.getByText('Exam title is required')).toBeInTheDocument();
      expect(screen.getByText('Start time is required')).toBeInTheDocument();
      expect(screen.getByText('End time is required')).toBeInTheDocument();
    });
    
    expect(mockOnExamCreated).not.toHaveBeenCalled();
  });
});