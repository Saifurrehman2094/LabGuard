import React, { useState } from 'react';
import { ConceptStat } from '../../types/studentAnalytics';
import './ConceptHeatmap.css';

interface ConceptHeatmapProps {
  concepts: ConceptStat[];
}

const ConceptHeatmap: React.FC<ConceptHeatmapProps> = ({ concepts }) => {
  const [expandedConcept, setExpandedConcept] = useState<string | null>(null);

  const getBackgroundColor = (failRate: number): string => {
    if (failRate <= 30) return '#dcfce7';
    if (failRate <= 60) return '#fef3c7';
    if (failRate <= 80) return '#fed7aa';
    return '#fee2e2';
  };

  const getTextColor = (failRate: number): string => {
    if (failRate <= 30) return '#166534';
    if (failRate <= 60) return '#92400e';
    if (failRate <= 80) return '#9a3412';
    return '#991b1b';
  };

  const getTrendArrow = (trend: string): string => {
    if (trend === 'improving') return '↑';
    if (trend === 'worsening') return '↓';
    return '→';
  };

  const getTrendColor = (trend: string): string => {
    if (trend === 'improving') return '#22c55e';
    if (trend === 'worsening') return '#ef4444';
    return '#64748b';
  };

  if (concepts.length === 0) {
    return <div className="concept-heatmap-empty">No concepts tracked yet</div>;
  }

  return (
    <div className="concept-heatmap">
      <div className="heatmap-grid">
        {concepts.map((concept) => (
          <div
            key={concept.concept}
            className={`concept-card ${concept.isAtRisk ? 'at-risk' : ''} ${
              expandedConcept === concept.concept ? 'expanded' : ''
            }`}
            style={{
              backgroundColor: getBackgroundColor(concept.failRate),
              color: getTextColor(concept.failRate)
            }}
            onClick={() => setExpandedConcept(expandedConcept === concept.concept ? null : concept.concept)}
          >
            <div className="card-header">
              {concept.isAtRisk && <span className="at-risk-icon">!</span>}
              <span className="concept-name">{concept.concept}</span>
            </div>

            <div className="fail-rate">
              <div className="fail-rate-number">{concept.failRate}%</div>
              <div className="fail-rate-label">fail rate</div>
            </div>

            <div className="progress-bar">
              <div
                className="progress-fill pass"
                style={{ width: `${Math.round((concept.passedCount / concept.totalAttempts) * 100)}%` }}
              />
              <div
                className="progress-fill fail"
                style={{ width: `${Math.round((concept.failedCount / concept.totalAttempts) * 100)}%` }}
              />
            </div>

            <div className="card-meta">
              <div className="meta-item">
                <span className="meta-label">Attempts</span>
                <span className="meta-value">{concept.totalAttempts}</span>
              </div>
              <div className="meta-divider" />
              <div className="meta-item">
                <span className="meta-label">Trend</span>
                <span className="meta-value trend" style={{ color: getTrendColor(concept.trend) }}>
                  {getTrendArrow(concept.trend)}
                </span>
              </div>
            </div>

            {expandedConcept === concept.concept && (
              <div className="card-expanded">
                <div className="expanded-section">
                  <div className="expanded-stat">
                    <span className="stat-label">Passed</span>
                    <span className="stat-value passed">{concept.passedCount}</span>
                  </div>
                  <div className="expanded-stat">
                    <span className="stat-label">Failed</span>
                    <span className="stat-value failed">{concept.failedCount}</span>
                  </div>
                  <div className="expanded-stat">
                    <span className="stat-label">Avg Score</span>
                    <span className="stat-value">{concept.avgScore}%</span>
                  </div>
                </div>

                {concept.isAtRisk && (
                  <div className="expanded-warning">
                    <span className="warning-icon">!</span>
                    <span className="warning-text">
                      {concept.consecutiveFailures} consecutive failures - immediate action recommended
                    </span>
                  </div>
                )}

                {concept.lastSeen && (
                  <div className="expanded-last-seen">
                    Last attempted: {new Date(concept.lastSeen).toLocaleDateString()}
                  </div>
                )}

                {concept.attempts.length > 0 && (
                  <div className="expanded-attempts">
                    <div className="attempts-label">Recent Attempts</div>
                    <div className="attempts-list">
                      {concept.attempts.slice(-3).map((attempt, index) => (
                        <div key={index} className="attempt-item">
                          <span className={`attempt-status ${attempt.passed ? 'pass' : 'fail'}`}>
                            {attempt.passed ? 'P' : 'F'}
                          </span>
                          <span className="attempt-score">{attempt.score}%</span>
                          <span className="attempt-question">{attempt.questionTitle}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default ConceptHeatmap;
