"""
Object Detector using YOLOv8n

This module provides object detection capabilities for:
- Mobile phone detection (COCO class 67)
- Person counting (COCO class 0)

Uses Ultralytics YOLOv8n model for fast, accurate detection.
"""

import cv2
import numpy as np
from pathlib import Path
from typing import Dict, List, Tuple, Optional
import logging

try:
    from ultralytics import YOLO
except ImportError:
    YOLO = None
    logging.warning("Ultralytics YOLO not available. Install with: pip install ultralytics")

from .. import config

# COCO class IDs
COCO_CLASS_PERSON = 0
COCO_CLASS_CELL_PHONE = 67

# Logger
logger = logging.getLogger(__name__)


class ObjectDetector:
    """
    Object detector using YOLOv8n for phone and person detection.
    
    Attributes:
        model: YOLOv8 model instance
        model_loaded: Whether model is successfully loaded
        model_path: Path to the YOLOv8n model file
    """
    
    def __init__(self, model_path: Optional[str] = None):
        """
        Initialize the ObjectDetector.
        
        Args:
            model_path: Path to YOLOv8n model file. If None, uses config default.
        """
        self.model = None
        self.model_loaded = False
        self.model_path = model_path or config.YOLO_MODEL_PATH
        
        # Detection thresholds from config
        self.phone_confidence_threshold = config.PHONE_CONFIDENCE_THRESHOLD
        self.person_confidence_threshold = config.PERSON_CONFIDENCE_THRESHOLD
        
        logger.info(f"ObjectDetector initialized with model path: {self.model_path}")
    
    def load_model(self, model_path: Optional[str] = None) -> bool:
        """
        Load the YOLOv8n model.
        
        Args:
            model_path: Optional path to model file. If None, uses instance model_path.
        
        Returns:
            bool: True if model loaded successfully, False otherwise
        """
        if YOLO is None:
            logger.error("Ultralytics YOLO not available. Cannot load model.")
            return False
        
        try:
            # Use provided path or instance path
            path_to_load = model_path or self.model_path
            
            # Check if model file exists
            if not Path(path_to_load).exists():
                logger.warning(f"Model file not found: {path_to_load}")
                logger.info("Attempting to download YOLOv8n model...")
                # YOLO will auto-download if model not found
                try:
                    self.model = YOLO('yolov8n.pt')  # This will download if not found
                    logger.info("YOLOv8n model downloaded successfully")
                except Exception as e:
                    logger.error(f"Failed to download model: {e}")
                    return False
            else:
                logger.info(f"Loading YOLOv8n model from: {path_to_load}")
                self.model = YOLO(path_to_load)
            
            # Verify model is loaded
            if self.model is None:
                logger.error("Model object is None after loading")
                return False
            
            # Test model with a dummy image to ensure it works
            test_image = np.zeros((640, 480, 3), dtype=np.uint8)
            try:
                _ = self.model(test_image, verbose=False)
                logger.info("YOLOv8n model loaded and verified successfully")
                self.model_loaded = True
                self.model_path = path_to_load
                return True
            except Exception as e:
                logger.error(f"Model verification failed: {e}")
                self.model = None
                return False
                
        except Exception as e:
            logger.error(f"Error loading YOLOv8n model: {e}")
            self.model = None
            self.model_loaded = False
            return False
    
    def detect(self, frame: np.ndarray) -> Dict:
        """
        Detect objects (phones and persons) in a frame.
        
        Args:
            frame: Input frame as numpy array (BGR format from OpenCV)
        
        Returns:
            dict: Detection results with the following structure:
                {
                    'phone': {
                        'detected': bool,
                        'confidence': float,
                        'bbox': [x, y, width, height] or None
                    },
                    'persons': {
                        'count': int,
                        'bboxes': List[[x, y, width, height]]
                    },
                    'raw_results': List  # Raw YOLO results for debugging
                }
        """
        if not self.model_loaded or self.model is None:
            logger.warning("Model not loaded. Cannot perform detection.")
            return self._empty_results()
        
        try:
            # Run YOLO detection
            # YOLO expects RGB, but OpenCV provides BGR, so we need to convert
            # Actually, YOLO handles BGR internally, but let's be explicit
            results = self.model(frame, verbose=False, conf=min(
                self.phone_confidence_threshold,
                self.person_confidence_threshold
            ))
            
            # Parse results
            phone_detection = self._filter_phone_detections(results)
            person_detections = self._count_persons(results)
            
            return {
                'phone': phone_detection,
                'persons': person_detections,
                'raw_results': results  # For debugging
            }
            
        except Exception as e:
            logger.error(f"Error during detection: {e}")
            return self._empty_results()
    
    def _filter_phone_detections(self, results) -> Dict:
        """
        Filter and extract phone detections from YOLO results.
        
        Args:
            results: YOLO detection results
        
        Returns:
            dict: Phone detection info
                {
                    'detected': bool,
                    'confidence': float,
                    'bbox': [x, y, width, height] or None
                }
        """
        try:
            # YOLO results structure: results[0] contains detections for first image
            if len(results) == 0:
                return {'detected': False, 'confidence': 0.0, 'bbox': None}
            
            result = results[0]
            
            # Get boxes, confidences, and class IDs
            boxes = result.boxes
            if boxes is None or len(boxes) == 0:
                return {'detected': False, 'confidence': 0.0, 'bbox': None}
            
            # Find phone detections (class 67)
            phone_detections = []
            for i, box in enumerate(boxes):
                class_id = int(box.cls[0])
                confidence = float(box.conf[0])
                
                if class_id == COCO_CLASS_CELL_PHONE and confidence >= self.phone_confidence_threshold:
                    # Get bounding box coordinates (xyxy format)
                    x1, y1, x2, y2 = box.xyxy[0].cpu().numpy()
                    
                    # Convert to [x, y, width, height] format
                    x = int(x1)
                    y = int(y1)
                    width = int(x2 - x1)
                    height = int(y2 - y1)
                    
                    phone_detections.append({
                        'confidence': confidence,
                        'bbox': [x, y, width, height]
                    })
            
            # Return the highest confidence phone detection
            if phone_detections:
                best_phone = max(phone_detections, key=lambda d: d['confidence'])
                return {
                    'detected': True,
                    'confidence': best_phone['confidence'],
                    'bbox': best_phone['bbox']
                }
            else:
                return {'detected': False, 'confidence': 0.0, 'bbox': None}
                
        except Exception as e:
            logger.error(f"Error filtering phone detections: {e}")
            return {'detected': False, 'confidence': 0.0, 'bbox': None}
    
    def _count_persons(self, results) -> Dict:
        """
        Count and extract person detections from YOLO results.
        
        Args:
            results: YOLO detection results
        
        Returns:
            dict: Person detection info
                {
                    'count': int,
                    'bboxes': List[[x, y, width, height]]
                }
        """
        try:
            # YOLO results structure: results[0] contains detections for first image
            if len(results) == 0:
                return {'count': 0, 'bboxes': []}
            
            result = results[0]
            
            # Get boxes, confidences, and class IDs
            boxes = result.boxes
            if boxes is None or len(boxes) == 0:
                return {'count': 0, 'bboxes': []}
            
            # Find person detections (class 0)
            person_bboxes = []
            for i, box in enumerate(boxes):
                class_id = int(box.cls[0])
                confidence = float(box.conf[0])
                
                if class_id == COCO_CLASS_PERSON and confidence >= self.person_confidence_threshold:
                    # Get bounding box coordinates (xyxy format)
                    x1, y1, x2, y2 = box.xyxy[0].cpu().numpy()
                    
                    # Convert to [x, y, width, height] format
                    x = int(x1)
                    y = int(y1)
                    width = int(x2 - x1)
                    height = int(y2 - y1)
                    
                    person_bboxes.append([x, y, width, height])
            
            return {
                'count': len(person_bboxes),
                'bboxes': person_bboxes
            }
            
        except Exception as e:
            logger.error(f"Error counting persons: {e}")
            return {'count': 0, 'bboxes': []}
    
    def _empty_results(self) -> Dict:
        """
        Return empty detection results.
        
        Returns:
            dict: Empty results structure
        """
        return {
            'phone': {
                'detected': False,
                'confidence': 0.0,
                'bbox': None
            },
            'persons': {
                'count': 0,
                'bboxes': []
            },
            'raw_results': None
        }
    
    def is_loaded(self) -> bool:
        """
        Check if model is loaded and ready.
        
        Returns:
            bool: True if model is loaded, False otherwise
        """
        return self.model_loaded and self.model is not None
    
    def get_model_info(self) -> Dict:
        """
        Get information about the loaded model.
        
        Returns:
            dict: Model information
        """
        if not self.model_loaded:
            return {
                'loaded': False,
                'path': self.model_path,
                'error': 'Model not loaded'
            }
        
        return {
            'loaded': True,
            'path': self.model_path,
            'phone_threshold': self.phone_confidence_threshold,
            'person_threshold': self.person_confidence_threshold
        }


# Convenience function for quick initialization
def create_detector(model_path: Optional[str] = None, auto_load: bool = True) -> ObjectDetector:
    """
    Create and optionally load an ObjectDetector instance.
    
    Args:
        model_path: Path to YOLOv8n model file. If None, uses config default.
        auto_load: If True, automatically load the model
    
    Returns:
        ObjectDetector: Initialized detector instance
    """
    detector = ObjectDetector(model_path)
    if auto_load:
        detector.load_model()
    return detector

