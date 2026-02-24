"""
Real-time Face Swap System
==========================
A complete face swapping solution with:
- Real-time face detection and swapping
- Background removal/segmentation
- Diffusion model integration
- Cost-effective training pipeline

Quick Start:
    from face_swap import RealtimeFaceSwapPipeline, PipelineConfig
    
    config = PipelineConfig(target_fps=30)
    pipeline = RealtimeFaceSwapPipeline(config)
    pipeline.set_source_face(source_image)
    result = pipeline.process_frame(frame)
"""

__version__ = "1.0.0"

from .pipeline.realtime_pipeline import (
    RealtimeFaceSwapPipeline,
    PipelineConfig,
    AsyncVideoProcessor,
    FrameInterpolator
)

from .models.face_analyzer import FaceAnalyzer, FaceData, FaceMatcher
from .models.face_swapper import FaceSwapper, DiffusionFaceSwapper
from .models.background_removal import (
    BackgroundRemover,
    PortraitSegmenter,
    SegmentationMode,
    SegmentationResult
)

from .training.face_trainer import (
    FaceTrainer,
    EmbeddingRefiner,
    FaceDataset,
    CostEstimator
)

__all__ = [
    'RealtimeFaceSwapPipeline',
    'PipelineConfig',
    'AsyncVideoProcessor',
    'FrameInterpolator',
    'FaceAnalyzer',
    'FaceData',
    'FaceMatcher',
    'FaceSwapper',
    'DiffusionFaceSwapper',
    'BackgroundRemover',
    'PortraitSegmenter',
    'SegmentationMode',
    'SegmentationResult',
    'FaceTrainer',
    'EmbeddingRefiner',
    'FaceDataset',
    'CostEstimator',
]
