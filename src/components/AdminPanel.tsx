import React, { useState, useEffect, useCallback } from 'react';
import FaceCapture from './FaceCapture';
import './AdminDashboard.css';

interface User {
    user_id: string;
    username: string;
    role: string;
    full_name: string;
    email?: string;
    has_registered_face: number;
    face_registration_date?: string;
    created_at: string;
    created_by?: string;
    last_login?: string;
}

interface AdminPanelProps {
    currentUser: any;
    onLogout: () => void;
}

const AdminPanel: React.FC<AdminPanelProps> = ({ currentUser, onLogout }) => {
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'users' | 'settings' | 'logs' | 'stats'>('users');

    // Settings state
    const [systemSettings, setSystemSettings] = useState({
        face_matching_threshold: 0.45,
        max_login_attempts: 5,
        session_timeout: 28800000
    });

    // Statistics state
    const [faceStats, setFaceStats] = useState<any>(null);

    // Audit logs state
    const [auditLogs, setAuditLogs] = useState<any[]>([]);

    // Modal states
    const [showUserForm, setShowUserForm] = useState(false);
    const [showFaceRegistration, setShowFaceRegistration] = useState(false);
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [registeringUserId, setRegisteringUserId] = useState<string | null>(null);

    // Form state
    const [userFormData, setUserFormData] = useState({
        username: '',
        password: '',
        role: 'student',
        fullName: '',
        email: ''
    });

    // Face registration state
    const [capturedEmbeddings, setCapturedEmbeddings] = useState<number[][]>([]);
    const [captureConfidences, setCaptureConfidences] = useState<number[]>([]);
    const [registeringUserName, setRegisteringUserName] = useState<string>('');

    // Load users
    const loadUsers = useCallback(async () => {
        try {
            setLoading(true);
            const result = await window.electronAPI.getUsers();

            if (result.success) {
                setUsers(result.users);
            } else {
                setError(result.error || 'Failed to load users');
            }
        } catch (err) {
            setError('Failed to load users');
            console.error('Load users error:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    // Load system settings
    const loadSystemSettings = useCallback(async () => {
        try {
            const result = await window.electronAPI.getSystemSettings();
            if (result.success) {
                setSystemSettings(result.settings);
            }
        } catch (err) {
            console.error('Load settings error:', err);
        }
    }, []);

    // Load face statistics
    const loadFaceStats = useCallback(async () => {
        try {
            const result = await window.electronAPI.getFaceStats();
            if (result.success) {
                setFaceStats(result.stats);
            }
        } catch (err) {
            console.error('Load face stats error:', err);
        }
    }, []);

    // Load audit logs
    const loadAuditLogs = useCallback(async () => {
        try {
            const result = await window.electronAPI.getAuditLogs({ limit: 100 });
            if (result.success) {
                setAuditLogs(result.logs);
            }
        } catch (err) {
            console.error('Load audit logs error:', err);
        }
    }, []);

    // Handle settings update
    const handleSettingsUpdate = async () => {
        try {
            setLoading(true);
            const result = await window.electronAPI.updateSystemSettings(systemSettings);
            if (result.success) {
                // Settings updated successfully
                setError(null);
            } else {
                setError(result.error || 'Failed to update settings');
            }
        } catch (err) {
            setError('Failed to update settings');
            console.error('Settings update error:', err);
        } finally {
            setLoading(false);
        }
    };

    // Handle user deletion
    const handleDeleteUser = async (userId: string, username: string) => {
        if (!window.confirm(`Are you sure you want to delete user "${username}"? This action cannot be undone.`)) {
            return;
        }

        try {
            setLoading(true);
            const result = await window.electronAPI.deleteUser(userId);

            if (result.success) {
                await loadUsers(); // Reload users list
                setError(null);
            } else {
                setError(result.error || 'Failed to delete user');
            }
        } catch (err) {
            setError('Failed to delete user');
            console.error('Delete user error:', err);
        } finally {
            setLoading(false);
        }
    };

    // Start editing user
    const startEditUser = (user: User) => {
        setEditingUser(user);
        setUserFormData({
            username: user.username,
            password: '',
            role: user.role,
            fullName: user.full_name,
            email: user.email || ''
        });
        setShowUserForm(true);
    };

    // Start face registration
    const startFaceRegistration = (userId: string) => {
        const user = users.find(u => u.user_id === userId);
        setRegisteringUserId(userId);
        setRegisteringUserName(user?.full_name || 'Unknown User');
        setCapturedEmbeddings([]);
        setCaptureConfidences([]);
        setShowFaceRegistration(true);
    };

    // Handle user form submission
    const handleUserSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        try {
            setLoading(true);

            if (editingUser) {
                // Update existing user
                const updateData: any = {
                    fullName: userFormData.fullName,
                    email: userFormData.email
                };

                if (userFormData.password) {
                    updateData.password = userFormData.password;
                }

                const result = await window.electronAPI.updateUser(editingUser.user_id, updateData);

                if (result.success) {
                    await loadUsers();
                    setShowUserForm(false);
                    setEditingUser(null);
                    resetUserForm();
                    setError(null);
                } else {
                    setError(result.error || 'Failed to update user');
                }
            } else {
                // Create new user
                const result = await window.electronAPI.createUser(userFormData);

                if (result.success) {
                    await loadUsers();
                    setShowUserForm(false);
                    resetUserForm();
                    setError(null);
                } else {
                    setError(result.error || 'Failed to create user');
                }
            }
        } catch (err) {
            setError('Failed to save user');
            console.error('User submit error:', err);
        } finally {
            setLoading(false);
        }
    };

    // Reset user form
    const resetUserForm = () => {
        setUserFormData({
            username: '',
            password: '',
            role: 'student',
            fullName: '',
            email: ''
        });
    };

    // Close modals
    const closeUserForm = () => {
        setShowUserForm(false);
        setEditingUser(null);
        resetUserForm();
    };

    const closeFaceRegistration = () => {
        setShowFaceRegistration(false);
        setRegisteringUserId(null);
        setRegisteringUserName('');
        setCapturedEmbeddings([]);
        setCaptureConfidences([]);
    };

    // Handle face detection during registration
    const handleFaceDetected = useCallback((embedding: number[], confidence: number) => {
        setCapturedEmbeddings(prev => [...prev, embedding]);
        setCaptureConfidences(prev => [...prev, confidence]);
    }, []);

    // Complete face registration
    const completeFaceRegistration = async () => {
        if (!registeringUserId || capturedEmbeddings.length === 0) {
            setError('No face data captured');
            return;
        }

        try {
            setLoading(true);

            const result = await window.electronAPI.registerMultipleFaces(
                registeringUserId,
                capturedEmbeddings,
                captureConfidences
            );

            if (result.success) {
                await loadUsers(); // Reload users to update face registration status
                await loadFaceStats(); // Update statistics
                closeFaceRegistration();
                setError(null);
            } else {
                setError(result.error || 'Failed to register face');
            }
        } catch (err) {
            setError('Failed to register face');
            console.error('Face registration error:', err);
        } finally {
            setLoading(false);
        }
    };

    // Handle face capture errors
    const handleFaceCaptureError = useCallback((error: string) => {
        setError(`Face capture error: ${error}`);
    }, []);

    // Initial data load
    useEffect(() => {
        loadUsers();
        loadSystemSettings();
        loadFaceStats();
        loadAuditLogs();
    }, [loadUsers, loadSystemSettings, loadFaceStats, loadAuditLogs]);

    return (
        <div className="admin-dashboard">
            <div className="admin-header">
                <div className="admin-header-content">
                    <h1>Admin Dashboard</h1>
                    <div className="admin-user-info">
                        <span>Welcome, {currentUser.fullName}</span>
                        <button onClick={onLogout} className="logout-btn">Logout</button>
                    </div>
                </div>

                <div className="admin-tabs">
                    <button
                        className={`tab-btn ${activeTab === 'users' ? 'active' : ''}`}
                        onClick={() => setActiveTab('users')}
                    >
                        Users
                    </button>
                    <button
                        className={`tab-btn ${activeTab === 'settings' ? 'active' : ''}`}
                        onClick={() => setActiveTab('settings')}
                    >
                        Settings
                    </button>
                    <button
                        className={`tab-btn ${activeTab === 'stats' ? 'active' : ''}`}
                        onClick={() => setActiveTab('stats')}
                    >
                        Statistics
                    </button>
                    <button
                        className={`tab-btn ${activeTab === 'logs' ? 'active' : ''}`}
                        onClick={() => setActiveTab('logs')}
                    >
                        Audit Logs
                    </button>
                </div>
            </div>

            {error && (
                <div className="error-banner">
                    <span>{error}</span>
                    <button onClick={() => setError(null)}>×</button>
                </div>
            )}

            <div className="admin-content">
                {activeTab === 'users' && (
                    <div className="users-tab">
                        <div className="users-header">
                            <h2>User Management</h2>
                            <div className="users-actions">
                                <button
                                    onClick={() => setShowUserForm(true)}
                                    className="btn btn-primary"
                                    disabled={loading}
                                >
                                    Add User
                                </button>
                                <button
                                    onClick={() => {
                                        const input = document.createElement('input');
                                        input.type = 'file';
                                        input.accept = '.csv';
                                        input.onchange = (e) => {
                                            const file = (e.target as HTMLInputElement).files?.[0];
                                            if (file) {
                                                alert(`Selected file: ${file.name}. CSV processing functionality will be implemented in the next update.`);
                                            }
                                        };
                                        input.click();
                                    }}
                                    className="btn btn-secondary"
                                    disabled={loading}
                                >
                                    Bulk Upload
                                </button>
                            </div>
                        </div>

                        <div className="users-table-container">
                            <table className="users-table">
                                <thead>
                                    <tr>
                                        <th>Username</th>
                                        <th>Full Name</th>
                                        <th>Role</th>
                                        <th>Email</th>
                                        <th>Face Registered</th>
                                        <th>Last Login</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {users.map(user => (
                                        <tr key={user.user_id}>
                                            <td>{user.username}</td>
                                            <td>{user.full_name}</td>
                                            <td>
                                                <span className={`role-badge role-${user.role}`}>
                                                    {user.role}
                                                </span>
                                            </td>
                                            <td>{user.email || '-'}</td>
                                            <td>
                                                <span className={`face-status ${user.has_registered_face ? 'registered' : 'not-registered'}`}>
                                                    {user.has_registered_face ? '✓ Yes' : '✗ No'}
                                                </span>
                                            </td>
                                            <td>
                                                {user.last_login
                                                    ? new Date(user.last_login).toLocaleDateString()
                                                    : 'Never'
                                                }
                                            </td>
                                            <td>
                                                <div className="user-actions">
                                                    <button
                                                        onClick={() => startEditUser(user)}
                                                        className="btn btn-sm btn-secondary"
                                                        disabled={loading}
                                                    >
                                                        Edit
                                                    </button>
                                                    <button
                                                        onClick={() => startFaceRegistration(user.user_id)}
                                                        className="btn btn-sm btn-primary"
                                                        disabled={loading}
                                                    >
                                                        Face
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteUser(user.user_id, user.username)}
                                                        className="btn btn-sm btn-danger"
                                                        disabled={user.user_id === currentUser.userId || loading}
                                                    >
                                                        Delete
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {activeTab === 'settings' && (
                    <div className="settings-tab">
                        <h2>System Settings</h2>

                        <div className="settings-form">
                            <div className="setting-group">
                                <label>Face Matching Threshold</label>
                                <input
                                    type="number"
                                    min="0"
                                    max="1"
                                    step="0.01"
                                    value={systemSettings.face_matching_threshold}
                                    onChange={(e) => setSystemSettings(prev => ({
                                        ...prev,
                                        face_matching_threshold: parseFloat(e.target.value)
                                    }))}
                                />
                                <small>Lower values = stricter matching (0.3-0.6 recommended)</small>
                            </div>

                            <div className="setting-group">
                                <label>Max Login Attempts</label>
                                <input
                                    type="number"
                                    min="1"
                                    max="10"
                                    value={systemSettings.max_login_attempts}
                                    onChange={(e) => setSystemSettings(prev => ({
                                        ...prev,
                                        max_login_attempts: parseInt(e.target.value)
                                    }))}
                                />
                            </div>

                            <div className="setting-group">
                                <label>Session Timeout (hours)</label>
                                <input
                                    type="number"
                                    min="1"
                                    max="24"
                                    value={systemSettings.session_timeout / 3600000}
                                    onChange={(e) => setSystemSettings(prev => ({
                                        ...prev,
                                        session_timeout: parseInt(e.target.value) * 3600000
                                    }))}
                                />
                            </div>

                            <button
                                onClick={handleSettingsUpdate}
                                className="btn btn-primary"
                                disabled={loading}
                            >
                                Save Settings
                            </button>
                        </div>
                    </div>
                )}

                {activeTab === 'stats' && (
                    <div className="stats-tab">
                        <h2>System Statistics</h2>

                        {faceStats && (
                            <div className="stats-grid">
                                <div className="stat-card">
                                    <h3>Total Users</h3>
                                    <div className="stat-value">{faceStats.totalUsers}</div>
                                </div>

                                <div className="stat-card">
                                    <h3>Face Registered</h3>
                                    <div className="stat-value">{faceStats.registeredUsers}</div>
                                </div>

                                <div className="stat-card">
                                    <h3>Registration Rate</h3>
                                    <div className="stat-value">{faceStats.registrationRate}%</div>
                                </div>

                                <div className="stat-card">
                                    <h3>Unregistered</h3>
                                    <div className="stat-value">{faceStats.unregisteredUsers}</div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'logs' && (
                    <div className="logs-tab">
                        <h2>Audit Logs</h2>

                        <div className="logs-table-container">
                            <table className="logs-table">
                                <thead>
                                    <tr>
                                        <th>Timestamp</th>
                                        <th>User</th>
                                        <th>Action</th>
                                        <th>Details</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {auditLogs.map((log, index) => (
                                        <tr key={index}>
                                            <td>{new Date(log.timestamp).toLocaleString()}</td>
                                            <td>{log.username || 'System'}</td>
                                            <td>
                                                <span className={`action-badge action-${log.action.toLowerCase().replace('_', '-')}`}>
                                                    {log.action}
                                                </span>
                                            </td>
                                            <td>
                                                {log.details && typeof log.details === 'object'
                                                    ? JSON.stringify(log.details, null, 2)
                                                    : log.details || '-'
                                                }
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>

            {/* User Form Modal */}
            {showUserForm && (
                <div className="modal-overlay">
                    <div className="modal">
                        <div className="modal-header">
                            <h3>{editingUser ? 'Edit User' : 'Add New User'}</h3>
                            <button onClick={closeUserForm} className="modal-close">×</button>
                        </div>

                        <form onSubmit={handleUserSubmit} className="user-form">
                            <div className="form-group">
                                <label>Username</label>
                                <input
                                    type="text"
                                    value={userFormData.username}
                                    onChange={(e) => setUserFormData(prev => ({ ...prev, username: e.target.value }))}
                                    required
                                    disabled={!!editingUser}
                                />
                            </div>

                            <div className="form-group">
                                <label>Password {editingUser && '(leave blank to keep current)'}</label>
                                <input
                                    type="password"
                                    value={userFormData.password}
                                    onChange={(e) => setUserFormData(prev => ({ ...prev, password: e.target.value }))}
                                    required={!editingUser}
                                />
                            </div>

                            <div className="form-group">
                                <label>Role</label>
                                <select
                                    value={userFormData.role}
                                    onChange={(e) => setUserFormData(prev => ({ ...prev, role: e.target.value }))}
                                    required
                                >
                                    <option value="student">Student</option>
                                    <option value="teacher">Teacher</option>
                                    <option value="admin">Admin</option>
                                </select>
                            </div>

                            <div className="form-group">
                                <label>Full Name</label>
                                <input
                                    type="text"
                                    value={userFormData.fullName}
                                    onChange={(e) => setUserFormData(prev => ({ ...prev, fullName: e.target.value }))}
                                    required
                                />
                            </div>

                            <div className="form-group">
                                <label>Email</label>
                                <input
                                    type="email"
                                    value={userFormData.email}
                                    onChange={(e) => setUserFormData(prev => ({ ...prev, email: e.target.value }))}
                                />
                            </div>

                            <div className="form-actions">
                                <button type="submit" className="btn btn-primary" disabled={loading}>
                                    {editingUser ? 'Update User' : 'Create User'}
                                </button>
                                <button type="button" onClick={closeUserForm} className="btn btn-secondary">
                                    Cancel
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Face Registration Modal */}
            {showFaceRegistration && (
                <div className="modal-overlay">
                    <div className="modal modal-large">
                        <div className="modal-header">
                            <h3>Face Registration</h3>
                            <button onClick={closeFaceRegistration} className="modal-close">×</button>
                        </div>

                        <div className="face-registration-content">
                            <p>Registering face for: <strong>{registeringUserName}</strong></p>
                            <p>Capture multiple face samples for better accuracy. Recommended: 3-5 captures.</p>

                            <FaceCapture
                                onFaceDetected={handleFaceDetected}
                                onError={handleFaceCaptureError}
                                isCapturing={true}
                                showBoundingBox={true}
                                captureMultiple={true}
                                maxCaptures={5}
                            />

                            <div className="capture-status">
                                <p>Captured: {capturedEmbeddings.length}/5 samples</p>
                                {capturedEmbeddings.length > 0 && (
                                    <div className="capture-quality">
                                        <p>Average confidence: {captureConfidences.length > 0
                                            ? (captureConfidences.reduce((sum, conf) => sum + conf, 0) / captureConfidences.length * 100).toFixed(1)
                                            : 0}%
                                        </p>
                                    </div>
                                )}
                            </div>

                            <div className="form-actions">
                                {capturedEmbeddings.length > 0 && (
                                    <button
                                        onClick={completeFaceRegistration}
                                        className="btn btn-primary"
                                        disabled={loading}
                                    >
                                        Complete Registration ({capturedEmbeddings.length} samples)
                                    </button>
                                )}
                                <button onClick={closeFaceRegistration} className="btn btn-secondary">
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {loading && (
                <div className="loading-overlay">
                    <div className="loading-spinner"></div>
                </div>
            )}
        </div>
    );
};

export default AdminPanel;