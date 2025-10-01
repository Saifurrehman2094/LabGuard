import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import Login from '../components/Login';

// Mock the electronAPI
const mockElectronAPI = {
  login: jest.fn(),
  getDeviceId: jest.fn()
};

// Setup window.electronAPI mock
Object.defineProperty(window, 'electronAPI', {
  value: mockElectronAPI,
  writable: true
});

describe('Login Component', () => {
  const mockOnLoginSuccess = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockElectronAPI.getDeviceId.mockResolvedValue({
      success: true,
      deviceId: 'test-device-123'
    });
  });

  test('renders login form correctly', async () => {
    render(<Login onLoginSuccess={mockOnLoginSuccess} />);

    expect(screen.getByText('LAB-Guard')).toBeInTheDocument();
    expect(screen.getByText('Exam Monitoring System')).toBeInTheDocument();
    expect(screen.getByLabelText('Username')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Login' })).toBeInTheDocument();
    expect(screen.getByText('Login as Teacher')).toBeInTheDocument();
    expect(screen.getByText('Login as Student')).toBeInTheDocument();

    // Wait for device ID to load
    await waitFor(() => {
      expect(screen.getByText(/Device ID: test-dev/)).toBeInTheDocument();
    });
  });

  test('validates required fields', async () => {
    render(<Login onLoginSuccess={mockOnLoginSuccess} />);

    const loginButton = screen.getByRole('button', { name: 'Login' });
    fireEvent.click(loginButton);

    await waitFor(() => {
      expect(screen.getByText('Username is required')).toBeInTheDocument();
      expect(screen.getByText('Password is required')).toBeInTheDocument();
    });
  });

  test('validates minimum field lengths', async () => {
    render(<Login onLoginSuccess={mockOnLoginSuccess} />);

    const usernameInput = screen.getByLabelText('Username');
    const passwordInput = screen.getByLabelText('Password');
    const loginButton = screen.getByRole('button', { name: 'Login' });

    fireEvent.change(usernameInput, { target: { value: 'ab' } });
    fireEvent.change(passwordInput, { target: { value: '123' } });
    fireEvent.click(loginButton);

    await waitFor(() => {
      expect(screen.getByText('Username must be at least 3 characters long')).toBeInTheDocument();
      expect(screen.getByText('Password must be at least 4 characters long')).toBeInTheDocument();
    });
  });

  test('successful login with valid credentials in Electron', async () => {
    const mockUser = {
      userId: 'user123',
      username: 'teacher1',
      role: 'teacher',
      fullName: 'Dr. John Smith'
    };

    mockElectronAPI.login.mockResolvedValue({
      success: true,
      user: mockUser,
      token: 'jwt-token-123',
      deviceId: 'device-456'
    });

    render(<Login onLoginSuccess={mockOnLoginSuccess} />);

    const usernameInput = screen.getByLabelText('Username');
    const passwordInput = screen.getByLabelText('Password');
    const loginButton = screen.getByRole('button', { name: 'Login' });

    fireEvent.change(usernameInput, { target: { value: 'teacher1' } });
    fireEvent.change(passwordInput, { target: { value: 'password123' } });
    fireEvent.click(loginButton);

    await waitFor(() => {
      expect(mockElectronAPI.login).toHaveBeenCalledWith({
        username: 'teacher1',
        password: 'password123'
      });
      expect(mockOnLoginSuccess).toHaveBeenCalledWith({
        ...mockUser,
        token: 'jwt-token-123',
        deviceId: 'device-456'
      });
    });
  });

  test('handles login failure', async () => {
    mockElectronAPI.login.mockResolvedValue({
      success: false,
      error: 'Invalid credentials'
    });

    render(<Login onLoginSuccess={mockOnLoginSuccess} />);

    const usernameInput = screen.getByLabelText('Username');
    const passwordInput = screen.getByLabelText('Password');
    const loginButton = screen.getByRole('button', { name: 'Login' });

    fireEvent.change(usernameInput, { target: { value: 'wronguser' } });
    fireEvent.change(passwordInput, { target: { value: 'wrongpass' } });
    fireEvent.click(loginButton);

    await waitFor(() => {
      expect(screen.getByText('Invalid credentials')).toBeInTheDocument();
      expect(mockOnLoginSuccess).not.toHaveBeenCalled();
    });
  });

  test('quick login buttons work correctly', async () => {
    const mockUser = {
      userId: 'user123',
      username: 'teacher1',
      role: 'teacher',
      fullName: 'Dr. John Smith'
    };

    mockElectronAPI.login.mockResolvedValue({
      success: true,
      user: mockUser,
      token: 'jwt-token-123',
      deviceId: 'device-456'
    });

    render(<Login onLoginSuccess={mockOnLoginSuccess} />);

    const teacherButton = screen.getByText('Login as Teacher');
    fireEvent.click(teacherButton);

    // Wait for the form to update and login to complete
    await waitFor(() => {
      expect(screen.getByDisplayValue('teacher1')).toBeInTheDocument();
      expect(screen.getByDisplayValue('password123')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(mockElectronAPI.login).toHaveBeenCalledWith({
        username: 'teacher1',
        password: 'password123'
      });
      expect(mockOnLoginSuccess).toHaveBeenCalled();
    });
  });

  test('works in development mode without electronAPI', async () => {
    // Store original electronAPI
    const originalElectronAPI = (window as any).electronAPI;
    
    // Remove electronAPI to simulate development mode
    (window as any).electronAPI = undefined;

    render(<Login onLoginSuccess={mockOnLoginSuccess} />);

    const usernameInput = screen.getByLabelText('Username');
    const passwordInput = screen.getByLabelText('Password');
    const loginButton = screen.getByRole('button', { name: 'Login' });

    fireEvent.change(usernameInput, { target: { value: 'teacher1' } });
    fireEvent.change(passwordInput, { target: { value: 'password123' } });
    fireEvent.click(loginButton);

    await waitFor(() => {
      expect(mockOnLoginSuccess).toHaveBeenCalledWith({
        userId: 'dev-teacher-1',
        username: 'teacher1',
        role: 'teacher',
        fullName: 'Dr. John Smith',
        token: 'dev-token-123',
        deviceId: 'dev-device-12345'
      });
    });

    // Restore electronAPI for other tests
    (window as any).electronAPI = originalElectronAPI;
  });

  test('shows loading state during login', async () => {
    // Create a promise that we can control
    let resolveLogin: (value: any) => void;
    const loginPromise = new Promise(resolve => {
      resolveLogin = resolve;
    });

    mockElectronAPI.login.mockReturnValue(loginPromise);

    render(<Login onLoginSuccess={mockOnLoginSuccess} />);

    const usernameInput = screen.getByLabelText('Username');
    const passwordInput = screen.getByLabelText('Password');
    const loginButton = screen.getByRole('button', { name: 'Login' });

    fireEvent.change(usernameInput, { target: { value: 'teacher1' } });
    fireEvent.change(passwordInput, { target: { value: 'password123' } });
    fireEvent.click(loginButton);

    // Check loading state
    expect(screen.getByText('Logging in...')).toBeInTheDocument();
    expect(loginButton).toBeDisabled();

    // Resolve the login
    resolveLogin!({
      success: true,
      user: { userId: 'test', username: 'teacher1', role: 'teacher', fullName: 'Test' },
      token: 'token',
      deviceId: 'device'
    });

    await waitFor(() => {
      expect(screen.queryByText('Logging in...')).not.toBeInTheDocument();
    });
  });

  test('clears field errors when user starts typing', async () => {
    render(<Login onLoginSuccess={mockOnLoginSuccess} />);

    const usernameInput = screen.getByLabelText('Username');
    const loginButton = screen.getByRole('button', { name: 'Login' });

    // Trigger validation error
    fireEvent.click(loginButton);

    await waitFor(() => {
      expect(screen.getByText('Username is required')).toBeInTheDocument();
    });

    // Start typing to clear error
    fireEvent.change(usernameInput, { target: { value: 'a' } });

    await waitFor(() => {
      expect(screen.queryByText('Username is required')).not.toBeInTheDocument();
    });
  });
});