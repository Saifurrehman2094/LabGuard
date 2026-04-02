import React from 'react';

interface MetricCardProps {
  label: string;
  value: number | string | null;
  sub?: string;
  accent?: 'purple' | 'green' | 'red' | 'amber' | 'blue';
  icon?: string;
}

const ACCENT_MAP: Record<string, string> = {
  purple: '#a5b4fc',
  green: '#4ade80',
  red: '#f87171',
  amber: '#f59e0b',
  blue: '#60a5fa',
};

const MetricCard: React.FC<MetricCardProps> = ({
  label,
  value,
  sub,
  accent = 'purple',
  icon,
}) => {
  const color = ACCENT_MAP[accent] ?? ACCENT_MAP.purple;

  return (
    <div className="dash-metric-card">
      <div className="dash-metric-top">
        {icon && <span className="dash-metric-icon">{icon}</span>}
        <span className="dash-metric-label">{label}</span>
      </div>
      <div className="dash-metric-value" style={{ color }}>
        {value === null || value === undefined ? (
          <span className="dash-metric-skeleton" />
        ) : (
          value
        )}
      </div>
      {sub && <div className="dash-metric-sub">{sub}</div>}
    </div>
  );
};

export default MetricCard;
