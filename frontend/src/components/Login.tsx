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
  const [showLoginForm, setShowLoginForm] = useState(false);
  const [showRegisterForm, setShowRegisterForm] = useState(false);
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
  const [showPassword, setShowPassword] = useState(false);

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

  // Handle admin quick login
  const handleAdminLogin = async () => {
    setFormData({ username: 'admin', password: 'admin123' });
    setIsLoading(true);
    setErrors([]);
    
    try {
      if (isElectron()) {
        const result = await (window as any).electronAPI.login({
          username: 'admin',
          password: 'admin123'
        });

        if (result.success) {
          if (result.requiresFaceAuth) {
            // Credentials verified, now need face authentication
            setAuthState({
              step: 'face-auth',
              sessionId: result.sessionId,
              user: result.user
            });
          } else {
            // Login complete
            onLoginSuccess({
              ...result.user,
              token: result.token,
              deviceId: result.deviceId,
              faceVerified: result.faceVerified || false
            });
          }
        } else {
          setErrors([{ message: result.error || 'Admin login failed' }]);
          setIsLoading(false);
        }
      } else {
        // Web mode - allow admin login for testing
        onLoginSuccess({
          userId: 'admin-web',
          username: 'admin',
          role: 'admin',
          fullName: 'System Administrator (Web Mode)',
          token: 'web-token-admin',
          deviceId: deviceId || 'web-device',
          faceVerified: false
        });
      }
    } catch (error) {
      console.error('Admin login error:', error);
      setErrors([{ message: 'Admin login failed. Please try again.' }]);
      setIsLoading(false);
    }
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

  // Landing page (Netflix style)
  if (!showLoginForm && !showRegisterForm) {
    return (
      <div className="landing-container">
        <div className="landing-background" style={{ backgroundImage: 'url(/images/image.png)' }}></div>
        <div className="landing-overlay"></div>
        
        <div className="landing-content">
          <div className="landing-header">
            <h1 className="landing-title">LAB-GUARD</h1>
            <p className="landing-subtitle">Secure Exam Monitoring System</p>
            <p className="landing-tagline">Ensuring Academic Integrity Through Advanced AI Monitoring</p>
          </div>

          {getGeneralErrors().length > 0 && (
            <div className="landing-error-messages">
              {getGeneralErrors().map((error, index) => (
                <div key={index} className="landing-error-message">
                  {error.message}
                </div>
              ))}
            </div>
          )}

          <div className="landing-actions">
            <button 
              className="action-btn primary-btn"
              onClick={() => setShowLoginForm(true)}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                <polyline points="10 17 15 12 10 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <line x1="15" y1="12" x2="3" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              Login
            </button>

            <button 
              className="action-btn secondary-btn"
              onClick={() => setShowRegisterForm(true)}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                <circle cx="8.5" cy="7" r="4" stroke="currentColor" strokeWidth="2"/>
                <line x1="20" y1="8" x2="20" y2="14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                <line x1="23" y1="11" x2="17" y2="11" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              Register
            </button>

            <button 
              className="action-btn admin-btn"
              onClick={handleAdminLogin}
              disabled={isLoading}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" stroke="currentColor" strokeWidth="2"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" stroke="currentColor" strokeWidth="2"/>
              </svg>
              {isLoading ? 'Logging in...' : 'Admin Login'}
            </button>
          </div>

          {deviceId && (
            <div className="landing-device-info">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="2" y="3" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="2"/>
                <path d="M8 21h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                <path d="M12 17v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              <span>Device: {deviceId.substring(0, 12)}...</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Login/Register Form
  return (
    <div className="login-container">
      <div className="login-card">
        <button className="back-btn" onClick={() => { setShowLoginForm(false); setShowRegisterForm(false); }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Back
        </button>

        <div className="login-header">
          <h1>{showRegisterForm ? 'Register' : 'Login'}</h1>
          <p className="subtitle">LAB-Guard Exam Monitoring System</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          {getGeneralErrors().length > 0 && (
            <div className="error-messages">
              {getGeneralErrors().map((error, index) => (
                <div key={index} className="error-message">
                  {error.message}
                </div>
              ))}
            </div>
          )}

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

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <div className="password-input-wrapper">
              <input
                type={showPassword ? "text" : "password"}
                id="password"
                name="password"
                value={formData.password}
                onChange={handleInputChange}
                className={getFieldError('password') ? 'error' : ''}
                placeholder="Enter your password"
                disabled={isLoading}
                autoComplete="current-password"
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <line x1="1" y1="1" x2="23" y2="23" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </button>
            </div>
            {getFieldError('password') && (
              <div className="field-error">{getFieldError('password')}</div>
            )}
          </div>

          <button
            type="submit"
            className="login-button"
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <span className="loading-spinner"></span>
                {showRegisterForm ? 'Registering...' : 'Logging in...'}
              </>
            ) : (
              showRegisterForm ? 'Register' : 'Login'
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;