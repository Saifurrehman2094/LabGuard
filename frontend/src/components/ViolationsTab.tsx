import React, { useState, useEffect } from 'react';
import './ViolationsTab.css';

interface User {
    userId: string;
    username: string;
    role: string;
    fullName: string;
}

interface Violation {
    violation_id: string;
    exam_id: string;
    exam_title: string;
    violation_type: string;
    application_name: string;
    start_time: string;
    end_time: string | null;
    duration: number;
    screenshot_path: string | null;
}

interface ViolationsTabProps {
    user: User;
}

const ViolationsTab: React.FC<ViolationsTabProps> = ({ user }) => {
    const [violations, setViolations] = useState<Violation[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedExam, setSelectedExam] = useState<string>('all');
    const [exams, setExams] = useState<{ exam_id: string; title: string }[]>([]);

    const isElectron = () => !!(window as any).electronAPI;

    useEffect(() => {
        loadViolations();
    }, [user.userId]);

    const loadViolations = async () => {
        try {
            setLoading(true);
            setError(null);

            if (!isElectron()) {
                setViolations([]);
                setLoading(false);
                return;
            }

            const result = await (window as any).electronAPI.getStudentViolations(null);

            if (result.success) {
                setViolations(result.violations || []);

                // Extract unique exams
                const uniqueExams = Array.from(
                    new Map(
                        result.violations.map((v: Violation) => [v.exam_id, { exam_id: v.exam_id, title: v.exam_title }])
                    ).values()
                );
                setExams(uniqueExams as { exam_id: string; title: string }[]);
            } else {
                setError(result.error || 'Failed to load violations');
            }
        } catch (err) {
            console.error('Error loading violations:', err);
            setError('Failed to load violations');
        } finally {
            setLoading(false);
        }
    };

    const filteredViolations = selectedExam === 'all'
        ? violations
        : violations.filter(v => v.exam_id === selectedExam);

    const formatDuration = (seconds: number): string => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}m ${secs}s`;
    };

    const formatDateTime = (dateString: string): string => {
        return new Date(dateString).toLocaleString();
    };

    const getViolationIcon = (type: string): string => {
        switch (type) {
            case 'UNAUTHORIZED_APP':
                return '🚫';
            case 'WINDOW_SWITCH':
                return '🔄';
            case 'SUSPICIOUS_ACTIVITY':
                return '⚠️';
            default:
                return '❗';
        }
    };

    const getViolationColor = (type: string): string => {
        switch (type) {
            case 'UNAUTHORIZED_APP':
                return 'red';
            case 'WINDOW_SWITCH':
                return 'orange';
            case 'SUSPICIOUS_ACTIVITY':
                return 'yellow';
            default:
                return 'gray';
        }
    };

    if (loading) {
        return (
            <div className="violations-tab">
                <div className="loading-container">
                    <div className="loading-spinner"></div>
                    <p>Loading violations...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="violations-tab">
            <div className="violations-header">
                <h2>📋 My Violations</h2>
                <p>Review any violations detected during your exams</p>
            </div>

            {error && (
                <div className="error-message">
                    ⚠️ {error}
                </div>
            )}

            {/* Filter */}
            {exams.length > 0 && (
                <div className="violations-filter">
                    <label>Filter by Exam:</label>
                    <select value={selectedExam} onChange={(e) => setSelectedExam(e.target.value)}>
                        <option value="all">All Exams</option>
                        {exams.map(exam => (
                            <option key={exam.exam_id} value={exam.exam_id}>
                                {exam.title}
                            </option>
                        ))}
                    </select>
                </div>
            )}

            {/* Violations List */}
            {filteredViolations.length === 0 ? (
                <div className="no-violations">
                    <div className="no-violations-icon">✅</div>
                    <h3>No Violations Found</h3>
                    <p>You have a clean record! Keep up the good work.</p>
                </div>
            ) : (
                <div className="violations-list">
                    {filteredViolations.map((violation) => (
                        <div
                            key={violation.violation_id}
                            className={`violation-card ${getViolationColor(violation.violation_type)}`}
                        >
                            <div className="violation-icon">
                                {getViolationIcon(violation.violation_type)}
                            </div>
                            <div className="violation-details">
                                <div className="violation-header-row">
                                    <h3>{violation.exam_title}</h3>
                                    <span className="violation-type">{violation.violation_type.replace('_', ' ')}</span>
                                </div>
                                <div className="violation-info">
                                    <p><strong>Application:</strong> {violation.application_name}</p>
                                    <p><strong>Time:</strong> {formatDateTime(violation.start_time)}</p>
                                    <p><strong>Duration:</strong> {formatDuration(violation.duration)}</p>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Summary */}
            {filteredViolations.length > 0 && (
                <div className="violations-summary">
                    <h3>Summary</h3>
                    <div className="summary-stats">
                        <div className="stat-item">
                            <span className="stat-value">{filteredViolations.length}</span>
                            <span className="stat-label">Total Violations</span>
                        </div>
                        <div className="stat-item">
                            <span className="stat-value">
                                {filteredViolations.filter(v => v.violation_type === 'UNAUTHORIZED_APP').length}
                            </span>
                            <span className="stat-label">Unauthorized Apps</span>
                        </div>
                        <div className="stat-item">
                            <span className="stat-value">
                                {filteredViolations.filter(v => v.violation_type === 'WINDOW_SWITCH').length}
                            </span>
                            <span className="stat-label">Window Switches</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ViolationsTab;
