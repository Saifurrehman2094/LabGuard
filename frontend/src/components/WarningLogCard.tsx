import React from 'react';
import './WarningSystem.css';
import './WarningLogCard.css';

interface ViolationRecord {
    violationId: string;
    examId: string;
    studentId: string;
    deviceId: string;
    appName: string;
    windowTitle: string;
    focusStartTime: string;
    focusEndTime?: string;
    durationSeconds?: number;
    screenshotPath?: string;
    screenshotCaptured: boolean;
    createdAt: string;
}

interface WarningLogCardProps {
    violation: ViolationRecord;
    isActive: boolean;
}

const WarningLogCard: React.FC<WarningLogCardProps> = ({ violation, isActive }) => {
    // Format timestamp to readable format
    const formatTimestamp = (timestamp: string): string => {
        const date = new Date(timestamp);
        return date.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        });
    };

    // Format duration to readable format
    const formatDuration = (seconds?: number): string => {
        if (!seconds) return '0s';

        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;

        if (minutes > 0) {
            return `${minutes}m ${remainingSeconds}s`;
        }
        return `${remainingSeconds}s`;
    };

    // Calculate current duration for active violations
    const getCurrentDuration = (): number => {
        if (!isActive) {
            return violation.durationSeconds || 0;
        }

        const startTime = new Date(violation.focusStartTime);
        const now = new Date();
        return Math.floor((now.getTime() - startTime.getTime()) / 1000);
    };

    const currentDuration = getCurrentDuration();

    return (
        <div className={`warning-component warning-log-card ${isActive ? 'active' : 'completed'}`}>
            <div className="warning-header">
                <div className="warning-icon">
                    <span className={`status-indicator ${isActive ? 'active' : 'completed'}`}>
                        {isActive ? '⚠️' : '✓'}
                    </span>
                </div>
                <div className="warning-title">
                    <h4 className="app-name">{violation.appName}</h4>
                    <span className={`violation-status ${isActive ? 'active' : 'completed'}`}>
                        {isActive ? 'Active Violation' : 'Violation Ended'}
                    </span>
                </div>
                <div className="warning-time">
                    <span className="start-time">{formatTimestamp(violation.focusStartTime)}</span>
                </div>
            </div>

            <div className="warning-content">
                {violation.windowTitle && (
                    <div className="window-info">
                        <span className="window-label">Window:</span>
                        <span className="window-title">{violation.windowTitle}</span>
                    </div>
                )}

                <div className="violation-details">
                    <div className="detail-item">
                        <span className="detail-label">Duration:</span>
                        <span className={`detail-value duration ${isActive ? 'counting' : ''}`}>
                            {formatDuration(currentDuration)}
                        </span>
                    </div>

                    {!isActive && violation.focusEndTime && (
                        <div className="detail-item">
                            <span className="detail-label">Ended:</span>
                            <span className="detail-value">
                                {formatTimestamp(violation.focusEndTime)}
                            </span>
                        </div>
                    )}

                    {violation.screenshotCaptured && (
                        <div className="detail-item">
                            <span className="detail-label">Evidence:</span>
                            <span className="detail-value screenshot-indicator">
                                📸 Screenshot captured
                            </span>
                        </div>
                    )}
                </div>
            </div>

            {isActive && (
                <div className="active-indicator">
                    <div className="pulse-dot"></div>
                    <span>Currently active</span>
                </div>
            )}
        </div>
    );
};

export default WarningLogCard;