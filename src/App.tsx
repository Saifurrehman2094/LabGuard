import React, { useState, useEffect } from 'react';
import './App.css';
import Login from './components/Login';
import TeacherDashboard from './components/TeacherDashboard';
import StudentDashboard from './components/StudentDashboard';
import AdminPanel from './components/AdminPanel';

interface User {
  userId: string;
  username: string;
  role: 'admin' | 'teacher' | 'student';
  fullName: string;
  token?: string;
  deviceId?: string;
  faceVerified?: boolean;
}

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showSetupWizard, setShowSetupWizard] = useState(false);
  const [systemStatus, setSystemStatus] = useState<any>(null);

  // Check if running in Electron
  const isElectron = () => {
    return !!(window as any).electronAPI;
  };

  // Check for existing session and system status on app start
  useEffect(() => {
    const initializeApp = async () => {
      try {
        if (isElectron()) {
          // Check existing session
          const sessionResult = await (window as any).electronAPI.getCurrentUser();
          if (sessionResult.success && sessionResult.user) {
            setUser(sessionResult.user);
          }

          // Check system setup status
          const statusResult = await (window as any).electronAPI.getSystemSetupStatus();
          if (statusResult.success) {
            setSystemStatus(statusResult.data);

            // Show setup wizard if no non-admin users exist and no user is logged in
            if (!statusResult.data.hasNonAdminUsers && !sessionResult.user) {
              setShowSetupWizard(true);
            }
          }
        }
      } catch (error) {
        console.error('Failed to initialize app:', error);
      } finally {
        setIsLoading(false);
      }
    };

    initializeApp();
  }, []);

  // Handle successful login
  const handleLoginSuccess = (userData: User) => {
    setUser(userData);
  };

  // Handle logout
  const handleLogout = async () => {
    try {
      if (isElectron()) {
        await (window as any).electronAPI.logout();
      }
      // Always clear user state
      setUser(null);

      // Check if we should show setup wizard again
      if (systemStatus && !systemStatus.hasNonAdminUsers) {
        setShowSetupWizard(true);
      }
    } catch (error) {
      console.error('Logout error:', error);
      // Force logout even if API call fails
      setUser(null);
    }
  };

  // Handle setup wizard completion
  const handleSetupComplete = () => {
    setShowSetupWizard(false);
  };

  // Show loading screen while checking session
  if (isLoading) {
    return (
      <div className="App">
        <div className="loading-container">
          <div className="loading-spinner-large"></div>
          <p>Loading LAB-Guard...</p>
        </div>
      </div>
    );
  }

  // Show setup wizard if needed
  if (showSetupWizard) {
    return (
      <div className="App">
        <SetupWizard onSetupComplete={handleSetupComplete} />
      </div>
    );
  }

  // Show login if no user is authenticated
  if (!user) {
    return (
      <div className="App">
        <Login onLoginSuccess={handleLoginSuccess} />
      </div>
    );
  }

  // Show appropriate dashboard based on user role
  return (
    <div className="App">
      {user.role === 'admin' ? (
        <AdminPanel currentUser={user} onLogout={handleLogout} />
      ) : user.role === 'teacher' ? (
        <TeacherDashboard user={user} onLogout={handleLogout} />
      ) : (
        <StudentDashboard user={user} onLogout={handleLogout} />
      )}
    </div>
  );
}

export default App;