import React from 'react';
import { ConceptStat } from '../../hooks/useDashboardData';

interface ConceptBarProps {
  concepts: ConceptStat[];
}

const CONCEPT_LABELS: Record<string, string> = {
  loops: 'Loops',
  do_while: 'Do-While',
  switch: 'Switch',
  nested_loops: 'Nested Loops',
  arrays: 'Arrays (1D)',
  arrays_2d: 'Arrays (2D)',
  arrays_3d: 'Arrays (3D)',
  pointers: 'Pointers',
  conditionals: 'Conditionals',
  recursion: 'Recursion',
};

const ConceptBar: React.FC<ConceptBarProps> = ({ concepts }) => {
  const max = Math.max(...concepts.map(c => c.count), 1);

  return (
    <div className="dash-concept-list">
      {concepts.map(({ concept, count }) => {
        const pct = Math.round((count / max) * 100);
        return (
          <div key={concept} className="dash-concept-row">
            <span className="dash-concept-label">
              {CONCEPT_LABELS[concept] ?? concept}
            </span>
            <div className="dash-concept-bar-bg">
              <div
                className="dash-concept-bar-fill"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="dash-concept-count">{count}</span>
          </div>
        );
      })}
      {concepts.length === 0 && (
        <div className="dash-empty-note">No concept data yet.</div>
      )}
    </div>
  );
};

export default ConceptBar;
