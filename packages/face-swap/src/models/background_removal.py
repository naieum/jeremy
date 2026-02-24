"""
Background Segmentation and Removal
Uses MediaPipe for real-time segmentation, with fallback to rembg for higher quality.
"""
import cv2
import numpy as np
import torch
from typing import Optional, Tuple
from dataclasses import dataclass
from enum import Enum


class SegmentationMode(Enum):
    MEDIAPIPE = "mediapipe"      # Fast, real-time
    REMBG = "rembg"              # Higher quality, slower
    MODNET = "modnet"            # Portrait matting
    RMBG2 = "bria-rmbg"          # BRIA AI background removal


@dataclass
class SegmentationResult:
    """Container for segmentation results"""
    mask: np.ndarray           # Alpha mask (0-255)
    foreground: np.ndarray     # Foreground image with alpha
    background: Optional[np.ndarray] = None
    

class BackgroundRemover:
    """
    Real-time background segmentation and removal.
    Optimized for portrait/face applications.
    """
    
    def __init__(
        self,
        mode: SegmentationMode = SegmentationMode.MEDIAPIPE,
        device: str = 'cuda' if torch.cuda.is_available() else 'cpu'
    ):
        self.mode = mode
        self.device = device
        self.model = None
        self._init_model()
    
    def _init_model(self):
        """Initialize the segmentation model"""
        if self.mode == SegmentationMode.MEDIAPIPE:
            self._init_mediapipe()
        elif self.mode == SegmentationMode.REMBG:
            self._init_rembg()
        elif self.mode == SegmentationMode.MODNET:
            self._init_modnet()
        elif self.mode == SegmentationMode.RMBG2:
            self._init_bria_rmbg()
    
    def _init_mediapipe(self):
        """Initialize MediaPipe selfie segmentation"""
        import mediapipe as mp
        
        self.mp_selfie_segmentation = mp.solutions.selfie_segmentation
        self.segmenter = self.mp_selfie_segmentation.SelfieSegmentation(
            model_selection=1  # 0 = general, 1 = landscape (higher quality)
        )
    
    def _init_rembg(self):
        """Initialize rembg"""
        from rembg import remove, new_session
        self.rembg_session = new_session("u2net")
    
    def _init_modnet(self):
        """Initialize MODNet portrait matting"""
        # Load MODNet model
        model_path = './models/modnet_photographic_portrait_matting.ckpt'
        
        try:
            import sys
            sys.path.append('./models/MODNet')
            from MODNet.src.models.modnet import MODNet
            
            self.modnet = MODNet(backbone_pretrained=False)
            self.modnet = torch.nn.DataParallel(self.modnet).to(self.device)
            
            weights = torch.load(model_path, map_location=self.device)
            self.modnet.load_state_dict(weights)
            self.modnet.eval()
        except Exception as e:
            print(f"MODNet initialization failed: {e}")
            print("Falling back to MediaPipe")
            self.mode = SegmentationMode.MEDIAPIPE
            self._init_mediapipe()
    
    def _init_bria_rmbg(self):
        """Initialize BRIA RMBG-2-Studio"""
        try:
            from bria_rmbg import BriaRMBG
            self.rmbg = BriaRMBG.from_pretrained("briaai/RMBG-2-Studio")
            self.rmbg.to(self.device)
        except Exception as e:
            print(f"BRIA RMBG initialization failed: {e}")
            self.mode = SegmentationMode.MEDIAPIPE
            self._init_mediapipe()
    
    def remove_background(
        self,
        image: np.ndarray,
        threshold: float = 0.5,
        smooth_edges: bool = True
    ) -> SegmentationResult:
        """
        Remove background from image.
        
        Args:
            image: Input image (BGR format)
            threshold: Segmentation threshold
            smooth_edges: Apply edge smoothing
            
        Returns:
            SegmentationResult with mask and foreground
        """
        if self.mode == SegmentationMode.MEDIAPIPE:
            return self._segment_mediapipe(image, threshold, smooth_edges)
        elif self.mode == SegmentationMode.REMBG:
            return self._segment_rembg(image)
        elif self.mode == SegmentationMode.MODNET:
            return self._segment_modnet(image)
        elif self.mode == SegmentationMode.RMBG2:
            return self._segment_bria(image)
    
    def _segment_mediapipe(
        self,
        image: np.ndarray,
        threshold: float,
        smooth_edges: bool
    ) -> SegmentationResult:
        """Segment using MediaPipe"""
        import mediapipe as mp
        
        rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        results = self.segmenter.process(rgb)
        
        # Get segmentation mask
        mask = results.segmentation_mask
        mask = (mask > threshold).astype(np.uint8) * 255
        
        if smooth_edges:
            mask = cv2.GaussianBlur(mask, (7, 7), 0)
        
        # Create foreground with alpha
        foreground = self._apply_mask(image, mask)
        
        return SegmentationResult(mask=mask, foreground=foreground)
    
    def _segment_rembg(self, image: np.ndarray) -> SegmentationResult:
        """Segment using rembg"""
        from PIL import Image
        import io
        
        # Convert to PIL
        pil_img = Image.fromarray(cv2.cvtColor(image, cv2.COLOR_BGR2RGB))
        
        # Remove background
        output = self.rembg_session.remove(pil_img)
        
        # Convert back
        result = cv2.cvtColor(np.array(output), cv2.COLOR_RGBA2BGRA)
        mask = result[:, :, 3]
        foreground = cv2.cvtColor(result, cv2.COLOR_BGRA2BGR)
        
        return SegmentationResult(mask=mask, foreground=result)
    
    def _segment_modnet(self, image: np.ndarray) -> SegmentationResult:
        """Segment using MODNet"""
        # Preprocess
        h, w = image.shape[:2]
        
        # Resize to MODNet input size (multiple of 32)
        im_h, im_w = 512, 512
        image_resized = cv2.resize(image, (im_w, im_h))
        
        # Normalize
        image_tensor = torch.from_numpy(
            image_resized.astype(np.float32) / 255.0
        ).permute(2, 0, 1).unsqueeze(0).to(self.device)
        
        # Inference
        with torch.no_grad():
            _, _, matte = self.modnet(image_tensor, inference=False)
        
        # Post-process
        matte = matte[0][0].cpu().numpy()
        mask = (matte * 255).astype(np.uint8)
        mask = cv2.resize(mask, (w, h))
        
        foreground = self._apply_mask(image, mask)
        
        return SegmentationResult(mask=mask, foreground=foreground)
    
    def _segment_bria(self, image: np.ndarray) -> SegmentationResult:
        """Segment using BRIA RMBG-2"""
        from PIL import Image
        import torch.nn.functional as F
        
        # Convert to PIL
        pil_img = Image.fromarray(cv2.cvtColor(image, cv2.COLOR_BGR2RGB))
        
        # Transform
        from torchvision import transforms
        transform = transforms.Compose([
            transforms.Resize((1024, 1024)),
            transforms.ToTensor(),
        ])
        
        input_tensor = transform(pil_img).unsqueeze(0).to(self.device)
        
        # Inference
        with torch.no_grad():
            output = self.rmbg(input_tensor)
        
        # Get mask
        mask = output[0, 0].cpu().numpy()
        mask = (mask * 255).astype(np.uint8)
        mask = cv2.resize(mask, (image.shape[1], image.shape[0]))
        
        foreground = self._apply_mask(image, mask)
        
        return SegmentationResult(mask=mask, foreground=foreground)
    
    def _apply_mask(self, image: np.ndarray, mask: np.ndarray) -> np.ndarray:
        """Apply alpha mask to image"""
        # Ensure 3-channel image
        if len(image.shape) == 2:
            image = cv2.cvtColor(image, cv2.COLOR_GRAY2BGR)
        
        # Create alpha channel
        b, g, r = cv2.split(image)
        rgba = cv2.merge([b, g, r, mask])
        
        return rgba
    
    def replace_background(
        self,
        image: np.ndarray,
        new_background: np.ndarray,
        blur_background: bool = False,
        blur_amount: int = 21
    ) -> np.ndarray:
        """
        Replace background with new image or blur.
        
        Args:
            image: Foreground image
            new_background: New background image (or None to use blur)
            blur_background: Blur existing background instead of replacing
            blur_amount: Gaussian blur kernel size
            
        Returns:
            Composited image
        """
        # Get segmentation
        result = self.remove_background(image, smooth_edges=True)
        mask = result.mask.astype(np.float32) / 255.0
        
        h, w = image.shape[:2]
        
        if blur_background:
            # Blur original background
            background = cv2.GaussianBlur(image, (blur_amount, blur_amount), 0)
        else:
            # Resize new background
            background = cv2.resize(new_background, (w, h))
        
        # Normalize mask
        mask_3channel = np.stack([mask] * 3, axis=2)
        
        # Composite
        foreground = image.astype(np.float32)
        background = background.astype(np.float32)
        
        composited = (foreground * mask_3channel + background * (1 - mask_3channel)).astype(np.uint8)
        
        return composited
    
    def apply_green_screen(
        self,
        image: np.ndarray,
        color: Tuple[int, int, int] = (0, 255, 0)
    ) -> np.ndarray:
        """Apply green screen (or custom color) background"""
        result = self.remove_background(image)
        mask = result.mask.astype(np.float32) / 255.0
        
        # Create colored background
        background = np.full_like(image, color)
        
        # Composite
        mask_3channel = np.stack([mask] * 3, axis=2)
        composited = (image.astype(np.float32) * mask_3channel + 
                     background.astype(np.float32) * (1 - mask_3channel)).astype(np.uint8)
        
        return composited


class PortraitSegmenter:
    """
    Specialized portrait segmentation with face-aware refinement.
    Combines multiple segmentation approaches for best results.
    """
    
    def __init__(self, device: str = 'cuda' if torch.cuda.is_available() else 'cpu'):
        self.device = device
        self.mp_segmenter = BackgroundRemover(SegmentationMode.MEDIAPIPE)
        
        # High quality fallback
        try:
            self.hq_segmenter = BackgroundRemover(SegmentationMode.RMBG2)
            self.has_hq = True
        except:
            self.has_hq = False
    
    def segment_portrait(
        self,
        image: np.ndarray,
        use_hq: bool = False
    ) -> SegmentationResult:
        """
        Segment portrait with optional high-quality processing.
        
        Args:
            image: Input image
            use_hq: Use high-quality (slower) segmentation
            
        Returns:
            SegmentationResult
        """
        if use_hq and self.has_hq:
            return self.hq_segmenter.remove_background(image)
        else:
            return self.mp_segmenter.remove_background(image)
    
    def segment_face_region(
        self,
        image: np.ndarray,
        face_bbox: Optional[Tuple[int, int, int, int]] = None,
        padding: float = 0.3
    ) -> SegmentationResult:
        """
        Segment only the face region, leaving body intact.
        
        Args:
            image: Input image
            face_bbox: Face bounding box (x1, y1, x2, y2)
            padding: Padding around face as ratio
            
        Returns:
            SegmentationResult with face region segmented
        """
        if face_bbox is None:
            from .face_analyzer import FaceAnalyzer
            analyzer = FaceAnalyzer()
            face = analyzer.get_largest_face(image)
            if face:
                face_bbox = face.bbox
            else:
                return self.mp_segmenter.remove_background(image)
        
        x1, y1, x2, y2 = face_bbox
        
        # Add padding
        w, h = x2 - x1, y2 - y1
        pad_x, pad_y = int(w * padding), int(h * padding)
        x1, y1 = max(0, x1 - pad_x), max(0, y1 - pad_y)
        x2, y2 = min(image.shape[1], x2 + pad_x), min(image.shape[0], y2 + pad_y)
        
        # Extract face region
        face_region = image[y1:y2, x1:x2]
        
        # Segment face region
        result = self.mp_segmenter.remove_background(face_region)
        
        # Create full-size output
        full_mask = np.zeros(image.shape[:2], dtype=np.uint8)
        full_foreground = np.zeros((*image.shape[:2], 4), dtype=np.uint8)
        
        # Place segmented face back
        full_mask[y1:y2, x1:x2] = result.mask
        full_foreground[y1:y2, x1:x2] = result.foreground
        
        return SegmentationResult(mask=full_mask, foreground=full_foreground)
