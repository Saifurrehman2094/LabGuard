import React, { useState, useEffect } from 'react';
import './SetupWizard.css';

interface SetupWizardProps {
    onSetupComplete: () => void;
}

interface SystemStatus {
    hasUsers: boolean;
    hasNonAdminUsers: boolean;
    totalUsers: number;
    nonAdminUsers: number;
}

const SetupWizard: React.FC<SetupWizardProps> = ({ onSetupComplete }) => {
    const [currentStep, setCurrentStep] = useState(1);
    const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // Check if running in Electron
    const isElectron = () => {
        return !!(window as any).electronAPI;
    };

    useEffect(() => {
        checkSystemStatus();
    }, []);

    const checkSystemStatus = async () => {
        try {
            if (isElectron()) {
                const result = await (window as any).electronAPI.getSystemSetupStatus();
                if (result.success) {
                    setSystemStatus(result.data);

                    // If system already has non-admin users, skip setup
                    if (result.data.hasNonAdminUsers) {
                        onSetupComplete();
                        return;
                    }
                }
            }
        } catch (error) {
            console.error('Failed to check system status:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSkipSetup = () => {
        onSetupComplete();
    };

    const handleCompleteSetup = () => {
        onSetupComplete();
    };

    if (isLoading) {
        return (
            <div className="setup-wizard">
                <div className="setup-container">
                    <div className="loading-spinner"></div>
                    <p>Checking system status...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="setup-wizard">
            <div className="setup-container">
                <div className="setup-header">
                    <h1>Welcome to LAB-Guard</h1>
                    <p className="setup-subtitle">Let's set up your exam monitoring system</p>
                </div>

                {currentStep === 1 && (
                    <div className="setup-step">
                        <div className="step-content">
                            <h2>System Status</h2>
                            <div className="status-info">
                                <div className="status-item">
                                    <span className="status-label">Total Users:</span>
                                    <span className="status-value">{systemStatus?.totalUsers || 0}</span>
                                </div>
                                <div className="status-item">
                                    <span className="status-label">Teachers & Students:</span>
                                    <span className="status-value">{systemStatus?.nonAdminUsers || 0}</span>
                                </div>
                            </div>

                            {systemStatus?.nonAdminUsers === 0 ? (
                                <div className="setup-message">
                                    <div className="message-box warning">
                                        <h3>⚠️ No Users Found</h3>
                                        <p>Your system doesn't have any teachers or students yet. You'll need to create user accounts through the Admin Panel to start using LAB-Guard.</p>
                                    </div>

                                    <div className="setup-instructions">
                                        <h3>Next Steps:</h3>
                                        <ol>
                                            <li>Access the Admin Panel with your admin account</li>
                                            <li>Create teacher accounts for your instructors</li>
                                            <li>Create student accounts for exam participants</li>
                                            <li>Teachers can then create and manage exams</li>
                                            <li>Students can participate in exams with face authentication</li>
                                        </ol>
                                    </div>
                                </div>
                            ) : (
                                <div className="setup-message">
                                    <div className="message-box success">
                                        <h3>✅ System Ready</h3>
                                        <p>Your system has {systemStatus?.nonAdminUsers} user accounts configured and is ready to use.</p>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="setup-actions">
                            <button
                                className="btn btn-secondary"
                                onClick={handleSkipSetup}
                            >
                                Continue to Login
                            </button>
                            <button
                                className="btn btn-primary"
                                onClick={handleCompleteSetup}
                            >
                                Go to Admin Panel
                            </button>
                        </div>
                    </div>
                )}

                <div className="setup-footer">
                    <p className="setup-note">
                        <strong>Default Admin Account:</strong> username: <code>admin</code>, password: <code>admin123</code>
                    </p>
                    <p className="setup-warning">
                        ⚠️ Please change the default admin password after first login for security!
                    </p>
                </div>
            </div>
        </div>
    );
};

export default SetupWizard;