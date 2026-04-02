"""
Gaze Estimator for Camera Monitoring

This module provides gaze estimation and blink detection capabilities:
- Gaze direction estimation (left/center/right) from iris positions
- Horizontal gaze angle calculation
- Eye Aspect Ratio (EAR) calculation for blink detection
- Blink detection based on EAR threshold
- Screen-facing status based on head pose

Uses iris positions from FaceAnalyzer and head pose data.
"""

import numpy as np
from typing import Dict, Optional, Tuple
import logging

from .. import config

# MediaPipe Face Mesh eye landmark indices for EAR calculation
# Standard 6-point EAR uses: outer corner, inner corner, top, bottom
# Left eye landmarks
LEFT_EYE_OUTER = 33
LEFT_EYE_INNER = 133
LEFT_EYE_TOP = 159
LEFT_EYE_BOTTOM = 145
LEFT_EYE_TOP_INNER = 158
LEFT_EYE_BOTTOM_INNER = 153

# Right eye landmarks
RIGHT_EYE_OUTER = 263
RIGHT_EYE_INNER = 362
RIGHT_EYE_TOP = 386
RIGHT_EYE_BOTTOM = 374
RIGHT_EYE_TOP_INNER = 385
RIGHT_EYE_BOTTOM_INNER = 380

# Logger
logger = logging.getLogger(__name__)


class GazeEstimator:
    """
    Gaze estimator for calculating gaze direction and blink detection.
    
    Attributes:
        ear_threshold: Eye Aspect Ratio threshold for blink detection
        blink_min_frames: Minimum frames for valid blink
        blink_max_frames: Maximum frames for valid blink
        gaze_left_threshold: Left gaze threshold in degrees
        gaze_right_threshold: Right gaze threshold in degrees
        gaze_center_threshold: Center gaze tolerance in degrees
        gaze_history: History of recent gaze angles for smoothing
        smoothing_window: Number of frames to average for smoothing
    """
    
    def __init__(self, smoothing_window: Optional[int] = None):
        """
        Initialize the GazeEstimator.
        
        Args:
            smoothing_window: Number of recent frames to average for gaze smoothing (default: 5)
        """
        # Load thresholds from config
        self.ear_threshold = config.BLINK_EAR_THRESHOLD
        self.blink_min_frames = config.BLINK_MIN_FRAMES
        self.blink_max_frames = config.BLINK_MAX_FRAMES
        self.gaze_left_threshold = config.GAZE_LEFT_THRESHOLD
        self.gaze_right_threshold = config.GAZE_RIGHT_THRESHOLD
        self.gaze_center_threshold = config.GAZE_CENTER_THRESHOLD
        self.gaze_scaling = config.GAZE_SCALING_FACTOR
        self.head_yaw_comp_factor = config.GAZE_HEAD_YAW_COMP_FACTOR
        self.min_eye_width_px = config.GAZE_MIN_EYE_WIDTH_PX
        self.min_quality = config.GAZE_MIN_QUALITY
        
        # Smoothing for gaze angles to reduce fluctuation (EMA)
        self.smoothing_window = smoothing_window or config.GAZE_SMOOTHING_WINDOW
        self.alpha = 2.0 / (self.smoothing_window + 1.0)
        self.ema_angle = None
        self.quality_history = []
        
        logger.info(f"GazeEstimator initialized with smoothing_window={self.smoothing_window}")
    
    def estimate_gaze(
        self,
        iris_positions: Dict,
        head_pose: Optional[Dict],
        landmarks_2d: Optional[np.ndarray] = None
    ) -> Dict:
        """
        Estimate gaze direction from iris positions and head pose.
        
        Args:
            iris_positions: Dictionary with 'left', 'right', 'left_2d', 'right_2d' iris landmarks
            head_pose: Dictionary with 'yaw', 'pitch', 'roll' angles in degrees, or None
            landmarks_2d: Optional 2D landmarks array (468x2) for eye corner reference
        
        Returns:
            dict: Gaze estimation results:
                {
                    'horizontal_angle': float,  # Horizontal gaze angle in degrees
                    'vertical_angle': float,    # Vertical gaze angle in degrees
                    'direction': str,           # 'left', 'center', or 'right'
                    'gaze_detected': bool,      # True if gaze could be calculated
                    'iris_center_left': np.ndarray or None,  # Left iris center (2D)
                    'iris_center_right': np.ndarray or None,  # Right iris center (2D)
                    'raw_offset_h': float,      # Raw horizontal offset (debug)
                    'raw_offset_v': float,      # Raw vertical offset (debug)
                }
        """
        try:
            # Check if iris positions are available
            if (iris_positions is None or 
                iris_positions.get('left_2d') is None or 
                iris_positions.get('right_2d') is None):
                return self._empty_gaze_result()
            
            left_iris_2d = iris_positions['left_2d']
            right_iris_2d = iris_positions['right_2d']
            
            # Calculate iris centers (average of all iris landmarks)
            left_iris_center = np.mean(left_iris_2d, axis=0)
            right_iris_center = np.mean(right_iris_2d, axis=0)
            
            horizontal_angle = 0.0
            vertical_angle = 0.0
            raw_offset_h = 0.0
            raw_offset_v = 0.0
            quality_score = 0.0
            
            # Need landmarks for accurate gaze estimation
            if landmarks_2d is not None and len(landmarks_2d) >= 478:
                # Get eye corner positions for both eyes
                left_eye_outer = landmarks_2d[LEFT_EYE_OUTER]
                left_eye_inner = landmarks_2d[LEFT_EYE_INNER]
                right_eye_outer = landmarks_2d[RIGHT_EYE_OUTER]
                right_eye_inner = landmarks_2d[RIGHT_EYE_INNER]
                
                # Get vertical landmarks for each eye
                left_eye_top = landmarks_2d[LEFT_EYE_TOP]
                left_eye_bottom = landmarks_2d[LEFT_EYE_BOTTOM]
                right_eye_top = landmarks_2d[RIGHT_EYE_TOP]
                right_eye_bottom = landmarks_2d[RIGHT_EYE_BOTTOM]
                
                # Calculate eye dimensions
                left_eye_width = np.linalg.norm(left_eye_outer - left_eye_inner)
                right_eye_width = np.linalg.norm(right_eye_outer - right_eye_inner)
                left_eye_height = np.linalg.norm(left_eye_top - left_eye_bottom)
                right_eye_height = np.linalg.norm(right_eye_top - right_eye_bottom)
                
                # Quality gate: ensure eyes are large enough in frame
                if left_eye_width < self.min_eye_width_px or right_eye_width < self.min_eye_width_px:
                    logger.debug(f"Eyes too small: L={left_eye_width:.1f}, R={right_eye_width:.1f}")
                    return self._empty_gaze_result()
                
                # Calculate eye centers (using corner midpoints)
                left_eye_center = (left_eye_outer + left_eye_inner) / 2.0
                right_eye_center = (right_eye_outer + right_eye_inner) / 2.0
                
                # Calculate vertical centers
                left_eye_vcenter = (left_eye_top + left_eye_bottom) / 2.0
                right_eye_vcenter = (right_eye_top + right_eye_bottom) / 2.0
                
                # ---- Horizontal gaze calculation ----
                # Calculate normalized iris offset from eye center
                # Positive = iris to the right of center (looking right from subject's POV)
                left_h_offset = (left_iris_center[0] - left_eye_center[0]) / left_eye_width
                right_h_offset = (right_iris_center[0] - right_eye_center[0]) / right_eye_width
                
                # Average horizontal offset (both eyes should agree)
                avg_h_offset = (left_h_offset + right_h_offset) / 2.0
                raw_offset_h = avg_h_offset
                
                # ---- Vertical gaze calculation ----
                # Calculate vertical offset (positive = looking up)
                # Note: In image coordinates, Y increases downward
                left_v_offset = (left_eye_vcenter[1] - left_iris_center[1]) / max(left_eye_height, 1.0)
                right_v_offset = (right_eye_vcenter[1] - right_iris_center[1]) / max(right_eye_height, 1.0)
                
                avg_v_offset = (left_v_offset + right_v_offset) / 2.0
                raw_offset_v = avg_v_offset
                
                # ---- Quality scoring ----
                # High quality = both eyes agree on direction
                h_diff = abs(left_h_offset - right_h_offset)
                v_diff = abs(left_v_offset - right_v_offset)
                # Quality decreases with disagreement; max disagreement = 0.5 offset units
                quality_score = max(0.0, 1.0 - (h_diff + v_diff))
                
                # ---- Convert to angles ----
                # Iris typically moves ~0.3-0.4 of eye width for extreme gaze
                # Map normalized offset to degrees: 0.3 offset ≈ 30 degrees
                horizontal_angle = avg_h_offset * self.gaze_scaling
                vertical_angle = avg_v_offset * self.gaze_scaling * 0.7  # Vertical has less range
                
                # ---- Head pose compensation ----
                # If head turns, the apparent gaze direction changes
                # Compensate by adding head yaw to get world-space gaze
                if head_pose is not None:
                    head_yaw = head_pose.get('yaw', 0.0)
                    head_pitch = head_pose.get('pitch', 0.0)
                    # Add head orientation to get combined gaze direction
                    horizontal_angle = horizontal_angle + head_yaw * self.head_yaw_comp_factor
                    vertical_angle = vertical_angle + head_pitch * self.head_yaw_comp_factor
                    
            else:
                # Fallback: use simple heuristic
                horizontal_angle = self._calculate_simple_gaze_angle(
                    left_iris_center, right_iris_center, landmarks_2d
                )
                quality_score = 0.4  # Lower confidence for fallback
            
            # Track quality history
            self._push_quality(quality_score)
            
            # Quality check - but don't reject too aggressively
            # Only reject if quality is consistently poor
            if quality_score < 0.2 and self._avg_quality() < self.min_quality:
                return self._empty_gaze_result()
            
            # Apply smoothing to reduce frame-to-frame jitter
            horizontal_angle = self._smooth_gaze_angle(horizontal_angle)
            
            # Classify gaze direction using config helper function
            direction = config.get_gaze_direction(horizontal_angle)
            
            return {
                'horizontal_angle': float(horizontal_angle),
                'vertical_angle': float(vertical_angle),
                'direction': direction,
                'gaze_detected': True,
                'iris_center_left': left_iris_center,
                'iris_center_right': right_iris_center,
                'quality_score': float(quality_score),
                'avg_quality': float(self._avg_quality()),
                'raw_offset_h': float(raw_offset_h),
                'raw_offset_v': float(raw_offset_v)
            }
            
        except Exception as e:
            logger.error(f"Error estimating gaze: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return self._empty_gaze_result()
    
    def _calculate_simple_gaze_angle(
        self,
        left_iris_center: np.ndarray,
        right_iris_center: np.ndarray,
        landmarks_2d: Optional[np.ndarray]
    ) -> float:
        """
        Calculate gaze angle using simple heuristic when eye corners unavailable.
        
        Args:
            left_iris_center: Left iris center coordinates
            right_iris_center: Right iris center coordinates
            landmarks_2d: Optional landmarks for reference
        
        Returns:
            float: Horizontal gaze angle in degrees
        """
        # Calculate midpoint between irises
        iris_midpoint = (left_iris_center + right_iris_center) / 2.0
        
        # If we have landmarks, compare to face center (nose tip)
        if landmarks_2d is not None and len(landmarks_2d) > 4:
            nose_tip = landmarks_2d[4]  # Nose tip landmark
            # Calculate horizontal offset
            offset = (iris_midpoint[0] - nose_tip[0])
            # Normalize by approximate face width derived from inter-ocular distance when available
            if len(landmarks_2d) > 263:
                left_eye_outer = landmarks_2d[LEFT_EYE_OUTER]
                right_eye_outer = landmarks_2d[RIGHT_EYE_OUTER]
                face_width = np.linalg.norm(left_eye_outer - right_eye_outer)
                face_width = max(face_width, 1.0)
            else:
                # Fallback to iris distance as a proxy
                face_width = np.linalg.norm(left_iris_center - right_iris_center)
                face_width = max(face_width, 1.0)
            normalized_offset = offset / face_width
            # Convert to angle using configured scaling
            angle = normalized_offset * self.gaze_scaling
            return angle
        
        # Last resort: assume center
        return 0.0
    
    def _smooth_gaze_angle(self, angle: float) -> float:
        """
        Smooth gaze angle using moving average to reduce fluctuation.
        
        Args:
            angle: Current gaze angle in degrees
        
        Returns:
            float: Smoothed gaze angle
        """
        # Exponential moving average for faster response with stability
        if self.ema_angle is None:
            self.ema_angle = angle
        else:
            self.ema_angle = self.alpha * angle + (1.0 - self.alpha) * self.ema_angle
        return self.ema_angle

    def _push_quality(self, quality: float):
        """Track recent quality scores for robustness."""
        self.quality_history.append(quality)
        if len(self.quality_history) > 10:
            self.quality_history.pop(0)

    def _avg_quality(self) -> float:
        if not self.quality_history:
            return 0.0
        return float(np.mean(self.quality_history))

    def _empty_gaze_result(self) -> Dict:
        return {
            'horizontal_angle': 0.0,
            'vertical_angle': 0.0,
            'direction': 'unknown',
            'gaze_detected': False,
            'iris_center_left': None,
            'iris_center_right': None,
            'quality_score': 0.0,
            'avg_quality': self._avg_quality(),
            'raw_offset_h': 0.0,
            'raw_offset_v': 0.0
        }
    
    def calculate_ear(self, landmarks_2d: np.ndarray, eye: str = 'both') -> Dict:
        """
        Calculate Eye Aspect Ratio (EAR) for blink detection.
        
        EAR = (vertical_distance_1 + vertical_distance_2) / (2 * horizontal_distance)
        Lower EAR = eye is more closed
        
        Args:
            landmarks_2d: 2D landmarks array (468x2 or 478x2)
            eye: 'left', 'right', or 'both'
        
        Returns:
            dict: EAR values:
                {
                    'left_ear': float or None,
                    'right_ear': float or None,
                    'avg_ear': float or None  # Average of both eyes
                }
        """
        try:
            if landmarks_2d is None or len(landmarks_2d) < 387:
                return {
                    'left_ear': None,
                    'right_ear': None,
                    'avg_ear': None
                }
            
            left_ear = None
            right_ear = None
            
            if eye in ('left', 'both'):
                # Calculate left eye EAR
                left_ear = self._calculate_eye_ear(
                    landmarks_2d,
                    LEFT_EYE_OUTER,
                    LEFT_EYE_INNER,
                    LEFT_EYE_TOP,
                    LEFT_EYE_BOTTOM,
                    LEFT_EYE_TOP_INNER,
                    LEFT_EYE_BOTTOM_INNER
                )
            
            if eye in ('right', 'both'):
                # Calculate right eye EAR
                right_ear = self._calculate_eye_ear(
                    landmarks_2d,
                    RIGHT_EYE_OUTER,
                    RIGHT_EYE_INNER,
                    RIGHT_EYE_TOP,
                    RIGHT_EYE_BOTTOM,
                    RIGHT_EYE_TOP_INNER,
                    RIGHT_EYE_BOTTOM_INNER
                )
            
            # Calculate average
            avg_ear = None
            if left_ear is not None and right_ear is not None:
                avg_ear = (left_ear + right_ear) / 2.0
            elif left_ear is not None:
                avg_ear = left_ear
            elif right_ear is not None:
                avg_ear = right_ear
            
            return {
                'left_ear': left_ear,
                'right_ear': right_ear,
                'avg_ear': avg_ear
            }
            
        except Exception as e:
            logger.error(f"Error calculating EAR: {e}")
            return {
                'left_ear': None,
                'right_ear': None,
                'avg_ear': None
            }
    
    def _calculate_eye_ear(
        self,
        landmarks_2d: np.ndarray,
        outer_idx: int,
        inner_idx: int,
        top_idx: int,
        bottom_idx: int,
        top_inner_idx: int,
        bottom_inner_idx: int
    ) -> Optional[float]:
        """
        Calculate EAR for a single eye.
        
        Args:
            landmarks_2d: 2D landmarks array
            outer_idx: Outer corner landmark index
            inner_idx: Inner corner landmark index
            top_idx: Top landmark index
            bottom_idx: Bottom landmark index
            top_inner_idx: Top inner landmark index
            bottom_inner_idx: Bottom inner landmark index
        
        Returns:
            float: EAR value, or None if calculation fails
        """
        try:
            # Get landmark coordinates
            outer = landmarks_2d[outer_idx]
            inner = landmarks_2d[inner_idx]
            top = landmarks_2d[top_idx]
            bottom = landmarks_2d[bottom_idx]
            top_inner = landmarks_2d[top_inner_idx]
            bottom_inner = landmarks_2d[bottom_inner_idx]
            
            # Calculate vertical distances
            # Distance from top to bottom (outer side)
            vertical_1 = np.linalg.norm(top - bottom)
            # Distance from top_inner to bottom_inner
            vertical_2 = np.linalg.norm(top_inner - bottom_inner)
            
            # Calculate horizontal distance (eye width)
            horizontal = np.linalg.norm(outer - inner)
            
            # Avoid division by zero
            if horizontal == 0:
                return None
            
            # Calculate EAR
            ear = (vertical_1 + vertical_2) / (2.0 * horizontal)
            
            return float(ear)
            
        except (IndexError, KeyError) as e:
            logger.warning(f"Error calculating eye EAR: {e}")
            return None
    
    def detect_blink(self, ear_values: Dict) -> Dict:
        """
        Detect if a blink is occurring based on EAR values.
        
        Args:
            ear_values: Dictionary with 'left_ear', 'right_ear', and/or 'avg_ear'
        
        Returns:
            dict: Blink detection results:
                {
                    'is_blinking': bool,        # True if blink detected
                    'left_eye_closed': bool,    # True if left eye closed
                    'right_eye_closed': bool,   # True if right eye closed
                    'both_eyes_closed': bool    # True if both eyes closed
                }
        """
        try:
            left_ear = ear_values.get('left_ear')
            right_ear = ear_values.get('right_ear')
            avg_ear = ear_values.get('avg_ear')
            
            # Use average EAR if available, otherwise use individual eyes
            if avg_ear is not None:
                is_blinking = avg_ear < self.ear_threshold
                left_eye_closed = avg_ear < self.ear_threshold
                right_eye_closed = avg_ear < self.ear_threshold
            else:
                # Check individual eyes
                left_eye_closed = left_ear is not None and left_ear < self.ear_threshold
                right_eye_closed = right_ear is not None and right_ear < self.ear_threshold
                is_blinking = left_eye_closed or right_eye_closed
            
            both_eyes_closed = (
                (left_ear is not None and left_ear < self.ear_threshold) and
                (right_ear is not None and right_ear < self.ear_threshold)
            )
            
            return {
                'is_blinking': is_blinking,
                'left_eye_closed': left_eye_closed if left_ear is not None else False,
                'right_eye_closed': right_eye_closed if right_ear is not None else False,
                'both_eyes_closed': both_eyes_closed,
                'left_ear': left_ear,
                'right_ear': right_ear,
                'avg_ear': avg_ear
            }
            
        except Exception as e:
            logger.error(f"Error detecting blink: {e}")
            return {
                'is_blinking': False,
                'left_eye_closed': False,
                'right_eye_closed': False,
                'both_eyes_closed': False,
                'left_ear': None,
                'right_ear': None,
                'avg_ear': None
            }
    
    def is_facing_screen(self, head_pose: Optional[Dict]) -> bool:
        """
        Check if head pose indicates student is facing the screen.
        
        Uses config helper function to determine if head is within acceptable range.
        
        Args:
            head_pose: Dictionary with 'yaw', 'pitch', 'roll' angles in degrees, or None
        
        Returns:
            bool: True if facing screen, False otherwise
        """
        if head_pose is None:
            return False
        
        yaw = head_pose.get('yaw')
        pitch = head_pose.get('pitch')
        
        if yaw is None or pitch is None:
            return False
        
        # Use config helper function
        return config.is_facing_screen(yaw, pitch)
    
    def analyze(
        self,
        iris_positions: Dict,
        landmarks_2d: Optional[np.ndarray],
        head_pose: Optional[Dict]
    ) -> Dict:
        """
        Complete gaze analysis: estimate gaze, calculate EAR, detect blinks, check screen-facing.
        
        This is a convenience method that runs all gaze analysis in one call.
        
        Args:
            iris_positions: Dictionary with iris landmark positions
            landmarks_2d: 2D landmarks array (468x2 or 478x2)
            head_pose: Dictionary with head pose angles, or None
        
        Returns:
            dict: Complete gaze analysis results:
                {
                    'gaze': {
                        'horizontal_angle': float,
                        'direction': str,
                        'gaze_detected': bool
                    },
                    'blink': {
                        'is_blinking': bool,
                        'left_eye_closed': bool,
                        'right_eye_closed': bool,
                        'both_eyes_closed': bool,
                        'left_ear': float,
                        'right_ear': float,
                        'avg_ear': float
                    },
                    'facing_screen': bool
                }
        """
        # Estimate gaze
        gaze_result = self.estimate_gaze(iris_positions, head_pose, landmarks_2d)
        
        # Calculate EAR
        ear_values = self.calculate_ear(landmarks_2d, eye='both')
        
        # Detect blink
        blink_result = self.detect_blink(ear_values)
        
        # Check if facing screen
        facing_screen = self.is_facing_screen(head_pose)
        
        return {
            'gaze': gaze_result,
            'blink': blink_result,
            'facing_screen': facing_screen
        }


# Convenience function for quick initialization
def create_gaze_estimator(smoothing_window: Optional[int] = None) -> GazeEstimator:
    """
    Create a GazeEstimator instance.
    
    Args:
        smoothing_window: Number of frames to average for gaze smoothing (default: 5)
    
    Returns:
        GazeEstimator: Initialized estimator instance
    """
    return GazeEstimator(smoothing_window=smoothing_window)

