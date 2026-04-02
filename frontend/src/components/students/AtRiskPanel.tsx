import React from 'react';
import { ConceptStat } from '../../types/studentAnalytics';
import './AtRiskPanel.css';

interface AtRiskPanelProps {
  concepts: ConceptStat[];
}

const AtRiskPanel: React.FC<AtRiskPanelProps> = ({ concepts }) => {
  const getConceptSuggestion = (concept: string): string => {
    const suggestions: Record<string, string> = {
      arrays: 'Review array traversal, boundary conditions, and common patterns (sum, max, search)',
      pointers: 'Practice pointer arithmetic, dereferencing, and memory management',
      '2D arrays': 'Practice nested loop iteration and row/column access patterns',
      sorting: 'Review sort algorithms, swap mechanics, and verify correct boundary handling',
      loops: 'Focus on loop structure, iteration counts, and termination conditions',
      conditionals: 'Practice nested if-else chains and edge case handling',
      strings: 'Review character indexing, string functions, and common string operations',
      recursion: 'Focus on base cases, recursive structure, and stack depth understanding',
      nested_loops: 'Practice outer/inner loop index management and nested iteration patterns',
      'brute force': 'Understand when to use brute force and optimize loop efficiency'
    };

    return (
      suggestions[concept] ||
      `Review ${concept} fundamentals and attempt additional practice problems`
    );
  };

  if (concepts.length === 0) {
    return null;
  }

  return (
    <div className="at-risk-panel">
      <div className="at-risk-header">
        <span className="at-risk-title-icon">⚠️</span>
        <span className="at-risk-title">Concepts Requiring Attention</span>
      </div>

      <p className="at-risk-description">
        The following concepts have been failed in 2 or more consecutive questions. Immediate
        intervention is recommended.
      </p>

      <div className="at-risk-concepts">
        {concepts.map(concept => (
          <div key={concept.concept} className="at-risk-concept">
            <div className="concept-name-section">
              <span className="concept-name">{concept.concept}</span>
              <span className="consecutive-count">
                {concept.consecutiveFailures} consecutive failures
              </span>
            </div>

            <div className="concept-suggestion">{getConceptSuggestion(concept.concept)}</div>

            <div className="concept-meta">
              <span className="meta-item">
                <span className="meta-label">Fail Rate:</span>
                <span className="meta-value">{concept.failRate}%</span>
              </span>
              <span className="meta-item">
                <span className="meta-label">Last Attempted:</span>
                <span className="meta-value">
                  {concept.lastSeen
                    ? new Date(concept.lastSeen).toLocaleDateString()
                    : 'N/A'}
                </span>
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AtRiskPanel;
