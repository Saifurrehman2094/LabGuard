import React, { useState, useEffect, useCallback } from 'react';
import AdminCourseManagement from './AdminCourseManagement';
import FaceCapture from './FaceCapture';
import SnapshotConfig from './SnapshotConfig';
import './AdminDashboard.css';

function adminInitials(fullName: string): string {
    const t = fullName.trim();
    if (!t) return '?';
    const parts = t.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
        const a = parts[0][0];
        const b = parts[parts.length - 1][0];
        if (a && b) return `${a}${b}`.toUpperCase();
    }
    return t.slice(0, 2).toUpperCase();
}

interface FaceStatsSummary {
    totalUsers: number;
    registeredUsers: number;
    registrationRate: number | string;
    unregisteredUsers: number;
}

type AdminTabId = 'users' | 'courses' | 'settings' | 'camera' | 'stats';

const AdminNavIcon: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <span className="admin-sidebar__icon" aria-hidden>
        {children}
    </span>
);

const ICON_USERS = (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
);
const ICON_COURSES = (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
);
const ICON_SETTINGS = (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <circle cx="12" cy="12" r="3" />
        <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </svg>
);
const ICON_CAMERA = (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
        <circle cx="12" cy="13" r="4" />
    </svg>
);
const ICON_STATS = (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="M18 20V10M12 20V4M6 20v-6" />
    </svg>
);
const ICON_LOGOUT = (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <polyline points="16 17 21 12 16 7" />
        <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
);

const ADMIN_NAV: { id: AdminTabId; label: string; icon: React.ReactNode }[] = [
    { id: 'users', label: 'Users', icon: ICON_USERS },
    { id: 'courses', label: 'Courses', icon: ICON_COURSES },
    { id: 'settings', label: 'Settings', icon: ICON_SETTINGS },
    { id: 'camera', label: 'Camera', icon: ICON_CAMERA },
    { id: 'stats', label: 'Statistics', icon: ICON_STATS }
];

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
    currentUser: { userId: string; fullName: string };
    onLogout: () => void;
}

const AdminPanel: React.FC<AdminPanelProps> = ({ currentUser, onLogout }) => {
    const [users, setUsers] = useState<User[]>([]);
    const [usersLoading, setUsersLoading] = useState(true);
    const [statsLoading, setStatsLoading] = useState(true);
    const [statsError, setStatsError] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<AdminTabId>('users');

    const [settingsLoading, setSettingsLoading] = useState(true);
    const [settingsError, setSettingsError] = useState<string | null>(null);
    const [settingsSaving, setSettingsSaving] = useState(false);
    const [userFormSaving, setUserFormSaving] = useState(false);
    const [faceSaving, setFaceSaving] = useState(false);
    const [deletingUserId, setDeletingUserId] = useState<string | null>(null);

    const [systemSettings, setSystemSettings] = useState({
        face_matching_threshold: 0.45,
        max_login_attempts: 5,
        session_timeout: 28800000
    });

    const [faceStats, setFaceStats] = useState<FaceStatsSummary | null>(null);

    const [showUserForm, setShowUserForm] = useState(false);
    const [showFaceRegistration, setShowFaceRegistration] = useState(false);
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [registeringUserId, setRegisteringUserId] = useState<string | null>(null);

    const [userFormData, setUserFormData] = useState({
        username: '',
        password: '',
        role: 'student',
        fullName: '',
        email: ''
    });

    const [capturedEmbeddings, setCapturedEmbeddings] = useState<number[][]>([]);
    const [captureConfidences, setCaptureConfidences] = useState<number[]>([]);
    const [registeringUserName, setRegisteringUserName] = useState<string>('');

    const clearSuccessSoon = useCallback(() => {
        setTimeout(() => setSuccessMessage(null), 4000);
    }, []);

    const loadUsers = useCallback(async () => {
        try {
            setUsersLoading(true);
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
            setUsersLoading(false);
        }
    }, []);

    const loadSystemSettings = useCallback(async () => {
        try {
            setSettingsLoading(true);
            setSettingsError(null);
            const result = await window.electronAPI.getSystemSettings();
            if (result?.success && result.settings) {
                setSystemSettings(result.settings);
            } else {
                const msg =
                    result && typeof result === 'object' && 'error' in result && typeof result.error === 'string'
                        ? result.error
                        : 'Could not load system settings.';
                setSettingsError(msg);
            }
        } catch (err) {
            setSettingsError('Could not load system settings.');
            console.error('Load settings error:', err);
        } finally {
            setSettingsLoading(false);
        }
    }, []);

    const loadFaceStats = useCallback(async () => {
        try {
            setStatsLoading(true);
            setStatsError(null);
            const result = await window.electronAPI.getFaceStats();
            if (result.success) {
                setFaceStats(result.stats);
            } else {
                setFaceStats(null);
                setStatsError(result.error || 'Could not load statistics');
            }
        } catch (err) {
            setFaceStats(null);
            setStatsError('Could not load statistics');
            console.error('Load face stats error:', err);
        } finally {
            setStatsLoading(false);
        }
    }, []);

    const handleSettingsUpdate = async () => {
        try {
            setSettingsSaving(true);
            setSuccessMessage(null);
            const result = await window.electronAPI.updateSystemSettings(systemSettings);
            if (result.success) {
                setError(null);
                setSuccessMessage('Settings saved.');
                clearSuccessSoon();
            } else {
                setError(result.error || 'Failed to update settings');
            }
        } catch (err) {
            setError('Failed to update settings');
            console.error('Settings update error:', err);
        } finally {
            setSettingsSaving(false);
        }
    };

    const handleDeleteUser = async (userId: string, username: string) => {
        if (!window.confirm(`Are you sure you want to delete user "${username}"? This action cannot be undone.`)) {
            return;
        }

        try {
            setDeletingUserId(userId);
            const result = await window.electronAPI.deleteUser(userId);

            if (result.success) {
                await loadUsers();
                setError(null);
            } else {
                setError(result.error || 'Failed to delete user');
            }
        } catch (err) {
            setError('Failed to delete user');
            console.error('Delete user error:', err);
        } finally {
            setDeletingUserId(null);
        }
    };

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

    const startFaceRegistration = (userId: string) => {
        const user = users.find(u => u.user_id === userId);
        setRegisteringUserId(userId);
        setRegisteringUserName(user?.full_name || 'Unknown User');
        setCapturedEmbeddings([]);
        setCaptureConfidences([]);
        setShowFaceRegistration(true);
    };

    const handleUserSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        try {
            setUserFormSaving(true);

            if (editingUser) {
                const updateData: Record<string, string> = {
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
                    setSuccessMessage('User updated.');
                    clearSuccessSoon();
                } else {
                    setError(result.error || 'Failed to update user');
                }
            } else {
                const result = await window.electronAPI.createUser(userFormData);

                if (result.success) {
                    await loadUsers();
                    setShowUserForm(false);
                    resetUserForm();
                    setError(null);
                    setSuccessMessage('User created.');
                    clearSuccessSoon();
                } else {
                    setError(result.error || 'Failed to create user');
                }
            }
        } catch (err) {
            setError('Failed to save user');
            console.error('User submit error:', err);
        } finally {
            setUserFormSaving(false);
        }
    };

    const resetUserForm = () => {
        setUserFormData({
            username: '',
            password: '',
            role: 'student',
            fullName: '',
            email: ''
        });
    };

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

    const handleFaceDetected = useCallback((embedding: number[], confidence: number) => {
        setCapturedEmbeddings(prev => [...prev, embedding]);
        setCaptureConfidences(prev => [...prev, confidence]);
    }, []);

    const completeFaceRegistration = async () => {
        if (!registeringUserId || capturedEmbeddings.length === 0) {
            setError('No face data captured');
            return;
        }

        try {
            setFaceSaving(true);

            const result = await window.electronAPI.registerMultipleFaces(
                registeringUserId,
                capturedEmbeddings,
                captureConfidences
            );

            if (result.success) {
                await loadUsers();
                await loadFaceStats();
                closeFaceRegistration();
                setError(null);
                setSuccessMessage('Face registration saved for this user.');
                clearSuccessSoon();
            } else {
                setError(result.error || 'Failed to register face');
            }
        } catch (err) {
            setError('Failed to register face');
            console.error('Face registration error:', err);
        } finally {
            setFaceSaving(false);
        }
    };

    const handleFaceCaptureError = useCallback((msg: string) => {
        setError(`Face capture error: ${msg}`);
    }, []);

    useEffect(() => {
        loadUsers();
        loadSystemSettings();
        loadFaceStats();
    }, [loadUsers, loadSystemSettings, loadFaceStats]);

    useEffect(() => {
        if (error) {
            setSuccessMessage(null);
        }
    }, [error]);

    const usersTabBusy =
        usersLoading || userFormSaving || faceSaving || deletingUserId !== null;

    return (
        <div className="admin-dashboard">
            <aside className="admin-dashboard__sidebar" aria-label="Administration">
                <div className="admin-sidebar__brand">
                    <span className="admin-sidebar__logo-mark" aria-hidden>
                        <svg
                            width="26"
                            height="26"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        >
                            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                        </svg>
                    </span>
                    <div className="admin-sidebar__brand-text">
                        <span className="admin-sidebar__product">LabGuard</span>
                        <span className="admin-sidebar__product-tag">Admin</span>
                    </div>
                </div>

                <nav className="admin-sidebar__nav" aria-label="Admin sections">
                    {ADMIN_NAV.map(({ id, label, icon }) => (
                        <button
                            key={id}
                            type="button"
                            className={`admin-sidebar__link${activeTab === id ? ' admin-sidebar__link--active' : ''}`}
                            onClick={() => setActiveTab(id)}
                            aria-current={activeTab === id ? 'page' : undefined}
                        >
                            <AdminNavIcon>{icon}</AdminNavIcon>
                            <span className="admin-sidebar__link-label">{label}</span>
                        </button>
                    ))}
                </nav>

                <div className="admin-sidebar__footer">
                    <div className="admin-sidebar__user">
                        <span className="admin-sidebar__avatar" aria-hidden>
                            {adminInitials(currentUser.fullName)}
                        </span>
                        <div className="admin-sidebar__user-meta">
                            <span className="admin-sidebar__user-name">{currentUser.fullName}</span>
                            <span className="admin-sidebar__user-role">System administrator</span>
                        </div>
                    </div>
                    <button type="button" className="admin-sidebar__logout" onClick={onLogout}>
                        {ICON_LOGOUT}
                        <span>Logout</span>
                    </button>
                </div>
            </aside>

            <div className="admin-dashboard__main lg-atmosphere-bg">
                <div className="admin-dashboard__alerts">
                    {successMessage && !error && (
                        <div className="success-banner" role="status">
                            <span>{successMessage}</span>
                            <button type="button" onClick={() => setSuccessMessage(null)} aria-label="Dismiss">
                                ×
                            </button>
                        </div>
                    )}

                    {error && (
                        <div className="error-banner" role="alert">
                            <span>{error}</span>
                            <button type="button" onClick={() => setError(null)} aria-label="Dismiss">
                                ×
                            </button>
                        </div>
                    )}
                </div>

                <main id="admin-dashboard-main" className="dashboard-content" aria-label="Administration content">
                {activeTab === 'courses' && (
                    <div className="courses-tab tab-panel">
                        <AdminCourseManagement />
                    </div>
                )}

                {activeTab === 'users' && (
                    <div className="users-tab tab-panel">
                        <h2 className="admin-tab-title">User management</h2>
                        <p className="tab-description">
                            Create and edit accounts, assign roles, and register faces for secure lab sign-in.
                        </p>
                        <div className="admin-tab-toolbar">
                            <div className="users-actions">
                                <button
                                    type="button"
                                    onClick={() => setShowUserForm(true)}
                                    className="btn btn-primary"
                                    disabled={usersTabBusy}
                                >
                                    Add user
                                </button>
                            </div>
                        </div>

                        <div className={`users-table-container ${usersLoading ? 'users-table-container--loading' : ''}`}>
                            {usersLoading ? (
                                <div className="section-loading" role="status" aria-live="polite">
                                    <div className="loading-spinner loading-spinner--sm" />
                                    <p>Loading users…</p>
                                </div>
                            ) : (
                                <table className="users-table">
                                    <thead>
                                        <tr>
                                            <th scope="col">Username</th>
                                            <th scope="col">Full name</th>
                                            <th scope="col" className="users-table__th--center">
                                                Role
                                            </th>
                                            <th scope="col">Email</th>
                                            <th scope="col" className="users-table__th--center">
                                                Face
                                            </th>
                                            <th scope="col">Last login</th>
                                            <th scope="col" className="users-table__th--actions">
                                                Actions
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {users.length === 0 ? (
                                            <tr>
                                                <td colSpan={7} className="users-table-empty">
                                                    <div className="users-table-empty-inner">
                                                        <p>No users yet. Add an account to get started.</p>
                                                        <button
                                                            type="button"
                                                            className="btn btn-primary"
                                                            onClick={() => setShowUserForm(true)}
                                                            disabled={usersTabBusy}
                                                        >
                                                            Add user
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ) : null}
                                        {users.map(user => (
                                            <tr key={user.user_id}>
                                                <td>{user.username}</td>
                                                <td>{user.full_name}</td>
                                                <td className="users-table__cell-role">
                                                    <span className={`role-badge role-${user.role}`}>
                                                        {user.role}
                                                    </span>
                                                </td>
                                                <td className="users-table__cell-email">
                                                    {user.email ? (
                                                        user.email
                                                    ) : (
                                                        <span className="users-table__empty-cell">—</span>
                                                    )}
                                                </td>
                                                <td className="users-table__cell-face">
                                                    <span
                                                        className={`face-status ${user.has_registered_face ? 'registered' : 'not-registered'}`}
                                                    >
                                                        {user.has_registered_face ? 'Registered' : 'Not registered'}
                                                    </span>
                                                </td>
                                                <td>
                                                    {user.last_login
                                                        ? new Date(user.last_login).toLocaleDateString()
                                                        : 'Never'}
                                                </td>
                                                <td className="users-table__cell-actions">
                                                    <div className="user-actions">
                                                        <button
                                                            type="button"
                                                            onClick={() => startEditUser(user)}
                                                            className="btn btn-sm btn-secondary"
                                                            disabled={usersTabBusy}
                                                        >
                                                            Edit
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleDeleteUser(user.user_id, user.username)}
                                                            className="btn btn-sm btn-danger"
                                                            disabled={user.user_id === currentUser.userId || usersTabBusy}
                                                        >
                                                            {deletingUserId === user.user_id ? 'Deleting…' : 'Delete'}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => startFaceRegistration(user.user_id)}
                                                            className="btn btn-sm btn-primary"
                                                            disabled={usersTabBusy}
                                                            title="Open camera capture to register this user’s face"
                                                        >
                                                            Register face
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                )}

                {activeTab === 'settings' && (
                    <div className="settings-tab tab-panel">
                        <h2 className="admin-tab-title">System settings</h2>
                        <p className="tab-description">
                            Tune face-matching sensitivity, login limits, and how long sessions stay active on lab
                            machines.
                        </p>

                        {settingsLoading ? (
                            <div className="section-loading" role="status" aria-live="polite">
                                <div className="loading-spinner loading-spinner--sm" />
                                <p>Loading settings…</p>
                            </div>
                        ) : settingsError ? (
                            <>
                                <div className="error-banner settings-load-banner" role="alert">
                                    <span>{settingsError}</span>
                                    <button
                                        type="button"
                                        onClick={() => loadSystemSettings()}
                                        className="btn btn-sm btn-secondary"
                                    >
                                        Retry
                                    </button>
                                </div>
                                <p className="settings-error-hint">
                                    Could not load saved settings. The fields below show defaults only—retry to edit
                                    server values.
                                </p>
                                <div className="settings-form settings-form--blocked">
                                    <div className="setting-group">
                                        <label htmlFor="face-threshold-offline">Face matching threshold</label>
                                        <input
                                            id="face-threshold-offline"
                                            type="number"
                                            disabled
                                            value={systemSettings.face_matching_threshold}
                                            readOnly
                                        />
                                        <small>
                                            How strict face login is (0–1). Lower is stricter; typical range 0.3–0.6.
                                        </small>
                                    </div>
                                    <div className="setting-group">
                                        <label htmlFor="max-attempts-offline">Max login attempts</label>
                                        <input
                                            id="max-attempts-offline"
                                            type="number"
                                            disabled
                                            value={systemSettings.max_login_attempts}
                                            readOnly
                                        />
                                    </div>
                                    <div className="setting-group">
                                        <label htmlFor="session-hours-offline">Session timeout (hours)</label>
                                        <input
                                            id="session-hours-offline"
                                            type="number"
                                            disabled
                                            value={systemSettings.session_timeout / 3600000}
                                            readOnly
                                        />
                                    </div>
                                    <button type="button" className="btn btn-primary" disabled>
                                        Save settings
                                    </button>
                                </div>
                            </>
                        ) : (
                            <div className="settings-form">
                                <div className="setting-group">
                                    <label htmlFor="face-threshold">Face matching threshold</label>
                                    <input
                                        id="face-threshold"
                                        type="number"
                                        min={0}
                                        max={1}
                                        step={0.01}
                                        value={systemSettings.face_matching_threshold}
                                        onChange={e =>
                                            setSystemSettings(prev => ({
                                                ...prev,
                                                face_matching_threshold: parseFloat(e.target.value)
                                            }))
                                        }
                                    />
                                    <small>
                                        How strict face login is (0–1). Lower is stricter; typical range 0.3–0.6.
                                    </small>
                                </div>

                                <div className="setting-group">
                                    <label htmlFor="max-attempts">Max login attempts</label>
                                    <input
                                        id="max-attempts"
                                        type="number"
                                        min={1}
                                        max={10}
                                        value={systemSettings.max_login_attempts}
                                        onChange={e =>
                                            setSystemSettings(prev => ({
                                                ...prev,
                                                max_login_attempts: parseInt(e.target.value, 10)
                                            }))
                                        }
                                    />
                                </div>

                                <div className="setting-group">
                                    <label htmlFor="session-hours">Session timeout (hours)</label>
                                    <input
                                        id="session-hours"
                                        type="number"
                                        min={1}
                                        max={24}
                                        value={systemSettings.session_timeout / 3600000}
                                        onChange={e =>
                                            setSystemSettings(prev => ({
                                                ...prev,
                                                session_timeout: parseInt(e.target.value, 10) * 3600000
                                            }))
                                        }
                                    />
                                </div>

                                <button
                                    type="button"
                                    onClick={handleSettingsUpdate}
                                    className="btn btn-primary"
                                    disabled={settingsSaving}
                                >
                                    {settingsSaving ? 'Saving…' : 'Save settings'}
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'camera' && (
                    <div className="camera-tab tab-panel">
                        <h2 className="admin-tab-title">Camera monitoring configuration</h2>
                        <p className="tab-description">
                            Configure violation snapshot settings for the camera monitoring system. These settings
                            control when and how snapshots are captured as proof of violations.
                        </p>
                        <SnapshotConfig onError={(err) => setError(err)} />
                    </div>
                )}

                {activeTab === 'stats' && (
                    <div className="stats-tab tab-panel">
                        <h2 className="admin-tab-title">System statistics</h2>
                        <p className="tab-description">
                            Snapshot of total users, face enrollment, and how many accounts still need registration.
                        </p>

                        {statsLoading ? (
                            <div className="section-loading" role="status" aria-live="polite">
                                <div className="loading-spinner loading-spinner--sm" />
                                <p>Loading statistics…</p>
                            </div>
                        ) : statsError ? (
                            <div className="stats-empty">
                                <p>{statsError}</p>
                                <button type="button" className="btn btn-secondary" onClick={() => loadFaceStats()}>
                                    Retry
                                </button>
                            </div>
                        ) : faceStats ? (
                            <div className="stats-grid">
                                <div className="stat-card">
                                    <h3>Total users</h3>
                                    <div className="stat-value tabular-nums">{faceStats.totalUsers}</div>
                                </div>
                                <div className="stat-card">
                                    <h3>Face registered</h3>
                                    <div className="stat-value tabular-nums">{faceStats.registeredUsers}</div>
                                </div>
                                <div className="stat-card">
                                    <h3>Registration rate</h3>
                                    <div className="stat-value tabular-nums">{faceStats.registrationRate}%</div>
                                </div>
                                <div className="stat-card">
                                    <h3>Unregistered</h3>
                                    <div className="stat-value tabular-nums">{faceStats.unregisteredUsers}</div>
                                </div>
                            </div>
                        ) : (
                            <div className="stats-empty">
                                <p>No statistics are available yet.</p>
                            </div>
                        )}
                    </div>
                )}
                </main>
            </div>

            {showUserForm && (
                <div className="modal-overlay" role="presentation">
                    <div
                        className="modal"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="user-form-title"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="modal-header">
                            <h3 id="user-form-title">{editingUser ? 'Edit user' : 'Add user'}</h3>
                            <button type="button" onClick={closeUserForm} className="modal-close" aria-label="Close">
                                ×
                            </button>
                        </div>

                        <form onSubmit={handleUserSubmit} className="user-form">
                            <div className="form-group">
                                <label htmlFor="uf-username">Username</label>
                                <input
                                    id="uf-username"
                                    type="text"
                                    value={userFormData.username}
                                    onChange={(e) => setUserFormData(prev => ({ ...prev, username: e.target.value }))}
                                    required
                                    disabled={!!editingUser}
                                />
                            </div>

                            <div className="form-group">
                                <label htmlFor="uf-password">
                                    Password {editingUser && '(leave blank to keep current)'}
                                </label>
                                <input
                                    id="uf-password"
                                    type="password"
                                    value={userFormData.password}
                                    onChange={(e) => setUserFormData(prev => ({ ...prev, password: e.target.value }))}
                                    required={!editingUser}
                                />
                            </div>

                            <div className="form-group">
                                <label htmlFor="uf-role">Role</label>
                                <select
                                    id="uf-role"
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
                                <label htmlFor="uf-fullname">Full name</label>
                                <input
                                    id="uf-fullname"
                                    type="text"
                                    value={userFormData.fullName}
                                    onChange={(e) => setUserFormData(prev => ({ ...prev, fullName: e.target.value }))}
                                    required
                                />
                            </div>

                            <div className="form-group">
                                <label htmlFor="uf-email">Email</label>
                                <input
                                    id="uf-email"
                                    type="email"
                                    value={userFormData.email}
                                    onChange={(e) => setUserFormData(prev => ({ ...prev, email: e.target.value }))}
                                />
                            </div>

                            <div className="form-actions">
                                <button type="submit" className="btn btn-primary" disabled={userFormSaving}>
                                    {userFormSaving ? 'Saving…' : editingUser ? 'Update user' : 'Create user'}
                                </button>
                                <button type="button" onClick={closeUserForm} className="btn btn-secondary">
                                    Cancel
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {showFaceRegistration && (
                <div className="modal-overlay" role="presentation">
                    <div
                        className="modal modal-large"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="face-reg-title"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="modal-header">
                            <h3 id="face-reg-title">Face registration</h3>
                            <button
                                type="button"
                                onClick={closeFaceRegistration}
                                className="modal-close"
                                aria-label="Close"
                            >
                                ×
                            </button>
                        </div>

                        <div className="face-registration-content">
                            <p>
                                Registering face for: <strong>{registeringUserName}</strong>
                            </p>
                            <p>Capture several samples for better accuracy (about 3–5).</p>

                            <FaceCapture
                                onFaceDetected={handleFaceDetected}
                                onError={handleFaceCaptureError}
                                isCapturing={true}
                                showBoundingBox={true}
                                captureMultiple={true}
                                maxCaptures={5}
                            />

                            <div className="capture-status">
                                <p>
                                    Captured: {capturedEmbeddings.length}/5 samples
                                </p>
                                {capturedEmbeddings.length > 0 && (
                                    <div className="capture-quality">
                                        <p>
                                            Average confidence:{' '}
                                            {captureConfidences.length > 0
                                                ? (
                                                      (captureConfidences.reduce((sum, conf) => sum + conf, 0) /
                                                          captureConfidences.length) *
                                                      100
                                                  ).toFixed(1)
                                                : 0}
                                            %
                                        </p>
                                    </div>
                                )}
                            </div>

                            <div className="form-actions">
                                {capturedEmbeddings.length > 0 && (
                                    <button
                                        type="button"
                                        onClick={completeFaceRegistration}
                                        className="btn btn-primary"
                                        disabled={faceSaving}
                                    >
                                        {faceSaving ? 'Saving…' : `Complete registration (${capturedEmbeddings.length} samples)`}
                                    </button>
                                )}
                                <button type="button" onClick={closeFaceRegistration} className="btn btn-secondary">
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminPanel;
