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

  // Check if running in Electron
  const isElectron = () => {
    return !!(window as any).electronAPI;
  };

  // Check for existing session on app start
  useEffect(() => {
    const checkExistingSession = async () => {
      try {
        if (isElectron()) {
          const result = await (window as any).electronAPI.getCurrentUser();
          if (result.success && result.user) {
            setUser(result.user);
          }
        }
        // In development mode, no existing session to check
      } catch (error) {
        console.error('Failed to check existing session:', error);
      } finally {
        setIsLoading(false);
      }
    };

    checkExistingSession();
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
    } catch (error) {
      console.error('Logout error:', error);
      // Force logout even if API call fails
      setUser(null);
    }
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