import React, { useState, useEffect } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import JSZip from 'jszip';
import './ExamPage.css';

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

interface User {
    userId: string;
    username: string;
    role: 'admin' | 'teacher' | 'student';
    fullName: string;
}

interface Exam {
    exam_id: string;
    teacher_id: string;
    title: string;
    pdf_path?: string;
    start_time: string;
    end_time: string;
    allowed_apps: string[];
    teacher_name: string;
    course_name?: string;
    course_code?: string;
}

interface ExamPageProps {
    exam: Exam;
    user: User;
    onBack: () => void;
    onExamStarted: () => void;
    onExamEnded: () => void;
}

interface ExamContent {
    text: string;
    images: string[];
}

const ExamPage: React.FC<ExamPageProps> = ({ exam: initialExam, user, onBack, onExamStarted, onExamEnded }) => {
    const [exam, setExam] = useState<Exam>(initialExam);
    const [examContent, setExamContent] = useState<ExamContent | null>(null);
    const [loading, setLoading] = useState(true);
    const [checkingStatus, setCheckingStatus] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [examStarted, setExamStarted] = useState(false);
    const [timeRemaining, setTimeRemaining] = useState<number>(-1);
    const [monitoringActive, setMonitoringActive] = useState(false);
    const [showSubmitDialog, setShowSubmitDialog] = useState(false);
    const [submittedFiles, setSubmittedFiles] = useState<File[]>([]);
    const [submissionStatus, setSubmissionStatus] = useState<{
        submitted: boolean;
        submittedAt?: string;
        filesData?: any[];
    }>({ submitted: false });
    const [showConfirmDialog, setShowConfirmDialog] = useState(false);
    const [zipContents, setZipContents] = useState<{ [key: string]: string[] }>({});

    const isElectron = () => !!(window as any).electronAPI;

    // Reload exam data when component mounts to get latest times
    useEffect(() => {
        const reloadExamData = async () => {
            if (isElectron()) {
                try {
                    const result = await (window as any).electronAPI.getExamById(initialExam.exam_id);
                    if (result.success && result.exam) {
                        const dbExam = result.exam;

                        // Map camelCase from DB to snake_case for Exam interface
                        const reloadedExam: Exam = {
                            exam_id: dbExam.examId || initialExam.exam_id,
                            teacher_id: dbExam.teacherId || initialExam.teacher_id,
                            title: dbExam.title || initialExam.title,
                            pdf_path: dbExam.pdfPath,
                            start_time: dbExam.startTime || initialExam.start_time,
                            end_time: dbExam.endTime || initialExam.end_time,
                            allowed_apps: Array.isArray(dbExam.allowedApps) ? dbExam.allowedApps :
                                (typeof dbExam.allowedApps === 'string' ? JSON.parse(dbExam.allowedApps) : []),
                            teacher_name: initialExam.teacher_name,
                            course_name: initialExam.course_name,
                            course_code: initialExam.course_code
                        };

                        console.log('Exam reloaded:', {
                            title: reloadedExam.title,
                            start_time: reloadedExam.start_time,
                            end_time: reloadedExam.end_time,
                            now: new Date().toISOString(),
                            canStart: new Date() >= new Date(reloadedExam.start_time) && new Date() <= new Date(reloadedExam.end_time)
                        });

                        setExam(reloadedExam);
                    }
                } catch (err) {
                    console.error('Error reloading exam data:', err);
                    // If reload fails, use initial exam
                    setExam(initialExam);
                }
            } else {
                setExam(initialExam);
            }
        };
        reloadExamData();
    }, [initialExam.exam_id]);

    // Calculate time remaining only when exam is started
    useEffect(() => {
        if (!examStarted) return;

        const calculateTimeRemaining = () => {
            const now = new Date();
            const endTime = new Date(exam.end_time);
            const remaining = Math.floor((endTime.getTime() - now.getTime()) / 1000);
            setTimeRemaining(Math.max(0, remaining));
        };

        calculateTimeRemaining();
        const interval = setInterval(calculateTimeRemaining, 1000);

        return () => clearInterval(interval);
    }, [exam.end_time, examStarted]);

    // Auto end exam when time runs out
    useEffect(() => {
        // Only trigger if exam is started, time is 0, and it's not the initial state
        // We check > -1 first to ensure timer has been initialized
        if (examStarted && timeRemaining > -1 && timeRemaining === 0) {
            if (submissionStatus.submitted) {
                // Time's up and already submitted - auto confirm and close
                handleConfirmSubmission();
            } else {
                // Time's up but not submitted - show alert and close
                alert('Time is up! Exam has ended.');
                // Stop monitoring and close
                if (isElectron() && monitoringActive) {
                    (window as any).electronAPI.stopMonitoring().catch((err: any) => {
                        console.error('Error stopping monitoring:', err);
                    });
                }
                onBack();
            }
        }
    }, [timeRemaining, examStarted, submissionStatus.submitted]);

    // Load submission status and check if exam was already started
    useEffect(() => {
        const initializeExamState = async () => {
            setCheckingStatus(true);
            console.log('=== Initializing exam state ===');
            await checkSubmissionStatus();
            const wasResumed = await checkExamStartedStatus();
            console.log('Exam resumed:', wasResumed);
            setCheckingStatus(false);
        };
        initializeExamState();
    }, [exam.exam_id]);

    // Re-check exam status when exam data changes (e.g., after reload)
    useEffect(() => {
        const recheckStatus = async () => {
            if (!examStarted) {
                await checkExamStartedStatus();
            }
        };
        recheckStatus();
    }, [exam.start_time, exam.end_time]);

    // Load and process PDF only when exam is started
    useEffect(() => {
        if (exam.pdf_path && examStarted) {
            loadAndProcessPDF();
        } else if (!examStarted) {
            setLoading(false);
        }
    }, [exam.pdf_path, examStarted]);

    const checkSubmissionStatus = async () => {
        if (!isElectron()) return;

        try {
            const result = await (window as any).electronAPI.getExamSubmission(exam.exam_id);
            if (result.success && result.submission) {
                setSubmissionStatus({
                    submitted: true,
                    submittedAt: result.submission.submitted_at,
                    filesData: result.submission.files_data ? JSON.parse(result.submission.files_data) : []
                });
            }
        } catch (err) {
            console.error('Error checking submission status:', err);
        }
    };

    const checkExamStartedStatus = async (): Promise<boolean> => {
        // Check if exam is currently in progress (within time window)
        const now = new Date();
        const startTime = new Date(exam.start_time);
        const endTime = new Date(exam.end_time);

        console.log('Checking exam started status:', {
            now: now.toISOString(),
            startTime: exam.start_time,
            endTime: exam.end_time,
            examStarted,
            withinWindow: now >= startTime && now <= endTime
        });

        // If exam has ended, don't check monitoring
        if (now > endTime) {
            console.log('Exam has ended, not checking monitoring');
            localStorage.removeItem(`exam_session_${exam.exam_id}`);
            return false;
        }

        // If we're within exam time, check if monitoring is already running
        if (now >= startTime && now <= endTime) {
            if (isElectron()) {
                try {
                    const status = await (window as any).electronAPI.getMonitoringStatus();
                    console.log('Monitoring status received:', JSON.stringify(status, null, 2));

                    if (status && status.success && status.isMonitoring) {
                        // Monitoring is active, resume exam session
                        console.log('✅ Monitoring is active - resuming exam session');
                        setExamStarted(true);
                        setMonitoringActive(true);
                        return true;
                    } else {
                        console.log('❌ Monitoring not active - exam needs to be started');
                        return false;
                    }
                } catch (err) {
                    console.error('Error checking monitoring status:', err);
                    return false;
                }
            }
        }
        return false;
    };

    const loadAndProcessPDF = async () => {
        try {
            setLoading(true);
            setError(null);

            if (!isElectron()) {
                setError('PDF processing only available in desktop app');
                setLoading(false);
                return;
            }

            // Get PDF data from backend
            const result = await (window as any).electronAPI.getPDFData(exam.exam_id);

            if (!result.success || !result.data) {
                setError(result.error || 'Failed to load PDF');
                setLoading(false);
                return;
            }

            // Convert base64 to ArrayBuffer
            const binaryString = atob(result.data);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }

            // Load PDF
            const pdf = await pdfjsLib.getDocument({ data: bytes.buffer }).promise;

            let fullText = '';
            const images: string[] = [];

            // Process each page - render as images only
            for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
                const page = await pdf.getPage(pageNum);

                // Render page to canvas at high quality
                const viewport = page.getViewport({ scale: 2.0 });
                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                canvas.height = viewport.height;
                canvas.width = viewport.width;

                if (context) {
                    await page.render({
                        canvasContext: context,
                        viewport: viewport
                    }).promise;

                    // Convert canvas to image
                    const imageData = canvas.toDataURL('image/png');
                    images.push(imageData);
                }
            }

            setExamContent({
                text: '', // No text extraction needed
                images: images
            });
            setLoading(false);
        } catch (err) {
            console.error('Error processing PDF:', err);
            setError('Failed to process PDF: ' + (err as Error).message);
            setLoading(false);
        }
    };

    const handleStartExam = async () => {
        try {
            setError(null);

            // Check if exam can be started
            const now = new Date();
            const startTime = new Date(exam.start_time);
            const endTime = new Date(exam.end_time);

            if (now < startTime) {
                setError('Exam has not started yet');
                return;
            }

            if (now > endTime) {
                setError('Exam has already ended');
                return;
            }

            setExamStarted(true);
            onExamStarted();

            // Store exam session in localStorage for persistence
            localStorage.setItem(`exam_session_${exam.exam_id}`, JSON.stringify({
                examId: exam.exam_id,
                studentId: user.userId,
                startedAt: new Date().toISOString()
            }));

            // Start monitoring if in Electron and not already active
            if (isElectron()) {
                // Check if monitoring is already active
                const statusCheck = await (window as any).electronAPI.getMonitoringStatus();

                if (statusCheck && statusCheck.isMonitoring) {
                    // Monitoring already active, just update state
                    setMonitoringActive(true);
                    console.log('Monitoring already active, resuming session');
                } else {
                    // Start new monitoring session
                    const result = await (window as any).electronAPI.startMonitoring(
                        exam.exam_id,
                        user.userId,
                        exam.allowed_apps
                    );

                    if (result.success) {
                        setMonitoringActive(true);
                    } else {
                        setError('Warning: Monitoring failed to start - ' + result.error);
                    }
                }
            }
        } catch (err) {
            setError('Failed to start exam: ' + (err as Error).message);
        }
    };

    const handleSubmitExam = () => {
        setShowSubmitDialog(true);
    };

    const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (files) {
            const fileArray = Array.from(files);
            setSubmittedFiles(fileArray);

            // Read ZIP file contents
            const zipContentMap: { [key: string]: string[] } = {};

            for (const file of fileArray) {
                if (file.name.endsWith('.zip')) {
                    try {
                        const zip = new JSZip();
                        const zipData = await zip.loadAsync(file);
                        const fileNames: string[] = [];

                        zipData.forEach((relativePath, zipEntry) => {
                            if (!zipEntry.dir) {
                                fileNames.push(relativePath);
                            }
                        });

                        zipContentMap[file.name] = fileNames;
                    } catch (err) {
                        console.error('Error reading ZIP file:', err);
                        zipContentMap[file.name] = ['Error reading ZIP contents'];
                    }
                }
            }

            setZipContents(zipContentMap);
        }
    };

    const handleFinalSubmit = async () => {
        try {
            // Submit exam to backend (DON'T stop monitoring yet)
            if (isElectron()) {
                const filesData = submittedFiles.map(f => ({
                    name: f.name,
                    size: f.size,
                    type: f.type
                }));

                const result = await (window as any).electronAPI.submitExam(exam.exam_id, filesData);

                if (!result.success) {
                    alert('Error submitting exam: ' + result.error);
                    return;
                }

                // Update submission status
                setSubmissionStatus({
                    submitted: true,
                    submittedAt: new Date().toISOString(),
                    filesData: filesData
                });
            }

            setShowSubmitDialog(false);
            setShowConfirmDialog(true);

            // Show success message
            alert('Files submitted! Please review and confirm your submission.');
        } catch (err) {
            console.error('Error submitting exam:', err);
            alert('Error submitting exam. Please try again.');
        }
    };

    const handleConfirmSubmission = async () => {
        try {
            // Stop monitoring
            if (isElectron() && monitoringActive) {
                await (window as any).electronAPI.stopMonitoring();
                setMonitoringActive(false);
            }

            setExamStarted(false);
            setShowConfirmDialog(false);
            onExamEnded();

            // Show success message
            alert('Exam submission confirmed! Good luck!');

            // Close exam page and go back to dashboard
            onBack();
        } catch (err) {
            console.error('Error confirming submission:', err);
            alert('Error confirming submission. Please try again.');
        }
    };

    const handleUnsubmit = async () => {
        if (!confirm('Are you sure you want to unsubmit? You can resubmit before the exam ends.')) {
            return;
        }

        try {
            if (isElectron()) {
                const result = await (window as any).electronAPI.unsubmitExam(exam.exam_id);

                if (!result.success) {
                    alert('Error unsubmitting exam: ' + result.error);
                    return;
                }

                // Update submission status
                setSubmissionStatus({ submitted: false });
                setSubmittedFiles([]);
                setShowConfirmDialog(false);
                alert('Exam unsubmitted successfully! You can now resubmit.');
            }
        } catch (err) {
            console.error('Error unsubmitting exam:', err);
            alert('Error unsubmitting exam. Please try again.');
        }
    };

    const handleCancelConfirm = () => {
        setShowConfirmDialog(false);
    };

    const handleCancelSubmit = () => {
        setShowSubmitDialog(false);
        setSubmittedFiles([]);
    };

    const formatTime = (seconds: number): string => {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;

        if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
        return `${minutes}:${secs.toString().padStart(2, '0')}`;
    };

    const canStartExam = () => {
        const now = new Date();
        const startTime = new Date(exam.start_time);
        const endTime = new Date(exam.end_time);
        return now >= startTime && now <= endTime;
    };

    const isExamEnded = () => {
        const now = new Date();
        const endTime = new Date(exam.end_time);
        return now > endTime;
    };

    const canUnsubmit = () => {
        return submissionStatus.submitted && !isExamEnded();
    };

    return (
        <div className="exam-page">
            {/* Header */}
            <div className="exam-header">
                <button onClick={onBack} className="back-btn" disabled={examStarted}>
                    ← Back to Dashboard
                </button>
                <div className="exam-info">
                    <h1>{exam.title}</h1>
                    <p>{exam.course_code} - {exam.course_name}</p>
                </div>
            </div>

            {error && (
                <div className="exam-error">
                    ⚠️ {error}
                </div>
            )}

            {/* Main Content Layout */}
            <div className="exam-main-layout">
                {/* Left Side - Question Paper */}
                <div className="exam-left-section">
                    <div className="question-paper-section">
                        <div className="section-header">
                            <h2>📄 Question Paper</h2>
                            {!examStarted && !checkingStatus && (
                                <button
                                    onClick={handleStartExam}
                                    className="start-exam-btn-inline"
                                    disabled={!canStartExam()}
                                >
                                    🚀 Start Exam
                                </button>
                            )}
                            {checkingStatus && (
                                <div className="checking-status">
                                    <div className="loading-spinner-small"></div>
                                    <span>Checking exam status...</span>
                                </div>
                            )}
                        </div>

                        {!examStarted && !canStartExam() && (
                            <div className="exam-status-notice">
                                {new Date() < new Date(exam.start_time)
                                    ? '⏰ Exam has not started yet'
                                    : '⏰ Exam has ended'}
                            </div>
                        )}

                        {/* Exam Content */}
                        {!examStarted ? (
                            <div className="exam-not-started">
                                <div className="not-started-icon">🔒</div>
                                <h3>Exam Not Started</h3>
                                <p>Click "Start Exam" to begin and view the question paper</p>
                            </div>
                        ) : loading ? (
                            <div className="loading-content">
                                <div className="loading-spinner"></div>
                                <p>Processing exam content...</p>
                            </div>
                        ) : examContent && examContent.images.length > 0 ? (
                            <div className="content-display">
                                <div className="pdf-pages">
                                    {examContent.images.map((img, index) => (
                                        <div key={index} className="exam-page-image">
                                            <img src={img} alt={`Page ${index + 1}`} />
                                            <p className="page-number">Page {index + 1} of {examContent.images.length}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="no-content">
                                <p>No exam paper available</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Right Side - Exam Details & Submission */}
                <div className="exam-right-section">
                    {/* Timer Card */}
                    <div className="timer-card">
                        <div className="timer-header">
                            <span className="timer-icon">⏱️</span>
                            <span className="timer-label">Time Remaining</span>
                        </div>
                        <div className={`timer-display ${timeRemaining > 0 && timeRemaining < 300 ? 'warning' : ''}`}>
                            {examStarted && timeRemaining >= 0 ? formatTime(timeRemaining) : '--:--'}
                        </div>
                        {examStarted && (
                            <div className="timer-info">
                                <p>Ends: {new Date(exam.end_time).toLocaleTimeString()}</p>
                            </div>
                        )}
                    </div>

                    {/* Monitoring Status Card */}
                    {examStarted && (
                        <div className="monitoring-card">
                            <div className="card-header">
                                <span className="card-icon">👁️</span>
                                <h3>Monitoring Status</h3>
                            </div>
                            <div className={`monitoring-indicator ${monitoringActive ? 'active' : 'inactive'}`}>
                                <span className="status-dot"></span>
                                <span>{monitoringActive ? 'Active' : 'Inactive'}</span>
                            </div>
                            {monitoringActive && (
                                <p className="monitoring-message">
                                    Your activity is being tracked for academic integrity
                                </p>
                            )}
                        </div>
                    )}

                    {/* Allowed Apps Card */}
                    <div className="allowed-apps-card">
                        <div className="card-header">
                            <span className="card-icon">📱</span>
                            <h3>Allowed Applications</h3>
                        </div>
                        <div className="allowed-apps-list">
                            {(exam.allowed_apps || []).map((app, index) => (
                                <div key={index} className="app-item">
                                    <span className="app-icon">✓</span>
                                    <span className="app-name">{app}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Submission Card */}
                    {examStarted && (
                        <div className="submission-card">
                            <div className="card-header">
                                <span className="card-icon">📤</span>
                                <h3>Your Work</h3>
                            </div>

                            {!submissionStatus.submitted ? (
                                <div className="submission-content">
                                    <p className="submission-instruction">
                                        Upload your answer files when ready
                                    </p>
                                    <button onClick={handleSubmitExam} className="submit-files-btn">
                                        📁 Upload Files
                                    </button>
                                </div>
                            ) : (
                                <div className="submission-content">
                                    <div className="submitted-status">
                                        <span className="status-icon">✅</span>
                                        <span className="status-text">Files Submitted</span>
                                    </div>
                                    <p className="submitted-time">
                                        {new Date(submissionStatus.submittedAt!).toLocaleTimeString()}
                                    </p>
                                    <div className="submitted-files-summary">
                                        <p className="files-count">
                                            {submissionStatus.filesData?.length || 0} file(s) uploaded
                                        </p>
                                    </div>
                                    <button onClick={() => setShowConfirmDialog(true)} className="review-btn">
                                        📋 Review & Confirm
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Submit Dialog */}
            {showSubmitDialog && (
                <div className="submit-dialog-overlay">
                    <div className="submit-dialog">
                        <h2>📤 Upload Your Work</h2>
                        <p>Select your answer files to submit</p>

                        <div className="file-upload-section">
                            <label htmlFor="exam-files" className="file-upload-btn">
                                📁 Choose Files
                            </label>
                            <input
                                id="exam-files"
                                type="file"
                                multiple
                                onChange={handleFileSelect}
                                style={{ display: 'none' }}
                            />
                        </div>

                        {submittedFiles.length > 0 && (
                            <div className="submitted-files-list">
                                <h3>Selected Files ({submittedFiles.length})</h3>
                                {submittedFiles.map((file, index) => {
                                    const isZip = file.name.endsWith('.zip');
                                    const zipFiles = zipContents[file.name];
                                    return (
                                        <div key={index} className="file-item-container">
                                            <div className="file-item">
                                                <span className="file-icon">{isZip ? '📦' : '📄'}</span>
                                                <div className="file-details">
                                                    <span className="file-name">{file.name}</span>
                                                    <span className="file-size">
                                                        {(file.size / 1024).toFixed(2)} KB
                                                        {isZip && zipFiles && (
                                                            <span className="zip-file-count"> • {zipFiles.length} files</span>
                                                        )}
                                                    </span>
                                                </div>
                                            </div>
                                            {isZip && zipFiles && zipFiles.length > 0 && (
                                                <div className="zip-contents">
                                                    <div className="zip-contents-header">
                                                        📂 Archive Contents:
                                                    </div>
                                                    <ul className="zip-files-list">
                                                        {zipFiles.slice(0, 10).map((fileName, idx) => (
                                                            <li key={idx}>
                                                                <span className="zip-file-icon">📄</span>
                                                                {fileName}
                                                            </li>
                                                        ))}
                                                        {zipFiles.length > 10 && (
                                                            <li className="more-files">
                                                                ... and {zipFiles.length - 10} more files
                                                            </li>
                                                        )}
                                                    </ul>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        <div className="submit-dialog-actions">
                            <button onClick={handleCancelSubmit} className="cancel-btn">
                                Cancel
                            </button>
                            <button
                                onClick={handleFinalSubmit}
                                className="confirm-submit-btn"
                                disabled={submittedFiles.length === 0}
                            >
                                Upload Files
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Confirm Submission Dialog */}
            {showConfirmDialog && submissionStatus.submitted && (
                <div className="submit-dialog-overlay">
                    <div className="submit-dialog confirm-dialog">
                        <h2>📋 Review Your Submission</h2>
                        <p>Please review your submitted files before confirming</p>

                        <div className="submitted-files-preview">
                            <h3>Submitted Files ({submissionStatus.filesData?.length || 0})</h3>
                            {submissionStatus.filesData && submissionStatus.filesData.length > 0 ? (
                                <div className="files-preview-list">
                                    {submissionStatus.filesData.map((file: any, index: number) => {
                                        const isZip = file.name.endsWith('.zip');
                                        const zipFiles = zipContents[file.name];
                                        return (
                                            <div key={index} className="file-preview-container">
                                                <div className="file-preview-item">
                                                    <span className="file-icon">{isZip ? '📦' : '📄'}</span>
                                                    <div className="file-info">
                                                        <span className="file-name">{file.name}</span>
                                                        <span className="file-meta">
                                                            {(file.size / 1024).toFixed(2)} KB
                                                            {isZip && <span className="zip-badge">ZIP Archive</span>}
                                                            {isZip && zipFiles && (
                                                                <span className="zip-file-count"> • {zipFiles.length} files</span>
                                                            )}
                                                        </span>
                                                    </div>
                                                </div>
                                                {isZip && zipFiles && zipFiles.length > 0 && (
                                                    <div className="zip-contents">
                                                        <div className="zip-contents-header">
                                                            📂 Archive Contents:
                                                        </div>
                                                        <ul className="zip-files-list">
                                                            {zipFiles.slice(0, 10).map((fileName, idx) => (
                                                                <li key={idx}>
                                                                    <span className="zip-file-icon">📄</span>
                                                                    {fileName}
                                                                </li>
                                                            ))}
                                                            {zipFiles.length > 10 && (
                                                                <li className="more-files">
                                                                    ... and {zipFiles.length - 10} more files
                                                                </li>
                                                            )}
                                                        </ul>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <p className="no-files-warning">⚠️ No files submitted</p>
                            )}
                        </div>

                        <div className="submission-time-info">
                            <p>📅 Submitted at: {new Date(submissionStatus.submittedAt!).toLocaleString()}</p>
                            <p className="time-remaining-info">
                                ⏰ Time remaining: {timeRemaining >= 0 ? formatTime(timeRemaining) : '--:--'}
                            </p>
                        </div>

                        <div className="confirm-dialog-actions">
                            {canUnsubmit() && (
                                <button onClick={handleUnsubmit} className="unsubmit-btn">
                                    🔄 Change Files
                                </button>
                            )}
                            <button onClick={handleCancelConfirm} className="cancel-btn">
                                ← Back to Exam
                            </button>
                            <button onClick={handleConfirmSubmission} className="confirm-final-btn">
                                ✅ Confirm & End Exam
                            </button>
                        </div>

                        <p className="confirm-warning">
                            ⚠️ Once confirmed, you cannot make changes even if time remains
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ExamPage;
