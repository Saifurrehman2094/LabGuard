import React, { useState, useEffect } from 'react';
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
                    <h3>Violation Evidence</h3>
                    <div className="viewer-actions">
                        <button
                            className="zoom-btn"
                            onClick={() => setIsZoomed(!isZoomed)}
                            disabled={isLoading || !!error}
                        >
                            {isZoomed ? '🔍-' : '🔍+'}
                        </button>
                        <button
                            className="download-btn"
                            onClick={downloadScreenshot}
                            disabled={isLoading || !!error}
                        >
                            📥 Download
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
                    <div className="screenshot-info">
                        <span className="info-label">File:</span>
                        <span className="info-value">{screenshotPath.split('/').pop() || screenshotPath}</span>
                    </div>
                    <div className="viewer-controls">
                        <span className="help-text">Press ESC to close • Click outside to close</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ScreenshotViewer;