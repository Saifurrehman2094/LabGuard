"""
Detection modules for camera monitoring.

This package contains:
- ObjectDetector: YOLOv8-based object detection (phones, persons)
- FaceAnalyzer: MediaPipe-based face detection and landmark extraction
- GazeEstimator: Gaze direction and blink detection
"""

from .object_detector import ObjectDetector, create_detector
from .face_analyzer import FaceAnalyzer, create_face_analyzer
from .gaze_estimator import GazeEstimator, create_gaze_estimator

__all__ = [
    'ObjectDetector', 'create_detector',
    'FaceAnalyzer', 'create_face_analyzer',
    'GazeEstimator', 'create_gaze_estimator'
]

