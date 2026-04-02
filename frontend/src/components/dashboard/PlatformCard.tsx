import React from 'react';

interface PlatformCardProps {
  platform: string;
  count: number;
  percentage: number;
  total: number;
}

const PLATFORM_COLORS: Record<string, string> = {
  codeforces: '#ef4444',
  atcoder: '#3b82f6',
  hackerrank: '#22c55e',
  manual: '#a5b4fc',
  default: '#94a3b8',
};

function getColor(platform: string): string {
  return PLATFORM_COLORS[platform.toLowerCase()] ?? PLATFORM_COLORS.default;
}

const PlatformCard: React.FC<PlatformCardProps> = ({
  platform,
  count,
  percentage,
}) => {
  const color = getColor(platform);

  return (
    <div className="dash-platform-card">
      <div className="dash-platform-header">
        <span className="dash-platform-name">{platform}</span>
        <span className="dash-platform-count" style={{ color }}>{count}</span>
      </div>
      <div className="dash-platform-bar-bg">
        <div
          className="dash-platform-bar-fill"
          style={{ width: `${Math.min(percentage, 100)}%`, background: color }}
        />
      </div>
      <div className="dash-platform-pct">{percentage}% of questions</div>
    </div>
  );
};

export default PlatformCard;
