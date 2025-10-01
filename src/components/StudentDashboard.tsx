// Student Dashboard Component - Placeholder
// This will be implemented in task 6
import React from 'react';

interface User {
  userId: string;
  username: string;
  role: 'teacher' | 'student';
  fullName: string;
  token?: string;
  deviceId?: string;
}

interface StudentDashboardProps {
  user: User;
  onLogout: () => void;
}

const StudentDashboard: React.FC<StudentDashboardProps> = ({ user, onLogout }) => {
  return (
    <div style={{ padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h2>Student Dashboard</h2>
          <p>Welcome, {user.fullName}!</p>
        </div>
        <button onClick={onLogout} style={{ padding: '8px 16px', cursor: 'pointer' }}>
          Logout
        </button>
      </div>
      <p>This dashboard will be implemented in task 6.</p>
    </div>
  );
};

export default StudentDashboard;