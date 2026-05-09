import React, { useState, useEffect, useMemo } from 'react';
import './ScreenshotViewer.css';

interface ScreenshotViewerProps {
    screenshotPath: string;
    violationId: string;
    onClose: () => void;
}

const ScreenshotViewer: React.FC<ScreenshotViewerProps> = ({
    screenshotPath,
    violationId,
    onClose
}) => {
    const [imageUrl, setImageUrl] = useState<string>('');
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string>('');
    const [isZoomed, setIsZoomed] = useState(false);
    const evidenceMeta = useMemo(() => {
        const fileName = screenshotPath.split(/[\\/]/).pop() || '';
        const shortViolationId = violationId ? violationId.slice(0, 8).toUpperCase() : '';
        const timestampMatch = fileName.match(/violation-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)/i);
        const sourceMatch = fileName.match(/violation-[^-]+-([^-]+)-violation_/i);

        let capturedAt: string | null = null;
        if (timestampMatch?.[1]) {
            const isoLike = timestampMatch[1].replace(
                /T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z/,
                'T$1:$2:$3.$4Z'
            );
            const dt = new Date(isoLike);
            if (!Number.isNaN(dt.getTime())) {
                capturedAt = dt.toLocaleString();
            }
        }

        return {
            shortViolationId,
            capturedAt,
            sourceLabel: sourceMatch?.[1] || null
        };
    }, [screenshotPath, violationId]);

    useEffect(() => {
        loadScreenshot();
    }, [screenshotPath]);

    const loadScreenshot = async () => {
        try {
            setIsLoading(true);
            setError('');

            // Check if running in Electron
            if ((window as any).electronAPI) {
                const result = await (window as any).electronAPI.getScreenshot(screenshotPath);
                if (result.success) {
                    setImageUrl(result.imageUrl);
                } else {
                    setError(result.error || 'Failed to load screenshot');
                }
            } else {
                // Development mode - show placeholder
                setImageUrl('/api/placeholder/800/600');
            }
        } catch (error) {
            console.error('Error loading screenshot:', error);
            setError('Failed to load screenshot');
        } finally {
            setIsLoading(false);
        }
    };

    const handleBackdropClick = (e: React.MouseEvent) => {
        if (e.target === e.currentTarget) {
            onClose();
        }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            onClose();
        }
    };

    useEffect(() => {
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, []);

    const downloadScreenshot = async () => {
        try {
            if ((window as any).electronAPI) {
                const result = await (window as any).electronAPI.downloadScreenshot(screenshotPath);
                if (!result.success) {
                    alert('Failed to download screenshot: ' + result.error);
                }
            }
        } catch (error) {
            console.error('Error downloading screenshot:', error);
            alert('Failed to download screenshot');
        }
    };

    return (
        <div className="screenshot-viewer-overlay" onClick={handleBackdropClick}>
            <div className="screenshot-viewer">
                <div className="viewer-header">
                    <div className="viewer-title-group">
                        <h3>Violation Evidence</h3>
                        <span className="viewer-subtitle">Focused evidence preview for review decisions</span>
                    </div>
                    <div className="viewer-actions">
                        <button
                            className="zoom-btn"
                            onClick={() => setIsZoomed(!isZoomed)}
                            disabled={isLoading || !!error}
                        >
                            {isZoomed ? 'Zoom out' : 'Zoom in'}
                        </button>
                        <button
                            className="download-btn"
                            onClick={downloadScreenshot}
                            disabled={isLoading || !!error}
                        >
                            Download
                        </button>
                        <button className="close-btn" onClick={onClose}>
                            ✕
                        </button>
                    </div>
                </div>

                <div className="viewer-content">
                    {isLoading && (
                        <div className="loading-state">
                            <div className="loading-spinner"></div>
                            <p>Loading screenshot...</p>
                        </div>
                    )}

                    {error && (
                        <div className="error-state">
                            <div className="error-icon">⚠️</div>
                            <h4>Failed to Load Screenshot</h4>
                            <p>{error}</p>
                            <button onClick={loadScreenshot} className="retry-btn">
                                Try Again
                            </button>
                        </div>
                    )}

                    {!isLoading && !error && imageUrl && (
                        <div className={`image-container ${isZoomed ? 'zoomed' : ''}`}>
                            <img
                                src={imageUrl}
                                alt="Violation screenshot"
                                className="screenshot-image"
                                onError={() => setError('Failed to display screenshot')}
                            />
                        </div>
                    )}
                </div>

                <div className="viewer-footer">
                    <div className="screenshot-info" aria-label="Evidence metadata">
                        {evidenceMeta.shortViolationId && (
                            <span className="meta-pill">Case {evidenceMeta.shortViolationId}</span>
                        )}
                        {evidenceMeta.sourceLabel && (
                            <span className="meta-pill">Source {evidenceMeta.sourceLabel}</span>
                        )}
                        {evidenceMeta.capturedAt && (
                            <span className="meta-pill">Captured {evidenceMeta.capturedAt}</span>
                        )}
                    </div>
                    <div className="viewer-controls">
                        <span className="help-text">ESC or outside click closes this view</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ScreenshotViewer;