import React, { useState, useEffect, useRef } from 'react';
import SubmissionDetailModal from './SubmissionDetailModal';
import './LiveSubmissionToast.css';

export interface SubmissionEvent {
  id: string;               // unique per toast
  examId: string;
  examTitle: string;
  studentId: string;
  studentName: string;
  questionId: string;
  score: number;
  maxMarks: number;
  passedCount: number;
  totalCount: number;
  hardcoded: boolean;
  conceptPassed: boolean;
  submittedAt: string;
}

interface LiveSubmissionToastProps {
  exams: Array<{ examId: string; title: string }>;
}

const DISMISS_MS = 30_000;   // auto-dismiss after 30 s (unless hovered)

const LiveSubmissionToast: React.FC<LiveSubmissionToastProps> = ({ exams }) => {
  const api = (window as any).electronAPI;
  const [toasts, setToasts]   = useState<SubmissionEvent[]>([]);
  const [modal,  setModal]    = useState<SubmissionEvent | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  /* ── helpers ── */
  const dismiss = (id: string) => {
    clearTimeout(timers.current[id]);
    delete timers.current[id];
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  const scheduleDismiss = (id: string) => {
    timers.current[id] = setTimeout(() => dismiss(id), DISMISS_MS);
  };

  /* ── listener ── */
  useEffect(() => {
    if (!api?.onStudentSubmitted) return;
    let counter = 0;

    api.onStudentSubmitted((data: any) => {
      const examTitle = exams.find(e => e.examId === data.examId)?.title || 'Exam';
      const toast: SubmissionEvent = {
        id: `${Date.now()}-${counter++}`,
        examId:      data.examId,
        examTitle,
        studentId:   data.studentId,
        studentName: data.studentName,
        questionId:  data.questionId,
        score:       data.score ?? 0,
        maxMarks:    data.maxMarks ?? 0,
        passedCount: data.passedCount ?? 0,
        totalCount:  data.totalCount ?? 0,
        hardcoded:   !!data.hardcoded,
        conceptPassed: data.conceptPassed !== false,
        submittedAt: data.submittedAt || new Date().toISOString()
      };
      setToasts(prev => [toast, ...prev].slice(0, 20));
      setCollapsed(false);
      scheduleDismiss(toast.id);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, exams]);

  /* ── cleanup timers on unmount ── */
  useEffect(() => {
    return () => Object.values(timers.current).forEach(clearTimeout);
  }, []);

  if (toasts.length === 0) return null;

  const pct = (t: SubmissionEvent) =>
    t.maxMarks > 0 ? Math.round((t.score / t.maxMarks) * 100) : 0;

  const chipClass = (t: SubmissionEvent) => {
    if (t.hardcoded) return 'lst-chip-hc';
    const p = pct(t);
    return p >= 80 ? 'lst-chip-green' : p >= 50 ? 'lst-chip-yellow' : 'lst-chip-red';
  };

  return (
    <>
      {/* ── Toast panel (fixed, bottom-right) ── */}
      <div className="lst-panel">
        {/* Panel header */}
        <div className="lst-header">
          <span className="lst-live-dot" />
          <span className="lst-title">Live Submissions ({toasts.length})</span>
          <button className="lst-collapse-btn" onClick={() => setCollapsed(c => !c)}
            title={collapsed ? 'Expand' : 'Collapse'}>
            {collapsed ? '▲' : '▼'}
          </button>
          <button className="lst-clear-btn" onClick={() => setToasts([])} title="Clear all">✕</button>
        </div>

        {/* Toast cards */}
        {!collapsed && (
          <div className="lst-cards">
            {toasts.map(t => (
              <div
                key={t.id}
                className={`lst-card ${chipClass(t)}`}
                onMouseEnter={() => { clearTimeout(timers.current[t.id]); }}
                onMouseLeave={() => scheduleDismiss(t.id)}
              >
                {/* Left: avatar */}
                <div className="lst-avatar">{(t.studentName || 'S')[0].toUpperCase()}</div>

                {/* Middle: details */}
                <div className="lst-info">
                  <div className="lst-student">{t.studentName}</div>
                  <div className="lst-exam">{t.examTitle}</div>
                  <div className="lst-meta">
                    <span className={`lst-pct ${chipClass(t)}`}>
                      {t.hardcoded ? '⚠ Hardcoded' : `${pct(t)}%`}
                    </span>
                    <span className="lst-marks">{t.score}/{t.maxMarks} marks</span>
                    <span className="lst-tc">{t.passedCount}/{t.totalCount} tests</span>
                    {!t.conceptPassed && !t.hardcoded && (
                      <span className="lst-concept-warn">concept ✗</span>
                    )}
                  </div>
                  <div className="lst-time">
                    {new Date(t.submittedAt).toLocaleTimeString()}
                  </div>
                </div>

                {/* Right: actions */}
                <div className="lst-actions">
                  <button
                    className="lst-view-btn"
                    onClick={() => setModal(t)}
                    title="Open full report"
                  >
                    View Report
                  </button>
                  <button
                    className="lst-dismiss-btn"
                    onClick={() => dismiss(t.id)}
                    title="Dismiss"
                  >✕</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Full detail modal ── */}
      {modal && (
        <SubmissionDetailModal
          examId={modal.examId}
          examTitle={modal.examTitle}
          studentId={modal.studentId}
          studentName={modal.studentName}
          onClose={() => setModal(null)}
        />
      )}
    </>
  );
};

export default LiveSubmissionToast;
