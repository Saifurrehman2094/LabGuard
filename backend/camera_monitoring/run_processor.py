#!/usr/bin/env python
"""
Standalone runner script for Camera Processor

This script can be run directly from the camera_monitoring directory.
Usage:
    py -3.11 run_processor.py                    # Run with webcam
    py -3.11 run_processor.py --display          # Show display window
    py -3.11 run_processor.py --camera 1         # Use camera index 1
"""

import sys
import os

# Add parent directory to path so imports work correctly
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Now import and run the camera processor
from camera_monitoring.camera_processor import main

if __name__ == "__main__":
    main()

