import React from 'react';
import { useDashboardData } from '../hooks/useDashboardData';
import MetricCard from './dashboard/MetricCard';
import PlatformCard from './dashboard/PlatformCard';
import ConceptBar from './dashboard/ConceptBar';
import QuestionAccuracy from './dashboard/QuestionAccuracy';
import PipelinePanel from './dashboard/PipelinePanel';
import EventLog from './dashboard/EventLog';
import './AnalyticsDashboard.css';

interface AnalyticsDashboardProps {
  user: { userId: string; role: string; fullName: string };
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
    recentEvents: data.events
  };

  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `labguard_report_${Date.now()}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({ user }) => {
  const { data, loading, error, lastUpdated, refresh, selectedExamId, setSelectedExamId } =
    useDashboardData(10000);

  const exams = data.papers.map((paper) => ({
    examId: paper.examId,
    examTitle: paper.examTitle,
    createdAt: paper.createdAt
  }));

  return (
    <div className="analytics-root analytics-root-lite">
      <main className="analytics-main analytics-main-lite">
        <header className="analytics-topbar analytics-topbar-lite">
          <div className="analytics-topbar-left">
            <h1 className="analytics-title">Analytics Dashboard</h1>
            <span className="analytics-user-hint">{user.fullName}</span>
          </div>
          <div className="analytics-topbar-right">
            <span className="analytics-updated">
              Updated {lastUpdated ? lastUpdated.toLocaleTimeString() : 'never'}
            </span>
            <button className="analytics-btn-refresh" onClick={refresh}>
              Refresh
            </button>
            <button className="analytics-btn-report" onClick={() => generateReport(data)}>
              Export Report
            </button>
          </div>
        </header>

        {error && <div className="ce-error">{error}</div>}
        {loading && <div className="ce-loading">Loading analytics...</div>}

        <section className="dash-metric-grid">
          <MetricCard label="Total Exams" value={data.summary?.totalExams ?? 0} accent="blue" />
          <MetricCard label="Questions" value={data.summary?.totalQuestions ?? 0} accent="green" />
          <MetricCard label="Test Cases" value={data.summary?.totalTestCases ?? 0} accent="amber" />
          <MetricCard label="Accuracy Rate" value={`${data.summary?.accuracyRate ?? 0}%`} accent="purple" />
          <MetricCard label="Submissions" value={data.summary?.totalSubmissions ?? 0} accent="blue" />
          <MetricCard label="Hardcoding Flags" value={data.summary?.hardcodingFlags ?? 0} accent="red" />
        </section>

        <section className="analytics-lite-grid">
          <div className="dash-panel">
            <div className="dash-panel-header">
              <span className="dash-panel-title">Exam Coverage</span>
            </div>
            <div className="analytics-paper-list">
              {data.papers.length === 0 && <div className="dash-empty-note">No exams yet.</div>}
              {data.papers.map((paper) => (
                <div key={paper.examId} className="analytics-paper-row">
                  <div>
                    <strong>{paper.examTitle}</strong>
                    <div className="ce-muted">
                      {paper.questionCount} questions | {paper.testCaseCount} test cases
                    </div>
                  </div>
                  <div className="analytics-paper-stats">
                    <span className="ce-pill ce-pill-good">{paper.correctCases} pass</span>
                    <span className="ce-pill ce-pill-bad">{paper.wrongCases} fail</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="dash-panel">
            <div className="dash-panel-header">
              <span className="dash-panel-title">Concept Distribution</span>
            </div>
            <ConceptBar concepts={data.concepts} />
          </div>
        </section>

        <section className="analytics-lite-grid">
          <QuestionAccuracy
            questions={data.questions}
            exams={exams}
            selectedExamId={selectedExamId}
            onExamChange={setSelectedExamId}
          />

          <div className="dash-panel">
            <div className="dash-panel-header">
              <span className="dash-panel-title">Question Sources</span>
            </div>
            <div className="analytics-platform-list">
              {data.platforms.map((platform) => (
                <PlatformCard
                  key={platform.platform}
                  platform={platform.platform}
                  count={platform.count}
                  percentage={platform.percentage}
                  total={platform.count}
                />
              ))}
            </div>
          </div>
        </section>

        <section className="analytics-lite-grid">
          <PipelinePanel config={data.pipeline} />
          <EventLog events={data.events} submissions={data.submissions} />
        </section>
      </main>
    </div>
  );
};

export default AnalyticsDashboard;
