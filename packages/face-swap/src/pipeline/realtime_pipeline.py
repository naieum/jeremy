"""
Real-time Face Swap Pipeline
High-performance streaming with WebRTC support.
"""
import cv2
import numpy as np
import asyncio
from typing import Optional, Callable, Dict, Any
from dataclasses import dataclass
from collections import deque
import time

from ..models.face_analyzer import FaceAnalyzer, FaceData
from ..models.face_swapper import FaceSwapper
from ..models.background_removal import BackgroundRemover, SegmentationMode


@dataclass
class PipelineConfig:
    """Configuration for real-time pipeline"""
    # Face detection
    det_size: tuple = (320, 320)  # Smaller = faster
    det_thresh: float = 0.5
    
    # Face swap
    swap_model: str = './models/inswapper_128.onnx'
    enhance_face: bool = False
    
    # Background
    remove_bg: bool = False
    bg_mode: SegmentationMode = SegmentationMode.MEDIAPIPE
    bg_replace: Optional[np.ndarray] = None
    blur_bg: bool = False
    
    # Performance
    target_fps: int = 30
    frame_skip: int = 0  # Process every Nth frame
    async_processing: bool = True


class RealtimeFaceSwapPipeline:
    """
    Real-time face swapping pipeline optimized for streaming.
    Combines face detection, swapping, and background removal.
    """
    
    def __init__(self, config: Optional[PipelineConfig] = None):
        self.config = config or PipelineConfig()
        
        # Initialize models
        print("Initializing face analyzer...")
        self.analyzer = FaceAnalyzer(
            det_size=self.config.det_size,
            device='cuda' if cv2.cuda.getCudaEnabledDeviceCount() > 0 else 'cpu'
        )
        
        print("Initializing face swapper...")
        self.swapper = FaceSwapper(
            model_path=self.config.swap_model,
            face_analyzer=self.analyzer
        )
        
        if self.config.remove_bg:
            print("Initializing background remover...")
            self.bg_remover = BackgroundRemover(mode=self.config.bg_mode)
        else:
            self.bg_remover = None
        
        # State
        self.source_face_emb: Optional[np.ndarray] = None
        self.source_face_img: Optional[np.ndarray] = None
        self.frame_count = 0
        self.last_face_detection: Optional[FaceData] = None
        
        # Performance tracking
        self.fps_history = deque(maxlen=30)
        self.last_time = time.time()
        
        # Async processing
        self.processing_queue: asyncio.Queue = asyncio.Queue(maxsize=2)
        self.result_queue: asyncio.Queue = asyncio.Queue(maxsize=2)
        
        print("Pipeline initialized!")
    
    def set_source_face(self, source_image: np.ndarray) -> bool:
        """
        Set the source face for swapping.
        
        Args:
            source_image: Image containing the face to swap in
            
        Returns:
            True if face found and set
        """
        face = self.analyzer.get_largest_face(source_image)
        if face is None:
            return False
        
        self.source_face_emb = self.analyzer.get_face_embedding(source_image, face)
        self.source_face_img = source_image
        
        print(f"Source face set: embedding shape {self.source_face_emb.shape}")
        return True
    
    def process_frame(self, frame: np.ndarray) -> np.ndarray:
        """
        Process a single frame through the pipeline.
        
        Args:
            frame: Input frame (BGR)
            
        Returns:
            Processed frame
        """
        if self.source_face_emb is None:
            # No source face set, just return frame with detection
            faces = self.analyzer.detect_faces(frame)
            return self.analyzer.draw_faces(frame, faces)
        
        self.frame_count += 1
        
        # Frame skipping for performance
        if self.config.frame_skip > 0 and self.frame_count % (self.config.frame_skip + 1) != 0:
            # Use cached face detection for swap
            if self.last_face_detection is not None:
                frame = self._apply_cached_swap(frame)
        else:
            # Full processing
            frame = self._process_full(frame)
        
        # Background removal
        if self.bg_remover:
            frame = self._apply_background(frame)
        
        # Update FPS
        self._update_fps()
        
        return frame
    
    def _process_full(self, frame: np.ndarray) -> np.ndarray:
        """Full processing pipeline"""
        # Detect face
        face = self.analyzer.get_largest_face(frame, det_thresh=self.config.det_thresh)
        
        if face is None:
            return frame
        
        self.last_face_detection = face
        
        # Swap face
        result = self.swapper.swap_video_frame(
            frame,
            self.source_face_emb,
            enhance=self.config.enhance_face
        )
        
        return result
    
    def _apply_cached_swap(self, frame: np.ndarray) -> np.ndarray:
        """Apply swap using cached face position"""
        # This is a simplified version - in production you'd want
        # optical flow or tracking for smoother results
        if self.last_face_detection is None:
            return frame
        
        # Check if face is still roughly in same position
        face = self.analyzer.get_largest_face(frame, det_thresh=0.3)
        if face is not None:
            self.last_face_detection = face
        
        # Apply swap
        return self.swapper.swap_video_frame(
            frame,
            self.source_face_emb,
            enhance=False  # Skip enhancement for speed
        )
    
    def _apply_background(self, frame: np.ndarray) -> np.ndarray:
        """Apply background removal/replacement"""
        if self.config.blur_bg:
            return self.bg_remover.replace_background(frame, None, blur_background=True)
        elif self.config.bg_replace is not None:
            return self.bg_remover.replace_background(frame, self.config.bg_replace)
        else:
            result = self.bg_remover.remove_background(frame)
            # Return RGBA or composite with black background
            if result.foreground.shape[2] == 4:
                # Convert to BGR with black background
                alpha = result.foreground[:, :, 3:4].astype(np.float32) / 255.0
                rgb = result.foreground[:, :, :3].astype(np.float32)
                frame = (rgb * alpha).astype(np.uint8)
            return frame
    
    def _update_fps(self):
        """Update FPS counter"""
        current_time = time.time()
        dt = current_time - self.last_time
        self.last_time = current_time
        
        if dt > 0:
            fps = 1.0 / dt
            self.fps_history.append(fps)
    
    @property
    def current_fps(self) -> float:
        """Get current average FPS"""
        if not self.fps_history:
            return 0.0
        return sum(self.fps_history) / len(self.fps_history)
    
    def draw_debug_info(self, frame: np.ndarray) -> np.ndarray:
        """Draw FPS and debug info on frame"""
        result = frame.copy()
        
        # FPS
        fps_text = f"FPS: {self.current_fps:.1f}"
        cv2.putText(result, fps_text, (10, 30),
                   cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
        
        # Source face status
        status = "Source: SET" if self.source_face_emb is not None else "Source: NOT SET"
        cv2.putText(result, status, (10, 60),
                   cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0) if self.source_face_emb else (0, 0, 255), 2)
        
        return result


class AsyncVideoProcessor:
    """
    Asynchronous video processor for non-blocking frame processing.
    Uses producer-consumer pattern with frame buffering.
    """
    
    def __init__(
        self,
        pipeline: RealtimeFaceSwapPipeline,
        buffer_size: int = 2
    ):
        self.pipeline = pipeline
        self.buffer_size = buffer_size
        
        self.input_queue: asyncio.Queue = asyncio.Queue(maxsize=buffer_size)
        self.output_queue: asyncio.Queue = asyncio.Queue(maxsize=buffer_size)
        
        self.running = False
        self.processor_task: Optional[asyncio.Task] = None
    
    async def start(self):
        """Start the async processor"""
        self.running = True
        self.processor_task = asyncio.create_task(self._processing_loop())
    
    async def stop(self):
        """Stop the async processor"""
        self.running = False
        if self.processor_task:
            self.processor_task.cancel()
            try:
                await self.processor_task
            except asyncio.CancelledError:
                pass
    
    async def _processing_loop(self):
        """Main processing loop"""
        while self.running:
            try:
                # Get frame from input queue
                frame = await asyncio.wait_for(self.input_queue.get(), timeout=0.1)
                
                # Process frame (run in thread pool to not block)
                loop = asyncio.get_event_loop()
                result = await loop.run_in_executor(
                    None, self.pipeline.process_frame, frame
                )
                
                # Put result in output queue
                if not self.output_queue.full():
                    await self.output_queue.put(result)
                
            except asyncio.TimeoutError:
                continue
            except Exception as e:
                print(f"Processing error: {e}")
    
    async def submit_frame(self, frame: np.ndarray) -> bool:
        """
        Submit a frame for processing.
        Returns False if queue is full (frame dropped).
        """
        if self.input_queue.full():
            return False
        await self.input_queue.put(frame)
        return True
    
    async def get_result(self) -> Optional[np.ndarray]:
        """Get processed frame result"""
        if self.output_queue.empty():
            return None
        return await self.output_queue.get()
    
    def get_result_nowait(self) -> Optional[np.ndarray]:
        """Get result without blocking (returns None if empty)"""
        if self.output_queue.empty():
            return None
        try:
            return self.output_queue.get_nowait()
        except asyncio.QueueEmpty:
            return None


class WebRTCFaceSwapTrack:
    """
    WebRTC MediaStreamTrack for real-time face swap streaming.
    Integrates with aiortc for browser-based streaming.
    """
    
    def __init__(
        self,
        pipeline: RealtimeFaceSwapPipeline,
        source_track=None  # aiortc MediaStreamTrack
    ):
        from aiortc import MediaStreamTrack
        
        super().__init__()
        self.pipeline = pipeline
        self.source_track = source_track
        
        self.kind = "video"
        self._frame_count = 0
    
    async def recv(self):
        """Receive and process frame"""
        from aiortc import VideoFrame
        
        # Get frame from source
        frame = await self.source_track.recv()
        
        # Convert to numpy
        img = frame.to_ndarray(format="bgr24")
        
        # Process
        processed = self.pipeline.process_frame(img)
        
        # Convert back to VideoFrame
        new_frame = VideoFrame.from_ndarray(processed, format="bgr24")
        new_frame.pts = frame.pts
        new_frame.time_base = frame.time_base
        
        return new_frame


class FrameInterpolator:
    """
    Frame interpolation for smoother output when processing is slow.
    Uses optical flow to interpolate between processed frames.
    """
    
    def __init__(self):
        self.prev_frame: Optional[np.ndarray] = None
        self.prev_gray: Optional[np.ndarray] = None
        self.flow = None
    
    def interpolate(
        self,
        frame: np.ndarray,
        target_frame: np.ndarray,
        ratio: float = 0.5
    ) -> np.ndarray:
        """
        Interpolate between two frames using optical flow.
        
        Args:
            frame: Current frame
            target_frame: Target frame to interpolate towards
            ratio: Interpolation ratio (0 = frame, 1 = target_frame)
            
        Returns:
            Interpolated frame
        """
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        target_gray = cv2.cvtColor(target_frame, cv2.COLOR_BGR2GRAY)
        
        if self.prev_gray is not None:
            # Calculate optical flow
            flow = cv2.calcOpticalFlowFarneback(
                self.prev_gray, gray, None,
                pyr_scale=0.5, levels=3, winsize=15,
                iterations=3, poly_n=5, poly_sigma=1.2, flags=0
            )
            
            # Warp frame using flow
            h, w = frame.shape[:2]
            flow_map = np.column_stack((
                np.repeat(np.arange(h), w),
                np.tile(np.arange(w), h)
            )).reshape(h, w, 2).astype(np.float32)
            
            warped = cv2.remap(
                self.prev_frame,
                (flow_map + flow * ratio).astype(np.float32),
                None,
                cv2.INTER_LINEAR
            )
            
            # Blend
            result = cv2.addWeighted(frame, 1 - ratio, warped, ratio, 0)
            return result
        
        self.prev_frame = frame
        self.prev_gray = gray
        return frame
