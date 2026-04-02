import React, { useState, useEffect, useRef } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { useDashboardData } from '../hooks/useDashboardData';
import MetricCard from './dashboard/MetricCard';
import PlatformCard from './dashboard/PlatformCard';
import ConceptBar from './dashboard/ConceptBar';
import QuestionAccuracy from './dashboard/QuestionAccuracy';
import PipelinePanel from './dashboard/PipelinePanel';
import EventLog from './dashboard/EventLog';
import './AnalyticsDashboard.css';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

interface AnalyticsDashboardProps {
  user: { userId: string; role: string; fullName: string };
}

const CHART_DEFAULTS = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { labels: { color: '#94a3b8', font: { size: 11 } } },
    tooltip: { backgroundColor: '#1e2130', titleColor: '#e2e8f0', bodyColor: '#94a3b8' },
  },
  scales: {
    x: { ticks: { color: '#3d4260' }, grid: { color: 'rgba(255,255,255,0.04)' } },
    y: { ticks: { color: '#3d4260' }, grid: { color: 'rgba(255,255,255,0.04)' } },
  },
};

function useSecondsTicker(lastUpdated: Date | null): string {
  const [secs, setSecs] = useState(0);

  useEffect(() => {
    if (!lastUpdated) return;
    setSecs(Math.floor((Date.now() - lastUpdated.getTime()) / 1000));
    const t = setInterval(() => {
      setSecs(Math.floor((Date.now() - lastUpdated.getTime()) / 1000));
    }, 1000);
    return () => clearInterval(t);
  }, [lastUpdated]);

  if (!lastUpdated) return 'never';
  if (secs < 5) return 'just now';
  if (secs < 60) return `${secs}s ago`;
  return `${Math.floor(secs / 60)}m ago`;
}

function generateReport(data: ReturnType<typeof useDashboardData>['data']): void {
  const report = {
    generatedAt: new Date().toISOString(),
    summary: data.summary,
    papers: data.papers,
    platforms: data.platforms,
    concepts: data.concepts,
    pipeline: data.pipeline,
    recentSubmissions: data.submissions,
    recentEvents: data.events,
  };
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `labguard_report_${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({ user }) => {
  const {
    data,
    loading,
    error,
    lastUpdated,
    refresh,
    selectedExamId,
    setSelectedExamId,
  } = useDashboardData(10000);

  const [isUpdating, setIsUpdating] = useState(false);
  const ticker = useSecondsTicker(lastUpdated);

  // Show update indicator briefly when new data arrives
  useEffect(() => {
    setIsUpdating(true);
    const timer = setTimeout(() => setIsUpdating(false), 1500);
    return () => clearTimeout(timer);
  }, [lastUpdated]);

  // Build exams list for dropdown
  const exams = data.papers.map(p => ({
    examId: p.examId,
    examTitle: p.examTitle,
    createdAt: p.createdAt,
  }));

  // Total platform count for percentage calcs
  const totalPlatformCount = data.platforms.reduce((s, p) => s + p.count, 0);

  // Results-by-paper bar chart data
  const paperChartData = {
    labels: data.papers.slice(0, 8).map(p =>
      p.examTitle.length > 18 ? p.examTitle.slice(0, 18) + '…' : p.examTitle
    ),
    datasets: [
      {
        label: 'Correct',
        data: data.papers.slice(0, 8).map(p => p.correctCases),
        backgroundColor: '#4ade8099',
        borderColor: '#4ade80',
        borderWidth: 1,
        borderRadius: 4,
      },
      {
        label: 'Wrong',
        data: data.papers.slice(0, 8).map(p => p.wrongCases),
        backgroundColor: '#f8717199',
        borderColor: '#f87171',
        borderWidth: 1,
        borderRadius: 4,
      },
    ],
  };

  // Difficulty spread chart data
  const diffChartData = {
    labels: data.papers.slice(0, 8).map(p =>
      p.examTitle.length > 14 ? p.examTitle.slice(0, 14) + '…' : p.examTitle
    ),
    datasets: [
      {
        label: 'Easy',
        data: data.papers.slice(0, 8).map(p => p.easyCount),
        backgroundColor: '#4ade8066',
        borderColor: '#4ade80',
        borderWidth: 1,
        borderRadius: 4,
      },
      {
        label: 'Medium',
        data: data.papers.slice(0, 8).map(p => p.mediumCount),
        backgroundColor: '#f59e0b66',
        borderColor: '#f59e0b',
        borderWidth: 1,
        borderRadius: 4,
      },
      {
        label: 'Hard',
        data: data.papers.slice(0, 8).map(p => p.hardCount),
        backgroundColor: '#f8717166',
        borderColor: '#f87171',
        borderWidth: 1,
        borderRadius: 4,
      },
    ],
  };

  const s = data.summary;

  return (
    <div className="analytics-root">
      {/* Sidebar */}
      <aside className="analytics-sidebar">
        <div className="analytics-sidebar-brand">
          <span className="analytics-brand-icon">⚗</span>
          <span className="analytics-brand-name">LabGuard</span>
        </div>

        <nav className="analytics-nav">
          <div className="analytics-nav-section">Overview</div>
          <a className="analytics-nav-item analytics-nav-active" href="#overview">
            <span>📊</span> Analytics
          </a>
          <a className="analytics-nav-item" href="#papers">
            <span>📄</span> Exam Papers
          </a>
          <a className="analytics-nav-item" href="#concepts">
            <span>🧠</span> Concepts
          </a>
          <a className="analytics-nav-item" href="#pipeline">
            <span>🤖</span> AI Pipeline
          </a>
        </nav>

        <div className="analytics-sidebar-section">
          <div className="analytics-sidebar-section-title">Active Exams</div>
          {data.papers.length === 0 ? (
            <div className="analytics-sidebar-empty">No exams yet</div>
          ) : (
            data.papers.slice(0, 5).map(p => (
              <div key={p.examId} className="analytics-sidebar-exam">
                <span className="analytics-sidebar-exam-dot" />
                <span className="analytics-sidebar-exam-name">{p.examTitle}</span>
                <span className="analytics-sidebar-exam-count">{p.questionCount}q</span>
              </div>
            ))
          )}
        </div>

        <div className="analytics-sidebar-section">
          <div className="analytics-sidebar-section-title">AI Engine</div>
          <div className={`analytics-ai-status ${data.pipeline?.groqConfigured || data.pipeline?.geminiConfigured ? 'analytics-ai-ok' : 'analytics-ai-err'}`}>
            <span className="analytics-ai-dot" />
            {data.pipeline
              ? data.pipeline.groqConfigured || data.pipeline.geminiConfigured
                ? `${data.pipeline.primaryProvider} active`
                : 'No API keys'
              : 'Loading…'}
          </div>
          {data.pipeline && (
            <div className="analytics-ai-model">{data.pipeline.primaryModel}</div>
          )}
        </div>
      </aside>

      {/* Main content */}
      <main className="analytics-main">
        {/* Top bar */}
        <header className="analytics-topbar">
          <div className="analytics-topbar-left">
            <h1 className="analytics-title">Analytics Dashboard</h1>
            <span className="analytics-user-hint">
              {user.fullName}
            </span>
          </div>
          <div className="analytics-topbar-right">
            {s && (
              <span className="analytics-accuracy-badge">
                {s.accuracyRate}% Accuracy
              </span>
            )}
            <div className="analytics-status-group">
              <span className={`analytics-live-indicator ${isUpdating ? 'analytics-live-updating' : ''}`}>
                <span className="analytics-live-dot" />
                Live
              </span>
              <span className="analytics-updated">Updated {ticker}</span>
            </div>
            <button className="analytics-btn-refresh" onClick={refresh} title="Refresh now">
              ↻ Refresh
            </button>
            <button
              className="analytics-btn-report"
              onClick={() => generateReport(data)}
            >
              ↓ Generate Report
            </button>
          </div>
        </header>

        {error && (
          <div className="analytics-error-banner">
            ⚠ {error} — <button onClick={refresh}>Retry</button>
          </div>
        )}

        <div className="analytics-scroll">
          {/* ── Metric cards ── */}
          <section className="analytics-metrics-row" id="overview">
            <MetricCard
              label="Total Questions"
              value={loading && !s ? null : s?.totalQuestions ?? 0}
              icon="❓"
              accent="purple"
            />
            <MetricCard
              label="Test Cases"
              value={loading && !s ? null : s?.totalTestCases ?? 0}
              sub={s ? `avg ${s.avgCasesPerQuestion} / question` : undefined}
              icon="🧪"
              accent="blue"
            />
            <MetricCard
              label="Exams"
              value={loading && !s ? null : s?.totalExams ?? 0}
              icon="📝"
              accent="purple"
            />
            <MetricCard
              label="Submissions"
              value={loading && !s ? null : s?.totalSubmissions ?? 0}
              icon="📬"
              accent="blue"
            />
            <MetricCard
              label="Hardcoding Flags"
              value={loading && !s ? null : s?.hardcodingFlags ?? 0}
              icon="🚩"
              accent="red"
            />
            <MetricCard
              label="Verified Correct"
              value={loading && !s ? null : s?.verifiedCorrect ?? 0}
              icon="✅"
              accent="green"
            />
          </section>

          {/* ── Platform cards ── */}
          <section className="analytics-platform-row">
            {loading && data.platforms.length === 0
              ? ['Codeforces', 'AtCoder', 'HackerRank'].map(p => (
                  <div key={p} className="dash-platform-card dash-skeleton-card">
                    <div className="dash-skeleton-row" style={{ width: '60%' }} />
                    <div className="dash-skeleton-row" style={{ width: '100%', marginTop: 8 }} />
                  </div>
                ))
              : data.platforms
                  .filter(p => ['Codeforces', 'AtCoder', 'HackerRank', 'manual'].includes(p.platform) ||
                    ['codeforces', 'atcoder', 'hackerrank'].includes(p.platform.toLowerCase()))
                  .slice(0, 4)
                  .map(p => (
                    <PlatformCard
                      key={p.platform}
                      platform={p.platform}
                      count={p.count}
                      percentage={p.percentage}
                      total={totalPlatformCount}
                    />
                  ))}
          </section>

          {/* ── Charts row ── */}
          <section className="analytics-charts-row" id="papers">
            <div className="dash-panel analytics-chart-panel">
              <div className="dash-panel-header">
                <span className="dash-panel-title">Test Case Results by Paper</span>
              </div>
              <div className="analytics-chart-wrap">
                {data.papers.length === 0 ? (
                  <div className="dash-empty-note">No exam data yet.</div>
                ) : (
                  <Bar data={paperChartData} options={CHART_DEFAULTS as any} />
                )}
              </div>
            </div>

            <div className="dash-panel analytics-chart-panel">
              <div className="dash-panel-header">
                <span className="dash-panel-title">Difficulty Spread</span>
              </div>
              <div className="analytics-chart-wrap">
                {data.papers.length === 0 ? (
                  <div className="dash-empty-note">No exam data yet.</div>
                ) : (
                  <Bar data={diffChartData} options={{ ...(CHART_DEFAULTS as any), plugins: { ...CHART_DEFAULTS.plugins, tooltip: CHART_DEFAULTS.plugins.tooltip } }} />
                )}
              </div>
            </div>

            <div className="dash-panel analytics-concept-panel" id="concepts">
              <div className="dash-panel-header">
                <span className="dash-panel-title">Concept Coverage</span>
              </div>
              <ConceptBar concepts={data.concepts} />
            </div>
          </section>

          {/* ── Bottom row ── */}
          <section className="analytics-bottom-row">
            <QuestionAccuracy
              questions={data.questions}
              exams={exams}
              selectedExamId={selectedExamId}
              onExamChange={setSelectedExamId}
            />
            <div className="analytics-bottom-right">
              <PipelinePanel config={data.pipeline} />
              <EventLog events={data.events} submissions={data.submissions} />
            </div>
          </section>
        </div>
      </main>
    </div>
  );
};

export default AnalyticsDashboard;
