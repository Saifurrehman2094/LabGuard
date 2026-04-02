"""
Camera Monitoring Module

This package provides camera-based monitoring capabilities for LabGuard,
including object detection, face analysis, and gaze estimation.

Main Components:
- CameraProcessor: Main processing pipeline
- ObjectDetector: YOLOv8-based phone/person detection
- FaceAnalyzer: MediaPipe face mesh analysis
- GazeEstimator: Gaze direction and blink detection
"""

__version__ = "1.0.0"

from .camera_processor import CameraProcessor

__all__ = ['CameraProcessor']

