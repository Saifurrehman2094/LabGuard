import React, { useState, useEffect, useCallback } from 'react';
import WarningLogCard from './WarningLogCard';
import './WarningSystem.css';
import './WarningPanel.css';

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

interface WarningPanelProps {
    examId?: string;
    studentId?: string;
    isMonitoringActive: boolean;
}

const WarningPanel: React.FC<WarningPanelProps> = ({
    examId,
    studentId,
    isMonitoringActive
}) => {
    const [violations, setViolations] = useState<ViolationRecord[]>([]);
    const [activeViolations, setActiveViolations] = useState<Set<string>>(new Set());
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [totalViolationTime, setTotalViolationTime] = useState(0);

    // Check if running in Electron
    const isElectron = () => {
        return !!(window as any).electronAPI;
    };

    // Handle new violation events
    const handleViolationStart = useCallback((violationData: ViolationRecord) => {
        setViolations(prev => {
            // Check if violation already exists
            const existingIndex = prev.findIndex(v => v.violationId === violationData.violationId);
            if (existingIndex >= 0) {
                // Update existing violation
                const updated = [...prev];
                updated[existingIndex] = violationData;
                return updated;
            }
            // Add new violation at the beginning (most recent first)
            return [violationData, ...prev];
        });

        setActiveViolations(prev => new Set(prev).add(violationData.violationId));
    }, []);

    // Handle violation end events
    const handleViolationEnd = useCallback((violationData: ViolationRecord) => {
        setViolations(prev => {
            const updated = prev.map(v =>
                v.violationId === violationData.violationId ? violationData : v
            );
            return updated;
        });

        setActiveViolations(prev => {
            const updated = new Set(prev);
            updated.delete(violationData.violationId);
            return updated;
        });
    }, []);

    // Handle monitoring events from Electron
    useEffect(() => {
        if (!isElectron() || !isMonitoringActive) return;

        const handleMonitoringEvent = (event: any, data: any) => {
            switch (data.type) {
                case 'violation_start':
                    handleViolationStart(data.violation);
                    break;
                case 'violation_end':
                    handleViolationEnd(data.violation);
                    break;
                case 'violation_update':
                    handleViolationStart(data.violation); // Use same handler for updates
                    break;
                default:
                    break;
            }
        };

        // Set up IPC event listener
        const removeListener = (window as any).electronAPI.onMonitoringEvent(handleMonitoringEvent);

        return () => {
            if (removeListener) {
                removeListener();
            }
        };
    }, [isMonitoringActive, handleViolationStart, handleViolationEnd]);

    // Calculate total violation time
    useEffect(() => {
        const calculateTotalTime = () => {
            let total = 0;
            const now = new Date();

            violations.forEach(violation => {
                if (activeViolations.has(violation.violationId)) {
                    // Active violation - calculate current duration
                    const startTime = new Date(violation.focusStartTime);
                    total += Math.floor((now.getTime() - startTime.getTime()) / 1000);
                } else if (violation.durationSeconds) {
                    // Completed violation - use stored duration
                    total += violation.durationSeconds;
                }
            });

            setTotalViolationTime(total);
        };

        calculateTotalTime();

        // Update total time every second for active violations
        if (activeViolations.size > 0) {
            const interval = setInterval(calculateTotalTime, 1000);
            return () => clearInterval(interval);
        }
    }, [violations, activeViolations]);

    // Format total time
    const formatTotalTime = (seconds: number): string => {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;

        if (hours > 0) {
            return `${hours}h ${minutes}m ${secs}s`;
        }
        if (minutes > 0) {
            return `${minutes}m ${secs}s`;
        }
        return `${secs}s`;
    };

    // Clear all violations (for testing or reset)
    const clearViolations = () => {
        setViolations([]);
        setActiveViolations(new Set());
        setTotalViolationTime(0);
    };

    // Get violation statistics
    const getViolationStats = () => {
        const totalCount = violations.length;
        const activeCount = activeViolations.size;
        const completedCount = totalCount - activeCount;
        const uniqueApps = new Set(violations.map(v => v.appName)).size;

        return {
            totalCount,
            activeCount,
            completedCount,
            uniqueApps
        };
    };

    const stats = getViolationStats();

    if (!isMonitoringActive && violations.length === 0) {
        return null; // Don't show panel when not monitoring and no violations
    }

    return (
        <div className={`warning-component warning-panel ${isCollapsed ? 'collapsed' : ''}`}>
            <div className="warning-panel-header" onClick={() => setIsCollapsed(!isCollapsed)}>
                <div className="panel-title">
                    <span className="warning-icon">⚠️</span>
                    <h3>Application Violations</h3>
                    {stats.activeCount > 0 && (
                        <span className="active-count">{stats.activeCount} active</span>
                    )}
                </div>

                <div className="panel-stats">
                    <div className="stat-item">
                        <span className="stat-label">Total:</span>
                        <span className="stat-value">{stats.totalCount}</span>
                    </div>
                    <div className="stat-item">
                        <span className="stat-label">Time:</span>
                        <span className="stat-value total-time">{formatTotalTime(totalViolationTime)}</span>
                    </div>
                </div>

                <button
                    className={`collapse-btn ${isCollapsed ? 'collapsed' : ''}`}
                    aria-label={isCollapsed ? 'Expand panel' : 'Collapse panel'}
                >
                    <span className="collapse-icon">▼</span>
                </button>
            </div>

            {!isCollapsed && (
                <div className="warning-panel-content">
                    {violations.length === 0 ? (
                        <div className="no-violations">
                            <div className="no-violations-icon">✅</div>
                            <p>No violations detected</p>
                            <span className="no-violations-subtitle">
                                Keep using only allowed applications
                            </span>
                        </div>
                    ) : (
                        <>
                            <div className="violations-summary">
                                <div className="summary-stats">
                                    <div className="summary-item">
                                        <span className="summary-number">{stats.totalCount}</span>
                                        <span className="summary-label">Total Violations</span>
                                    </div>
                                    <div className="summary-item">
                                        <span className="summary-number">{stats.uniqueApps}</span>
                                        <span className="summary-label">Different Apps</span>
                                    </div>
                                    <div className="summary-item">
                                        <span className="summary-number total-time">{formatTotalTime(totalViolationTime)}</span>
                                        <span className="summary-label">Total Time</span>
                                    </div>
                                </div>

                                {violations.length > 5 && (
                                    <button
                                        onClick={clearViolations}
                                        className="clear-violations-btn"
                                        title="Clear all violations (for testing)"
                                    >
                                        Clear All
                                    </button>
                                )}
                            </div>

                            <div className="violations-list">
                                {violations.map((violation) => (
                                    <WarningLogCard
                                        key={violation.violationId}
                                        violation={violation}
                                        isActive={activeViolations.has(violation.violationId)}
                                    />
                                ))}
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
};

export default WarningPanel;