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
        } catch (error) {
            console.error('Face verification error:', error);

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
        console.error('Face capture error:', error);
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

    // Get status color based on current state
    const getStatusColor = () => {
        switch (authState.status) {
            case 'success':
                return '#4CAF50';
            case 'failed':
                return '#f44336';
            case 'verifying':
            case 'capturing':
                return '#ff9800';
            default:
                return '#2196F3';
        }
    };

    // Get status icon
    const getStatusIcon = () => {
        switch (authState.status) {
            case 'success':
                return '✓';
            case 'failed':
                return '✗';
            case 'verifying':
                return '⟳';
            case 'capturing':
                return '📷';
            default:
                return 'ℹ';
        }
    };

    return (
        <div className="face-auth">
            <div className="face-auth__header">
                <h2 className="face-auth__title">Face Authentication</h2>
                <p className="face-auth__subtitle">
                    Welcome back, <strong>{username}</strong>. Please verify your identity using face recognition.
                </p>
            </div>

            <div className="face-auth__content">
                <div className="face-auth__status">
                    <div
                        className="face-auth__status-icon"
                        style={{ backgroundColor: getStatusColor() }}
                    >
                        {getStatusIcon()}
                    </div>
                    <p className="face-auth__status-message">{authState.message}</p>

                    {authState.attempts > 0 && (
                        <div className="face-auth__attempts">
                            <p>Attempts: {authState.attempts}/{authState.maxAttempts}</p>
                            <div className="face-auth__attempts-bar">
                                <div
                                    className="face-auth__attempts-fill"
                                    style={{
                                        width: `${(authState.attempts / authState.maxAttempts) * 100}%`,
                                        backgroundColor: authState.attempts >= authState.maxAttempts ? '#f44336' : '#ff9800'
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
                            onClick={startVerification}
                            className="face-auth__button face-auth__button--verify"
                        >
                            Verify Face
                        </button>
                    )}

                    {authState.status === 'capturing' && (
                        <button
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