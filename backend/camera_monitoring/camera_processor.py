"""
Camera Processor - Main Processing Pipeline

This module provides the main camera processing pipeline for LabGuard.
It integrates all detection components and outputs JSON status updates.

Features:
- Webcam initialization and frame capture
- Object detection (phone, person counting)
- Face analysis (landmarks, head pose)
- Gaze estimation and blink detection
- JSON output to stdout for Node.js integration
- Graceful shutdown handling
- FPS calculation and reporting

Usage:
    python camera_processor.py                    # Run with webcam
    python camera_processor.py --camera 0         # Specify camera index
    python camera_processor.py --debug            # Enable debug output
"""

import sys
import cv2
import json
import time
import signal
import argparse
import logging
import base64
import os
import numpy as np
from typing import Dict, Optional, Any, Set
from datetime import datetime

# Import configuration
from . import config

# Import detectors
from .detectors.object_detector import ObjectDetector
from .detectors.face_analyzer import FaceAnalyzer
from .detectors.gaze_estimator import GazeEstimator

# Setup logging
logging.basicConfig(
    level=getattr(logging, config.LOG_LEVEL),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    stream=sys.stderr  # Log to stderr, JSON to stdout
)
logger = logging.getLogger(__name__)


class CameraProcessor:
    """
    Main camera processing pipeline for LabGuard monitoring.
    
    Integrates object detection, face analysis, and gaze estimation
    to monitor exam sessions and detect violations.
    
    Attributes:
        camera: OpenCV VideoCapture object
        object_detector: YOLOv8 object detector
        face_analyzer: MediaPipe face analyzer
        gaze_estimator: Gaze and blink detector
        running: Whether the main loop is running
        frame_count: Total frames processed
        fps: Current frames per second
    """
    
    def __init__(
        self,
        camera_index: int = None,
        enable_display: bool = False,
        enable_frame_transmission: bool = None,
        student_name: str = "unknown",
        snapshot_violations: list = None
    ):
        """
        Initialize the CameraProcessor.
        
        Args:
            camera_index: Camera device index (default: from config)
            enable_display: Show OpenCV window with detections (default: False)
            enable_frame_transmission: Send frames as base64 in JSON (default: from config)
            student_name: Name of the student for snapshot naming
            snapshot_violations: List of violation types that should trigger snapshots
        """
        self.camera_index = camera_index if camera_index is not None else config.CAMERA_INDEX
        self.enable_display = enable_display
        self.enable_frame_transmission = (
            enable_frame_transmission if enable_frame_transmission is not None 
            else config.ENABLE_FRAME_TRANSMISSION
        )
        
        # Student info for snapshots
        self.student_name = student_name.replace(" ", "_") if student_name else "unknown"
        
        # Snapshot configuration
        self.snapshot_violations: Set[str] = set(
            snapshot_violations if snapshot_violations is not None 
            else config.DEFAULT_SNAPSHOT_VIOLATIONS
        )
        self.snapshot_cooldowns: Dict[str, float] = {}  # violation_type -> last_snapshot_time
        self.snapshot_count = 0
        self._ensure_snapshot_dir()
        
        # Components
        self.camera: Optional[cv2.VideoCapture] = None
        self.object_detector: Optional[ObjectDetector] = None
        self.face_analyzer: Optional[FaceAnalyzer] = None
        self.gaze_estimator: Optional[GazeEstimator] = None
        
        # State
        self.running = False
        self.initialized = False
        self.frame_count = 0
        self.fps = 0.0
        self.last_fps_time = time.time()
        self.fps_frame_count = 0
        
        # Shutdown handling
        self._setup_signal_handlers()
        
        logger.info(f"CameraProcessor created (camera_index={self.camera_index}, student={self.student_name})")
        logger.info(f"Snapshot violations enabled: {self.snapshot_violations}")
    
    def _setup_signal_handlers(self):
        """Setup signal handlers for graceful shutdown."""
        signal.signal(signal.SIGINT, self._signal_handler)
        signal.signal(signal.SIGTERM, self._signal_handler)
        
        # Windows-specific signal
        if hasattr(signal, 'SIGBREAK'):
            signal.signal(signal.SIGBREAK, self._signal_handler)
    
    def _signal_handler(self, signum, frame):
        """Handle shutdown signals."""
        logger.info(f"Received signal {signum}, initiating shutdown...")
        self.running = False
    
    def _ensure_snapshot_dir(self):
        """Ensure the snapshot directory exists."""
        try:
            if not os.path.exists(config.SNAPSHOT_DIR):
                os.makedirs(config.SNAPSHOT_DIR)
                logger.info(f"Created snapshot directory: {config.SNAPSHOT_DIR}")
        except Exception as e:
            logger.error(f"Failed to create snapshot directory: {e}")
    
    def _can_take_snapshot(self, violation_type: str) -> bool:
        """
        Check if a snapshot can be taken for this violation type (respecting cooldown).
        
        Args:
            violation_type: Type of violation (e.g., 'phone_violation', 'multiple_persons')
        
        Returns:
            bool: True if cooldown has passed and snapshot can be taken
        """
        if not config.ENABLE_VIOLATION_SNAPSHOTS:
            return False
        
        if violation_type not in self.snapshot_violations:
            return False
        
        if config.MAX_SNAPSHOTS_PER_SESSION > 0 and self.snapshot_count >= config.MAX_SNAPSHOTS_PER_SESSION:
            logger.warning(f"Maximum snapshots per session ({config.MAX_SNAPSHOTS_PER_SESSION}) reached")
            return False
        
        current_time = time.time()
        last_snapshot_time = self.snapshot_cooldowns.get(violation_type, 0)
        
        if current_time - last_snapshot_time < config.SNAPSHOT_COOLDOWN_SECONDS:
            return False
        
        return True
    
    def _take_snapshot(self, frame: np.ndarray, violation_type: str) -> Optional[str]:
        """
        Take a snapshot of the current frame for a violation.
        
        Args:
            frame: Current video frame
            violation_type: Type of violation that triggered the snapshot
        
        Returns:
            str: Path to saved snapshot file, or None if failed
        """
        try:
            # Generate filename: studentname_violationtype_timestamp.jpg
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            violation_name = violation_type.replace('_', '-')
            filename = f"{self.student_name}_{violation_name}_{timestamp}.jpg"
            filepath = os.path.join(config.SNAPSHOT_DIR, filename)
            
            # Save the snapshot
            success = cv2.imwrite(
                filepath, 
                frame, 
                [cv2.IMWRITE_JPEG_QUALITY, config.SNAPSHOT_JPEG_QUALITY]
            )
            
            if success:
                # Update cooldown tracker
                self.snapshot_cooldowns[violation_type] = time.time()
                self.snapshot_count += 1
                
                logger.info(f"Snapshot saved: {filename} (total: {self.snapshot_count})")
                return filepath
            else:
                logger.error(f"Failed to save snapshot: {filepath}")
                return None
                
        except Exception as e:
            logger.error(f"Error taking snapshot: {e}")
            return None
    
    def _process_violation_snapshots(self, frame: np.ndarray, violations: Dict[str, bool]) -> Dict[str, Any]:
        """
        Process violations and take snapshots if needed.
        
        Args:
            frame: Current video frame
            violations: Dictionary of violation flags
        
        Returns:
            Dict with snapshot information
        """
        snapshot_info = {
            'snapshot_taken': False,
            'snapshot_violations': [],
            'snapshot_paths': []
        }
        
        if not config.ENABLE_VIOLATION_SNAPSHOTS:
            return snapshot_info
        
        for violation_type, is_active in violations.items():
            if is_active and self._can_take_snapshot(violation_type):
                snapshot_path = self._take_snapshot(frame, violation_type)
                if snapshot_path:
                    snapshot_info['snapshot_taken'] = True
                    snapshot_info['snapshot_violations'].append(violation_type)
                    snapshot_info['snapshot_paths'].append(snapshot_path)
        
        return snapshot_info
    
    def update_snapshot_config(self, violations: list):
        """
        Update which violations should trigger snapshots.
        
        Args:
            violations: List of violation type strings
        """
        self.snapshot_violations = set(violations)
        logger.info(f"Updated snapshot violations: {self.snapshot_violations}")
    
    def initialize(self) -> bool:
        """
        Initialize all components (camera and detectors).
        
        Returns:
            bool: True if all components initialized successfully
        """
        logger.info("Initializing CameraProcessor...")
        
        try:
            # Initialize camera
            if not self._initialize_camera():
                return False
            
            # Initialize object detector
            if config.ENABLE_PHONE_DETECTION or config.ENABLE_PERSON_COUNTING:
                if not self._initialize_object_detector():
                    return False
            
            # Initialize face analyzer
            if config.ENABLE_HEAD_POSE_DETECTION or config.ENABLE_GAZE_DETECTION:
                if not self._initialize_face_analyzer():
                    return False
            
            # Initialize gaze estimator
            if config.ENABLE_GAZE_DETECTION or config.ENABLE_BLINK_DETECTION:
                if not self._initialize_gaze_estimator():
                    return False
            
            self.initialized = True
            logger.info("CameraProcessor initialized successfully")
            
            # Send ready status
            self._output_status({
                'type': 'ready',
                'timestamp': self._get_timestamp(),
                'message': 'Camera processor initialized and ready'
            })
            
            return True
            
        except Exception as e:
            logger.error(f"Error during initialization: {e}")
            self._output_error('initialization_failed', str(e))
            return False
    
    def _initialize_camera(self) -> bool:
        """Initialize webcam."""
        logger.info(f"Opening camera {self.camera_index}...")
        
        self.camera = cv2.VideoCapture(self.camera_index)
        
        if not self.camera.isOpened():
            logger.error(f"Failed to open camera {self.camera_index}")
            self._output_error('camera_access_denied', f'Could not open camera {self.camera_index}')
            return False
        
        # Set camera properties
        self.camera.set(cv2.CAP_PROP_FRAME_WIDTH, config.CAMERA_WIDTH)
        self.camera.set(cv2.CAP_PROP_FRAME_HEIGHT, config.CAMERA_HEIGHT)
        self.camera.set(cv2.CAP_PROP_FPS, config.TARGET_FPS)
        
        # Verify settings
        actual_width = int(self.camera.get(cv2.CAP_PROP_FRAME_WIDTH))
        actual_height = int(self.camera.get(cv2.CAP_PROP_FRAME_HEIGHT))
        actual_fps = self.camera.get(cv2.CAP_PROP_FPS)
        
        logger.info(f"Camera opened: {actual_width}x{actual_height} @ {actual_fps} FPS")
        return True
    
    def _initialize_object_detector(self) -> bool:
        """Initialize YOLOv8 object detector."""
        logger.info("Initializing object detector...")
        
        self.object_detector = ObjectDetector()
        
        if not self.object_detector.load_model():
            logger.error("Failed to load object detection model")
            self._output_error('model_load_failed', 'Failed to load YOLOv8 model')
            return False
        
        logger.info("Object detector initialized")
        return True
    
    def _initialize_face_analyzer(self) -> bool:
        """Initialize MediaPipe face analyzer."""
        logger.info("Initializing face analyzer...")
        
        self.face_analyzer = FaceAnalyzer()
        
        if not self.face_analyzer.initialize():
            logger.error("Failed to initialize face analyzer")
            self._output_error('model_load_failed', 'Failed to initialize MediaPipe Face Mesh')
            return False
        
        logger.info("Face analyzer initialized")
        return True
    
    def _initialize_gaze_estimator(self) -> bool:
        """Initialize gaze estimator."""
        logger.info("Initializing gaze estimator...")
        
        self.gaze_estimator = GazeEstimator()
        
        logger.info("Gaze estimator initialized")
        return True
    
    def process_frame(self, frame: np.ndarray) -> Dict[str, Any]:
        """
        Process a single frame through all detectors.
        
        Args:
            frame: BGR image frame from camera
        
        Returns:
            Dict containing all detection results
        """
        results = {
            'timestamp': self._get_timestamp(),
            'fps': self.fps,
            'frame_number': self.frame_count,
            'detections': {},
            'face': {},
            'gaze': {},
            'blink': {},
            'violations': {}
        }
        
        try:
            # Object detection (phone, persons)
            if self.object_detector and self.object_detector.is_loaded():
                object_results = self.object_detector.detect(frame)
                
                results['detections'] = {
                    'phone': {
                        'detected': object_results['phone']['detected'],
                        'confidence': object_results['phone']['confidence'],
                        'bbox': object_results['phone']['bbox']
                    },
                    'persons': {
                        'count': object_results['persons']['count'],
                        'bboxes': object_results['persons']['bboxes']
                    }
                }
            
            # Face analysis
            face_detected = False
            landmarks_2d = None
            head_pose = None
            iris_positions = None
            
            if self.face_analyzer and self.face_analyzer.is_initialized():
                face_results = self.face_analyzer.detect_face(frame)
                face_detected = face_results['face_detected']
                
                results['face'] = {
                    'detected': face_detected,
                    'landmarks_count': len(face_results['landmarks']) if face_results['landmarks'] is not None else 0
                }
                
                if face_detected:
                    landmarks_2d = face_results['landmarks_2d']
                    head_pose = face_results['head_pose']
                    iris_positions = face_results['iris_positions']
                    
                    if head_pose:
                        results['face']['head_pose'] = {
                            'yaw': round(head_pose['yaw'], 2),
                            'pitch': round(head_pose['pitch'], 2),
                            'roll': round(head_pose['roll'], 2)
                        }
                        
                        # Check if facing screen
                        facing_screen = config.is_facing_screen(head_pose['yaw'], head_pose['pitch'])
                        results['face']['orientation'] = 'facing_screen' if facing_screen else 'looking_away'
            
            # Gaze estimation
            if self.gaze_estimator and face_detected:
                gaze_results = self.gaze_estimator.analyze(
                    iris_positions,
                    landmarks_2d,
                    head_pose
                )
                
                gaze = gaze_results['gaze']
                blink = gaze_results['blink']
                
                results['gaze'] = {
                    'direction': gaze['direction'],
                    'horizontal_angle': round(gaze['horizontal_angle'], 2),
                    'gaze_detected': gaze['gaze_detected'],
                    'looking_at_screen': gaze['direction'] == 'center'
                }
                
                results['blink'] = {
                    'is_blinking': blink['is_blinking'],
                    'left_eye_ear': round(blink['left_ear'], 3) if blink['left_ear'] is not None else None,
                    'right_eye_ear': round(blink['right_ear'], 3) if blink['right_ear'] is not None else None,
                    'avg_ear': round(blink['avg_ear'], 3) if blink['avg_ear'] is not None else None
                }
            
            # Calculate violations
            results['violations'] = self._calculate_violations(results)
            
            # Process violation snapshots
            snapshot_info = self._process_violation_snapshots(frame, results['violations'])
            results['snapshot'] = snapshot_info
            
            # Add frame data if enabled
            if self.enable_frame_transmission:
                results['frame_jpeg_base64'] = self._encode_frame(frame)
            
        except Exception as e:
            logger.error(f"Error processing frame: {e}")
            results['error'] = str(e)
        
        return results
    
    def _calculate_violations(self, results: Dict) -> Dict[str, bool]:
        """
        Calculate violation flags from detection results.
        
        Args:
            results: Detection results dictionary
        
        Returns:
            Dict with violation flags
        """
        violations = {
            'phone_violation': False,
            'multiple_persons': False,
            'no_face_detected': False,
            'not_facing_screen': False,
            'not_looking_at_screen': False
        }
        
        try:
            # Phone violation
            if config.ENABLE_PHONE_DETECTION:
                detections = results.get('detections', {})
                phone = detections.get('phone', {})
                violations['phone_violation'] = phone.get('detected', False)
            
            # Multiple persons
            if config.ENABLE_PERSON_COUNTING:
                detections = results.get('detections', {})
                persons = detections.get('persons', {})
                person_count = persons.get('count', 0)
                violations['multiple_persons'] = person_count >= config.MULTIPLE_PERSON_THRESHOLD
            
            # Face detection
            face = results.get('face', {})
            face_detected = face.get('detected', False)
            violations['no_face_detected'] = not face_detected
            
            # Head pose / facing screen
            if config.ENABLE_HEAD_POSE_DETECTION and face_detected:
                orientation = face.get('orientation', '')
                violations['not_facing_screen'] = orientation != 'facing_screen'
            
            # Gaze direction
            if config.ENABLE_GAZE_DETECTION and face_detected:
                gaze = results.get('gaze', {})
                looking_at_screen = gaze.get('looking_at_screen', True)
                violations['not_looking_at_screen'] = not looking_at_screen
                
        except Exception as e:
            logger.warning(f"Error calculating violations: {e}")
        
        return violations
    
    def _encode_frame(self, frame: np.ndarray) -> str:
        """
        Encode frame as base64 JPEG.
        
        Args:
            frame: BGR image frame
        
        Returns:
            str: Base64 encoded JPEG
        """
        try:
            _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 70])
            return base64.b64encode(buffer).decode('utf-8')
        except Exception as e:
            logger.warning(f"Error encoding frame: {e}")
            return ''
    
    def _update_fps(self):
        """Update FPS calculation."""
        self.fps_frame_count += 1
        current_time = time.time()
        elapsed = current_time - self.last_fps_time
        
        if elapsed >= 1.0:  # Update every second
            self.fps = self.fps_frame_count / elapsed
            self.fps_frame_count = 0
            self.last_fps_time = current_time
    
    def _get_timestamp(self) -> int:
        """Get current timestamp in milliseconds."""
        return int(time.time() * 1000)
    
    def _output_status(self, status: Dict):
        """
        Output status JSON to stdout.
        
        Args:
            status: Status dictionary to output
        """
        if config.JSON_OUTPUT_ENABLED:
            try:
                print(json.dumps(status), flush=True)
            except Exception as e:
                logger.error(f"Error outputting status: {e}")
    
    def _output_error(self, error_type: str, message: str):
        """
        Output error JSON to stdout.
        
        Args:
            error_type: Type of error
            message: Error message
        """
        error_status = {
            'error': True,
            'error_type': error_type,
            'message': message,
            'timestamp': self._get_timestamp()
        }
        self._output_status(error_status)
    
    def run(self):
        """
        Main processing loop.
        
        Captures frames, processes them, and outputs JSON status updates.
        """
        if not self.initialized:
            logger.error("CameraProcessor not initialized. Call initialize() first.")
            self._output_error('not_initialized', 'Camera processor not initialized')
            return
        
        logger.info("Starting main processing loop...")
        self.running = True
        self.last_fps_time = time.time()
        
        try:
            while self.running:
                # Capture frame
                ret, frame = self.camera.read()
                
                if not ret:
                    logger.warning("Failed to capture frame")
                    continue
                
                self.frame_count += 1
                
                # Frame skipping for performance
                if self.frame_count % config.FRAME_SKIP != 0:
                    continue
                
                # Process frame
                start_time = time.time()
                results = self.process_frame(frame)
                processing_time = (time.time() - start_time) * 1000
                
                # Check processing time
                if processing_time > config.MAX_FRAME_PROCESSING_TIME_MS:
                    logger.warning(f"Frame processing took {processing_time:.1f}ms (max: {config.MAX_FRAME_PROCESSING_TIME_MS}ms)")
                
                # Update FPS
                self._update_fps()
                results['fps'] = round(self.fps, 1)
                results['processing_time_ms'] = round(processing_time, 1)
                
                # Output results
                self._output_status(results)
                
                # Display if enabled
                if self.enable_display:
                    self._display_frame(frame, results)
                    
                    # Check for quit key
                    key = cv2.waitKey(1) & 0xFF
                    if key == ord('q'):
                        logger.info("Quit key pressed")
                        self.running = False
                
        except KeyboardInterrupt:
            logger.info("Keyboard interrupt received")
        except Exception as e:
            logger.error(f"Error in main loop: {e}")
            self._output_error('processing_error', str(e))
        finally:
            self.running = False
            logger.info("Main processing loop ended")
    
    def _display_frame(self, frame: np.ndarray, results: Dict):
        """
        Display frame with detection overlays (for debugging).
        
        Args:
            frame: Original frame
            results: Detection results
        """
        display_frame = frame.copy()
        
        try:
            # Draw phone detection
            detections = results.get('detections', {})
            phone = detections.get('phone', {})
            if phone.get('detected') and phone.get('bbox'):
                x, y, w, h = phone['bbox']
                cv2.rectangle(display_frame, (x, y), (x + w, y + h), (0, 0, 255), 2)
                cv2.putText(display_frame, f"Phone: {phone['confidence']:.2f}",
                           (x, y - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 255), 2)
            
            # Draw person detections
            persons = detections.get('persons', {})
            for i, bbox in enumerate(persons.get('bboxes', [])):
                x, y, w, h = bbox
                cv2.rectangle(display_frame, (x, y), (x + w, y + h), (0, 255, 0), 2)
                cv2.putText(display_frame, f"Person {i+1}",
                           (x, y - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)
            
            # Draw status info
            y_offset = 20
            status_lines = [
                f"FPS: {results.get('fps', 0):.1f}",
                f"Face: {'YES' if results.get('face', {}).get('detected') else 'NO'}",
                f"Gaze: {results.get('gaze', {}).get('direction', 'N/A').upper()}",
                f"Screen: {'YES' if results.get('gaze', {}).get('looking_at_screen') else 'NO'}"
            ]
            
            for line in status_lines:
                cv2.putText(display_frame, line, (10, y_offset),
                           cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
                y_offset += 25
            
            # Draw violations
            violations = results.get('violations', {})
            active_violations = [k for k, v in violations.items() if v]
            if active_violations:
                y_offset += 10
                cv2.putText(display_frame, "VIOLATIONS:", (10, y_offset),
                           cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2)
                y_offset += 25
                for violation in active_violations:
                    cv2.putText(display_frame, f"  - {violation}", (10, y_offset),
                               cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 255), 2)
                    y_offset += 20
            
            cv2.imshow("Camera Processor", display_frame)
            
        except Exception as e:
            logger.warning(f"Error displaying frame: {e}")
    
    def cleanup(self):
        """Release all resources."""
        logger.info("Cleaning up resources...")
        
        # Close display window
        if self.enable_display:
            cv2.destroyAllWindows()
        
        # Release camera
        if self.camera is not None:
            self.camera.release()
            self.camera = None
        
        # Send shutdown status
        self._output_status({
            'type': 'shutdown',
            'timestamp': self._get_timestamp(),
            'message': 'Camera processor shut down',
            'total_frames': self.frame_count
        })
        
        logger.info("Cleanup complete")
    
    def __enter__(self):
        """Context manager entry."""
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit."""
        self.cleanup()


def main():
    """Main entry point for command-line usage."""
    parser = argparse.ArgumentParser(
        description='LabGuard Camera Monitoring Processor'
    )
    parser.add_argument(
        '--camera', '-c',
        type=int,
        default=config.CAMERA_INDEX,
        help=f'Camera index (default: {config.CAMERA_INDEX})'
    )
    parser.add_argument(
        '--display', '-d',
        action='store_true',
        help='Enable display window'
    )
    parser.add_argument(
        '--transmit-frames', '-t',
        action='store_true',
        help='Transmit frames as base64 in JSON output'
    )
    parser.add_argument(
        '--debug',
        action='store_true',
        help='Enable debug logging'
    )
    parser.add_argument(
        '--student-name', '-s',
        type=str,
        default='unknown',
        help='Student name for snapshot file naming'
    )
    parser.add_argument(
        '--snapshot-violations',
        type=str,
        default=None,
        help='Comma-separated list of violations that trigger snapshots (e.g., "phone_violation,multiple_persons")'
    )
    
    args = parser.parse_args()
    
    # Set debug logging if requested
    if args.debug:
        logging.getLogger().setLevel(logging.DEBUG)
        logger.setLevel(logging.DEBUG)
    
    # Parse snapshot violations
    snapshot_violations = None
    if args.snapshot_violations:
        snapshot_violations = [v.strip() for v in args.snapshot_violations.split(',')]
    
    # Create and run processor
    with CameraProcessor(
        camera_index=args.camera,
        enable_display=args.display,
        enable_frame_transmission=args.transmit_frames,
        student_name=args.student_name,
        snapshot_violations=snapshot_violations
    ) as processor:
        
        if processor.initialize():
            processor.run()
        else:
            logger.error("Failed to initialize camera processor")
            sys.exit(1)


if __name__ == "__main__":
    main()

