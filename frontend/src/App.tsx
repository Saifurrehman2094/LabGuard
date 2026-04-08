import React, { useState, useEffect } from 'react';
import './App.css';
import Login from './components/Login';
import TeacherDashboard from './components/TeacherDashboard';
import StudentDashboard from './components/StudentDashboard';
import AdminPanel from './components/AdminPanel';
import SetupWizard from './components/SetupWizard';

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
        const api = (window as any).electronAPI;
        
        // Stop monitoring services before logout (safety measure)
        try {
          // Stop app-level monitoring
          try {
            const monitoringStatus = await api.getMonitoringStatus();
            // monitoring:get-status returns { success: true, isMonitoring: ..., ... } (spread status)
            if (monitoringStatus && monitoringStatus.success && monitoringStatus.isMonitoring) {
              console.log('[Logout] Stopping app-level monitoring...');
              await api.stopMonitoring().catch((err: any) => {
                console.warn('[Logout] Error stopping app-level monitoring:', err);
              });
            }
          } catch (monitoringErr) {
            console.warn('[Logout] Could not check/stop app-level monitoring:', monitoringErr);
          }

          // Stop camera monitoring
          try {
            const cameraApi = api.camera;
            if (cameraApi) {
              const cameraStatus = await cameraApi.getStatus();
              // camera:get-status returns { success: true, status: { isMonitoring: ..., ... } }
              if (cameraStatus && cameraStatus.success && cameraStatus.status?.isMonitoring) {
                console.log('[Logout] Stopping camera monitoring...');
                await cameraApi.stopTest().catch((err: any) => {
                  console.warn('[Logout] Error stopping camera monitoring:', err);
                });
              }
            }
          } catch (cameraErr) {
            console.warn('[Logout] Could not check/stop camera monitoring:', cameraErr);
          }
        } catch (monitoringError) {
          console.warn('[Logout] Error stopping monitoring services:', monitoringError);
          // Continue with logout even if monitoring stop fails
        }

        // Perform logout (backend will also stop monitoring, but this is a safety measure)
        await api.logout();
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
      <div className="App app-loading">
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
      <div className="App app-setup">
        <SetupWizard onSetupComplete={handleSetupComplete} />
      </div>
    );
  }

  // Show login if no user is authenticated
  if (!user) {
    return (
      <div className="App app-auth">
        <Login onLoginSuccess={handleLoginSuccess} />
      </div>
    );
  }

  // Show appropriate dashboard based on user role
  return (
    <div className={`App app-role-${user.role}`}>
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