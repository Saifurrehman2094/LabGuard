import React, { useMemo, useState, useEffect } from 'react';
import ScreenshotViewer from './ScreenshotViewer';
import './ViolationReport.css';

interface AppViolation {
  violationId: string;
  studentId: string;
  studentName: string;
  username: string;
  appName: string;
  windowTitle: string;
  focusStartTime: string;
  focusEndTime?: string;
  durationSeconds?: number;
  screenshotPath?: string | null;
  screenshotCaptured?: boolean;
  createdAt?: string;
}

interface CameraViolation {
  cameraViolationId: string;
  studentId: string;
  studentName: string;
  username: string;
  violationType: string;
  timestamp: string;
  details?: string;
  durationSeconds?: number | null;
  screenshotPath?: string | null;
}

interface StudentIntegrityRow {
  studentId: string;
  studentName: string;
  username: string;
  appViolationCount: number;
  cameraViolationCount: number;
  totalViolationCount: number;
  riskLevel: 'low' | 'medium' | 'high' | string;
  isReviewed?: boolean;
  isSuspicious?: boolean;
  reviewedAt?: string | null;
  reviewNotes?: string;
}

interface ViolationReportProps {
    examId: string;
    examTitle: string;
}

const ViolationReport: React.FC<ViolationReportProps> = ({ examId, examTitle }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [students, setStudents] = useState<StudentIntegrityRow[]>([]);
  const [appViolations, setAppViolations] = useState<AppViolation[]>([]);
  const [cameraViolations, setCameraViolations] = useState<CameraViolation[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [selectedScreenshot, setSelectedScreenshot] = useState<{ path: string; violationId: string } | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'suspicious' | 'reviewed'>('pending');
  const [sortBy, setSortBy] = useState<'risk' | 'recent' | 'name'>('risk');
  const [isUpdatingReview, setIsUpdatingReview] = useState(false);

  const loadIntegrityData = async () => {
    try {
      setIsLoading(true);
      setError('');
      const api = (window as any).electronAPI;
      if (!api) {
        setStudents([]);
        setAppViolations([]);
        setCameraViolations([]);
        return;
      }

      const combinedRes = await api.getIntegrityReviewData?.(examId);
      if (combinedRes?.success) {
        setStudents(combinedRes.students || []);
        setAppViolations(combinedRes.appViolations || []);
        setCameraViolations(combinedRes.cameraViolations || []);
        return;
      }

      // Fallback to previous app-only endpoint if the new endpoint is not available yet.
      const appRes = await api.getViolations(examId);
      if (!appRes?.success) {
        setError(appRes?.error || combinedRes?.error || 'Failed to load integrity review data');
        return;
      }

      const fallbackAppViolations = appRes.violations || [];
      const studentMap = new Map<string, StudentIntegrityRow>();
      for (const v of fallbackAppViolations) {
        if (!studentMap.has(v.studentId)) {
          studentMap.set(v.studentId, {
            studentId: v.studentId,
            studentName: v.studentName,
            username: v.username,
            appViolationCount: 0,
            cameraViolationCount: 0,
            totalViolationCount: 0,
            riskLevel: 'low'
          });
        }
        const row = studentMap.get(v.studentId)!;
        row.appViolationCount += 1;
        row.totalViolationCount += 1;
        row.riskLevel = row.totalViolationCount >= 3 ? 'medium' : 'low';
      }
      setStudents(Array.from(studentMap.values()));
      setAppViolations(fallbackAppViolations);
      setCameraViolations([]);
    } catch (loadError) {
      console.error('Error loading integrity review data:', loadError);
      setError('Failed to load integrity review data. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadIntegrityData();
  }, [examId]);

  const lastIncidentByStudent = useMemo(() => {
    const latest = new Map<string, number>();
    const register = (studentId: string, value?: string) => {
      if (!studentId || !value) return;
      const ts = new Date(value).getTime();
      if (!Number.isFinite(ts)) return;
      const prev = latest.get(studentId);
      if (!prev || ts > prev) latest.set(studentId, ts);
    };

    for (const v of appViolations) register(v.studentId, v.focusStartTime);
    for (const v of cameraViolations) register(v.studentId, v.timestamp);

    return latest;
  }, [appViolations, cameraViolations]);

  const filteredStudents = useMemo(() => {
    let subset = students;
    if (statusFilter === 'pending') subset = students.filter((s) => !s.isReviewed);
    else if (statusFilter === 'suspicious') subset = students.filter((s) => !!s.isSuspicious);
    else if (statusFilter === 'reviewed') subset = students.filter((s) => !!s.isReviewed);

    return [...subset].sort((a, b) => {
      if (sortBy === 'name') {
        return (a.studentName || '').localeCompare(b.studentName || '', undefined, { sensitivity: 'base' });
      }

      if (sortBy === 'recent') {
        const aTs = lastIncidentByStudent.get(a.studentId) || 0;
        const bTs = lastIncidentByStudent.get(b.studentId) || 0;
        if (aTs !== bTs) return bTs - aTs;
      }

      if (!!a.isSuspicious !== !!b.isSuspicious) return a.isSuspicious ? -1 : 1;
      if (!!a.isReviewed !== !!b.isReviewed) return a.isReviewed ? 1 : -1;
      return (b.totalViolationCount || 0) - (a.totalViolationCount || 0);
    });
  }, [students, statusFilter, sortBy, lastIncidentByStudent]);

  useEffect(() => {
    if (!selectedStudentId && filteredStudents.length > 0) {
      setSelectedStudentId(filteredStudents[0].studentId);
    }
    if (selectedStudentId && !filteredStudents.some((s) => s.studentId === selectedStudentId)) {
      setSelectedStudentId(filteredStudents[0]?.studentId || '');
    }
  }, [filteredStudents, selectedStudentId]);

  const selectedStudent = students.find((s) => s.studentId === selectedStudentId) || null;
  const selectedAppViolations = useMemo(
    () => appViolations.filter((v) => v.studentId === selectedStudentId),
    [appViolations, selectedStudentId]
  );
  const selectedCameraViolations = useMemo(
    () => cameraViolations.filter((v) => v.studentId === selectedStudentId),
    [cameraViolations, selectedStudentId]
  );

  const updateReviewState = async (changes: { isReviewed?: boolean; isSuspicious?: boolean }) => {
    if (!selectedStudent) return;
    const api = (window as any).electronAPI;
    if (!api?.updateIntegrityCaseReview) return;
    try {
      setIsUpdatingReview(true);
      const res = await api.updateIntegrityCaseReview({
        examId,
        studentId: selectedStudent.studentId,
        ...changes
      });
      if (!res?.success) {
        setError(res?.error || 'Failed to update integrity review state');
        return;
      }
      setStudents((prev) =>
        prev.map((student) =>
          student.studentId === selectedStudent.studentId
            ? {
                ...student,
                isReviewed: res.review?.isReviewed ?? student.isReviewed,
                isSuspicious: res.review?.isSuspicious ?? student.isSuspicious,
                reviewedAt: res.review?.reviewedAt ?? student.reviewedAt
              }
            : student
        )
      );
    } catch (e) {
      console.error('Failed to update review state:', e);
      setError('Failed to update integrity review state');
    } finally {
      setIsUpdatingReview(false);
    }
  };

  const formatDateTime = (value?: string) => {
    if (!value) return '-';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
  };

  const formatDuration = (seconds?: number | null) => {
    if (seconds == null || seconds < 0) return '-';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  };

  const renderEvidenceCell = (opts: { screenshotPath?: string | null; violationId: string; source: 'app' | 'camera' }) => {
    if (opts.screenshotPath) {
      return (
        <div className="evidence-cell">
          <button
            className="link-btn"
            onClick={() =>
              setSelectedScreenshot({
                path: opts.screenshotPath as string,
                violationId: opts.violationId
              })
            }
          >
            View screenshot
          </button>
          <span className="evidence-badge evidence-captured">Captured</span>
        </div>
      );
    }

    return (
      <div className="evidence-cell">
        <span className="muted">No screenshot</span>
        <span className="evidence-badge evidence-missing">
          {opts.source === 'camera' ? 'Not captured (cooldown/disabled)' : 'Not captured'}
        </span>
      </div>
    );
  };

  const formatCameraTimeWindow = (details?: string) => {
    if (!details?.trim()) return '—';
    try {
      const parsed = JSON.parse(details);
      if (parsed && typeof parsed === 'object') {
        const start = parsed.startedAt ? formatDateTime(parsed.startedAt) : null;
        const end = parsed.endedAt ? formatDateTime(parsed.endedAt) : null;
        if (start && end) return `${start} → ${end}`;
        if (start) return `Started ${start}`;
        if (end) return `Ended ${end}`;
      }
    } catch {
      /* never show raw payloads */
    }
    return '—';
  };

  const formatViolationTypeLabel = (raw?: string) => {
    if (!raw?.trim()) return '—';
    const normalized = raw.trim().replace(/_ended$/, '');
    if (normalized === 'phone_violation') return 'Phone';
    if (normalized === 'multiple_persons') return 'Multiple Faces';
    return normalized.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  };

  const riskLabel = (level: string) => {
    if (level === 'high') return 'High attention';
    if (level === 'medium') return 'Review suggested';
    return 'Low';
  };

  if (isLoading) {
    return (
      <div className="violation-report">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Loading integrity review...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="violation-report">
        <div className="error-container">
          <div className="error-icon">⚠️</div>
          <h3>Failed to Load Integrity Review</h3>
          <p>{error}</p>
          <button onClick={loadIntegrityData} className="retry-btn">
            Try Again
          </button>
        </div>
      </div>
    );
  }

  const totalIncidents = appViolations.length + cameraViolations.length;
  const pendingCount = students.filter((s) => !s.isReviewed).length;
  const suspiciousCount = students.filter((s) => !!s.isSuspicious).length;
  const reviewedCount = students.filter((s) => !!s.isReviewed).length;

  return (
    <div className="violation-report">
      <header className="integrity-review-hero">
        <div className="integrity-review-hero-inner">
          <div className="integrity-review-title-block">
            <p className="integrity-review-eyebrow">Exam integrity</p>
            <h2 className="integrity-review-title">{examTitle}</h2>
            <p className="integrity-review-subtitle">
              Review app and camera incidents per student. Open evidence to see full-screen captures when available.
            </p>
          </div>
          <div className="integrity-kpi-row" role="group" aria-label="Incident summary">
            <div className="integrity-kpi">
              <span className="integrity-kpi-value">{pendingCount}</span>
              <span className="integrity-kpi-label">Pending review</span>
            </div>
            <div className="integrity-kpi">
              <span className="integrity-kpi-value">{appViolations.length}</span>
              <span className="integrity-kpi-label">App events</span>
            </div>
            <div className="integrity-kpi">
              <span className="integrity-kpi-value">{suspiciousCount}</span>
              <span className="integrity-kpi-label">Suspicious students</span>
            </div>
            <div className="integrity-kpi integrity-kpi-accent">
              <span className="integrity-kpi-value">{totalIncidents}</span>
              <span className="integrity-kpi-label">Total events</span>
            </div>
          </div>
          <button type="button" onClick={loadIntegrityData} className="integrity-refresh">
            Refresh data
          </button>
        </div>
      </header>

      {students.length === 0 ? (
        <div className="error-container">
          <h3>No integrity incidents found</h3>
          <p>No app-level or camera-level incidents were recorded for this exam yet.</p>
        </div>
      ) : (
        <div className="integrity-layout">
          <aside className="students-panel" aria-label="Students with incidents">
            <div className="students-panel-head">
              <h3 className="students-panel-title">Students</h3>
              <p className="students-panel-hint">Select a row to load detail</p>
            </div>
            <div className="review-filter-row">
              <button type="button" className={`filter-chip ${statusFilter === 'pending' ? 'active' : ''}`} onClick={() => setStatusFilter('pending')}>
                Pending
              </button>
              <button type="button" className={`filter-chip ${statusFilter === 'suspicious' ? 'active' : ''}`} onClick={() => setStatusFilter('suspicious')}>
                Suspicious
              </button>
              <button type="button" className={`filter-chip ${statusFilter === 'reviewed' ? 'active' : ''}`} onClick={() => setStatusFilter('reviewed')}>
                Reviewed
              </button>
              <button type="button" className={`filter-chip ${statusFilter === 'all' ? 'active' : ''}`} onClick={() => setStatusFilter('all')}>
                All
              </button>
            </div>
            <div className="queue-meta">
              <p className="queue-meta-text">
                Showing {filteredStudents.length} of {students.length} students
              </p>
              <label className="sort-select-wrap">
                <span>Sort</span>
                <select value={sortBy} onChange={(e) => setSortBy(e.target.value as 'risk' | 'recent' | 'name')}>
                  <option value="risk">Highest incidents</option>
                  <option value="recent">Most recent incident</option>
                  <option value="name">Name A-Z</option>
                </select>
              </label>
            </div>
            <div className="students-list">
              {filteredStudents.length === 0 ? (
                <div className="students-empty">No students in this filter.</div>
              ) : filteredStudents.map((student) => {
                const initials = (student.studentName || student.username || '?')
                  .split(/\s+/)
                  .map((p) => p[0])
                  .join('')
                  .slice(0, 2)
                  .toUpperCase();
                const lastTs = lastIncidentByStudent.get(student.studentId);
                return (
                  <button
                    key={student.studentId}
                    type="button"
                    className={`student-row ${student.studentId === selectedStudentId ? 'active' : ''}`}
                    onClick={() => setSelectedStudentId(student.studentId)}
                  >
                    <span className="student-avatar" aria-hidden>
                      {initials}
                    </span>
                    <div className="student-meta">
                      <strong>{student.studentName}</strong>
                      <span>@{student.username}</span>
                    </div>
                    <div className="student-counts">
                      <span className="count-pill count-app" title="App-level events">
                        App {student.appViolationCount}
                      </span>
                      <span className="count-pill count-cam" title="Camera events">
                        Cam {student.cameraViolationCount}
                      </span>
                      <span className={`risk-badge risk-${student.riskLevel}`} title="Relative signal">
                        {riskLabel(student.riskLevel)}
                      </span>
                      {student.isSuspicious && <span className="state-pill suspicious">Suspicious</span>}
                      {student.isReviewed && <span className="state-pill reviewed">Reviewed</span>}
                    </div>
                    <div className="student-actions">
                      <span className="student-last-incident">
                        Last: {lastTs ? formatDateTime(new Date(lastTs).toISOString()) : '—'}
                      </span>
                      <span className="view-detail-btn">View details</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>

          <div className="detail-panel">
            {selectedStudent ? (
              <>
                <div className="detail-header">
                  <div>
                    <p className="detail-eyebrow">Selected student</p>
                    <h3 className="detail-name">{selectedStudent.studentName}</h3>
                    <p className="detail-handle">@{selectedStudent.username}</p>
                  </div>
                  <div className="detail-header-stats">
                    <span className="detail-stat">
                      <strong>{selectedAppViolations.length}</strong> app
                    </span>
                    <span className="detail-stat">
                      <strong>{selectedCameraViolations.length}</strong> camera
                    </span>
                    <span className="detail-stat">
                      <strong>{reviewedCount}</strong> reviewed
                    </span>
                    <div className="review-action-row">
                      <button
                        type="button"
                        className={`review-action-btn ${selectedStudent.isReviewed ? 'active' : ''}`}
                        disabled={isUpdatingReview}
                        onClick={() => updateReviewState({ isReviewed: !selectedStudent.isReviewed })}
                      >
                        {selectedStudent.isReviewed ? 'Marked Reviewed' : 'Mark Reviewed'}
                      </button>
                      <button
                        type="button"
                        className={`review-action-btn warning ${selectedStudent.isSuspicious ? 'active' : ''}`}
                        disabled={isUpdatingReview}
                        onClick={() => updateReviewState({ isSuspicious: !selectedStudent.isSuspicious })}
                      >
                        {selectedStudent.isSuspicious ? 'Suspicious' : 'Flag Suspicious'}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="detail-sections">
                  <section className="detail-card">
                    <div className="detail-card-head">
                      <h4 className="detail-card-title">Case summary</h4>
                      <p className="detail-card-desc">Quick decision context for this student</p>
                    </div>
                    <div className="case-summary-grid">
                      <div className="case-summary-item">
                        <span className="case-summary-label">Total incidents</span>
                        <strong>{selectedStudent.totalViolationCount}</strong>
                      </div>
                      <div className="case-summary-item">
                        <span className="case-summary-label">Current status</span>
                        <strong>
                          {selectedStudent.isSuspicious
                            ? 'Suspicious'
                            : selectedStudent.isReviewed
                              ? 'Reviewed'
                              : 'Pending review'}
                        </strong>
                      </div>
                      <div className="case-summary-item">
                        <span className="case-summary-label">Last reviewed</span>
                        <strong>{selectedStudent.reviewedAt ? formatDateTime(selectedStudent.reviewedAt) : '—'}</strong>
                      </div>
                    </div>
                  </section>

                  <section className="detail-card">
                    <div className="detail-card-head">
                      <h4 className="detail-card-title">Application focus</h4>
                      <p className="detail-card-desc">Switches away from the exam environment</p>
                    </div>
                    {selectedAppViolations.length === 0 ? (
                      <p className="empty-text">No app-level events for this student.</p>
                    ) : (
                      <div className="detail-table-wrap">
                      <table className="detail-table">
                        <thead>
                          <tr>
                            <th>Time</th>
                            <th>Application</th>
                            <th>Window</th>
                            <th>Duration</th>
                            <th>Evidence</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedAppViolations.map((violation) => (
                            <tr key={violation.violationId}>
                              <td>{formatDateTime(violation.focusStartTime)}</td>
                              <td>{violation.appName}</td>
                              <td>{violation.windowTitle || '-'}</td>
                              <td>{formatDuration(violation.durationSeconds)}</td>
                              <td>
                                {renderEvidenceCell({
                                  screenshotPath: violation.screenshotPath,
                                  violationId: violation.violationId,
                                  source: 'app'
                                })}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      </div>
                    )}
                  </section>

                  <section className="detail-card">
                    <div className="detail-card-head">
                      <h4 className="detail-card-title">Camera monitoring</h4>
                      <p className="detail-card-desc">Presence and posture alerts from the session</p>
                    </div>
                    {selectedCameraViolations.length === 0 ? (
                      <p className="empty-text">No camera events for this student.</p>
                    ) : (
                      <div className="detail-table-wrap">
                      <table className="detail-table">
                        <thead>
                          <tr>
                            <th>Time</th>
                            <th>Type</th>
                            <th>Time window</th>
                            <th>Duration</th>
                            <th>Evidence</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedCameraViolations.map((violation) => (
                            <tr key={violation.cameraViolationId}>
                              <td>{formatDateTime(violation.timestamp)}</td>
                              <td>{formatViolationTypeLabel(violation.violationType)}</td>
                              <td>{formatCameraTimeWindow(violation.details)}</td>
                              <td>{formatDuration(violation.durationSeconds)}</td>
                              <td>
                                {renderEvidenceCell({
                                  screenshotPath: violation.screenshotPath,
                                  violationId: violation.cameraViolationId,
                                  source: 'camera'
                                })}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      </div>
                    )}
                  </section>
                </div>
              </>
            ) : (
              <div className="error-container">
                <p>Select a student to review details.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {selectedScreenshot && (
        <ScreenshotViewer
          screenshotPath={selectedScreenshot.path}
          violationId={selectedScreenshot.violationId}
          onClose={() => setSelectedScreenshot(null)}
        />
      )}
    </div>
  );
};

export default ViolationReport;
