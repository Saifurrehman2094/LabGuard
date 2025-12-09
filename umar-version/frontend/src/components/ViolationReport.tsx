import React, { useState, useEffect } from 'react';
import ViolationSummary from './ViolationSummary';
import ViolationList from './ViolationList';
import ScreenshotViewer from './ScreenshotViewer';
import './ViolationReport.css';

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

interface ViolationReportProps {
    examId: string;
    examTitle: string;
}

const ViolationReport: React.FC<ViolationReportProps> = ({
    examId,
    examTitle
}) => {
    const [violations, setViolations] = useState<Violation[]>([]);
    const [stats, setStats] = useState<ViolationStats | null>(null);
    const [totalStudents, setTotalStudents] = useState<number>(0);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string>('');
    const [selectedScreenshot, setSelectedScreenshot] = useState<{
        path: string;
        violationId: string;
    } | null>(null);

    // Check if running in Electron
    const isElectron = () => {
        return !!(window as any).electronAPI;
    };

    const loadViolationData = async () => {
        try {
            setIsLoading(true);
            setError('');

            if (isElectron()) {
                const result = await (window as any).electronAPI.getViolations(examId);
                if (result.success) {
                    setViolations(result.violations || []);
                    setStats(result.stats || {
                        overall: {
                            totalViolations: 0,
                            studentsWithViolations: 0,
                            uniqueApps: 0,
                            totalDurationSeconds: 0,
                            avgDurationSeconds: 0
                        },
                        byApp: []
                    });
                    setTotalStudents(result.participantCount || 0);
                } else {
                    setError(result.error || 'Failed to load violation data');
                }
            } else {
                // Development mode - use mock data
                const mockViolations: Violation[] = [
                    {
                        violationId: '1',
                        studentId: 'student1',
                        studentName: 'John Doe',
                        username: 'john.doe',
                        appName: 'Chrome',
                        windowTitle: 'Google Search',
                        focusStartTime: new Date(Date.now() - 3600000).toISOString(),
                        focusEndTime: new Date(Date.now() - 3540000).toISOString(),
                        durationSeconds: 60,
                        screenshotPath: '/screenshots/violation1.png',
                        screenshotCaptured: true,
                        createdAt: new Date(Date.now() - 3600000).toISOString()
                    }
                ];

                const mockStats: ViolationStats = {
                    overall: {
                        totalViolations: 1,
                        studentsWithViolations: 1,
                        uniqueApps: 1,
                        totalDurationSeconds: 60,
                        avgDurationSeconds: 60
                    },
                    byApp: [
                        {
                            appName: 'Chrome',
                            violationCount: 1,
                            totalDurationSeconds: 60
                        }
                    ]
                };

                setViolations(mockViolations);
                setStats(mockStats);
                setTotalStudents(1);
            }
        } catch (error) {
            console.error('Error loading violation data:', error);
            setError('Failed to load violation data. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadViolationData();
    }, [examId]);

    const handleViewScreenshot = (screenshotPath: string, violationId: string) => {
        setSelectedScreenshot({ path: screenshotPath, violationId });
    };

    const handleCloseScreenshot = () => {
        setSelectedScreenshot(null);
    };

    const exportReport = async () => {
        try {
            if (isElectron()) {
                const result = await (window as any).electronAPI.exportViolationReport({
                    examId,
                    examTitle,
                    violations,
                    stats,
                    totalStudents
                });

                if (result.success) {
                    alert('Report exported successfully!');
                } else {
                    alert('Failed to export report: ' + result.error);
                }
            } else {
                // Development mode - show mock success
                alert('Export functionality available in desktop app');
            }
        } catch (error) {
            console.error('Error exporting report:', error);
            alert('Failed to export report');
        }
    };

    if (isLoading) {
        return (
            <div className="violation-report">
                <div className="loading-container">
                    <div className="loading-spinner"></div>
                    <p>Loading violation data...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="violation-report">
                <div className="error-container">
                    <div className="error-icon">⚠️</div>
                    <h3>Failed to Load Violation Data</h3>
                    <p>{error}</p>
                    <button onClick={loadViolationData} className="retry-btn">
                        Try Again
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="violation-report">
            <div className="report-header">
                <div className="header-content">
                    <h2>Violation Report: {examTitle}</h2>
                    <p className="exam-info">
                        Exam ID: {examId} • Total Students: {totalStudents}
                    </p>
                </div>
                <div className="header-actions">
                    <button onClick={loadViolationData} className="refresh-btn">
                        🔄 Refresh
                    </button>
                    <button onClick={exportReport} className="export-btn">
                        📊 Export Report
                    </button>
                </div>
            </div>

            {stats && (
                <ViolationSummary
                    stats={stats}
                    totalStudents={totalStudents}
                />
            )}

            <ViolationList
                violations={violations}
                onViewScreenshot={handleViewScreenshot}
            />

            {selectedScreenshot && (
                <ScreenshotViewer
                    screenshotPath={selectedScreenshot.path}
                    violationId={selectedScreenshot.violationId}
                    onClose={handleCloseScreenshot}
                />
            )}
        </div>
    );
};

export default ViolationReport;