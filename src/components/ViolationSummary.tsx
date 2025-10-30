import React from 'react';
import './ViolationSummary.css';

interface ViolationStats {
    overall: {
        totalViolations: number;
        studentsWithViolations: number;
        uniqueApps: number;
        totalDurationSeconds: number;
        avgDurationSeconds: number;
    };
    byApp: Array<{
        appName: string;
        violationCount: number;
        totalDurationSeconds: number;
    }>;
}

interface ViolationSummaryProps {
    stats: ViolationStats;
    totalStudents: number;
}

const ViolationSummary: React.FC<ViolationSummaryProps> = ({ stats, totalStudents }) => {
    const formatDuration = (seconds: number): string => {
        if (seconds < 60) {
            return `${seconds}s`;
        } else if (seconds < 3600) {
            const minutes = Math.floor(seconds / 60);
            const remainingSeconds = seconds % 60;
            return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
        } else {
            const hours = Math.floor(seconds / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
        }
    };

    const violationRate = totalStudents > 0 ?
        ((stats.overall.studentsWithViolations / totalStudents) * 100).toFixed(1) : '0';

    return (
        <div className="violation-summary">
            <h3>Violation Summary</h3>

            <div className="summary-stats">
                <div className="stat-card">
                    <div className="stat-number">{stats.overall.totalViolations}</div>
                    <div className="stat-label">Total Violations</div>
                </div>

                <div className="stat-card">
                    <div className="stat-number">{stats.overall.studentsWithViolations}</div>
                    <div className="stat-label">Students with Violations</div>
                </div>

                <div className="stat-card">
                    <div className="stat-number">{violationRate}%</div>
                    <div className="stat-label">Violation Rate</div>
                </div>

                <div className="stat-card">
                    <div className="stat-number">{formatDuration(stats.overall.totalDurationSeconds)}</div>
                    <div className="stat-label">Total Time in Violations</div>
                </div>
            </div>

            {stats.byApp.length > 0 && (
                <div className="app-breakdown">
                    <h4>Most Common Violations</h4>
                    <div className="app-list">
                        {stats.byApp.slice(0, 5).map((app, index) => (
                            <div key={app.appName} className="app-item">
                                <div className="app-rank">#{index + 1}</div>
                                <div className="app-info">
                                    <div className="app-name">{app.appName}</div>
                                    <div className="app-stats">
                                        {app.violationCount} violations • {formatDuration(app.totalDurationSeconds)}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {stats.overall.totalViolations === 0 && (
                <div className="no-violations">
                    <div className="success-icon">✓</div>
                    <div className="success-message">
                        <h4>Clean Exam Session</h4>
                        <p>No unauthorized application usage detected during this exam.</p>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ViolationSummary;