import React from 'react';
import { PipelineConfig } from '../../hooks/useDashboardData';

interface PipelinePanelProps {
  config: PipelineConfig | null;
}

interface ConfigRow {
  label: string;
  value: React.ReactNode;
}

const StatusDot: React.FC<{ ok: boolean }> = ({ ok }) => (
  <span
    style={{
      display: 'inline-block',
      width: 8,
      height: 8,
      borderRadius: '50%',
      background: ok ? '#4ade80' : '#f87171',
      marginRight: 6,
      verticalAlign: 'middle'
    }}
  />
);

const PipelinePanel: React.FC<PipelinePanelProps> = ({ config }) => {
  if (!config) {
    return (
      <div className="dash-panel">
        <div className="dash-panel-header">
          <span className="dash-panel-title">AI Pipeline Config</span>
        </div>
        <div className="dash-skeleton-rows">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="dash-skeleton-row" />
          ))}
        </div>
      </div>
    );
  }

  const rows: ConfigRow[] = [
    {
      label: 'Primary Model',
      value: (
        <>
          <StatusDot ok={config.groqConfigured} />
          {config.primaryModel}
          <span className="dash-pipe-provider"> | {config.primaryProvider}</span>
        </>
      )
    },
    {
      label: 'Fallback Model',
      value: (
        <>
          <StatusDot ok={config.geminiConfigured} />
          {config.fallbackModel}
          <span className="dash-pipe-provider"> | {config.fallbackProvider}</span>
        </>
      )
    },
    { label: 'Temperature', value: config.temperature },
    { label: 'Max Tokens', value: config.maxTokens.toLocaleString() },
    { label: 'Cases / Prompt', value: config.casesPerPrompt },
    { label: 'Memory Limit', value: `${config.memoryLimitMB} MB` },
    { label: 'Judge0 Python ID', value: config.judge0PythonId },
    { label: 'Judge0 C++ ID', value: config.judge0CppId },
    { label: 'Judge0 Endpoint', value: <span className="dash-pipe-mono">{config.judge0Endpoint}</span> }
  ];

  return (
    <div className="dash-panel">
      <div className="dash-panel-header">
        <span className="dash-panel-title">AI Pipeline Config</span>
        <span
          className={`dash-status-badge ${
            config.groqConfigured || config.geminiConfigured ? 'dash-status-ok' : 'dash-status-err'
          }`}
        >
          {config.groqConfigured || config.geminiConfigured ? 'Active' : 'No Keys'}
        </span>
      </div>
      <div className="dash-pipe-rows">
        {rows.map((row) => (
          <div key={row.label} className="dash-pipe-row">
            <span className="dash-pipe-label">{row.label}</span>
            <span className="dash-pipe-value">{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PipelinePanel;
