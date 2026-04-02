import React from 'react';
import { RecentEvent, RecentSubmission } from '../../hooks/useDashboardData';

interface EventLogProps {
  events: RecentEvent[];
  submissions: RecentSubmission[];
}

function fmtTime(ts: string): string {
  if (!ts) return '—';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return ts;
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function fmtDate(ts: string): string {
  if (!ts) return '—';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return ts;
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + fmtTime(ts);
}

const EventLog: React.FC<EventLogProps> = ({ events, submissions }) => {
  return (
    <div className="dash-panel dash-event-log">
      <div className="dash-panel-header">
        <span className="dash-panel-title">Monitoring Events</span>
        <span className="dash-badge dash-badge-count">{events.length}</span>
      </div>

      {events.length === 0 ? (
        <div className="dash-empty-note">No monitoring events recorded yet.</div>
      ) : (
        <div className="dash-event-list">
          {events.map((ev, i) => (
            <div key={ev.id ?? i} className={`dash-event-row ${ev.is_violation ? 'dash-event-violation' : ''}`}>
              <div className="dash-event-dot" style={{ background: ev.is_violation ? '#f87171' : '#60a5fa' }} />
              <div className="dash-event-body">
                <span className="dash-event-type">{ev.event_type ?? 'event'}</span>
                {ev.student_name && (
                  <span className="dash-event-student"> — {ev.student_name}</span>
                )}
                {ev.window_title && (
                  <div className="dash-event-detail">{ev.window_title}</div>
                )}
              </div>
              <span className="dash-event-time">{fmtTime(ev.timestamp)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="dash-panel-header" style={{ marginTop: 16 }}>
        <span className="dash-panel-title">Recent Submissions</span>
        <span className="dash-badge dash-badge-count">{submissions.length}</span>
      </div>

      {submissions.length === 0 ? (
        <div className="dash-empty-note">No submissions yet.</div>
      ) : (
        <div className="dash-sub-list">
          {submissions.map((s, i) => {
            const scoreColor = s.hardcoded
              ? '#f87171'
              : s.score >= 80
              ? '#4ade80'
              : s.score >= 40
              ? '#f59e0b'
              : '#f87171';
            return (
              <div key={s.submission_id ?? i} className="dash-sub-row">
                <div className="dash-sub-body">
                  <span className="dash-sub-student">{s.student_name || s.username}</span>
                  <span className="dash-sub-q">{s.question_title || 'Unknown question'}</span>
                  <div className="dash-sub-meta">
                    <span className="dash-sub-lang">{s.language}</span>
                    {s.hardcoded === 1 && (
                      <span className="dash-badge" style={{ color: '#f87171', borderColor: '#f87171' }}>hardcoded</span>
                    )}
                    {s.concept_passed === 0 && (
                      <span className="dash-badge" style={{ color: '#f59e0b', borderColor: '#f59e0b' }}>concept fail</span>
                    )}
                  </div>
                </div>
                <div className="dash-sub-right">
                  <span className="dash-sub-score" style={{ color: scoreColor }}>{s.score}%</span>
                  <span className="dash-sub-cases">{s.passed_count}/{s.total_count}</span>
                  <span className="dash-event-time">{fmtDate(s.submitted_at)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default EventLog;
