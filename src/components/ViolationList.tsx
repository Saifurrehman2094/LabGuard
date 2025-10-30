import React, { useState } from 'react';
import './ViolationList.css';

interface Violation {
    violationId: string;
    studentId: string;
    studentName: string;
    username: string;
    appName: string;
    windowTitle: string;
    focusStartTime: string;
    focusEndTime?: string;
    durationSeconds?: number;
    screenshotPath?: string;
    screenshotCaptured: boolean;
    createdAt: string;
}

interface ViolationListProps {
    violations: Violation[];
    onViewScreenshot: (screenshotPath: string, violationId: string) => void;
}

const ViolationList: React.FC<ViolationListProps> = ({ violations, onViewScreenshot }) => {
    const [sortBy, setSortBy] = useState<'time' | 'student' | 'app' | 'duration'>('time');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
    const [filterStudent, setFilterStudent] = useState<string>('');
    const [filterApp, setFilterApp] = useState<string>('');

    const formatDateTime = (dateString: string): string => {
        return new Date(dateString).toLocaleString();
    };

    const formatDuration = (seconds?: number): string => {
        if (!seconds) return 'Ongoing';

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

    const getUniqueStudents = (): string[] => {
        const students = Array.from(new Set(violations.map(v => v.studentName)));
        return students.sort();
    };

    const getUniqueApps = (): string[] => {
        const apps = Array.from(new Set(violations.map(v => v.appName)));
        return apps.sort();
    };

    const filteredViolations = violations.filter(violation => {
        const matchesStudent = !filterStudent || violation.studentName.toLowerCase().includes(filterStudent.toLowerCase());
        const matchesApp = !filterApp || violation.appName.toLowerCase().includes(filterApp.toLowerCase());
        return matchesStudent && matchesApp;
    });

    const sortedViolations = [...filteredViolations].sort((a, b) => {
        let comparison = 0;

        switch (sortBy) {
            case 'time':
                comparison = new Date(a.focusStartTime).getTime() - new Date(b.focusStartTime).getTime();
                break;
            case 'student':
                comparison = a.studentName.localeCompare(b.studentName);
                break;
            case 'app':
                comparison = a.appName.localeCompare(b.appName);
                break;
            case 'duration':
                comparison = (a.durationSeconds || 0) - (b.durationSeconds || 0);
                break;
        }

        return sortOrder === 'asc' ? comparison : -comparison;
    });

    const handleSort = (field: typeof sortBy) => {
        if (sortBy === field) {
            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
        } else {
            setSortBy(field);
            setSortOrder('desc');
        }
    };

    const getSortIcon = (field: typeof sortBy) => {
        if (sortBy !== field) return '↕️';
        return sortOrder === 'asc' ? '↑' : '↓';
    };

    return (
        <div className="violation-list">
            <div className="list-header">
                <h3>Detailed Violations ({filteredViolations.length})</h3>

                <div className="filters">
                    <div className="filter-group">
                        <label>Filter by Student:</label>
                        <select
                            value={filterStudent}
                            onChange={(e) => setFilterStudent(e.target.value)}
                        >
                            <option value="">All Students</option>
                            {getUniqueStudents().map(student => (
                                <option key={student} value={student}>{student}</option>
                            ))}
                        </select>
                    </div>

                    <div className="filter-group">
                        <label>Filter by App:</label>
                        <select
                            value={filterApp}
                            onChange={(e) => setFilterApp(e.target.value)}
                        >
                            <option value="">All Applications</option>
                            {getUniqueApps().map(app => (
                                <option key={app} value={app}>{app}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            {sortedViolations.length === 0 ? (
                <div className="no-violations-message">
                    {violations.length === 0 ?
                        'No violations recorded for this exam.' :
                        'No violations match the current filters.'
                    }
                </div>
            ) : (
                <div className="violations-table">
                    <div className="table-header">
                        <div className="header-cell sortable" onClick={() => handleSort('time')}>
                            Time {getSortIcon('time')}
                        </div>
                        <div className="header-cell sortable" onClick={() => handleSort('student')}>
                            Student {getSortIcon('student')}
                        </div>
                        <div className="header-cell sortable" onClick={() => handleSort('app')}>
                            Application {getSortIcon('app')}
                        </div>
                        <div className="header-cell">Window Title</div>
                        <div className="header-cell sortable" onClick={() => handleSort('duration')}>
                            Duration {getSortIcon('duration')}
                        </div>
                        <div className="header-cell">Evidence</div>
                    </div>

                    <div className="table-body">
                        {sortedViolations.map((violation) => (
                            <div key={violation.violationId} className="table-row">
                                <div className="cell time-cell">
                                    <div className="start-time">{formatDateTime(violation.focusStartTime)}</div>
                                    {violation.focusEndTime && (
                                        <div className="end-time">to {formatDateTime(violation.focusEndTime)}</div>
                                    )}
                                </div>

                                <div className="cell student-cell">
                                    <div className="student-name">{violation.studentName}</div>
                                    <div className="username">@{violation.username}</div>
                                </div>

                                <div className="cell app-cell">
                                    <div className="app-name">{violation.appName}</div>
                                </div>

                                <div className="cell window-cell">
                                    <div className="window-title" title={violation.windowTitle}>
                                        {violation.windowTitle || 'N/A'}
                                    </div>
                                </div>

                                <div className="cell duration-cell">
                                    <span className={`duration ${!violation.durationSeconds ? 'ongoing' : ''}`}>
                                        {formatDuration(violation.durationSeconds)}
                                    </span>
                                </div>

                                <div className="cell evidence-cell">
                                    {violation.screenshotCaptured && violation.screenshotPath ? (
                                        <button
                                            className="screenshot-btn"
                                            onClick={() => onViewScreenshot(violation.screenshotPath!, violation.violationId)}
                                        >
                                            📷 View Screenshot
                                        </button>
                                    ) : (
                                        <span className="no-screenshot">No screenshot</span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default ViolationList;