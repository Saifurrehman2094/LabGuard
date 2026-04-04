import React from 'react';
import { RecentEvent, RecentSubmission } from '../../hooks/useDashboardData';

interface EventLogProps {
  events: RecentEvent[];
  submissions: RecentSubmission[];
}

function fmtTime(ts: string): string {
  if (!ts) return '-';
  const date = new Date(ts);
  if (isNaN(date.getTime())) return ts;
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function fmtDate(ts: string): string {
  if (!ts) return '-';
  const date = new Date(ts);
  if (isNaN(date.getTime())) return ts;
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + fmtTime(ts);
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
          {events.map((eventItem, index) => (
            <div
              key={eventItem.id ?? index}
              className={`dash-event-row ${eventItem.is_violation ? 'dash-event-violation' : ''}`}
            >
              <div
                className="dash-event-dot"
                style={{ background: eventItem.is_violation ? '#f87171' : '#60a5fa' }}
              />
              <div className="dash-event-body">
                <span className="dash-event-type">{eventItem.event_type ?? 'event'}</span>
                {eventItem.student_name && (
                  <span className="dash-event-student"> - {eventItem.student_name}</span>
                )}
                {eventItem.window_title && <div className="dash-event-detail">{eventItem.window_title}</div>}
              </div>
              <span className="dash-event-time">{fmtTime(eventItem.timestamp)}</span>
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
          {submissions.map((submission, index) => {
            const scoreColor = submission.hardcoded
              ? '#f87171'
              : submission.score >= 80
              ? '#4ade80'
              : submission.score >= 40
              ? '#f59e0b'
              : '#f87171';

            return (
              <div key={submission.submission_id ?? index} className="dash-sub-row">
                <div className="dash-sub-body">
                  <span className="dash-sub-student">{submission.student_name || submission.username}</span>
                  <span className="dash-sub-q">{submission.question_title || 'Unknown question'}</span>
                  <div className="dash-sub-meta">
                    <span className="dash-sub-lang">{submission.language}</span>
                    {submission.hardcoded === 1 && (
                      <span className="dash-badge" style={{ color: '#f87171', borderColor: '#f87171' }}>
                        hardcoded
                      </span>
                    )}
                    {submission.concept_passed === 0 && (
                      <span className="dash-badge" style={{ color: '#f59e0b', borderColor: '#f59e0b' }}>
                        concept fail
                      </span>
                    )}
                  </div>
                </div>
                <div className="dash-sub-right">
                  <span className="dash-sub-score" style={{ color: scoreColor }}>
                    {submission.score}%
                  </span>
                  <span className="dash-sub-cases">
                    {submission.passed_count}/{submission.total_count}
                  </span>
                  <span className="dash-event-time">{fmtDate(submission.submitted_at)}</span>
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
