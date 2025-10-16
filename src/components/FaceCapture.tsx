import React, { useRef, useEffect, useState, useCallback } from 'react';
import * as faceapi from '@vladmandic/face-api';
import ModelManager from '../services/modelManager';
import './FaceCapture.css';

interface FaceCaptureProps {
    onFaceDetected?: (embedding: number[], confidence: number) => void;
    onError?: (error: string) => void;
    onCameraReady?: () => void;
    isCapturing?: boolean;
    showBoundingBox?: boolean;
    captureMultiple?: boolean;
    maxCaptures?: number;
    className?: string;
}

interface Detection {
    embedding: number[];
    confidence: number;
    box: { x: number; y: number; width: number; height: number };
}

const FaceCapture: React.FC<FaceCaptureProps> = ({
    onFaceDetected,
    onError,
    onCameraReady,
    isCapturing = false,
    showBoundingBox = true,
    captureMultiple = false,
    maxCaptures = 5,
    className = ''
}) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const animationRef = useRef<number | undefined>(undefined);

    const [isModelLoaded, setIsModelLoaded] = useState(false);
    const [isCameraActive, setIsCameraActive] = useState(false);
    const [currentDetection, setCurrentDetection] = useState<Detection | null>(null);
    const [captureCount, setCaptureCount] = useState(0);
    const [status, setStatus] = useState<string>('Initializing...');

    // Load face-api models
    const loadModels = useCallback(async () => {
        try {
            setStatus('Loading face recognition models...');

            const modelManager = ModelManager.getInstance();
            const result = await modelManager.loadModels();

            if (result.allLoaded) {
                setIsModelLoaded(true);
                setStatus('Models loaded successfully');
                console.log('Face-API models loaded successfully');
            } else {
                const errorMsg = `Failed to load some models: ${result.errors.join(', ')}`;
                console.error(errorMsg);
                setStatus('Failed to load models');
                onError?.(errorMsg);
            }
        } catch (error) {
            const errorMsg = `Failed to load face recognition models: ${error}`;
            console.error(errorMsg);
            setStatus('Failed to load models');
            onError?.(errorMsg);
        }
    }, [onError]);

    // Initialize camera
    const initializeCamera = useCallback(async () => {
        try {
            setStatus('Requesting camera access...');

            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 640 },
                    height: { ideal: 480 },
                    facingMode: 'user'
                },
                audio: false
            });

            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                streamRef.current = stream;

                videoRef.current.onloadedmetadata = () => {
                    setIsCameraActive(true);
                    setStatus('Camera ready');
                    onCameraReady?.();
                };
            }
        } catch (error) {
            const errorMsg = `Camera access failed: ${error}`;
            console.error(errorMsg);
            setStatus('Camera access denied');
            onError?.(errorMsg);
        }
    }, [onCameraReady, onError]);

    // Detect faces in video stream
    const detectFaces = useCallback(async () => {
        if (!videoRef.current || !canvasRef.current || !isModelLoaded || !isCameraActive) {
            return;
        }

        const video = videoRef.current;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');

        if (!ctx) return;

        try {
            // Set canvas dimensions to match video
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;

            // Clear canvas
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // Detect faces with landmarks and descriptors
            const detections = await faceapi
                .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.5 }))
                .withFaceLandmarks()
                .withFaceDescriptors();

            if (detections.length > 0) {
                const detection = detections[0]; // Use first detected face
                const box = detection.detection.box;
                const confidence = detection.detection.score;
                const embedding = Array.from(detection.descriptor);

                // Update current detection
                setCurrentDetection({
                    embedding,
                    confidence,
                    box: { x: box.x, y: box.y, width: box.width, height: box.height }
                });

                // Draw bounding box if enabled
                if (showBoundingBox) {
                    ctx.strokeStyle = confidence > 0.8 ? '#00ff00' : '#ffff00';
                    ctx.lineWidth = 2;
                    ctx.strokeRect(box.x, box.y, box.width, box.height);

                    // Draw confidence score
                    ctx.fillStyle = ctx.strokeStyle;
                    ctx.font = '16px Arial';
                    ctx.fillText(
                        `Confidence: ${(confidence * 100).toFixed(1)}%`,
                        box.x,
                        box.y - 10
                    );
                }

                // Auto-capture if conditions are met
                if (isCapturing && confidence > 0.8) {
                    if (!captureMultiple || captureCount < maxCaptures) {
                        onFaceDetected?.(embedding, confidence);

                        if (captureMultiple) {
                            setCaptureCount(prev => prev + 1);
                            setStatus(`Captured ${captureCount + 1}/${maxCaptures} faces`);
                        } else {
                            setStatus('Face captured successfully');
                        }
                    }
                }

                setStatus(
                    detections.length === 1
                        ? `Face detected (${(confidence * 100).toFixed(1)}% confidence)`
                        : `${detections.length} faces detected - please ensure only one face is visible`
                );
            } else {
                setCurrentDetection(null);
                setStatus('No face detected - please position your face in the frame');
            }
        } catch (error) {
            console.error('Face detection error:', error);
            setStatus('Face detection error');
        }

        // Continue detection loop
        animationRef.current = requestAnimationFrame(detectFaces);
    }, [isModelLoaded, isCameraActive, isCapturing, showBoundingBox, captureMultiple, maxCaptures, captureCount, onFaceDetected]);

    // Start detection loop
    const startDetection = useCallback(() => {
        if (animationRef.current) {
            cancelAnimationFrame(animationRef.current);
        }
        detectFaces();
    }, [detectFaces]);

    // Stop detection loop
    const stopDetection = useCallback(() => {
        if (animationRef.current) {
            cancelAnimationFrame(animationRef.current);
            animationRef.current = undefined;
        }
    }, []);

    // Cleanup camera stream
    const cleanup = useCallback(() => {
        stopDetection();

        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }

        setIsCameraActive(false);
        setCurrentDetection(null);
        setCaptureCount(0);
    }, [stopDetection]);

    // Manual capture function
    const captureNow = useCallback(() => {
        if (currentDetection && currentDetection.confidence > 0.7) {
            onFaceDetected?.(currentDetection.embedding, currentDetection.confidence);

            if (captureMultiple) {
                setCaptureCount(prev => prev + 1);
                setStatus(`Captured ${captureCount + 1}/${maxCaptures} faces`);
            } else {
                setStatus('Face captured successfully');
            }
        } else {
            setStatus('No suitable face detected for capture');
        }
    }, [currentDetection, captureMultiple, captureCount, maxCaptures, onFaceDetected]);

    // Reset capture count
    const resetCaptures = useCallback(() => {
        setCaptureCount(0);
        setStatus('Ready to capture faces');
    }, []);

    // Initialize on mount
    useEffect(() => {
        loadModels();
        return cleanup;
    }, [loadModels, cleanup]);

    // Initialize camera when models are loaded
    useEffect(() => {
        if (isModelLoaded) {
            initializeCamera();
        }
    }, [isModelLoaded, initializeCamera]);

    // Start/stop detection based on camera state
    useEffect(() => {
        if (isCameraActive && isModelLoaded) {
            startDetection();
        } else {
            stopDetection();
        }

        return stopDetection;
    }, [isCameraActive, isModelLoaded, startDetection, stopDetection]);

    return (
        <div className={`face-capture ${className}`}>
            <div className="face-capture__container">
                <div className="face-capture__video-container">
                    <video
                        ref={videoRef}
                        autoPlay
                        muted
                        playsInline
                        className="face-capture__video"
                    />
                    <canvas
                        ref={canvasRef}
                        className="face-capture__canvas"
                    />

                    {!isCameraActive && (
                        <div className="face-capture__overlay">
                            <div className="face-capture__loading">
                                <div className="face-capture__spinner"></div>
                                <p>{status}</p>
                            </div>
                        </div>
                    )}
                </div>

                <div className="face-capture__status">
                    <p className="face-capture__status-text">{status}</p>

                    {currentDetection && (
                        <div className="face-capture__detection-info">
                            <p>Confidence: {(currentDetection.confidence * 100).toFixed(1)}%</p>
                            <p>Quality: {currentDetection.confidence > 0.8 ? 'Good' : 'Fair'}</p>
                        </div>
                    )}

                    {captureMultiple && (
                        <div className="face-capture__progress">
                            <p>Captures: {captureCount}/{maxCaptures}</p>
                            <div className="face-capture__progress-bar">
                                <div
                                    className="face-capture__progress-fill"
                                    style={{ width: `${(captureCount / maxCaptures) * 100}%` }}
                                ></div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="face-capture__controls">
                    <button
                        onClick={captureNow}
                        disabled={!currentDetection || currentDetection.confidence < 0.7}
                        className="face-capture__button face-capture__button--capture"
                    >
                        Capture Face
                    </button>

                    {captureMultiple && (
                        <button
                            onClick={resetCaptures}
                            className="face-capture__button face-capture__button--reset"
                        >
                            Reset
                        </button>
                    )}

                    <button
                        onClick={cleanup}
                        className="face-capture__button face-capture__button--stop"
                    >
                        Stop Camera
                    </button>
                </div>
            </div>
        </div>
    );
};

export default FaceCapture;