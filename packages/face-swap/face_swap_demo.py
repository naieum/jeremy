#!/usr/bin/env python3
"""
Face Swap Demo Script
Demonstrates real-time face swapping from webcam.
"""
import argparse
import cv2
import sys
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent / 'src'))

from pipeline.realtime_pipeline import RealtimeFaceSwapPipeline, PipelineConfig
from models.background_removal import SegmentationMode


def main():
    parser = argparse.ArgumentParser(description='Real-time Face Swap Demo')
    parser.add_argument('--source', '-s', type=str, required=True,
                       help='Path to source face image')
    parser.add_argument('--camera', '-c', type=int, default=0,
                       help='Camera index (default: 0)')
    parser.add_argument('--det-size', type=int, default=320,
                       help='Detection size (default: 320)')
    parser.add_argument('--remove-bg', action='store_true',
                       help='Remove background')
    parser.add_argument('--blur-bg', action='store_true',
                       help='Blur background')
    parser.add_argument('--no-display', action='store_true',
                       help='No window display (headless)')
    parser.add_argument('--output', '-o', type=str,
                       help='Output video file')
    
    args = parser.parse_args()
    
    # Load source face
    print(f"Loading source face from {args.source}")
    source_img = cv2.imread(args.source)
    if source_img is None:
        print(f"Error: Could not load source image from {args.source}")
        return 1
    
    # Create pipeline
    print("Initializing pipeline...")
    config = PipelineConfig(
        det_size=(args.det_size, args.det_size),
        remove_bg=args.remove_bg or args.blur_bg,
        blur_bg=args.blur_bg,
        bg_mode=SegmentationMode.MEDIAPIPE
    )
    
    pipeline = RealtimeFaceSwapPipeline(config)
    
    # Set source face
    success = pipeline.set_source_face(source_img)
    if not success:
        print("Error: No face detected in source image")
        return 1
    
    print("Source face set successfully!")
    print("\nControls:")
    print("  q - Quit")
    print("  s - Save screenshot")
    print("  b - Toggle background removal")
    print("  d - Toggle debug info")
    print()
    
    # Open camera
    cap = cv2.VideoCapture(args.camera)
    if not cap.isOpened():
        print(f"Error: Could not open camera {args.camera}")
        return 1
    
    # Set camera properties
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
    cap.set(cv2.CAP_PROP_FPS, 30)
    
    # Video writer
    writer = None
    if args.output:
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        writer = cv2.VideoWriter(args.output, fourcc, 30.0, (1280, 720))
    
    show_debug = True
    
    try:
        while True:
            ret, frame = cap.read()
            if not ret:
                print("Error: Failed to capture frame")
                break
            
            # Process frame
            result = pipeline.process_frame(frame)
            
            # Add debug info
            if show_debug:
                result = pipeline.draw_debug_info(result)
            
            # Display
            if not args.no_display:
                cv2.imshow('Face Swap', result)
                
                key = cv2.waitKey(1) & 0xFF
                if key == ord('q'):
                    break
                elif key == ord('s'):
                    filename = f"screenshot_{int(cv2.getTickCount())}.jpg"
                    cv2.imwrite(filename, result)
                    print(f"Saved {filename}")
                elif key == ord('b'):
                    pipeline.config.remove_bg = not pipeline.config.remove_bg
                    print(f"Background removal: {pipeline.config.remove_bg}")
                elif key == ord('d'):
                    show_debug = not show_debug
            
            # Write to file
            if writer:
                writer.write(result)
    
    except KeyboardInterrupt:
        print("\nInterrupted by user")
    
    finally:
        cap.release()
        if writer:
            writer.release()
        cv2.destroyAllWindows()
        print(f"\nAverage FPS: {pipeline.current_fps:.1f}")
    
    return 0


if __name__ == '__main__':
    sys.exit(main())
