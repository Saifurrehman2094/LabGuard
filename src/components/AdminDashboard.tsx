import React from 'react';

interface AdminDashboardProps {
    currentUser: any;
    onLogout: () => void;
}

const AdminDashboard: React.FC<AdminDashboardProps> = ({ currentUser, onLogout }) => {
    return (
        <div>
            <h1>Admin Dashboard</h1>
            <p>Welcome, {currentUser.fullName}</p>
            <button onClick={onLogout}>Logout</button>
        </div>
    );
};

export default AdminDashboard;