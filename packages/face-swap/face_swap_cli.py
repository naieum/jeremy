#!/usr/bin/env python3
"""
Face Swap CLI
Command-line interface for training, processing, and server management.
"""
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / 'src'))


def train_command(args):
    """Handle training command"""
    from training.face_trainer import FaceTrainer, CostEstimator
    
    trainer = FaceTrainer(output_dir=args.output)
    
    if args.estimate:
        CostEstimator.print_estimates(args.num_images)
        return
    
    # Prepare dataset
    print(f"\nPreparing dataset from {args.images}...")
    image_paths = trainer.prepare_dataset(
        args.images,
        min_face_size=args.min_face_size,
        output_json=f"{args.output}/dataset_metadata.json"
    )
    
    if len(image_paths) < 5:
        print(f"Error: Not enough valid images (found {len(image_paths)}, need at least 5)")
        return
    
    # Estimate cost
    if args.lora:
        estimate = CostEstimator.estimate_lora_training(
            len(image_paths),
            args.epochs,
            args.gpu
        )
    else:
        estimate = CostEstimator.estimate_embedding_training(
            len(image_paths),
            args.gpu
        )
    
    print(f"\nEstimated cost: ${estimate['estimated_cost_usd']:.2f}")
    print(f"Estimated time: {estimate['estimated_hours']*60:.0f} minutes")
    
    if args.dry_run:
        print("\nDry run - not training")
        return
    
    # Train
    if args.lora:
        print(f"\nTraining LoRA model...")
        trainer.train_lora_diffusion(
            image_paths,
            instance_prompt=args.prompt,
            num_epochs=args.epochs
        )
    else:
        print(f"\nTraining embedding refiner...")
        trainer.train_embedding_refiner(
            image_paths,
            num_epochs=args.epochs,
            batch_size=args.batch_size
        )
    
    print(f"\nTraining complete! Models saved to {args.output}")


def process_command(args):
    """Handle image/video processing command"""
    from pipeline.realtime_pipeline import RealtimeFaceSwapPipeline, PipelineConfig
    from models.background_removal import SegmentationMode
    import cv2
    
    # Create pipeline
    config = PipelineConfig(
        remove_bg=args.remove_bg,
        blur_bg=args.blur_bg,
        enhance_face=args.enhance
    )
    
    pipeline = RealtimeFaceSwapPipeline(config)
    
    # Load source face
    source = cv2.imread(args.source)
    if source is None:
        print(f"Error: Could not load source image: {args.source}")
        return
    
    if not pipeline.set_source_face(source):
        print("Error: No face detected in source image")
        return
    
    # Process single image
    if args.input.endswith(('.jpg', '.jpeg', '.png')):
        print(f"Processing image: {args.input}")
        target = cv2.imread(args.input)
        if target is None:
            print(f"Error: Could not load target image: {args.input}")
            return
        
        result = pipeline.process_frame(target)
        cv2.imwrite(args.output, result)
        print(f"Saved result to: {args.output}")
    
    # Process video
    elif args.input.endswith(('.mp4', '.avi', '.mov')):
        print(f"Processing video: {args.input}")
        
        cap = cv2.VideoCapture(args.input)
        fps = int(cap.get(cv2.CAP_PROP_FPS))
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        writer = cv2.VideoWriter(args.output, fourcc, fps, (width, height))
        
        frame_count = 0
        while True:
            ret, frame = cap.read()
            if not ret:
                break
            
            result = pipeline.process_frame(frame)
            writer.write(result)
            
            frame_count += 1
            if frame_count % 30 == 0:
                print(f"Processed {frame_count} frames...")
        
        cap.release()
        writer.release()
        print(f"Saved result to: {args.output}")


def server_command(args):
    """Handle server command"""
    import uvicorn
    from api.server import app
    
    print(f"Starting server on {args.host}:{args.port}")
    uvicorn.run(app, host=args.host, port=args.port, reload=args.reload)


def main():
    parser = argparse.ArgumentParser(
        description='Face Swap CLI - Real-time face swapping and training',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Train custom face model
  python face_swap_cli.py train --images ./my_face_photos --epochs 100

  # Process single image
  python face_swap_cli.py process -s source.jpg -i target.jpg -o result.jpg

  # Process video with background removal
  python face_swap_cli.py process -s source.jpg -i video.mp4 -o output.mp4 --remove-bg

  # Start API server
  python face_swap_cli.py server --port 8000

  # Estimate training costs
  python face_swap_cli.py train --estimate --num-images 50
        """
    )
    
    subparsers = parser.add_subparsers(dest='command', help='Commands')
    
    # Train command
    train_parser = subparsers.add_parser('train', help='Train custom face model')
    train_parser.add_argument('--images', '-i', type=str, required=True,
                             help='Directory containing training images')
    train_parser.add_argument('--output', '-o', type=str, default='./trained_models',
                             help='Output directory for trained models')
    train_parser.add_argument('--epochs', '-e', type=int, default=100,
                             help='Number of training epochs')
    train_parser.add_argument('--batch-size', '-b', type=int, default=8,
                             help='Batch size for training')
    train_parser.add_argument('--min-face-size', type=int, default=100,
                             help='Minimum face size in pixels')
    train_parser.add_argument('--lora', action='store_true',
                             help='Train LoRA for diffusion (slower, higher quality)')
    train_parser.add_argument('--prompt', type=str, default='photo of zwx person',
                             help='Instance prompt for LoRA training')
    train_parser.add_argument('--gpu', type=str, default='rtxa5000',
                             choices=['rtxa4000', 'rtxa5000', 'a100', 'a100_80gb'],
                             help='GPU type for cost estimation')
    train_parser.add_argument('--estimate', action='store_true',
                             help='Only estimate training cost')
    train_parser.add_argument('--num-images', type=int, default=50,
                             help='Number of images for cost estimation')
    train_parser.add_argument('--dry-run', action='store_true',
                             help='Show what would be done without training')
    
    # Process command
    process_parser = subparsers.add_parser('process', help='Process image or video')
    process_parser.add_argument('--source', '-s', type=str, required=True,
                               help='Source face image')
    process_parser.add_argument('--input', '-i', type=str, required=True,
                               help='Input image or video')
    process_parser.add_argument('--output', '-o', type=str, required=True,
                               help='Output file')
    process_parser.add_argument('--remove-bg', action='store_true',
                               help='Remove background')
    process_parser.add_argument('--blur-bg', action='store_true',
                               help='Blur background')
    process_parser.add_argument('--enhance', action='store_true',
                               help='Enhance face quality')
    
    # Server command
    server_parser = subparsers.add_parser('server', help='Start API server')
    server_parser.add_argument('--host', type=str, default='0.0.0.0',
                              help='Host to bind to')
    server_parser.add_argument('--port', '-p', type=int, default=8000,
                              help='Port to listen on')
    server_parser.add_argument('--reload', action='store_true',
                              help='Enable auto-reload for development')
    
    args = parser.parse_args()
    
    if args.command is None:
        parser.print_help()
        return 1
    
    # Dispatch
    if args.command == 'train':
        train_command(args)
    elif args.command == 'process':
        process_command(args)
    elif args.command == 'server':
        server_command(args)
    
    return 0


if __name__ == '__main__':
    sys.exit(main())
