import React, { useState, useEffect } from 'react';
import ModelManager from '../services/modelManager';

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
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000
        }}>
            <div style={{
                backgroundColor: 'white',
                padding: '20px',
                borderRadius: '8px',
                maxWidth: '600px',
                maxHeight: '80vh',
                overflow: 'auto',
                fontFamily: 'monospace',
                fontSize: '12px'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h2 style={{ margin: 0, fontFamily: 'sans-serif' }}>Face-API Model Diagnostics</h2>
                    {onClose && (
                        <button onClick={onClose} style={{ padding: '5px 10px' }}>Close</button>
                    )}
                </div>

                {isLoading && (
                    <div style={{ textAlign: 'center', padding: '20px' }}>
                        <div>Loading models and running diagnostics...</div>
                    </div>
                )}

                {error && (
                    <div style={{ color: 'red', padding: '10px', backgroundColor: '#ffebee', borderRadius: '4px' }}>
                        <strong>Error:</strong> {error}
                    </div>
                )}

                {result && (
                    <div>
                        <div style={{ marginBottom: '20px' }}>
                            <h3 style={{ margin: '0 0 10px 0', fontFamily: 'sans-serif' }}>Environment</h3>
                            <div><strong>Timestamp:</strong> {result.timestamp}</div>
                            <div><strong>Protocol:</strong> {result.protocol}</div>
                            <div><strong>Origin:</strong> {result.origin}</div>
                            <div><strong>Model Path:</strong> {result.modelPath}</div>
                        </div>

                        <div style={{ marginBottom: '20px' }}>
                            <h3 style={{ margin: '0 0 10px 0', fontFamily: 'sans-serif' }}>
                                Overall Status: {result.allLoaded ? '✅ SUCCESS' : '❌ FAILED'}
                            </h3>
                            <div><strong>Total Size:</strong> {formatSize(result.totalSize)}</div>
                            <div><strong>Models Loaded:</strong> {result.models.filter(m => m.loaded).length}/{result.models.length}</div>
                        </div>

                        <div style={{ marginBottom: '20px' }}>
                            <h3 style={{ margin: '0 0 10px 0', fontFamily: 'sans-serif' }}>Model Details</h3>
                            {result.models.map((model, index) => (
                                <div key={index} style={{
                                    padding: '10px',
                                    margin: '5px 0',
                                    backgroundColor: model.loaded ? '#e8f5e8' : '#ffebee',
                                    borderRadius: '4px',
                                    border: `1px solid ${model.loaded ? '#4caf50' : '#f44336'}`
                                }}>
                                    <div style={{ fontWeight: 'bold' }}>
                                        {model.loaded ? '✅' : '❌'} {model.name}
                                    </div>
                                    {model.size && (
                                        <div><strong>Size:</strong> {formatSize(model.size)}</div>
                                    )}
                                    {model.error && (
                                        <div style={{ color: 'red' }}><strong>Error:</strong> {model.error}</div>
                                    )}
                                </div>
                            ))}
                        </div>

                        {result.errors.length > 0 && (
                            <div>
                                <h3 style={{ margin: '0 0 10px 0', fontFamily: 'sans-serif', color: 'red' }}>Errors</h3>
                                {result.errors.map((error, index) => (
                                    <div key={index} style={{
                                        padding: '10px',
                                        margin: '5px 0',
                                        backgroundColor: '#ffebee',
                                        borderRadius: '4px',
                                        color: 'red'
                                    }}>
                                        {error}
                                    </div>
                                ))}
                            </div>
                        )}

                        <div style={{ marginTop: '20px', textAlign: 'center' }}>
                            <button onClick={runDiagnostics} style={{ padding: '10px 20px', marginRight: '10px' }}>
                                Run Again
                            </button>
                            {onClose && (
                                <button onClick={onClose} style={{ padding: '10px 20px' }}>
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