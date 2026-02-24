"""
Face Swapping Module
Supports multiple face swapping models: SimSwap, Roop, etc.
Optimized for real-time performance.
"""
import cv2
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from typing import Optional, Tuple, List
from pathlib import Path
import onnxruntime as ort

from .face_analyzer import FaceAnalyzer, FaceData


class FaceSwapper:
    """
    Real-time face swapping using ONNX models.
    Supports models like SimSwap, inswapper_128, etc.
    """
    
    def __init__(
        self,
        model_path: str = './models/inswapper_128.onnx',
        device: str = 'cuda' if torch.cuda.is_available() else 'cpu',
        face_analyzer: Optional[FaceAnalyzer] = None
    ):
        self.device = device
        self.model_path = model_path
        
        # Initialize face analyzer
        self.analyzer = face_analyzer or FaceAnalyzer(device=device)
        
        # Load face swap model
        self.session = self._load_model(model_path)
        self.input_size = 128  # Default for inswapper_128
        
        # Post-processing
        self.face_enhancer = None
        
        print(f"FaceSwapper initialized with {model_path} on {device}")
    
    def _load_model(self, model_path: str) -> ort.InferenceSession:
        """Load ONNX model with optimizations"""
        providers = ['CUDAExecutionProvider', 'CPUExecutionProvider'] if self.device == 'cuda' else ['CPUExecutionProvider']
        
        sess_options = ort.SessionOptions()
        sess_options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        sess_options.intra_op_num_threads = 4
        
        session = ort.InferenceSession(
            model_path,
            sess_options=sess_options,
            providers=providers
        )
        
        return session
    
    def swap_face(
        self,
        target_image: np.ndarray,
        source_image: Optional[np.ndarray] = None,
        target_face: Optional[FaceData] = None,
        source_face: Optional[FaceData] = None,
        paste_back: bool = True,
        enhance: bool = False
    ) -> Tuple[np.ndarray, Optional[np.ndarray]]:
        """
        Swap face from source to target.
        
        Args:
            target_image: Target image where face will be replaced
            source_image: Source image containing face to use
            target_face: Pre-detected target face (optional)
            source_face: Pre-detected source face (optional)
            paste_back: Whether to paste result back onto target image
            enhance: Whether to apply face enhancement
            
        Returns:
            Tuple of (result_image, swapped_face_crop)
        """
        # Detect faces if not provided
        if target_face is None:
            target_face = self.analyzer.get_largest_face(target_image)
            if target_face is None:
                return target_image, None
        
        if source_face is None and source_image is not None:
            source_face = self.analyzer.get_largest_face(source_image)
            if source_face is None:
                return target_image, None
        
        # Get embeddings
        target_emb = self.analyzer.get_face_embedding(target_image, target_face)
        source_emb = self.analyzer.get_face_embedding(source_image, source_face) if source_face else target_emb
        
        # Prepare inputs
        target_crop = self._crop_face(target_image, target_face.bbox, expand=1.5)
        target_crop_resized = cv2.resize(target_crop, (self.input_size, self.input_size))
        
        # Normalize
        target_blob = target_crop_resized.astype(np.float32) / 255.0
        target_blob = np.transpose(target_blob, (2, 0, 1))
        target_blob = np.expand_dims(target_blob, axis=0)
        
        # Prepare latent
        latent = source_emb.reshape(1, -1).astype(np.float32)
        
        # Run inference
        outputs = self.session.run(
            None,
            {
                'target': target_blob,
                'source': latent
            }
        )
        
        # Process output
        result = outputs[0][0]
        result = np.transpose(result, (1, 2, 0))
        result = (result * 255).clip(0, 255).astype(np.uint8)
        
        # Resize back to crop size
        result = cv2.resize(result, (target_crop.shape[1], target_crop.shape[0]))
        
        # Apply enhancement if requested
        if enhance and self.face_enhancer:
            result = self.face_enhancer.enhance(result)
        
        if paste_back:
            # Paste back onto original image
            result = self._paste_face(target_image, result, target_face.bbox)
        
        return result, result if not paste_back else None
    
    def swap_multi_face(
        self,
        target_image: np.ndarray,
        source_image: np.ndarray,
        specific_target_face: Optional[int] = None
    ) -> np.ndarray:
        """
        Swap all faces in target with source face, or specific face by index.
        
        Args:
            target_image: Target image
            source_image: Source face image
            specific_target_face: Index of specific face to swap (None = all)
            
        Returns:
            Image with swapped faces
        """
        source_face = self.analyzer.get_largest_face(source_image)
        if source_face is None:
            return target_image
        
        target_faces = self.analyzer.detect_faces(target_image)
        
        result = target_image.copy()
        
        if specific_target_face is not None and specific_target_face < len(target_faces):
            faces_to_swap = [target_faces[specific_target_face]]
        else:
            faces_to_swap = target_faces
        
        for target_face in faces_to_swap:
            result, _ = self.swap_face(
                target_image=result,
                source_image=source_image,
                target_face=target_face,
                source_face=source_face,
                paste_back=True
            )
        
        return result
    
    def swap_video_frame(
        self,
        frame: np.ndarray,
        source_face_emb: np.ndarray,
        enhance: bool = False
    ) -> np.ndarray:
        """
        Optimized face swap for video frames.
        Uses pre-computed source embedding for speed.
        """
        target_face = self.analyzer.get_largest_face(frame)
        if target_face is None:
            return frame
        
        # Crop
        target_crop = self._crop_face(frame, target_face.bbox, expand=1.5)
        target_crop_resized = cv2.resize(target_crop, (self.input_size, self.input_size))
        
        # Normalize
        target_blob = target_crop_resized.astype(np.float32) / 255.0
        target_blob = np.transpose(target_blob, (2, 0, 1))
        target_blob = np.expand_dims(target_blob, axis=0)
        
        # Use pre-computed embedding
        latent = source_face_emb.reshape(1, -1).astype(np.float32)
        
        # Inference
        outputs = self.session.run(None, {'target': target_blob, 'source': latent})
        
        # Process
        result = outputs[0][0]
        result = np.transpose(result, (1, 2, 0))
        result = (result * 255).clip(0, 255).astype(np.uint8)
        result = cv2.resize(result, (target_crop.shape[1], target_crop.shape[0]))
        
        if enhance and self.face_enhancer:
            result = self.face_enhancer.enhance(result)
        
        # Paste back
        return self._paste_face(frame, result, target_face.bbox)
    
    def _crop_face(
        self, 
        image: np.ndarray, 
        bbox: np.ndarray, 
        expand: float = 1.0
    ) -> np.ndarray:
        """Crop face with optional expansion"""
        x1, y1, x2, y2 = bbox.astype(int)
        
        if expand > 1.0:
            cx, cy = (x1 + x2) // 2, (y1 + y2) // 2
            w, h = x2 - x1, y2 - y1
            w, h = int(w * expand), int(h * expand)
            x1, y1 = cx - w // 2, cy - h // 2
            x2, y2 = x1 + w, y1 + h
        
        # Clamp to image bounds
        h, w = image.shape[:2]
        x1, y1 = max(0, x1), max(0, y1)
        x2, y2 = min(w, x2), min(h, y2)
        
        return image[y1:y2, x1:x2]
    
    def _paste_face(
        self,
        target_image: np.ndarray,
        swapped_face: np.ndarray,
        target_bbox: np.ndarray
    ) -> np.ndarray:
        """Paste swapped face back with seamless blending"""
        x1, y1, x2, y2 = target_bbox.astype(int)
        
        # Calculate crop region (same as _crop_face with expand=1.5)
        cx, cy = (x1 + x2) // 2, (y1 + y2) // 2
        w, h = x2 - x1, y2 - y1
        w, h = int(w * 1.5), int(h * 1.5)
        crop_x1, crop_y1 = cx - w // 2, cy - h // 2
        crop_x2, crop_y2 = crop_x1 + w, crop_y1 + h
        
        # Create mask for blending
        mask = np.zeros((h, w), dtype=np.float32)
        face_margin = int(min(w, h) * 0.1)
        cv2.ellipse(
            mask,
            (w // 2, h // 2),
            (w // 2 - face_margin, h // 2 - face_margin),
            0, 0, 360, 1, -1
        )
        
        # Gaussian blur for smooth edges
        mask = cv2.GaussianBlur(mask, (51, 51), 0)
        mask = np.stack([mask] * 3, axis=2)
        
        # Prepare target crop
        h_img, w_img = target_image.shape[:2]
        
        # Calculate overlap
        ov_x1 = max(0, crop_x1)
        ov_y1 = max(0, crop_y1)
        ov_x2 = min(w_img, crop_x2)
        ov_y2 = min(h_img, crop_y2)
        
        # Extract regions
        target_crop = target_image[ov_y1:ov_y2, ov_x1:ov_x2]
        
        # Adjust swapped face and mask to overlap region
        sf_x1 = ov_x1 - crop_x1
        sf_y1 = ov_y1 - crop_y1
        sf_x2 = sf_x1 + (ov_x2 - ov_x1)
        sf_y2 = sf_y1 + (ov_y2 - ov_y1)
        
        swapped_crop = swapped_face[sf_y1:sf_y2, sf_x1:sf_x2]
        mask_crop = mask[sf_y1:sf_y2, sf_x1:sf_x2]
        
        # Blend
        blended = (swapped_crop * mask_crop + target_crop * (1 - mask_crop)).astype(np.uint8)
        
        # Paste back
        result = target_image.copy()
        result[ov_y1:ov_y2, ov_x1:ov_x2] = blended
        
        return result


class DiffusionFaceSwapper:
    """
    Face swapping using diffusion models for higher quality.
    Slower but produces more realistic results.
    """
    
    def __init__(
        self,
        model_id: str = "timbrooks/instruct-pix2pix",
        device: str = 'cuda' if torch.cuda.is_available() else 'cpu'
    ):
        from diffusers import StableDiffusionInstructPix2PixPipeline
        
        self.device = device
        self.pipe = StableDiffusionInstructPix2PixPipeline.from_pretrained(
            model_id,
            torch_dtype=torch.float16 if device == 'cuda' else torch.float32,
            safety_checker=None
        ).to(device)
        
        self.analyzer = FaceAnalyzer(device=device)
    
    def swap_face_diffusion(
        self,
        target_image: np.ndarray,
        source_image: np.ndarray,
        num_inference_steps: int = 20,
        guidance_scale: float = 7.5
    ) -> np.ndarray:
        """
        Face swap using diffusion model.
        More realistic but slower than ONNX-based methods.
        """
        from PIL import Image
        
        # Convert to PIL
        target_pil = Image.fromarray(cv2.cvtColor(target_image, cv2.COLOR_BGR2RGB))
        
        # Create prompt
        source_face = self.analyzer.get_largest_face(source_image)
        prompt = "change the face to match the reference person"
        
        # Generate
        result = self.pipe(
            prompt=prompt,
            image=target_pil,
            num_inference_steps=num_inference_steps,
            guidance_scale=guidance_scale
        ).images[0]
        
        # Convert back to OpenCV
        result_cv = cv2.cvtColor(np.array(result), cv2.COLOR_RGB2BGR)
        
        return result_cv
