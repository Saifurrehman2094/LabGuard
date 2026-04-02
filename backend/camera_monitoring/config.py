"""
Configuration settings for Camera Monitoring Module

This module contains all configurable parameters for:
- Detection thresholds
- Gaze estimation
- Blink detection
- Head pose estimation
- Camera settings
- Performance tuning
- Model paths
"""

import os
from pathlib import Path

# ============================================================================
# DETECTION THRESHOLDS
# ============================================================================

# Phone detection confidence threshold (0.0 to 1.0)
# Lower = more sensitive (may have false positives)
# Higher = more strict (may miss some phones)
PHONE_CONFIDENCE_THRESHOLD = 0.5

# Person detection confidence threshold (0.0 to 1.0)
PERSON_CONFIDENCE_THRESHOLD = 0.6

# Phone violation timeout (seconds)
# Phone must be out of frame for this duration before violation clears
PHONE_VIOLATION_CLEAR_TIMEOUT = 2.0

# ============================================================================
# GAZE ESTIMATION
# ============================================================================

# Gaze direction thresholds (degrees)
# Horizontal angle from center of screen
GAZE_LEFT_THRESHOLD = -20.0   # degrees (negative = left)
GAZE_RIGHT_THRESHOLD = 20.0   # degrees (positive = right)
GAZE_CENTER_THRESHOLD = 12.0  # tolerance for "center"

# Gaze scaling and smoothing
# Iris moves ~0.3 of eye width for ~30 degrees gaze, so factor ≈ 100
GAZE_SCALING_FACTOR = 100.0        # converts normalized eye offset to degrees
GAZE_HEAD_YAW_COMP_FACTOR = 0.3    # how much head yaw contributes to combined gaze
GAZE_SMOOTHING_WINDOW = 3          # EMA equivalent window (larger = smoother, slower response)

# Minimum eye geometry quality (in pixels) to trust gaze
GAZE_MIN_EYE_WIDTH_PX = 12.0       # Lower threshold to work with smaller faces/farther distances
# Minimum quality score (0-1) to accept a gaze measurement
GAZE_MIN_QUALITY = 0.3             # More permissive - quality is tracked over time
# Gaze violation timeout (seconds)
# Student must look away for this duration before violation triggers
GAZE_VIOLATION_TIMEOUT = 3.0

# ============================================================================
# BLINK DETECTION
# ============================================================================

# Eye Aspect Ratio (EAR) threshold
# EAR < this value = eye is closed
BLINK_EAR_THRESHOLD = 0.25

# Blink detection frame counts
BLINK_MIN_FRAMES = 2   # Minimum frames for a valid blink
BLINK_MAX_FRAMES = 5   # Maximum frames (beyond this = eyes closed, not blink)

# Blink rate thresholds (blinks per minute)
BLINK_RATE_NORMAL_MIN = 15
BLINK_RATE_NORMAL_MAX = 20
BLINK_RATE_LOW_THRESHOLD = 10   # Below this = possible fatigue
BLINK_RATE_HIGH_THRESHOLD = 30  # Above this = possible stress

# ============================================================================
# HEAD POSE ESTIMATION
# ============================================================================

# Head pose ranges for "facing screen" (degrees)
# Yaw: left-right rotation (-90 to +90)
HEAD_FACING_SCREEN_YAW_MIN = -30.0
HEAD_FACING_SCREEN_YAW_MAX = 30.0

# Pitch: up-down rotation (-45 to +45)
# Expanded downward range to account for typing (camera on top, person looks down at screen)
HEAD_FACING_SCREEN_PITCH_MIN = -35.0  # Allow more downward looking (typing scenario)
HEAD_FACING_SCREEN_PITCH_MAX = 20.0

# Roll: tilt rotation (-30 to +30)
# Note: Roll is less critical for "facing screen" detection
HEAD_ROLL_TOLERANCE = 30.0

# Head pose accuracy targets (for validation)
HEAD_POSE_YAW_ACCURACY = 5.0    # ±5 degrees
HEAD_POSE_PITCH_ACCURACY = 3.0  # ±3 degrees
HEAD_POSE_ROLL_ACCURACY = 3.0   # ±3 degrees

# ============================================================================
# CAMERA SETTINGS
# ============================================================================

# Camera resolution
CAMERA_WIDTH = 640
CAMERA_HEIGHT = 480

# Target FPS (frames per second)
TARGET_FPS = 30

# Camera index (0 = default webcam)
CAMERA_INDEX = 0

# ============================================================================
# PERFORMANCE SETTINGS
# ============================================================================

# Frame skipping: Process every Nth frame (1 = all frames, 2 = every other frame)
# Higher values reduce CPU usage but may miss brief violations
FRAME_SKIP = 1

# Enable GPU acceleration (requires CUDA and compatible GPU)
ENABLE_GPU = False

# Maximum processing time per frame (milliseconds)
# If exceeded, skip to next frame
MAX_FRAME_PROCESSING_TIME_MS = 100

# ============================================================================
# MODEL PATHS
# ============================================================================

# Get the base directory (backend/camera_monitoring)
BASE_DIR = Path(__file__).parent

# YOLOv8n model path
YOLO_MODEL_PATH = str(BASE_DIR / "models" / "yolov8n.pt")

# MediaPipe model path (None = MediaPipe handles model loading automatically)
MEDIAPIPE_MODEL_PATH = None

# ============================================================================
# OUTPUT SETTINGS
# ============================================================================

# Enable frame transmission as base64 (slower, uses more bandwidth)
# Set to False for better performance
ENABLE_FRAME_TRANSMISSION = False

# Enable JSON output to stdout
JSON_OUTPUT_ENABLED = True

# Output format version (for compatibility checking)
OUTPUT_FORMAT_VERSION = "1.0"

# ============================================================================
# VIOLATION DETECTION SETTINGS
# ============================================================================

# Enable violation detection
ENABLE_PHONE_DETECTION = True
ENABLE_PERSON_COUNTING = True
ENABLE_HEAD_POSE_DETECTION = True
ENABLE_GAZE_DETECTION = True
ENABLE_BLINK_DETECTION = True

# Multiple person violation threshold
# Number of persons that triggers violation (default: 2+)
MULTIPLE_PERSON_THRESHOLD = 2

# ============================================================================
# VIOLATION SNAPSHOT SETTINGS
# ============================================================================

# Enable snapshot capture on violations
ENABLE_VIOLATION_SNAPSHOTS = True

# Snapshot directory path (relative to camera_monitoring folder)
SNAPSHOT_DIR = str(BASE_DIR / "violation_snapshots")

# Cooldown time between snapshots for the same violation type (seconds)
# Prevents flooding the folder with too many similar images
SNAPSHOT_COOLDOWN_SECONDS = 7

# Default violations that trigger snapshots (can be configured by admin)
# Options: 'phone_violation', 'multiple_persons', 'no_face_detected', 
#          'not_facing_screen', 'not_looking_at_screen'
DEFAULT_SNAPSHOT_VIOLATIONS = ['phone_violation', 'multiple_persons']

# JPEG quality for snapshots (1-100, higher = better quality, larger file)
SNAPSHOT_JPEG_QUALITY = 85

# Maximum snapshots per exam session (0 = unlimited)
MAX_SNAPSHOTS_PER_SESSION = 100

# ============================================================================
# LOGGING SETTINGS
# ============================================================================

# Enable detailed logging
ENABLE_DEBUG_LOGGING = False

# Log level: 'DEBUG', 'INFO', 'WARNING', 'ERROR'
LOG_LEVEL = 'INFO'

# ============================================================================
# UTILITY FUNCTIONS
# ============================================================================

def get_head_pose_range():
    """Get head pose range for 'facing screen' detection.
    
    Returns:
        dict: Dictionary with yaw and pitch ranges
    """
    return {
        'yaw': (HEAD_FACING_SCREEN_YAW_MIN, HEAD_FACING_SCREEN_YAW_MAX),
        'pitch': (HEAD_FACING_SCREEN_PITCH_MIN, HEAD_FACING_SCREEN_PITCH_MAX)
    }


def is_facing_screen(yaw, pitch):
    """Check if head pose indicates student is facing screen.
    
    Args:
        yaw (float): Head yaw angle in degrees
        pitch (float): Head pitch angle in degrees
    
    Returns:
        bool: True if facing screen, False otherwise
    """
    yaw_in_range = HEAD_FACING_SCREEN_YAW_MIN <= yaw <= HEAD_FACING_SCREEN_YAW_MAX
    pitch_in_range = HEAD_FACING_SCREEN_PITCH_MIN <= pitch <= HEAD_FACING_SCREEN_PITCH_MAX
    return yaw_in_range and pitch_in_range


def get_gaze_direction(horizontal_angle):
    """Get gaze direction classification from horizontal angle.
    
    Args:
        horizontal_angle (float): Horizontal gaze angle in degrees
    
    Returns:
        str: 'left', 'center', or 'right'
    
    Classification logic:
        - angle < GAZE_LEFT_THRESHOLD (-25°): 'left' (extreme left, definitely not looking at screen)
        - angle > GAZE_RIGHT_THRESHOLD (25°): 'right' (extreme right, definitely not looking at screen)
        - -GAZE_CENTER_THRESHOLD <= angle <= GAZE_CENTER_THRESHOLD (±12°): 'center' (looking at screen)
        - GAZE_LEFT_THRESHOLD <= angle < -GAZE_CENTER_THRESHOLD (-25° to -12°): 'left' (looking left, off-center)
        - GAZE_CENTER_THRESHOLD < angle <= GAZE_RIGHT_THRESHOLD (12° to 25°): 'right' (looking right, off-center)
    """
    # Extreme left: angle < GAZE_LEFT_THRESHOLD (-15°)
    if horizontal_angle < GAZE_LEFT_THRESHOLD:
        return 'left'
    
    # Extreme right: angle > GAZE_RIGHT_THRESHOLD (15°)
    if horizontal_angle > GAZE_RIGHT_THRESHOLD:
        return 'right'
    
    # Center: within GAZE_CENTER_THRESHOLD (±5°)
    # This uses GAZE_CENTER_THRESHOLD to properly classify center gaze
    if -GAZE_CENTER_THRESHOLD <= horizontal_angle <= GAZE_CENTER_THRESHOLD:
        return 'center'
    
    # Off-center left: between GAZE_LEFT_THRESHOLD and -GAZE_CENTER_THRESHOLD (-15° to -5°)
    if horizontal_angle < 0:
        return 'left'
    
    # Off-center right: between GAZE_CENTER_THRESHOLD and GAZE_RIGHT_THRESHOLD (5° to 15°)
    return 'right'


def is_valid_blink(closed_frames):
    """Check if closed eye frames constitute a valid blink.
    
    Args:
        closed_frames (int): Number of consecutive frames with closed eyes
    
    Returns:
        bool: True if valid blink, False otherwise
    """
    return BLINK_MIN_FRAMES <= closed_frames <= BLINK_MAX_FRAMES


def get_model_paths():
    """Get all model file paths.
    
    Returns:
        dict: Dictionary with model paths
    """
    return {
        'yolo': YOLO_MODEL_PATH,
        'mediapipe': MEDIAPIPE_MODEL_PATH
    }


def validate_config():
    """Validate configuration values.
    
    Returns:
        tuple: (is_valid, errors)
    """
    errors = []
    
    # Validate thresholds
    if not 0.0 <= PHONE_CONFIDENCE_THRESHOLD <= 1.0:
        errors.append("PHONE_CONFIDENCE_THRESHOLD must be between 0.0 and 1.0")
    
    if not 0.0 <= PERSON_CONFIDENCE_THRESHOLD <= 1.0:
        errors.append("PERSON_CONFIDENCE_THRESHOLD must be between 0.0 and 1.0")
    
    # Validate gaze thresholds
    if GAZE_LEFT_THRESHOLD >= GAZE_RIGHT_THRESHOLD:
        errors.append("GAZE_LEFT_THRESHOLD must be less than GAZE_RIGHT_THRESHOLD")
    
    # Validate head pose ranges
    if HEAD_FACING_SCREEN_YAW_MIN >= HEAD_FACING_SCREEN_YAW_MAX:
        errors.append("HEAD_FACING_SCREEN_YAW_MIN must be less than HEAD_FACING_SCREEN_YAW_MAX")
    
    if HEAD_FACING_SCREEN_PITCH_MIN >= HEAD_FACING_SCREEN_PITCH_MAX:
        errors.append("HEAD_FACING_SCREEN_PITCH_MIN must be less than HEAD_FACING_SCREEN_PITCH_MAX")
    
    # Validate camera settings
    if CAMERA_WIDTH <= 0 or CAMERA_HEIGHT <= 0:
        errors.append("Camera dimensions must be positive")
    
    if TARGET_FPS <= 0:
        errors.append("TARGET_FPS must be positive")
    
    # Validate frame skip
    if FRAME_SKIP < 1:
        errors.append("FRAME_SKIP must be >= 1")
    
    is_valid = len(errors) == 0
    return is_valid, errors


# Validate configuration on import
_config_valid, _config_errors = validate_config()
if not _config_valid:
    import warnings
    warnings.warn(f"Configuration validation failed: {', '.join(_config_errors)}", UserWarning)

