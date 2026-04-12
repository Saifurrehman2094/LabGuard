import React, { useState, useEffect } from 'react';
import ModelManager from '../services/modelManager';
import './ModelDiagnostics.css';

interface ModelDiagnosticsProps {
    onClose?: () => void;
}

interface DiagnosticResult {
    timestamp: string;
    protocol: string;
    origin: string;
    modelPath: string;
    models: Array<{
        name: string;
        loaded: boolean;
        error?: string;
        size?: number;
    }>;
    totalSize: number;
    allLoaded: boolean;
    errors: string[];
}

const IconCheck = () => (
    <svg
        className="model-diagnostics__icon"
        width={18}
        height={18}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
    >
        <path d="M20 6L9 17l-5-5" />
    </svg>
);

const IconX = () => (
    <svg
        className="model-diagnostics__icon"
        width={18}
        height={18}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
    >
        <path d="M18 6 6 18M6 6l12 12" />
    </svg>
);

const ModelDiagnostics: React.FC<ModelDiagnosticsProps> = ({ onClose }) => {
    const [result, setResult] = useState<DiagnosticResult | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const runDiagnostics = async () => {
        setIsLoading(true);
        setError(null);
        setResult(null);

        try {
            const modelManager = ModelManager.getInstance();
            const loadResult = await modelManager.loadModels();

            const diagnosticResult: DiagnosticResult = {
                timestamp: new Date().toISOString(),
                protocol: window.location.protocol,
                origin: window.location.origin,
                modelPath: modelManager.getModelPath(),
                models: loadResult.models,
                totalSize: loadResult.totalSize,
                allLoaded: loadResult.allLoaded,
                errors: loadResult.errors
            };

            setResult(diagnosticResult);
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        runDiagnostics();
    }, []);

    const formatSize = (bytes: number): string => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    return (
        <div
            className="model-diagnostics-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="model-diagnostics-title"
        >
            <div className="model-diagnostics">
                <h2 id="model-diagnostics-title" className="model-diagnostics__title">
                    Face-API model diagnostics
                </h2>

                {isLoading && (
                    <div className="model-diagnostics__loading">
                        <p className="model-diagnostics__loading-text">
                            Loading models and running diagnostics…
                        </p>
                        {onClose && (
                            <div className="model-diagnostics__footer model-diagnostics__footer--inline">
                                <button
                                    type="button"
                                    className="model-diagnostics__button model-diagnostics__button--secondary"
                                    onClick={onClose}
                                >
                                    Close
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {error && (
                    <div className="model-diagnostics__error-wrap">
                        <div className="model-diagnostics__error-banner" role="alert">
                            <strong>Error:</strong> {error}
                        </div>
                        {onClose && (
                            <div className="model-diagnostics__footer model-diagnostics__footer--inline">
                                <button
                                    type="button"
                                    className="model-diagnostics__button model-diagnostics__button--secondary"
                                    onClick={onClose}
                                >
                                    Close
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {result && (
                    <div>
                        <section className="model-diagnostics__stack" aria-label="Environment">
                            <h3 className="model-diagnostics__section-title">Environment</h3>
                            <div className="model-diagnostics__mono-block">
                                <p className="model-diagnostics__kv">
                                    <strong>Timestamp:</strong> {result.timestamp}
                                </p>
                                <p className="model-diagnostics__kv">
                                    <strong>Protocol:</strong> {result.protocol}
                                </p>
                                <p className="model-diagnostics__kv">
                                    <strong>Origin:</strong> {result.origin}
                                </p>
                                <p className="model-diagnostics__kv">
                                    <strong>Model path:</strong> {result.modelPath}
                                </p>
                            </div>
                        </section>

                        <section className="model-diagnostics__stack" aria-label="Overall status">
                            <h3 className="model-diagnostics__section-title">Overall status</h3>
                            <div
                                className={
                                    result.allLoaded
                                        ? 'model-diagnostics__status-pill model-diagnostics__status-pill--ok'
                                        : 'model-diagnostics__status-pill model-diagnostics__status-pill--fail'
                                }
                            >
                                {result.allLoaded ? <IconCheck /> : <IconX />}
                                <span>{result.allLoaded ? 'All models loaded' : 'One or more models failed'}</span>
                            </div>
                            <p className="model-diagnostics__kv">
                                <strong>Total size:</strong> {formatSize(result.totalSize)}
                            </p>
                            <p className="model-diagnostics__kv">
                                <strong>Models loaded:</strong>{' '}
                                {result.models.filter(m => m.loaded).length}/{result.models.length}
                            </p>
                        </section>

                        <section className="model-diagnostics__stack" aria-label="Model details">
                            <h3 className="model-diagnostics__section-title">Model details</h3>
                            {result.models.map((model, index) => (
                                <div
                                    key={index}
                                    className={
                                        model.loaded
                                            ? 'model-diagnostics__model-row model-diagnostics__model-row--ok'
                                            : 'model-diagnostics__model-row model-diagnostics__model-row--fail'
                                    }
                                >
                                    <div className="model-diagnostics__model-name">
                                        <span className="model-diagnostics-sr-only">
                                            {model.loaded ? 'Loaded: ' : 'Not loaded: '}
                                        </span>
                                        {model.loaded ? <IconCheck /> : <IconX />}
                                        <span>{model.name}</span>
                                    </div>
                                    {model.size !== undefined && (
                                        <p className="model-diagnostics__model-meta">
                                            <strong>Size:</strong> {formatSize(model.size)}
                                        </p>
                                    )}
                                    {model.error && (
                                        <p className="model-diagnostics__model-err">
                                            <strong>Error:</strong> {model.error}
                                        </p>
                                    )}
                                </div>
                            ))}
                        </section>

                        {result.errors.length > 0 && (
                            <section className="model-diagnostics__stack" aria-label="Errors">
                                <h3 className="model-diagnostics__section-title model-diagnostics__section-title--error">
                                    Errors
                                </h3>
                                {result.errors.map((errLine, index) => (
                                    <div key={index} className="model-diagnostics__error-item">
                                        {errLine}
                                    </div>
                                ))}
                            </section>
                        )}

                        <div className="model-diagnostics__footer">
                            <button
                                type="button"
                                className="model-diagnostics__button model-diagnostics__button--primary"
                                onClick={runDiagnostics}
                            >
                                Run again
                            </button>
                            {onClose && (
                                <button
                                    type="button"
                                    className="model-diagnostics__button model-diagnostics__button--secondary"
                                    onClick={onClose}
                                >
                                    Close
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ModelDiagnostics;
