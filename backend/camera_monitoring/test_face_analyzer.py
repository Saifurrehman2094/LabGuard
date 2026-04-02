"""
Test script for Face Analyzer

This script tests the FaceAnalyzer class with sample images or webcam.
Usage:
    python test_face_analyzer.py                    # Test with webcam
    python test_face_analyzer.py <image_path>       # Test with image file
"""

import sys
import cv2
import numpy as np
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from camera_monitoring.detectors.face_analyzer import FaceAnalyzer
from camera_monitoring import config

def test_with_image(image_path: str):
    """Test face analyzer with a static image."""
    print(f"Testing FaceAnalyzer with image: {image_path}")
    
    # Load image
    if not Path(image_path).exists():
        print(f"Error: Image file not found: {image_path}")
        return False
    
    frame = cv2.imread(image_path)
    if frame is None:
        print(f"Error: Could not load image: {image_path}")
        return False
    
    print(f"Image loaded: {frame.shape[1]}x{frame.shape[0]}")
    
    # Create analyzer
    print("\nInitializing FaceAnalyzer...")
    analyzer = FaceAnalyzer()
    
    # Initialize MediaPipe
    print("Initializing MediaPipe Face Mesh...")
    if not analyzer.initialize():
        print("Error: Failed to initialize MediaPipe")
        return False
    
    print("MediaPipe initialized successfully!")
    print(f"Analyzer info: {analyzer.get_model_info()}")
    
    # Run detection
    print("\nRunning face detection...")
    results = analyzer.detect_face(frame)
    
    # Display results
    print("\n=== Face Detection Results ===")
    print(f"Face detected: {results['face_detected']}")
    
    if results['face_detected']:
        print(f"Landmarks extracted: {results['landmarks'].shape if results['landmarks'] is not None else 'None'}")
        
        # Head pose
        if results['head_pose'] is not None:
            hp = results['head_pose']
            print(f"\nHead Pose:")
            print(f"  Yaw: {hp['yaw']:.2f}° (negative=left, positive=right)")
            print(f"  Pitch: {hp['pitch']:.2f}° (negative=down, positive=up)")
            print(f"  Roll: {hp['roll']:.2f}° (negative=left tilt, positive=right tilt)")
        else:
            print("\nHead Pose: Could not calculate")
        
        # Iris positions
        iris = results['iris_positions']
        print(f"\nIris Positions:")
        if iris['left'] is not None:
            print(f"  Left iris: {iris['left'].shape} landmarks found")
        else:
            print(f"  Left iris: Not detected")
        
        if iris['right'] is not None:
            print(f"  Right iris: {iris['right'].shape} landmarks found")
        else:
            print(f"  Right iris: Not detected")
    else:
        print("No face detected in image")
    
    # Draw results on image
    output_frame = frame.copy()
    
    if results['face_detected'] and results['landmarks_2d'] is not None:
        # Draw facial landmarks (key points only, for visualization)
        landmarks_2d = results['landmarks_2d']
        
        # Draw key landmarks
        key_points = [
            4,    # Nose tip
            33,   # Left eye outer
            263,  # Right eye outer
            175,  # Chin
            61,   # Left mouth
            291   # Right mouth
        ]
        
        for idx in key_points:
            if idx < len(landmarks_2d):
                x, y = int(landmarks_2d[idx][0]), int(landmarks_2d[idx][1])
                cv2.circle(output_frame, (x, y), 3, (0, 255, 0), -1)
        
        # Draw iris landmarks
        if iris['left_2d'] is not None:
            for point in iris['left_2d']:
                x, y = int(point[0]), int(point[1])
                cv2.circle(output_frame, (x, y), 2, (255, 0, 0), -1)
        
        if iris['right_2d'] is not None:
            for point in iris['right_2d']:
                x, y = int(point[0]), int(point[1])
                cv2.circle(output_frame, (x, y), 2, (0, 0, 255), -1)
        
        # Draw head pose info
        if results['head_pose'] is not None:
            hp = results['head_pose']
            y_offset = 20
            info_text = [
                f"Yaw: {hp['yaw']:.1f}°",
                f"Pitch: {hp['pitch']:.1f}°",
                f"Roll: {hp['roll']:.1f}°"
            ]
            for text in info_text:
                cv2.putText(output_frame, text, (10, y_offset),
                           cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
                y_offset += 25
    
    # Save output
    output_path = "test_face_output.jpg"
    cv2.imwrite(output_path, output_frame)
    print(f"\nOutput saved to: {output_path}")
    
    # Display (optional, requires GUI)
    try:
        cv2.imshow("Face Detection Results", output_frame)
        print("\nPress any key to close the window...")
        cv2.waitKey(0)
        cv2.destroyAllWindows()
    except:
        print("(GUI not available, skipping display)")
    
    return True


def test_with_webcam():
    """Test face analyzer with webcam."""
    print("Testing FaceAnalyzer with webcam")
    print("Press 'q' to quit, 's' to save current frame")
    
    # Create analyzer
    print("\nInitializing FaceAnalyzer...")
    analyzer = FaceAnalyzer()
    
    # Initialize MediaPipe
    print("Initializing MediaPipe Face Mesh...")
    if not analyzer.initialize():
        print("Error: Failed to initialize MediaPipe")
        return False
    
    print("MediaPipe initialized successfully!")
    
    # Open webcam
    cap = cv2.VideoCapture(config.CAMERA_INDEX)
    if not cap.isOpened():
        print(f"Error: Could not open webcam (index {config.CAMERA_INDEX})")
        return False
    
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, config.CAMERA_WIDTH)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, config.CAMERA_HEIGHT)
    
    print(f"Webcam opened: {config.CAMERA_WIDTH}x{config.CAMERA_HEIGHT}")
    print("\nStarting detection loop...")
    
    frame_count = 0
    while True:
        ret, frame = cap.read()
        if not ret:
            print("Error: Could not read frame from webcam")
            break
        
        frame_count += 1
        
        # Run detection (skip frames for performance)
        if frame_count % config.FRAME_SKIP == 0:
            results = analyzer.detect_face(frame)
            
            # Draw results
            if results['face_detected'] and results['landmarks_2d'] is not None:
                landmarks_2d = results['landmarks_2d']
                
                # Draw face mesh (simplified - key points only for performance)
                # Draw contour of face (simplified)
                face_oval_indices = [
                    10, 338, 297, 332, 284, 251, 389, 356, 454, 323,
                    361, 288, 397, 365, 379, 378, 400, 377, 152, 148,
                    176, 149, 150, 136, 172, 58, 132, 93, 234, 127,
                    162, 21, 54, 103, 67, 109
                ]
                
                for i in range(len(face_oval_indices) - 1):
                    idx1 = face_oval_indices[i]
                    idx2 = face_oval_indices[i + 1]
                    if idx1 < len(landmarks_2d) and idx2 < len(landmarks_2d):
                        pt1 = (int(landmarks_2d[idx1][0]), int(landmarks_2d[idx1][1]))
                        pt2 = (int(landmarks_2d[idx2][0]), int(landmarks_2d[idx2][1]))
                        cv2.line(frame, pt1, pt2, (0, 255, 0), 1)
                
                # Draw iris positions
                iris = results['iris_positions']
                if iris['left_2d'] is not None:
                    for point in iris['left_2d']:
                        x, y = int(point[0]), int(point[1])
                        cv2.circle(frame, (x, y), 3, (255, 0, 0), -1)
                
                if iris['right_2d'] is not None:
                    for point in iris['right_2d']:
                        x, y = int(point[0]), int(point[1])
                        cv2.circle(frame, (x, y), 3, (0, 0, 255), -1)
                
                # Status text
                status_text = ["Face: DETECTED"]
                if results['head_pose'] is not None:
                    hp = results['head_pose']
                    status_text.extend([
                        f"Yaw: {hp['yaw']:.1f}°",
                        f"Pitch: {hp['pitch']:.1f}°",
                        f"Roll: {hp['roll']:.1f}°"
                    ])
                
                y_offset = 20
                for text in status_text:
                    cv2.putText(frame, text, (10, y_offset),
                               cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)
                    y_offset += 25
            else:
                cv2.putText(frame, "Face: NOT DETECTED", (10, 20),
                           cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2)
        
        # Display frame
        cv2.imshow("Face Detection Test", frame)
        
        # Handle keys
        key = cv2.waitKey(1) & 0xFF
        if key == ord('q'):
            break
        elif key == ord('s'):
            cv2.imwrite(f"test_face_frame_{frame_count}.jpg", frame)
            print(f"Frame saved: test_face_frame_{frame_count}.jpg")
    
    cap.release()
    cv2.destroyAllWindows()
    print("\nTest completed")
    return True


if __name__ == "__main__":
    if len(sys.argv) > 1:
        # Test with image file
        image_path = sys.argv[1]
        success = test_with_image(image_path)
    else:
        # Test with webcam
        success = test_with_webcam()
    
    sys.exit(0 if success else 1)

