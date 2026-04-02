"""
Test script for Gaze Estimator

This script tests the GazeEstimator class with FaceAnalyzer integration.
Provides comprehensive debugging output and visualization.

Usage:
    python test_gaze_estimator.py                    # Test with webcam
    python test_gaze_estimator.py <image_path>       # Test with image file
    python test_gaze_estimator.py --debug            # Webcam with debug overlay
"""

import sys
import cv2
import numpy as np
from pathlib import Path
import json
import time

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from camera_monitoring.detectors.face_analyzer import FaceAnalyzer
from camera_monitoring.detectors.gaze_estimator import GazeEstimator
from camera_monitoring import config

# Color constants for visualization
COLOR_GREEN = (0, 255, 0)
COLOR_RED = (0, 0, 255)
COLOR_BLUE = (255, 0, 0)
COLOR_YELLOW = (0, 255, 255)
COLOR_CYAN = (255, 255, 0)
COLOR_MAGENTA = (255, 0, 255)
COLOR_WHITE = (255, 255, 255)
COLOR_ORANGE = (0, 165, 255)


def draw_debug_overlay(frame, face_results, gaze_results, show_landmarks=True):
    """Draw comprehensive debug overlay on frame."""
    output = frame.copy()
    h, w = output.shape[:2]
    
    landmarks_2d = face_results.get('landmarks_2d')
    head_pose = face_results.get('head_pose')
    gaze = gaze_results.get('gaze', {})
    blink = gaze_results.get('blink', {})
    
    if landmarks_2d is not None and show_landmarks:
        # Draw all 468 facial landmarks as small dots
        for i, lm in enumerate(landmarks_2d[:468]):
            x, y = int(lm[0]), int(lm[1])
            if 0 <= x < w and 0 <= y < h:
                cv2.circle(output, (x, y), 1, (100, 100, 100), -1)
        
        # Highlight key landmarks
        key_landmarks = {
            4: ('Nose', COLOR_RED),
            33: ('L-Eye-Out', COLOR_GREEN),
            133: ('L-Eye-In', COLOR_GREEN),
            263: ('R-Eye-Out', COLOR_BLUE),
            362: ('R-Eye-In', COLOR_BLUE),
            152: ('Chin', COLOR_YELLOW),
            61: ('L-Mouth', COLOR_CYAN),
            291: ('R-Mouth', COLOR_CYAN),
        }
        
        for idx, (name, color) in key_landmarks.items():
            if idx < len(landmarks_2d):
                x, y = int(landmarks_2d[idx][0]), int(landmarks_2d[idx][1])
                cv2.circle(output, (x, y), 4, color, -1)
                cv2.putText(output, str(idx), (x + 5, y - 5),
                           cv2.FONT_HERSHEY_SIMPLEX, 0.3, color, 1)
        
        # Draw eye contours
        left_eye_indices = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246]
        right_eye_indices = [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398]
        
        # Left eye
        pts = []
        for idx in left_eye_indices:
            if idx < len(landmarks_2d):
                pts.append((int(landmarks_2d[idx][0]), int(landmarks_2d[idx][1])))
        if len(pts) > 2:
            pts = np.array(pts, np.int32)
            cv2.polylines(output, [pts], True, COLOR_GREEN, 1)
        
        # Right eye  
        pts = []
        for idx in right_eye_indices:
            if idx < len(landmarks_2d):
                pts.append((int(landmarks_2d[idx][0]), int(landmarks_2d[idx][1])))
        if len(pts) > 2:
            pts = np.array(pts, np.int32)
            cv2.polylines(output, [pts], True, COLOR_BLUE, 1)
        
        # Draw iris landmarks (468-477)
        if len(landmarks_2d) >= 478:
            # Left iris (468-472)
            for i in range(468, 473):
                x, y = int(landmarks_2d[i][0]), int(landmarks_2d[i][1])
                cv2.circle(output, (x, y), 2, COLOR_MAGENTA, -1)
            
            # Right iris (473-477)
            for i in range(473, 478):
                x, y = int(landmarks_2d[i][0]), int(landmarks_2d[i][1])
                cv2.circle(output, (x, y), 2, COLOR_ORANGE, -1)
    
    # Draw iris centers from gaze estimation
    if gaze.get('iris_center_left') is not None:
        center = tuple(map(int, gaze['iris_center_left']))
        cv2.circle(output, center, 6, COLOR_MAGENTA, 2)
        cv2.circle(output, center, 2, COLOR_MAGENTA, -1)
    
    if gaze.get('iris_center_right') is not None:
        center = tuple(map(int, gaze['iris_center_right']))
        cv2.circle(output, center, 6, COLOR_ORANGE, 2)
        cv2.circle(output, center, 2, COLOR_ORANGE, -1)
    
    # Draw gaze direction arrow
    if gaze.get('gaze_detected') and landmarks_2d is not None and len(landmarks_2d) > 4:
        nose_tip = (int(landmarks_2d[4][0]), int(landmarks_2d[4][1]))
        h_angle = gaze.get('horizontal_angle', 0)
        v_angle = gaze.get('vertical_angle', 0)
        
        # Calculate arrow endpoint
        arrow_length = 80
        # Horizontal: positive = looking right, negative = looking left
        dx = arrow_length * np.sin(np.radians(h_angle))
        # Vertical: positive = looking up (but Y increases downward in image)
        dy = -arrow_length * np.sin(np.radians(v_angle))
        
        arrow_end = (int(nose_tip[0] + dx), int(nose_tip[1] + dy))
        cv2.arrowedLine(output, nose_tip, arrow_end, COLOR_YELLOW, 3, tipLength=0.3)
    
    # Draw head pose axes
    if head_pose is not None and landmarks_2d is not None and len(landmarks_2d) > 4:
        nose_tip = (int(landmarks_2d[4][0]), int(landmarks_2d[4][1]))
        yaw, pitch, roll = head_pose['yaw'], head_pose['pitch'], head_pose['roll']
        
        axis_length = 50
        
        # Simple axis visualization based on angles
        # X-axis (red) - affected by yaw
        x_end = (int(nose_tip[0] + axis_length * np.cos(np.radians(yaw))),
                 int(nose_tip[1]))
        cv2.line(output, nose_tip, x_end, COLOR_RED, 2)
        
        # Y-axis (green) - affected by pitch  
        y_end = (int(nose_tip[0]),
                 int(nose_tip[1] - axis_length * np.cos(np.radians(pitch))))
        cv2.line(output, nose_tip, y_end, COLOR_GREEN, 2)
    
    return output


def draw_status_panel(frame, face_results, gaze_results, fps=0):
    """Draw status panel with all metrics."""
    output = frame.copy()
    h, w = output.shape[:2]
    
    # Create semi-transparent panel
    panel_width = 300
    panel = np.zeros((h, panel_width, 3), dtype=np.uint8)
    panel[:] = (40, 40, 40)
    
    head_pose = face_results.get('head_pose')
    gaze = gaze_results.get('gaze', {})
    blink = gaze_results.get('blink', {})
    facing = gaze_results.get('facing_screen', False)
    
    y = 25
    line_height = 22
    
    def put_text(text, color=COLOR_WHITE, indent=0):
        nonlocal y
        cv2.putText(panel, text, (10 + indent, y), cv2.FONT_HERSHEY_SIMPLEX, 
                   0.5, color, 1, cv2.LINE_AA)
        y += line_height
    
    def put_header(text):
        nonlocal y
        y += 5
        cv2.putText(panel, text, (10, y), cv2.FONT_HERSHEY_SIMPLEX, 
                   0.55, COLOR_YELLOW, 1, cv2.LINE_AA)
        y += line_height + 2
    
    # FPS
    put_text(f"FPS: {fps:.1f}", COLOR_GREEN if fps > 20 else COLOR_RED)
    
    # Face detection
    put_header("--- FACE DETECTION ---")
    face_detected = face_results.get('face_detected', False)
    put_text(f"Face: {'DETECTED' if face_detected else 'NOT FOUND'}", 
             COLOR_GREEN if face_detected else COLOR_RED)
    
    if face_detected:
        landmarks = face_results.get('landmarks_2d')
        if landmarks is not None:
            put_text(f"Landmarks: {len(landmarks)}", indent=10)
    
    # Head pose
    put_header("--- HEAD POSE ---")
    if head_pose:
        yaw = head_pose['yaw']
        pitch = head_pose['pitch']
        roll = head_pose['roll']
        
        # Color based on whether in acceptable range
        yaw_ok = config.HEAD_FACING_SCREEN_YAW_MIN <= yaw <= config.HEAD_FACING_SCREEN_YAW_MAX
        pitch_ok = config.HEAD_FACING_SCREEN_PITCH_MIN <= pitch <= config.HEAD_FACING_SCREEN_PITCH_MAX
        
        put_text(f"Yaw:   {yaw:+7.1f}° (L/R)", COLOR_GREEN if yaw_ok else COLOR_RED, 10)
        put_text(f"Pitch: {pitch:+7.1f}° (U/D)", COLOR_GREEN if pitch_ok else COLOR_RED, 10)
        put_text(f"Roll:  {roll:+7.1f}° (tilt)", indent=10)
        put_text(f"Facing Screen: {'YES' if facing else 'NO'}", 
                 COLOR_GREEN if facing else COLOR_RED, 10)
    else:
        put_text("No head pose data", COLOR_RED, 10)
    
    # Gaze
    put_header("--- GAZE ESTIMATION ---")
    if gaze.get('gaze_detected'):
        h_angle = gaze['horizontal_angle']
        v_angle = gaze.get('vertical_angle', 0)
        direction = gaze['direction']
        quality = gaze.get('quality_score', 0)
        avg_quality = gaze.get('avg_quality', 0)
        
        # Color based on direction
        dir_color = COLOR_GREEN if direction == 'center' else COLOR_YELLOW
        put_text(f"Direction: {direction.upper()}", dir_color, 10)
        put_text(f"H-Angle: {h_angle:+7.1f}°", indent=10)
        put_text(f"V-Angle: {v_angle:+7.1f}°", indent=10)
        put_text(f"Quality: {quality:.2f} (avg: {avg_quality:.2f})", indent=10)
        
        # Debug values
        raw_h = gaze.get('raw_offset_h', 0)
        raw_v = gaze.get('raw_offset_v', 0)
        put_text(f"Raw H-Offset: {raw_h:+.3f}", COLOR_CYAN, 10)
        put_text(f"Raw V-Offset: {raw_v:+.3f}", COLOR_CYAN, 10)
    else:
        put_text("Gaze not detected", COLOR_RED, 10)
    
    # Blink detection
    put_header("--- BLINK DETECTION ---")
    if blink.get('avg_ear') is not None:
        is_blinking = blink['is_blinking']
        left_ear = blink.get('left_ear', 0)
        right_ear = blink.get('right_ear', 0)
        avg_ear = blink['avg_ear']
        
        blink_color = COLOR_RED if is_blinking else COLOR_GREEN
        put_text(f"Blinking: {'YES' if is_blinking else 'NO'}", blink_color, 10)
        put_text(f"L-EAR: {left_ear:.3f}", indent=10)
        put_text(f"R-EAR: {right_ear:.3f}", indent=10)
        put_text(f"Avg:   {avg_ear:.3f} (thresh: {config.BLINK_EAR_THRESHOLD})", indent=10)
        
        put_text(f"L-Eye: {'CLOSED' if blink['left_eye_closed'] else 'OPEN'}", indent=10)
        put_text(f"R-Eye: {'CLOSED' if blink['right_eye_closed'] else 'OPEN'}", indent=10)
    else:
        put_text("No blink data", COLOR_RED, 10)
    
    # Config thresholds
    put_header("--- THRESHOLDS ---")
    put_text(f"Gaze L/R: {config.GAZE_LEFT_THRESHOLD}/{config.GAZE_RIGHT_THRESHOLD}°", COLOR_CYAN, 10)
    put_text(f"Gaze Center: ±{config.GAZE_CENTER_THRESHOLD}°", COLOR_CYAN, 10)
    put_text(f"Head Yaw: [{config.HEAD_FACING_SCREEN_YAW_MIN}, {config.HEAD_FACING_SCREEN_YAW_MAX}]", COLOR_CYAN, 10)
    put_text(f"Head Pitch: [{config.HEAD_FACING_SCREEN_PITCH_MIN}, {config.HEAD_FACING_SCREEN_PITCH_MAX}]", COLOR_CYAN, 10)
    
    # Combine panel with frame
    combined = np.hstack([output, panel])
    return combined


def test_with_image(image_path: str, save_output: bool = True):
    """Test gaze estimator with a static image."""
    print(f"\n{'='*60}")
    print(f"Testing GazeEstimator with image: {image_path}")
    print(f"{'='*60}")
    
    # Load image
    if not Path(image_path).exists():
        print(f"Error: Image file not found: {image_path}")
        return False
    
    frame = cv2.imread(image_path)
    if frame is None:
        print(f"Error: Could not load image: {image_path}")
        return False
    
    print(f"Image loaded: {frame.shape[1]}x{frame.shape[0]}")
    
    # Create analyzer and estimator
    print("\nInitializing FaceAnalyzer...")
    face_analyzer = FaceAnalyzer()
    if not face_analyzer.initialize():
        print("Error: Failed to initialize MediaPipe")
        return False
    
    print("Initializing GazeEstimator...")
    gaze_estimator = GazeEstimator()
    
    # Detect face
    print("\nRunning face detection...")
    face_results = face_analyzer.detect_face(frame)
    
    if not face_results['face_detected']:
        print("Error: No face detected in image")
        # Still save debug output
        if save_output:
            output_path = "test_gaze_no_face.jpg"
            cv2.imwrite(output_path, frame)
            print(f"Saved to: {output_path}")
        return False
    
    print("✓ Face detected!")
    print(f"  Landmarks: {len(face_results['landmarks_2d'])}")
    
    # Run gaze analysis
    print("\nRunning gaze analysis...")
    gaze_results = gaze_estimator.analyze(
        face_results['iris_positions'],
        face_results['landmarks_2d'],
        face_results['head_pose']
    )
    
    # Print detailed results
    print_detailed_results(face_results, gaze_results)
    
    # Create visualization
    debug_frame = draw_debug_overlay(frame, face_results, gaze_results)
    output_frame = draw_status_panel(debug_frame, face_results, gaze_results)
    
    # Save output
    if save_output:
        output_path = "test_gaze_output.jpg"
        cv2.imwrite(output_path, output_frame)
        print(f"\n✓ Output saved to: {output_path}")
        
        # Also save JSON results
        json_results = create_json_results(face_results, gaze_results)
        json_path = "test_gaze_results.json"
        with open(json_path, 'w') as f:
            json.dump(json_results, f, indent=2)
        print(f"✓ JSON results saved to: {json_path}")
    
    # Display (optional)
    try:
        cv2.imshow("Gaze Estimation Results", output_frame)
        print("\nPress any key to close the window...")
        cv2.waitKey(0)
        cv2.destroyAllWindows()
    except:
        print("(GUI not available, skipping display)")
    
    return True


def print_detailed_results(face_results, gaze_results):
    """Print detailed analysis results to console."""
    print("\n" + "="*60)
    print("DETAILED ANALYSIS RESULTS")
    print("="*60)
    
    # Head Pose
    print("\n[HEAD POSE]")
    head_pose = face_results.get('head_pose')
    if head_pose:
        print(f"  Yaw (L/R):    {head_pose['yaw']:+.2f}° ", end="")
        if config.HEAD_FACING_SCREEN_YAW_MIN <= head_pose['yaw'] <= config.HEAD_FACING_SCREEN_YAW_MAX:
            print("✓ In range")
        else:
            print(f"✗ Out of range [{config.HEAD_FACING_SCREEN_YAW_MIN}, {config.HEAD_FACING_SCREEN_YAW_MAX}]")
        
        print(f"  Pitch (U/D):  {head_pose['pitch']:+.2f}° ", end="")
        if config.HEAD_FACING_SCREEN_PITCH_MIN <= head_pose['pitch'] <= config.HEAD_FACING_SCREEN_PITCH_MAX:
            print("✓ In range")
        else:
            print(f"✗ Out of range [{config.HEAD_FACING_SCREEN_PITCH_MIN}, {config.HEAD_FACING_SCREEN_PITCH_MAX}]")
        
        print(f"  Roll (tilt):  {head_pose['roll']:+.2f}°")
    else:
        print("  No head pose data available")
    
    # Gaze
    print("\n[GAZE ESTIMATION]")
    gaze = gaze_results.get('gaze', {})
    if gaze.get('gaze_detected'):
        print(f"  Direction:     {gaze['direction'].upper()}")
        print(f"  H-Angle:       {gaze['horizontal_angle']:+.2f}°")
        print(f"  V-Angle:       {gaze.get('vertical_angle', 0):+.2f}°")
        print(f"  Quality:       {gaze.get('quality_score', 0):.3f}")
        print(f"  Avg Quality:   {gaze.get('avg_quality', 0):.3f}")
        print(f"  Raw H-Offset:  {gaze.get('raw_offset_h', 0):+.4f}")
        print(f"  Raw V-Offset:  {gaze.get('raw_offset_v', 0):+.4f}")
        
        # Interpretation
        h_angle = gaze['horizontal_angle']
        if abs(h_angle) <= config.GAZE_CENTER_THRESHOLD:
            print(f"  → Looking at screen (within ±{config.GAZE_CENTER_THRESHOLD}°)")
        elif h_angle < config.GAZE_LEFT_THRESHOLD:
            print(f"  → Looking LEFT (beyond {config.GAZE_LEFT_THRESHOLD}°)")
        elif h_angle > config.GAZE_RIGHT_THRESHOLD:
            print(f"  → Looking RIGHT (beyond {config.GAZE_RIGHT_THRESHOLD}°)")
        else:
            print(f"  → Slightly off-center")
    else:
        print("  Gaze not detected")
    
    # Blink
    print("\n[BLINK DETECTION]")
    blink = gaze_results.get('blink', {})
    if blink.get('avg_ear') is not None:
        print(f"  Left EAR:      {blink.get('left_ear', 0):.4f}")
        print(f"  Right EAR:     {blink.get('right_ear', 0):.4f}")
        print(f"  Average EAR:   {blink['avg_ear']:.4f}")
        print(f"  Threshold:     {config.BLINK_EAR_THRESHOLD}")
        print(f"  Is Blinking:   {'YES' if blink['is_blinking'] else 'NO'}")
        print(f"  Left Closed:   {'YES' if blink['left_eye_closed'] else 'NO'}")
        print(f"  Right Closed:  {'YES' if blink['right_eye_closed'] else 'NO'}")
    else:
        print("  No blink data available")
    
    # Overall status
    print("\n[STATUS SUMMARY]")
    facing = gaze_results.get('facing_screen', False)
    print(f"  Facing Screen: {'YES ✓' if facing else 'NO ✗'}")
    
    # Violations check
    violations = []
    if not facing:
        violations.append("Not facing screen")
    if gaze.get('direction') not in ['center', 'unknown']:
        violations.append(f"Looking {gaze.get('direction', 'unknown')}")
    
    if violations:
        print(f"  Violations:    {', '.join(violations)}")
    else:
        print(f"  Violations:    None")
    
    print("="*60)


def create_json_results(face_results, gaze_results):
    """Create JSON-serializable results dict."""
    def convert_numpy(obj):
        if isinstance(obj, np.ndarray):
            return obj.tolist()
        elif isinstance(obj, np.floating):
            return float(obj)
        elif isinstance(obj, np.integer):
            return int(obj)
        elif isinstance(obj, dict):
            return {k: convert_numpy(v) for k, v in obj.items()}
        elif isinstance(obj, list):
            return [convert_numpy(v) for v in obj]
        return obj
    
    results = {
        'face_detected': face_results.get('face_detected', False),
        'head_pose': convert_numpy(face_results.get('head_pose')),
        'gaze': convert_numpy(gaze_results.get('gaze')),
        'blink': convert_numpy(gaze_results.get('blink')),
        'facing_screen': gaze_results.get('facing_screen', False),
        'config': {
            'gaze_left_threshold': config.GAZE_LEFT_THRESHOLD,
            'gaze_right_threshold': config.GAZE_RIGHT_THRESHOLD,
            'gaze_center_threshold': config.GAZE_CENTER_THRESHOLD,
            'gaze_scaling_factor': config.GAZE_SCALING_FACTOR,
            'head_yaw_range': [config.HEAD_FACING_SCREEN_YAW_MIN, config.HEAD_FACING_SCREEN_YAW_MAX],
            'head_pitch_range': [config.HEAD_FACING_SCREEN_PITCH_MIN, config.HEAD_FACING_SCREEN_PITCH_MAX],
            'blink_ear_threshold': config.BLINK_EAR_THRESHOLD,
        }
    }
    return results


def test_with_webcam(debug_mode: bool = False):
    """Test gaze estimator with webcam."""
    print(f"\n{'='*60}")
    print("Testing GazeEstimator with webcam")
    print(f"{'='*60}")
    print("\nControls:")
    print("  'q' - Quit")
    print("  's' - Save current frame")
    print("  'd' - Toggle debug overlay")
    print("  'l' - Toggle landmarks display")
    print("  'p' - Print current values to console")
    
    # Create analyzer and estimator
    print("\nInitializing FaceAnalyzer...")
    face_analyzer = FaceAnalyzer()
    if not face_analyzer.initialize():
        print("Error: Failed to initialize MediaPipe")
        return False
    
    print("Initializing GazeEstimator...")
    gaze_estimator = GazeEstimator()
    
    # Open webcam
    cap = cv2.VideoCapture(config.CAMERA_INDEX)
    if not cap.isOpened():
        print(f"Error: Could not open webcam (index {config.CAMERA_INDEX})")
        return False
    
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, config.CAMERA_WIDTH)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, config.CAMERA_HEIGHT)
    
    actual_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    actual_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    print(f"Webcam opened: {actual_width}x{actual_height}")
    print("\nStarting detection loop...")
    
    frame_count = 0
    show_debug = debug_mode
    show_landmarks = True
    fps_history = []
    last_time = time.time()
    
    # Store last results for display
    last_face_results = {'face_detected': False}
    last_gaze_results = {'gaze': {}, 'blink': {}, 'facing_screen': False}
    
    while True:
        ret, frame = cap.read()
        if not ret:
            print("Error: Could not read frame from webcam")
            break
        
        frame_count += 1
        current_time = time.time()
        
        # Calculate FPS
        fps = 1.0 / max(current_time - last_time, 0.001)
        last_time = current_time
        fps_history.append(fps)
        if len(fps_history) > 30:
            fps_history.pop(0)
        avg_fps = sum(fps_history) / len(fps_history)
        
        # Run detection (skip frames for performance if needed)
        if frame_count % config.FRAME_SKIP == 0:
            # Detect face
            face_results = face_analyzer.detect_face(frame)
            last_face_results = face_results
            
            if face_results['face_detected']:
                # Run gaze analysis
                gaze_results = gaze_estimator.analyze(
                    face_results['iris_positions'],
                    face_results['landmarks_2d'],
                    face_results['head_pose']
                )
                last_gaze_results = gaze_results
        
        # Draw visualization
        if show_debug:
            display_frame = draw_debug_overlay(frame, last_face_results, last_gaze_results, show_landmarks)
        else:
            display_frame = frame.copy()
        
        # Always show status panel
        display_frame = draw_status_panel(display_frame, last_face_results, last_gaze_results, avg_fps)
        
        # Display frame
        cv2.imshow("Gaze Estimation Test", display_frame)
        
        # Handle keys
        key = cv2.waitKey(1) & 0xFF
        if key == ord('q'):
            break
        elif key == ord('s'):
            filename = f"test_gaze_frame_{frame_count}.jpg"
            cv2.imwrite(filename, display_frame)
            print(f"✓ Frame saved: {filename}")
            
            # Also save JSON
            json_results = create_json_results(last_face_results, last_gaze_results)
            json_filename = f"test_gaze_frame_{frame_count}.json"
            with open(json_filename, 'w') as f:
                json.dump(json_results, f, indent=2)
            print(f"✓ Results saved: {json_filename}")
        elif key == ord('d'):
            show_debug = not show_debug
            print(f"Debug overlay: {'ON' if show_debug else 'OFF'}")
        elif key == ord('l'):
            show_landmarks = not show_landmarks
            print(f"Landmarks display: {'ON' if show_landmarks else 'OFF'}")
        elif key == ord('p'):
            print_detailed_results(last_face_results, last_gaze_results)
    
    cap.release()
    cv2.destroyAllWindows()
    print("\n✓ Test completed")
    return True


def run_accuracy_test(image_paths: list):
    """Run accuracy test on multiple images."""
    print(f"\n{'='*60}")
    print("ACCURACY TEST")
    print(f"{'='*60}")
    
    # Initialize once
    face_analyzer = FaceAnalyzer()
    if not face_analyzer.initialize():
        print("Error: Failed to initialize MediaPipe")
        return
    
    gaze_estimator = GazeEstimator()
    
    results = []
    for image_path in image_paths:
        if not Path(image_path).exists():
            print(f"Skipping (not found): {image_path}")
            continue
        
        frame = cv2.imread(image_path)
        if frame is None:
            print(f"Skipping (could not load): {image_path}")
            continue
        
        face_results = face_analyzer.detect_face(frame)
        if not face_results['face_detected']:
            print(f"No face detected: {image_path}")
            continue
        
        gaze_results = gaze_estimator.analyze(
            face_results['iris_positions'],
            face_results['landmarks_2d'],
            face_results['head_pose']
        )
        
        result = {
            'image': image_path,
            'head_pose': face_results.get('head_pose'),
            'gaze': gaze_results.get('gaze'),
            'facing_screen': gaze_results.get('facing_screen')
        }
        results.append(result)
        
        # Print summary for this image
        gaze = gaze_results.get('gaze', {})
        hp = face_results.get('head_pose', {})
        print(f"\n{Path(image_path).name}:")
        print(f"  Head: yaw={hp.get('yaw', 0):.1f}°, pitch={hp.get('pitch', 0):.1f}°")
        print(f"  Gaze: {gaze.get('direction', 'N/A')} ({gaze.get('horizontal_angle', 0):.1f}°)")
        print(f"  Facing screen: {gaze_results.get('facing_screen', False)}")
    
    return results


if __name__ == "__main__":
    args = sys.argv[1:]
    
    if '--help' in args or '-h' in args:
        print(__doc__)
        sys.exit(0)
    
    debug_mode = '--debug' in args or '-d' in args
    args = [a for a in args if not a.startswith('-')]
    
    if len(args) > 0:
        # Test with image file(s)
        if len(args) == 1:
            success = test_with_image(args[0])
        else:
            # Multiple images - run accuracy test
            run_accuracy_test(args)
            success = True
    else:
        # Test with webcam
        success = test_with_webcam(debug_mode=debug_mode)
    
    sys.exit(0 if success else 1)
