import React, { useState, useCallback } from 'react';
import FaceCapture from './FaceCapture';
import './FaceAuth.css';

interface FaceAuthProps {
    sessionId: string;
    username: string;
    onAuthSuccess: (result: any) => void;
    onAuthFailure: (error: string) => void;
    onCancel: () => void;
}

interface AuthState {
    status: 'initializing' | 'ready' | 'capturing' | 'verifying' | 'success' | 'failed';
    message: string;
    attempts: number;
    maxAttempts: number;
}

const glyphSvgProps = {
    width: 22,
    height: 22,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const
};

function FaceAuthStatusGlyph({ status }: { status: AuthState['status'] }) {
    switch (status) {
        case 'success':
            return (
                <svg {...glyphSvgProps} aria-hidden>
                    <path d="M20 6L9 17l-5-5" />
                </svg>
            );
        case 'failed':
            return (
                <svg {...glyphSvgProps} aria-hidden>
                    <path d="M18 6L6 18M6 6l12 12" />
                </svg>
            );
        case 'verifying':
            return (
                <svg {...glyphSvgProps} aria-hidden>
                    <path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36M20.49 15a9 9 0 01-14.85 3.36" />
                </svg>
            );
        case 'capturing':
            return (
                <svg {...glyphSvgProps} aria-hidden>
                    <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                    <circle cx="12" cy="14" r="3.5" />
                </svg>
            );
        default:
            return (
                <svg {...glyphSvgProps} aria-hidden>
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 16v-4M12 8h.01" />
                </svg>
            );
    }
}

const FaceAuth: React.FC<FaceAuthProps> = ({
    sessionId,
    username,
    onAuthSuccess,
    onAuthFailure,
    onCancel
}) => {
    const [authState, setAuthState] = useState<AuthState>({
        status: 'initializing',
        message: 'Initializing face authentication...',
        attempts: 0,
        maxAttempts: 3
    });

    const [isCapturing, setIsCapturing] = useState(false);

    // Handle camera ready
    const handleCameraReady = useCallback(() => {
        setAuthState(prev => ({
            ...prev,
            status: 'ready',
            message: 'Please position your face within the frame and click "Verify Face" when ready.'
        }));
    }, []);

    // Handle face detection
    const handleFaceDetected = useCallback(async (embedding: number[], confidence: number) => {
        if (authState.status !== 'capturing') return;

        setAuthState(prev => ({
            ...prev,
            status: 'verifying',
            message: 'Verifying your face...'
        }));

        setIsCapturing(false);

        try {
            // Call the face verification API
            const result = await window.electronAPI.verifyFace(sessionId, embedding);

            if (result.success) {
                setAuthState(prev => ({
                    ...prev,
                    status: 'success',
                    message: 'Face verification successful! Logging you in...'
                }));

                // Wait a moment to show success message
                setTimeout(() => {
                    onAuthSuccess(result);
                }, 1500);
            } else {
                const newAttempts = authState.attempts + 1;

                if (newAttempts >= authState.maxAttempts) {
                    setAuthState(prev => ({
                        ...prev,
                        status: 'failed',
                        message: 'Face verification failed. Maximum attempts reached.',
                        attempts: newAttempts
                    }));

                    setTimeout(() => {
                        onAuthFailure('Maximum face verification attempts reached');
                    }, 2000);
                } else {
                    setAuthState(prev => ({
                        ...prev,
                        status: 'ready',
                        message: `Face verification failed. ${authState.maxAttempts - newAttempts} attempts remaining. Please try again.`,
                        attempts: newAttempts
                    }));
                }
            }
        } catch {
            const newAttempts = authState.attempts + 1;

            if (newAttempts >= authState.maxAttempts) {
                setAuthState(prev => ({
                    ...prev,
                    status: 'failed',
                    message: 'Face verification error. Please try logging in again.',
                    attempts: newAttempts
                }));

                setTimeout(() => {
                    onAuthFailure('Face verification system error');
                }, 2000);
            } else {
                setAuthState(prev => ({
                    ...prev,
                    status: 'ready',
                    message: `Verification error. ${authState.maxAttempts - newAttempts} attempts remaining.`,
                    attempts: newAttempts
                }));
            }
        }
    }, [sessionId, authState.attempts, authState.maxAttempts, authState.status, onAuthSuccess, onAuthFailure]);

    // Handle capture errors
    const handleCaptureError = useCallback((error: string) => {
        setAuthState(prev => ({
            ...prev,
            status: 'failed',
            message: `Camera error: ${error}`
        }));

        setTimeout(() => {
            onAuthFailure(error);
        }, 2000);
    }, [onAuthFailure]);

    // Start face verification
    const startVerification = useCallback(() => {
        if (authState.status === 'ready') {
            setAuthState(prev => ({
                ...prev,
                status: 'capturing',
                message: 'Look directly at the camera. Face capture will begin automatically...'
            }));
            setIsCapturing(true);
        }
    }, [authState.status]);

    return (
        <div className={`face-auth face-auth--${authState.status}`}>
            <div className="face-auth__header">
                <h2 className="face-auth__title">Face Authentication</h2>
                <p className="face-auth__subtitle">
                    Welcome back, <strong>{username}</strong>. Please verify your identity using face recognition.
                </p>
            </div>

            <div className="face-auth__content">
                <div className="face-auth__status">
                    <div className="face-auth__status-icon" aria-hidden="true">
                        <FaceAuthStatusGlyph status={authState.status} />
                    </div>
                    <p className="face-auth__status-message">{authState.message}</p>

                    {authState.attempts > 0 && (
                        <div className="face-auth__attempts">
                            <p>Attempts: {authState.attempts}/{authState.maxAttempts}</p>
                            <div className="face-auth__attempts-bar">
                                <div
                                    className={`face-auth__attempts-fill${authState.attempts >= authState.maxAttempts ? ' face-auth__attempts-fill--at-limit' : ''}`}
                                    style={{
                                        width: `${(authState.attempts / authState.maxAttempts) * 100}%`
                                    }}
                                ></div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="face-auth__capture">
                    <FaceCapture
                        onFaceDetected={handleFaceDetected}
                        onError={handleCaptureError}
                        onCameraReady={handleCameraReady}
                        isCapturing={isCapturing}
                        showBoundingBox={true}
                        className="face-auth__face-capture"
                    />
                </div>

                <div className="face-auth__controls">
                    {authState.status === 'ready' && (
                        <button
                            type="button"
                            onClick={startVerification}
                            className="face-auth__button face-auth__button--verify"
                        >
                            Verify Face
                        </button>
                    )}

                    {authState.status === 'capturing' && (
                        <button
                            type="button"
                            onClick={() => {
                                setIsCapturing(false);
                                setAuthState(prev => ({
                                    ...prev,
                                    status: 'ready',
                                    message: 'Face capture cancelled. Click "Verify Face" to try again.'
                                }));
                            }}
                            className="face-auth__button face-auth__button--cancel-capture"
                        >
                            Cancel Capture
                        </button>
                    )}

                    {(authState.status === 'ready' || authState.status === 'failed') && (
                        <button
                            type="button"
                            onClick={onCancel}
                            className="face-auth__button face-auth__button--cancel"
                        >
                            Cancel & Logout
                        </button>
                    )}
                </div>
            </div>

            <div className="face-auth__help">
                <h4>Tips for better face recognition:</h4>
                <ul>
                    <li>Ensure good lighting on your face</li>
                    <li>Look directly at the camera</li>
                    <li>Keep your face centered in the frame</li>
                    <li>Remove glasses or hats if possible</li>
                    <li>Maintain a neutral expression</li>
                </ul>
            </div>
        </div>
    );
};

export default FaceAuth;