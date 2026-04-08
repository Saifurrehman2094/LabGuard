import React, { useEffect, useMemo, useState } from 'react';
import './ViolationsTab.css';

interface User {
  userId: string;
  username: string;
  role: string;
  fullName: string;
}

interface IntegrityIncident {
  incident_id: string;
  exam_id: string;
  exam_title: string;
  source: 'app' | 'camera' | string;
  violation_type: string;
  display_type: string;
  application_name: string | null;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number;
}

interface ViolationsTabProps {
  user: User;
}

const formatDate = (value?: string | null) => {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString();
};

const formatDuration = (seconds?: number) => {
  const safe = Number(seconds || 0);
  if (safe <= 0) return '< 1s';
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
};

const ViolationsTab: React.FC<ViolationsTabProps> = ({ user }) => {
  const [incidents, setIncidents] = useState<IntegrityIncident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedExam, setSelectedExam] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'app' | 'camera'>('all');

  const isElectron = () => !!(window as any).electronAPI;

  useEffect(() => {
    const loadViolations = async () => {
      try {
        setLoading(true);
        setError(null);
        if (!isElectron()) {
          setIncidents([]);
          return;
        }
        const result = await (window as any).electronAPI.getStudentViolations(null);
        if (result.success) {
          setIncidents(result.violations || []);
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
    loadViolations();
  }, [user.userId]);

  const exams = useMemo(() => {
    return Array.from(
      new Map(incidents.map((v) => [v.exam_id, { exam_id: v.exam_id, title: v.exam_title }])).values()
    );
  }, [incidents]);

  const filtered = useMemo(() => {
    let rows = selectedExam === 'all' ? incidents : incidents.filter((v) => v.exam_id === selectedExam);
    if (sourceFilter !== 'all') rows = rows.filter((row) => row.source === sourceFilter);
    return rows;
  }, [incidents, selectedExam, sourceFilter]);

  const summary = useMemo(() => {
    const total = filtered.length;
    const appCount = filtered.filter((v) => v.source === 'app').length;
    const cameraCount = filtered.filter((v) => v.source === 'camera').length;
    const byType = filtered.reduce((acc, row) => {
      const key = row.display_type || row.violation_type || 'Other';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    const topTypes = Object.entries(byType).sort((a, b) => b[1] - a[1]).slice(0, 3);
    return { total, appCount, cameraCount, topTypes };
  }, [filtered]);

  if (loading) {
    return (
      <div className="violations-tab"><div className="loading-container"><div className="loading-spinner"></div><p>Loading violations...</p></div></div>
    );
  }

  return (
    <div className="violations-tab">
      <div className="violations-header">
        <h2>My Integrity Activity</h2>
        <p>Review app and camera incidents by exam. Screenshots are hidden on student view.</p>
      </div>

      {error && <div className="error-message">⚠️ {error}</div>}

      <div className="violations-controls">
        <div className="violations-filter">
          <label>Exam</label>
          <select value={selectedExam} onChange={(e) => setSelectedExam(e.target.value)}>
            <option value="all">All Exams</option>
            {exams.map((exam) => <option key={exam.exam_id} value={exam.exam_id}>{exam.title}</option>)}
          </select>
        </div>
        <div className="violations-filter">
          <label>Source</label>
          <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value as 'all' | 'app' | 'camera')}>
            <option value="all">All sources</option>
            <option value="app">App only</option>
            <option value="camera">Camera only</option>
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="no-violations">
          <div className="no-violations-icon">✅</div>
          <h3>No Incidents</h3>
          <p>No violations were recorded for the selected scope.</p>
        </div>
      ) : (
        <>
          <div className="overview-cards">
            <div className="overview-card"><div className="card-content"><div className="card-value">{summary.total}</div><div className="card-label">Total incidents</div></div></div>
            <div className="overview-card"><div className="card-content"><div className="card-value">{summary.appCount}</div><div className="card-label">App incidents</div></div></div>
            <div className="overview-card"><div className="card-content"><div className="card-value">{summary.cameraCount}</div><div className="card-label">Camera incidents</div></div></div>
          </div>

          {summary.topTypes.length > 0 && (
            <div className="type-summary-strip">
              {summary.topTypes.map(([label, count]) => (
                <span className="type-summary-chip" key={label}>
                  {label}: {count}
                </span>
              ))}
            </div>
          )}

          <div className="violations-list clean">
            {filtered.map((incident) => (
              <article key={incident.incident_id} className={`violation-card ${incident.source === 'camera' ? 'orange' : 'red'}`}>
                <div className="violation-details">
                  <div className="violation-header-row">
                    <h3>{incident.exam_title}</h3>
                    <span className="violation-type">{incident.display_type}</span>
                  </div>
                  <div className="violation-info">
                    <p><strong>Source:</strong> {incident.source === 'camera' ? 'Camera' : 'Application monitoring'}</p>
                    <p><strong>Started:</strong> {formatDate(incident.started_at)}</p>
                    <p><strong>Ended:</strong> {formatDate(incident.ended_at)}</p>
                    <p><strong>Duration:</strong> {formatDuration(incident.duration_seconds)}</p>
                    {incident.application_name ? (
                      <p><strong>Application:</strong> {incident.application_name}</p>
                    ) : null}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default ViolationsTab;
