"""
Face Analyzer using MediaPipe Face Mesh

This module provides face analysis capabilities for:
- Face detection
- 468 facial landmark extraction
- Head pose estimation (yaw, pitch, roll)
- Iris position extraction for gaze estimation

Uses MediaPipe Face Mesh for comprehensive face analysis.
"""

import cv2
import numpy as np
from typing import Dict, List, Tuple, Optional
import logging

try:
    import mediapipe as mp
except ImportError:
    mp = None
    logging.warning("MediaPipe not available. Install with: pip install mediapipe")

from .. import config

# MediaPipe Face Mesh landmark indices
# Key facial landmarks for head pose estimation
LANDMARK_NOSE_TIP = 4
LANDMARK_LEFT_EYE_OUTER = 33
LANDMARK_LEFT_EYE_INNER = 133
LANDMARK_RIGHT_EYE_OUTER = 263
LANDMARK_RIGHT_EYE_INNER = 362
LANDMARK_LEFT_MOUTH = 61
LANDMARK_RIGHT_MOUTH = 291
LANDMARK_CHIN = 152  # MediaPipe chin tip

# Iris landmarks (MediaPipe provides 5 landmarks per iris)
# Left iris: 468, 469, 470, 471, 472
# Right iris: 473, 474, 475, 476, 477
LEFT_IRIS_INDICES = [468, 469, 470, 471, 472]
RIGHT_IRIS_INDICES = [473, 474, 475, 476, 477]

# 3D face model points (in arbitrary units, canonical face model)
# These are used for head pose estimation via solvePnP
# Coordinate system: X-right, Y-down, Z-forward (away from camera)
# The model is centered at the nose tip
FACE_3D_MODEL = np.array([
    (0.0, 0.0, 0.0),           # Nose tip (landmark 4) - origin
    (43.3, -32.7, -26.0),      # Right eye outer corner (landmark 263) - right side of face
    (-43.3, -32.7, -26.0),     # Left eye outer corner (landmark 33) - left side of face  
    (0.0, 71.7, -15.0),        # Chin tip (landmark 152) - below nose
    (-28.9, 28.9, -24.1),      # Left mouth corner (landmark 61)
    (28.9, 28.9, -24.1),       # Right mouth corner (landmark 291)
], dtype=np.float64)

# Logger
logger = logging.getLogger(__name__)


class FaceAnalyzer:
    """
    Face analyzer using MediaPipe Face Mesh for face detection and landmark extraction.
    
    Attributes:
        face_mesh: MediaPipe Face Mesh instance
        initialized: Whether MediaPipe is successfully initialized
        image_width: Current image width (for coordinate conversion)
        image_height: Current image height (for coordinate conversion)
    """
    
    def __init__(self):
        """
        Initialize the FaceAnalyzer.
        """
        self.face_mesh = None
        self.initialized = False
        self.image_width = 0
        self.image_height = 0
        
        logger.info("FaceAnalyzer initialized")
    
    def initialize(self) -> bool:
        """
        Initialize MediaPipe Face Mesh.
        
        Returns:
            bool: True if MediaPipe initialized successfully, False otherwise
        """
        if mp is None:
            logger.error("MediaPipe not available. Cannot initialize Face Mesh.")
            return False
        
        try:
            # Initialize MediaPipe Face Mesh
            # static_image_mode=False: optimized for video
            # max_num_faces=1: we only need to track one face
            # min_detection_confidence=0.5: detection threshold
            # min_tracking_confidence=0.5: tracking threshold
            # refine_landmarks=True: get iris landmarks (468->478 total landmarks)
            mp_face_mesh = mp.solutions.face_mesh
            self.face_mesh = mp_face_mesh.FaceMesh(
                static_image_mode=False,
                max_num_faces=1,
                refine_landmarks=True,  # Enables iris landmarks
                min_detection_confidence=0.5,
                min_tracking_confidence=0.5
            )
            
            # Verify initialization
            if self.face_mesh is None:
                logger.error("MediaPipe Face Mesh object is None after initialization")
                return False
            
            self.initialized = True
            logger.info("MediaPipe Face Mesh initialized successfully")
            return True
            
        except Exception as e:
            logger.error(f"Error initializing MediaPipe Face Mesh: {e}")
            self.face_mesh = None
            self.initialized = False
            return False
    
    def detect_face(self, frame: np.ndarray) -> Dict:
        """
        Detect face and extract landmarks from a frame.
        
        Args:
            frame: Input frame as numpy array (BGR format from OpenCV)
        
        Returns:
            dict: Face detection results with the following structure:
                {
                    'face_detected': bool,
                    'landmarks': np.ndarray or None,  # 468x3 array (x, y, z normalized)
                    'landmarks_2d': np.ndarray or None,  # 468x2 array (x, y in pixels)
                    'head_pose': {
                        'yaw': float,
                        'pitch': float,
                        'roll': float
                    } or None,
                    'iris_positions': {
                        'left': np.ndarray or None,  # 5x3 array
                        'right': np.ndarray or None   # 5x3 array
                    },
                    'raw_results': mediapipe results or None
                }
        """
        if not self.initialized or self.face_mesh is None:
            logger.warning("Face Mesh not initialized. Cannot perform detection.")
            return self._empty_results()
        
        try:
            # Store image dimensions for coordinate conversion
            self.image_height, self.image_width = frame.shape[:2]
            
            # Convert BGR to RGB (MediaPipe expects RGB)
            frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            
            # Process frame with MediaPipe
            results = self.face_mesh.process(frame_rgb)
            
            # Check if face was detected
            if not results.multi_face_landmarks or len(results.multi_face_landmarks) == 0:
                return {
                    'face_detected': False,
                    'landmarks': None,
                    'landmarks_2d': None,
                    'head_pose': None,
                    'iris_positions': {'left': None, 'right': None},
                    'raw_results': results
                }
            
            # Get the first (and only) face
            face_landmarks = results.multi_face_landmarks[0]
            
            # Extract all 468 landmarks (or 478 if iris refinement enabled)
            # MediaPipe returns normalized coordinates (0-1)
            landmarks = []
            landmarks_2d = []
            
            for landmark in face_landmarks.landmark:
                # Normalized coordinates (x, y, z)
                landmarks.append([landmark.x, landmark.y, landmark.z])
                # Pixel coordinates (x, y)
                # Clamp to frame bounds to avoid out-of-frame values breaking solvePnP
                x_px = np.clip(landmark.x * self.image_width, 0.0, float(self.image_width))
                y_px = np.clip(landmark.y * self.image_height, 0.0, float(self.image_height))
                landmarks_2d.append([
                    x_px,
                    y_px
                ])
            
            landmarks = np.array(landmarks, dtype=np.float32)
            landmarks_2d = np.array(landmarks_2d, dtype=np.float32)
            
            # Calculate head pose
            head_pose = self.calculate_head_pose(landmarks, landmarks_2d)
            
            # Get iris positions
            iris_positions = self.get_iris_positions(landmarks, landmarks_2d)
            
            return {
                'face_detected': True,
                'landmarks': landmarks,
                'landmarks_2d': landmarks_2d,
                'head_pose': head_pose,
                'iris_positions': iris_positions,
                'raw_results': results
            }
            
        except Exception as e:
            logger.error(f"Error during face detection: {e}")
            return self._empty_results()
    
    def calculate_head_pose(self, landmarks: np.ndarray, landmarks_2d: np.ndarray) -> Optional[Dict]:
        """
        Calculate head pose (yaw, pitch, roll) from facial landmarks.
        
        Uses solvePnP with a 3D face model and 2D landmark positions.
        
        Args:
            landmarks: 3D landmarks (normalized, 468x3 array)
            landmarks_2d: 2D landmarks in pixel coordinates (468x2 array)
        
        Returns:
            dict: Head pose angles in degrees:
                {
                    'yaw': float,    # Left-right rotation (negative = left, positive = right)
                    'pitch': float,  # Up-down rotation (negative = down, positive = up)
                    'roll': float    # Tilt rotation (negative = left tilt, positive = right tilt)
                }
            or None if calculation fails
        """
        try:
            # Select key landmarks for head pose estimation
            # Use the standard 6-point model for solvePnP
            # Order must match FACE_3D_MODEL exactly
            key_landmark_indices = [
                LANDMARK_NOSE_TIP,        # 4 - nose tip
                LANDMARK_RIGHT_EYE_OUTER, # 263 - right eye outer
                LANDMARK_LEFT_EYE_OUTER,  # 33 - left eye outer
                LANDMARK_CHIN,            # 152 - chin
                LANDMARK_LEFT_MOUTH,      # 61 - left mouth
                LANDMARK_RIGHT_MOUTH      # 291 - right mouth
            ]
            
            # Extract 2D image points (in pixels)
            image_points = np.array([
                landmarks_2d[idx] for idx in key_landmark_indices
            ], dtype=np.float64)
            
            # 3D model points (in mm, same order as image_points)
            model_points = FACE_3D_MODEL.copy()
            
            # Camera matrix (approximate, assuming no distortion)
            # Focal length approximation: assume typical webcam FOV of ~60 degrees
            # f = (width/2) / tan(FOV/2) ≈ width for 60° FOV
            # Using the same focal length for X and Y (square pixels assumption)
            focal_length = float(self.image_width)
            if focal_length <= 0:
                focal_length = max(float(self.image_width + self.image_height) / 2.0, 1.0)
            center_x = float(self.image_width) / 2.0
            center_y = float(self.image_height) / 2.0
            
            camera_matrix = np.array([
                [focal_length, 0.0, center_x],
                [0.0, focal_length, center_y],
                [0.0, 0.0, 1.0]
            ], dtype=np.float64)
            
            # Distortion coefficients (assume no distortion for simplicity)
            dist_coeffs = np.zeros((4, 1), dtype=np.float64)
            
            # Solve PnP to get rotation and translation vectors
            success, rotation_vector, translation_vector = cv2.solvePnP(
                model_points,
                image_points,
                camera_matrix,
                dist_coeffs,
                flags=cv2.SOLVEPNP_ITERATIVE
            )
            
            if not success:
                logger.warning("solvePnP failed to estimate head pose")
                return None
            
            # Convert rotation vector to rotation matrix
            rotation_matrix, _ = cv2.Rodrigues(rotation_vector)
            
            # Extract Euler angles using projection method
            # This gives intuitive angles:
            # - Yaw: looking left/right (positive = right from camera's POV)
            # - Pitch: looking up/down (positive = up)
            # - Roll: head tilt (positive = tilting right ear toward shoulder)
            
            # Project 3D points to get head orientation
            # Nose direction for yaw/pitch, up direction for roll
            axis_points_3d = np.array([
                [0.0, 0.0, 100.0],   # Point along nose (forward)
                [0.0, -100.0, 0.0],  # Point above head (up in face coords)
            ], dtype=np.float64)
            
            axis_points_2d, _ = cv2.projectPoints(
                axis_points_3d, rotation_vector, translation_vector,
                camera_matrix, dist_coeffs
            )
            
            # Get nose tip position in 2D (reference point)
            nose_tip_2d = image_points[0]
            nose_end_2d = axis_points_2d[0][0]
            head_top_2d = axis_points_2d[1][0]
            
            # Yaw: horizontal deviation of nose direction
            dx_nose = nose_end_2d[0] - nose_tip_2d[0]
            dy_nose = nose_end_2d[1] - nose_tip_2d[1]
            
            # Calculate the forward projection length (depth indicator)
            # This helps normalize the yaw calculation
            nose_proj_len = np.sqrt(dx_nose**2 + dy_nose**2)
            if nose_proj_len < 1e-6:
                nose_proj_len = 1.0
            
            # Yaw: horizontal angle (positive = looking right)
            yaw_deg = np.degrees(np.arctan2(dx_nose, 100.0))
            
            # Pitch: vertical angle (positive = looking up)
            # Note: in image coords, Y increases downward
            pitch_deg = np.degrees(np.arctan2(-dy_nose, 100.0))
            
            # Roll: angle of the head's up-vector relative to image vertical
            dx_up = head_top_2d[0] - nose_tip_2d[0]
            dy_up = head_top_2d[1] - nose_tip_2d[1]
            
            # Roll is the angle between head's up direction and image vertical
            # When head is upright, up-vector points upward (negative Y in image)
            # atan2(dx, -dy) gives angle from vertical, positive = clockwise tilt
            roll_deg = np.degrees(np.arctan2(dx_up, -dy_up))
            
            return {
                'yaw': float(yaw_deg),
                'pitch': float(pitch_deg),
                'roll': float(roll_deg)
            }
            
        except Exception as e:
            logger.error(f"Error calculating head pose: {e}")
            return None
    
    def get_iris_positions(self, landmarks: np.ndarray, landmarks_2d: np.ndarray) -> Dict:
        """
        Extract iris positions from landmarks.
        
        MediaPipe Face Mesh with refine_landmarks=True provides 5 landmarks per iris:
        - Left iris: landmarks 468-472
        - Right iris: landmarks 473-477
        
        Args:
            landmarks: 3D landmarks (normalized, 478x3 array with iris refinement)
            landmarks_2d: 2D landmarks in pixel coordinates (478x2 array)
        
        Returns:
            dict: Iris positions:
                {
                    'left': np.ndarray or None,  # 5x3 array (x, y, z normalized)
                    'right': np.ndarray or None, # 5x3 array (x, y, z normalized)
                    'left_2d': np.ndarray or None,  # 5x2 array (x, y in pixels)
                    'right_2d': np.ndarray or None  # 5x2 array (x, y in pixels)
                }
        """
        try:
            # Check if we have enough landmarks (should be 478 with iris refinement)
            if landmarks.shape[0] < 478:
                logger.warning(f"Insufficient landmarks for iris extraction: {landmarks.shape[0]} < 478")
                return {
                    'left': None,
                    'right': None,
                    'left_2d': None,
                    'right_2d': None
                }
            
            # Extract left iris landmarks (468-472)
            left_iris_3d = landmarks[LEFT_IRIS_INDICES].copy()
            left_iris_2d = landmarks_2d[LEFT_IRIS_INDICES].copy()
            
            # Extract right iris landmarks (473-477)
            right_iris_3d = landmarks[RIGHT_IRIS_INDICES].copy()
            right_iris_2d = landmarks_2d[RIGHT_IRIS_INDICES].copy()
            
            return {
                'left': left_iris_3d,
                'right': right_iris_3d,
                'left_2d': left_iris_2d,
                'right_2d': right_iris_2d
            }
            
        except Exception as e:
            logger.error(f"Error extracting iris positions: {e}")
            return {
                'left': None,
                'right': None,
                'left_2d': None,
                'right_2d': None
            }
    
    def _empty_results(self) -> Dict:
        """
        Return empty face detection results.
        
        Returns:
            dict: Empty results structure
        """
        return {
            'face_detected': False,
            'landmarks': None,
            'landmarks_2d': None,
            'head_pose': None,
            'iris_positions': {
                'left': None,
                'right': None,
                'left_2d': None,
                'right_2d': None
            },
            'raw_results': None
        }
    
    def is_initialized(self) -> bool:
        """
        Check if Face Analyzer is initialized and ready.
        
        Returns:
            bool: True if initialized, False otherwise
        """
        return self.initialized and self.face_mesh is not None
    
    def get_model_info(self) -> Dict:
        """
        Get information about the Face Analyzer.
        
        Returns:
            dict: Model information
        """
        if not self.initialized:
            return {
                'initialized': False,
                'model': 'MediaPipe Face Mesh',
                'error': 'Not initialized'
            }
        
        return {
            'initialized': True,
            'model': 'MediaPipe Face Mesh',
            'landmarks_count': 478,  # 468 face + 10 iris (5 per eye)
            'refine_landmarks': True,
            'max_faces': 1
        }


# Convenience function for quick initialization
def create_face_analyzer(auto_initialize: bool = True) -> FaceAnalyzer:
    """
    Create and optionally initialize a FaceAnalyzer instance.
    
    Args:
        auto_initialize: If True, automatically initialize MediaPipe
    
    Returns:
        FaceAnalyzer: Initialized analyzer instance
    """
    analyzer = FaceAnalyzer()
    if auto_initialize:
        analyzer.initialize()
    return analyzer

