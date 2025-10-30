import React, { useState, useEffect } from 'react';
import FaceAuth from './FaceAuth';
import WebStorageService from '../services/webStorage';
import './Login.css';

interface LoginProps {
  onLoginSuccess: (user: any) => void;
}

interface LoginFormData {
  username: string;
  password: string;
}

interface LoginError {
  field?: string;
  message: string;
}

interface AuthState {
  step: 'credentials' | 'face-auth' | 'success';
  sessionId?: string;
  user?: any;
}

const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
  const [formData, setFormData] = useState<LoginFormData>({
    username: '',
    password: ''
  });
  const [errors, setErrors] = useState<LoginError[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [deviceId, setDeviceId] = useState<string>('');
  const [authState, setAuthState] = useState<AuthState>({
    step: 'credentials'
  });

  // Check if running in Electron
  const isElectron = () => {
    return typeof window !== 'undefined' &&
      (window as any).electronAPI &&
      typeof (window as any).electronAPI.login === 'function';
  };

  // Get device ID on component mount
  useEffect(() => {
    const getDeviceId = async () => {
      try {
        if (isElectron()) {
          const result = await (window as any).electronAPI.getDeviceId();
          if (result.success) {
            setDeviceId(result.deviceId);
          }
        } else {
          // Development mode - use a mock device ID
          setDeviceId('dev-device-12345');
        }
      } catch (error) {
        console.error('Failed to get device ID:', error);
        setDeviceId('fallback-device-id');
      }
    };

    getDeviceId();
  }, []);

  // Form validation
  const validateForm = (): LoginError[] => {
    const newErrors: LoginError[] = [];

    if (!formData.username.trim()) {
      newErrors.push({
        field: 'username',
        message: 'Username is required'
      });
    }

    if (!formData.password.trim()) {
      newErrors.push({
        field: 'password',
        message: 'Password is required'
      });
    }

    if (formData.username.trim().length < 3) {
      newErrors.push({
        field: 'username',
        message: 'Username must be at least 3 characters long'
      });
    }

    if (formData.password.trim().length < 4) {
      newErrors.push({
        field: 'password',
        message: 'Password must be at least 4 characters long'
      });
    }

    return newErrors;
  };

  // Handle input changes
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));

    // Clear field-specific errors when user starts typing
    if (errors.some(error => error.field === name)) {
      setErrors(prev => prev.filter(error => error.field !== name));
    }
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Clear previous errors
    setErrors([]);

    // Validate form
    const validationErrors = validateForm();
    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }

    setIsLoading(true);

    try {
      console.log('Login attempt started');
      console.log('isElectron():', isElectron());
      console.log('electronAPI exists:', !!(window as any).electronAPI);

      if (isElectron()) {
        console.log('Using Electron login');

        // Verify electronAPI is available
        if (!(window as any).electronAPI) {
          console.error('electronAPI is not available on window object');
          throw new Error('Electron API not available. Please restart the application.');
        }

        if (typeof (window as any).electronAPI.login !== 'function') {
          console.error('electronAPI.login is not a function:', typeof (window as any).electronAPI.login);
          throw new Error('Login function not available. Please restart the application.');
        }

        console.log('Calling electronAPI.login...');

        // Call authentication service through Electron API
        const result = await (window as any).electronAPI.login({
          username: formData.username.trim(),
          password: formData.password.trim()
        });

        console.log('Login result:', result);

        if (result.success) {
          if (result.requiresFaceAuth) {
            // Credentials verified, now need face authentication
            setAuthState({
              step: 'face-auth',
              sessionId: result.sessionId,
              user: result.user
            });
          } else {
            // Login complete (no face auth required)
            onLoginSuccess({
              ...result.user,
              token: result.token,
              deviceId: result.deviceId,
              faceVerified: result.faceVerified || false
            });
          }
        } else {
          // Login failed
          setErrors([{
            message: result.error || 'Login failed. Please check your credentials.'
          }]);
        }
      } else {
        // Development mode - show message that Electron is required
        setErrors([{
          message: 'Development mode detected. Please use "npm run dev" to start both React and Electron for full functionality. The web-only version has limited features.'
        }]);

        // For basic testing, allow admin login only
        if (formData.username.trim() === 'admin' && formData.password.trim() === 'admin123') {
          onLoginSuccess({
            userId: 'admin-web',
            username: 'admin',
            role: 'admin',
            fullName: 'System Administrator (Web Mode)',
            token: 'web-token-admin',
            deviceId: deviceId || 'web-device',
            faceVerified: false
          });
        // Development mode - use WebStorageService
        const webStorage = WebStorageService.getInstance();
        const result = await webStorage.login(formData.username.trim(), formData.password.trim());

        if (result.success && result.user) {
          onLoginSuccess({
            ...result.user,
            token: 'web-token-123',
            deviceId: deviceId,
            faceVerified: false
          });
        } else {
          setErrors([{
            message: result.error || 'Invalid credentials. Use admin/admin123, teacher1/password123 or student1/password123 for development.'
          }]);
        }
      }
    } catch (error) {
      console.error('Login error:', error);
      setErrors([{
        message: 'An unexpected error occurred. Please try again.'
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle successful face authentication
  const handleFaceAuthSuccess = (result: any) => {
    console.log('Face authentication successful:', result);
    setAuthState({ step: 'success' });

    // Complete login with face verification
    onLoginSuccess({
      ...result.user,
      token: result.token,
      deviceId: result.deviceId,
      faceVerified: true
    });
  };

  // Handle failed face authentication
  const handleFaceAuthFailure = (error: string) => {
    console.error('Face authentication failed:', error);
    setErrors([{
      message: `Face authentication failed: ${error}`
    }]);

    // Reset to credentials step
    setAuthState({ step: 'credentials' });
    setIsLoading(false);
  };

  // Handle face authentication cancellation
  const handleFaceAuthCancel = () => {
    console.log('Face authentication cancelled');
    setAuthState({ step: 'credentials' });
    setIsLoading(false);
  };



  // Get field-specific error
  const getFieldError = (fieldName: string): string | undefined => {
    const error = errors.find(err => err.field === fieldName);
    return error?.message;
  };

  // Get general errors (not field-specific)
  const getGeneralErrors = (): LoginError[] => {
    return errors.filter(err => !err.field);
  };

  // Render face authentication if needed
  if (authState.step === 'face-auth' && authState.sessionId && authState.user) {
    return (
      <div className="login-container">
        <FaceAuth
          sessionId={authState.sessionId}
          username={authState.user.username}
          onAuthSuccess={handleFaceAuthSuccess}
          onAuthFailure={handleFaceAuthFailure}
          onCancel={handleFaceAuthCancel}
        />
      </div>
    );
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <h1>LAB-Guard</h1>
          <p>Exam Monitoring System</p>
          {deviceId && (
            <div className="device-info">
              <small>Device ID: {deviceId.substring(0, 8)}...</small>
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          {/* General error messages */}
          {getGeneralErrors().length > 0 && (
            <div className="error-messages">
              {getGeneralErrors().map((error, index) => (
                <div key={index} className="error-message">
                  {error.message}
                </div>
              ))}
            </div>
          )}

          {/* Username field */}
          <div className="form-group">
            <label htmlFor="username">Username</label>
            <input
              type="text"
              id="username"
              name="username"
              value={formData.username}
              onChange={handleInputChange}
              className={getFieldError('username') ? 'error' : ''}
              placeholder="Enter your username"
              disabled={isLoading}
              autoComplete="username"
            />
            {getFieldError('username') && (
              <div className="field-error">{getFieldError('username')}</div>
            )}
          </div>

          {/* Password field */}
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              name="password"
              value={formData.password}
              onChange={handleInputChange}
              className={getFieldError('password') ? 'error' : ''}
              placeholder="Enter your password"
              disabled={isLoading}
              autoComplete="current-password"
            />
            {getFieldError('password') && (
              <div className="field-error">{getFieldError('password')}</div>
            )}
          </div>

          {/* Submit button */}
          <button
            type="submit"
            className="login-button"
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <span className="loading-spinner"></span>
                Logging in...
              </>
            ) : (
              'Login'
            )}
          </button>
        </form>

        {/* Login help text */}
        <div className="login-help">
          <p>Use your assigned username and password to access the system.</p>
          <p><small>For testing: admin/admin123, teacher1/password123, student1/password123</small></p>
        </div>
      </div>
    </div>
  );
};

export default Login;