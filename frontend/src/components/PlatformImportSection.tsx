import React, { useState, useEffect, useRef } from 'react';
import './PlatformImportSection.css';

interface ImportedQuestion {
  rewritten: {
    title: string;
    statement: string;
    inputFormat: string;
    outputFormat: string;
    constraints: string;
    difficulty: string;
    suggestedMarks: number;
  };
  testCases: Array<{ input: string; expectedOutput: string; description: string }>;
  sourceInfo: {
    platform: string;
    url: string;
    originalTitle: string;
    difficulty: string;
    tags: string[];
  };
  status: 'success' | 'failed';
  error?: string;
}

interface ProgressData {
  current: number;
  total: number;
  stage: string;
  problemTitle: string;
  percentComplete: number;
}

interface PlatformImportSectionProps {
  examId?: string;
  onQuestionsImported?: (count: number) => void;
}

const PlatformImportSection: React.FC<PlatformImportSectionProps> = ({ examId, onQuestionsImported }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [platform, setPlatform] = useState('');
  const [difficulty, setDifficulty] = useState('easy');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [requiredConcepts, setRequiredConcepts] = useState<string[]>([]);
  const [problemCount, setProblemCount] = useState(3);
  const [availableTags, setAvailableTags] = useState<Array<{ value: string; label: string }>>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState<ProgressData | null>(null);
  const [importedResults, setImportedResults] = useState<ImportedQuestion[]>([]);
  const [showReview, setShowReview] = useState(false);
  const abortRef = useRef(false);

  const concepts = [
    'loops', 'arrays', 'pointers', '2D arrays', 'sorting',
    'strings', 'conditionals', 'recursion', 'nested loops'
  ];

  const eAPI = () => (window as any).electronAPI;

  // Load tags when platform changes
  useEffect(() => {
    if (platform) {
      loadTags();
    }
  }, [platform]);

  const loadTags = async () => {
    try {
      const result = await eAPI().platformGetTags({ platform });
      if (result.success) {
        setAvailableTags(result.tags || []);
        setSelectedTags([]);
      }
    } catch (err) {
      console.error('Failed to load tags:', err);
    }
  };

  // Listen for progress updates
  useEffect(() => {
    const api = eAPI();
    if (!api?.onPlatformProgress) return;

    const unsubscribe = api.onPlatformProgress((data: ProgressData) => {
      setProgress(data);
    });

    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, []);

  const handleFetchProblems = async () => {
    if (!platform) {
      alert('Please select a platform');
      return;
    }

    setIsLoading(true);
    abortRef.current = false;
    setProgress(null);
    setImportedResults([]);
    setShowReview(false);

    try {
      const result = await eAPI().platformFetchProblems({
        platform,
        difficulty,
        tags: selectedTags,
        count: problemCount,
        requiredConcepts
      });

      if (result.success) {
        const filtered = result.results.filter((r: any) => r.status === 'success');
        setImportedResults(result.results);
        setShowReview(true);
        setProgress(null);
      } else {
        alert('Error: ' + (result.error || 'Failed to fetch problems'));
        setProgress(null);
      }
    } catch (err) {
      console.error('Fetch failed:', err);
      alert('Failed to fetch problems: ' + (err as Error).message);
      setProgress(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleImportQuestion = async (result: ImportedQuestion) => {
    if (!examId) {
      alert('Please create the exam first');
      return;
    }

    try {
      const importResult = await eAPI().platformImportQuestion({
        examId,
        rewrittenQuestion: result.rewritten,
        testCases: result.testCases,
        sourceInfo: result.sourceInfo
      });

      if (importResult.success) {
        // Remove from list
        setImportedResults(prev =>
          prev.filter((r, i) => r !== result)
        );
        if (onQuestionsImported) {
          onQuestionsImported(importResult.testCaseCount);
        }
      } else {
        alert('Failed to import: ' + importResult.error);
      }
    } catch (err) {
      console.error('Import failed:', err);
      alert('Failed to import question');
    }
  };

  const handleImportAll = async () => {
    const successful = importedResults.filter(r => r.status === 'success');
    for (const result of successful) {
      await handleImportQuestion(result);
    }
    if (onQuestionsImported) {
      onQuestionsImported(successful.length);
    }
    setShowReview(false);
    setImportedResults([]);
  };

  const successCount = importedResults.filter(r => r.status === 'success').length;
  const failedCount = importedResults.filter(r => r.status === 'failed').length;

  return (
    <div className="platform-import-section">
      {/* Header */}
      <div className="import-header" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="import-header-left">
          <span className="import-icon">🌐</span>
          <span className="import-title">Import questions from a platform</span>
          <span className="import-note">(Codeforces, AtCoder, HackerRank)</span>
        </div>
        <div className={`import-toggle ${isExpanded ? 'expanded' : ''}`}>
          ▼
        </div>
      </div>

      {/* Content */}
      {isExpanded && (
        <div className="import-content">
          {!showReview && importedResults.length === 0 ? (
            <>
              {/* Step 1: Platform Selection */}
              <div className="import-step">
                <h3>1. Select Platform</h3>
                <div className="platform-pills">
                  {['codeforces', 'atcoder', 'hackerrank'].map(p => (
                    <button
                      key={p}
                      type="button"
                      className={`platform-pill ${platform === p ? 'active' : ''}`}
                      onClick={() => setPlatform(p)}
                      disabled={isLoading}
                    >
                      {p === 'codeforces' && '⚡ Codeforces'}
                      {p === 'atcoder' && '🎯 AtCoder'}
                      {p === 'hackerrank' && '🏆 HackerRank'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Step 2: Filters (visible only after platform selected) */}
              {platform && (
                <div className="import-step">
                  <h3>2. Configure Filters</h3>

                  {/* Difficulty */}
                  <div className="filter-group">
                    <label>Difficulty</label>
                    <div className="difficulty-pills">
                      {['easy', 'medium'].map(d => (
                        <button
                          key={d}
                          type="button"
                          className={`difficulty-pill ${difficulty === d ? 'active' : ''}`}
                          onClick={() => setDifficulty(d)}
                          disabled={isLoading}
                        >
                          {d === 'easy' ? '🟢 Easy' : '🟡 Medium'}
                        </button>
                      ))}
                    </div>
                    <small className="filter-hint">
                      Problems are pre-filtered for AI compatibility
                    </small>
                  </div>

                  {/* Tags (only for Codeforces and HackerRank) */}
                  {(platform === 'codeforces' || platform === 'hackerrank') && (
                    <div className="filter-group">
                      <label>Topics</label>
                      <div className="tags-container">
                        {availableTags.map(tag => (
                          <button
                            key={tag.value}
                            type="button"
                            className={`tag-pill ${selectedTags.includes(tag.value) ? 'selected' : ''}`}
                            onClick={() => {
                              setSelectedTags(prev =>
                                prev.includes(tag.value)
                                  ? prev.filter(t => t !== tag.value)
                                  : [...prev, tag.value]
                              );
                            }}
                            disabled={isLoading}
                          >
                            {tag.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Required Concepts */}
                  <div className="filter-group">
                    <label>Required Concepts (Optional)</label>
                    <div className="concepts-container">
                      {concepts.map(concept => (
                        <button
                          key={concept}
                          type="button"
                          className={`concept-pill ${requiredConcepts.includes(concept) ? 'selected' : ''}`}
                          onClick={() => {
                            setRequiredConcepts(prev =>
                              prev.includes(concept)
                                ? prev.filter(c => c !== concept)
                                : [...prev, concept]
                            );
                          }}
                          disabled={isLoading}
                        >
                          {concept}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Problem Count */}
                  <div className="filter-group">
                    <label>Number of Questions</label>
                    <div className="count-selector">
                      <button
                        type="button"
                        onClick={() => setProblemCount(Math.max(1, problemCount - 1))}
                        disabled={isLoading || problemCount <= 1}
                      >
                        −
                      </button>
                      <input
                        type="number"
                        min="1"
                        max="5"
                        value={problemCount}
                        onChange={(e) => setProblemCount(Math.min(5, Math.max(1, parseInt(e.target.value) || 1)))}
                        disabled={isLoading}
                      />
                      <button
                        type="button"
                        onClick={() => setProblemCount(Math.min(5, problemCount + 1))}
                        disabled={isLoading || problemCount >= 5}
                      >
                        +
                      </button>
                    </div>
                  </div>

                  {/* Fetch Button */}
                  <button
                    type="button"
                    className="fetch-btn"
                    onClick={handleFetchProblems}
                    disabled={isLoading || !platform}
                  >
                    {isLoading ? (
                      <>
                        <span className="spinner-small"></span>
                        Fetching...
                      </>
                    ) : (
                      '🚀 Fetch and Generate Questions'
                    )}
                  </button>
                </div>
              )}
            </>
          ) : null}

          {/* Step 3: Progress Panel */}
          {progress && (
            <div className="import-step progress-panel">
              <h3>Processing Problems</h3>
              <div className="progress-bar-container">
                <div
                  className="progress-bar-fill"
                  style={{ width: progress.percentComplete + '%' }}
                ></div>
              </div>
              <div className="progress-info">
                <div className="progress-label">
                  {progress.stage === 'rewriting' && '✍️ Rewriting'}
                  {progress.stage === 'generating' && '🧪 Generating test cases'}
                  {progress.stage === 'done' && '✅ Done'}
                  {progress.stage === 'complete' && '🎉 All complete'}
                  {' - '} {progress.problemTitle}
                </div>
                <div className="progress-counter">
                  {progress.current} of {progress.total} ({progress.percentComplete}%)
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Review Panel */}
          {showReview && importedResults.length > 0 && (
            <div className="import-step review-panel">
              <h3>Review Questions</h3>
              <div className="review-summary">
                {successCount} of {importedResults.length} questions ready
                {failedCount > 0 && ` (${failedCount} skipped)`}
              </div>

              {successCount > 0 && (
                <button
                  type="button"
                  className="add-all-btn"
                  onClick={handleImportAll}
                >
                  ➕ Add all {successCount} successful
                </button>
              )}

              <div className="questions-grid">
                {importedResults.map((result, index) => (
                  <div key={index} className={`question-card ${result.status}`}>
                    {result.status === 'success' ? (
                      <>
                        <div className="card-header">
                          <div className="card-title-section">
                            <input
                              type="text"
                              className="question-title-input"
                              defaultValue={result.rewritten.title}
                              disabled
                            />
                            <span className={`difficulty-badge ${result.rewritten.difficulty}`}>
                              {result.rewritten.difficulty}
                            </span>
                          </div>
                          <span className="test-case-count">
                            {result.testCases.length} test cases
                          </span>
                        </div>

                        <div className="card-body">
                          <div className="source-attribution">
                            Adapted from {result.sourceInfo.platform} — {result.sourceInfo.originalTitle}
                          </div>
                          {result.sourceInfo.tags.length > 0 && (
                            <div className="source-tags">
                              {result.sourceInfo.tags.map(tag => (
                                <span key={tag} className="source-tag">
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="card-actions">
                          <button
                            type="button"
                            className="add-btn"
                            onClick={() => handleImportQuestion(result)}
                          >
                            ✓ Add to exam
                          </button>
                          <button
                            type="button"
                            className="discard-btn"
                            onClick={() => {
                              setImportedResults(prev => prev.filter((_, i) => i !== index));
                            }}
                          >
                            ✕ Discard
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="card-error">
                          <strong>{result.sourceInfo.originalTitle}</strong>
                          <p>{result.error}</p>
                        </div>
                        <button
                          type="button"
                          className="skip-btn"
                          onClick={() => {
                            setImportedResults(prev => prev.filter((_, i) => i !== index));
                          }}
                        >
                          Skip
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>

              <button
                type="button"
                className="back-btn"
                onClick={() => {
                  setShowReview(false);
                  setImportedResults([]);
                }}
              >
                ← Back to Settings
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default PlatformImportSection;
