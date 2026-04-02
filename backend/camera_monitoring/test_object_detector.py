"""
Test script for Object Detector

This script tests the ObjectDetector class with sample images or webcam.
Usage:
    python test_object_detector.py                    # Test with webcam
    python test_object_detector.py <image_path>       # Test with image file
"""

import sys
import cv2
import numpy as np
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from camera_monitoring.detectors.object_detector import ObjectDetector
from camera_monitoring import config

def test_with_image(image_path: str):
    """Test object detector with a static image."""
    print(f"Testing ObjectDetector with image: {image_path}")
    
    # Load image
    if not Path(image_path).exists():
        print(f"Error: Image file not found: {image_path}")
        return False
    
    frame = cv2.imread(image_path)
    if frame is None:
        print(f"Error: Could not load image: {image_path}")
        return False
    
    print(f"Image loaded: {frame.shape[1]}x{frame.shape[0]}")
    
    # Create detector
    print("\nInitializing ObjectDetector...")
    detector = ObjectDetector()
    
    # Load model
    print("Loading YOLOv8n model (this may take a moment on first run)...")
    if not detector.load_model():
        print("Error: Failed to load model")
        return False
    
    print("Model loaded successfully!")
    print(f"Model info: {detector.get_model_info()}")
    
    # Run detection
    print("\nRunning detection...")
    results = detector.detect(frame)
    
    # Display results
    print("\n=== Detection Results ===")
    print(f"Phone detected: {results['phone']['detected']}")
    if results['phone']['detected']:
        print(f"  Confidence: {results['phone']['confidence']:.2f}")
        print(f"  Bounding box: {results['phone']['bbox']}")
    
    print(f"\nPerson count: {results['persons']['count']}")
    if results['persons']['count'] > 0:
        print(f"  Bounding boxes: {len(results['persons']['bboxes'])}")
        for i, bbox in enumerate(results['persons']['bboxes']):
            print(f"    Person {i+1}: {bbox}")
    
    # Draw results on image
    output_frame = frame.copy()
    
    # Draw phone bounding box
    if results['phone']['detected']:
        x, y, w, h = results['phone']['bbox']
        cv2.rectangle(output_frame, (x, y), (x + w, y + h), (0, 0, 255), 2)
        cv2.putText(output_frame, f"Phone: {results['phone']['confidence']:.2f}",
                   (x, y - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 255), 2)
    
    # Draw person bounding boxes
    for i, bbox in enumerate(results['persons']['bboxes']):
        x, y, w, h = bbox
        cv2.rectangle(output_frame, (x, y), (x + w, y + h), (0, 255, 0), 2)
        cv2.putText(output_frame, f"Person {i+1}",
                   (x, y - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)
    
    # Save output
    output_path = "test_output.jpg"
    cv2.imwrite(output_path, output_frame)
    print(f"\nOutput saved to: {output_path}")
    
    # Display (optional, requires GUI)
    try:
        cv2.imshow("Detection Results", output_frame)
        print("\nPress any key to close the window...")
        cv2.waitKey(0)
        cv2.destroyAllWindows()
    except:
        print("(GUI not available, skipping display)")
    
    return True


def test_with_webcam():
    """Test object detector with webcam."""
    print("Testing ObjectDetector with webcam")
    print("Press 'q' to quit, 's' to save current frame")
    
    # Create detector
    print("\nInitializing ObjectDetector...")
    detector = ObjectDetector()
    
    # Load model
    print("Loading YOLOv8n model (this may take a moment on first run)...")
    if not detector.load_model():
        print("Error: Failed to load model")
        return False
    
    print("Model loaded successfully!")
    
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
            results = detector.detect(frame)
            
            # Draw results
            # Phone
            if results['phone']['detected']:
                x, y, w, h = results['phone']['bbox']
                cv2.rectangle(frame, (x, y), (x + w, y + h), (0, 0, 255), 2)
                cv2.putText(frame, f"Phone: {results['phone']['confidence']:.2f}",
                           (x, y - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 255), 2)
            
            # Persons
            for i, bbox in enumerate(results['persons']['bboxes']):
                x, y, w, h = bbox
                cv2.rectangle(frame, (x, y), (x + w, y + h), (0, 255, 0), 2)
                cv2.putText(frame, f"Person {i+1}",
                           (x, y - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)
            
            # Status text
            status_text = [
                f"Phone: {'YES' if results['phone']['detected'] else 'NO'}",
                f"Persons: {results['persons']['count']}"
            ]
            y_offset = 20
            for text in status_text:
                cv2.putText(frame, text, (10, y_offset),
                           cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
                y_offset += 25
        
        # Display frame
        cv2.imshow("Object Detection Test", frame)
        
        # Handle keys
        key = cv2.waitKey(1) & 0xFF
        if key == ord('q'):
            break
        elif key == ord('s'):
            cv2.imwrite(f"test_frame_{frame_count}.jpg", frame)
            print(f"Frame saved: test_frame_{frame_count}.jpg")
    
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

