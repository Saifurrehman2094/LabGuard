import React, { useState } from 'react';
import './ReportGenerator.css';

interface ReportGeneratorProps {
  studentId: string;
  studentName: string;
  onGenerateReport: (studentId: string, format: 'text' | 'json') => Promise<void>;
}

const ReportGenerator: React.FC<ReportGeneratorProps> = ({
  studentId,
  studentName,
  onGenerateReport
}) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  const handleGenerateReport = async (format: 'text' | 'json') => {
    setIsLoading(true);
    setMessage(null);
    try {
      await onGenerateReport(studentId, format);
      setMessage({
        type: 'success',
        text: `Report downloaded as ${format === 'text' ? '.txt' : '.json'}`
      });
      setIsDropdownOpen(false);
    } catch (error) {
      setMessage({
        type: 'error',
        text: `Failed to generate report: ${(error as Error).message}`
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="report-generator">
      <div className="report-dropdown">
        <button
          className="report-btn"
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          disabled={isLoading}
        >
          {isLoading ? (
            <>
              <span className="spinner" />
              Generating...
            </>
          ) : (
            <>
              <span className="report-icon">📄</span>
              Generate Report
            </>
          )}
        </button>

        {isDropdownOpen && !isLoading && (
          <div className="dropdown-menu">
            <button
              className="dropdown-item text"
              onClick={() => handleGenerateReport('text')}
            >
              <span className="item-icon">📋</span>
              <span className="item-text">Download as Text (.txt)</span>
            </button>
            <button
              className="dropdown-item json"
              onClick={() => handleGenerateReport('json')}
            >
              <span className="item-icon">{ }</span>
              <span className="item-text">Copy to Clipboard</span>
            </button>
          </div>
        )}
      </div>

      {message && (
        <div className={`report-message ${message.type}`}>
          <span className="message-icon">{message.type === 'success' ? '✓' : '✗'}</span>
          <span className="message-text">{message.text}</span>
        </div>
      )}
    </div>
  );
};

export default ReportGenerator;
