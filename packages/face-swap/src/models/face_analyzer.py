"""
Face Analysis Module using InsightFace
Provides face detection, alignment, and embedding extraction.
"""
import cv2
import numpy as np
import torch
from typing import List, Dict, Tuple, Optional
from dataclasses import dataclass
from pathlib import Path

import insightface
from insightface.app import FaceAnalysis


@dataclass
class FaceData:
    """Container for face detection results"""
    bbox: np.ndarray  # [x1, y1, x2, y2]
    kps: np.ndarray   # 5 keypoints
    det_score: float
    embedding: Optional[np.ndarray] = None
    age: Optional[int] = None
    gender: Optional[str] = None
    aligned_face: Optional[np.ndarray] = None


class FaceAnalyzer:
    """
    High-performance face analysis using InsightFace.
    Supports multiple detection models: retinaface, scrfd, etc.
    """
    
    def __init__(
        self,
        model_name: str = 'buffalo_l',  # buffalo_l, buffalo_m, buffalo_s, antelopev2
        root: str = './models',
        device: str = 'cuda' if torch.cuda.is_available() else 'cpu',
        det_size: Tuple[int, int] = (640, 640)
    ):
        self.device = device
        self.det_size = det_size
        
        # Initialize FaceAnalysis
        self.app = FaceAnalysis(
            name=model_name,
            root=root,
            providers=['CUDAExecutionProvider', 'CPUExecutionProvider'] if device == 'cuda' else ['CPUExecutionProvider']
        )
        self.app.prepare(ctx_id=0 if device == 'cuda' else -1, det_size=det_size)
        
        print(f"FaceAnalyzer initialized with {model_name} on {device}")
    
    def detect_faces(
        self, 
        image: np.ndarray,
        det_thresh: float = 0.5,
        max_num: int = 0
    ) -> List[FaceData]:
        """
        Detect faces in image.
        
        Args:
            image: BGR image (OpenCV format)
            det_thresh: Detection threshold
            max_num: Maximum faces to detect (0 = unlimited)
            
        Returns:
            List of FaceData objects
        """
        faces = self.app.get(image)
        
        # Filter by confidence and sort by detection score
        faces = [f for f in faces if f.det_score >= det_thresh]
        faces = sorted(faces, key=lambda x: x.det_score, reverse=True)
        
        if max_num > 0:
            faces = faces[:max_num]
        
        # Convert to FaceData
        results = []
        for face in faces:
            face_data = FaceData(
                bbox=face.bbox.astype(np.int32),
                kps=face.kps,
                det_score=face.det_score,
                embedding=face.embedding if hasattr(face, 'embedding') else None,
                age=face.age if hasattr(face, 'age') else None,
                gender='Female' if hasattr(face, 'sex') and face.sex == 0 else 'Male' if hasattr(face, 'sex') else None
            )
            results.append(face_data)
        
        return results
    
    def get_largest_face(self, image: np.ndarray, det_thresh: float = 0.5) -> Optional[FaceData]:
        """Get the largest face in the image"""
        faces = self.detect_faces(image, det_thresh)
        if not faces:
            return None
        
        # Calculate face areas
        largest_face = max(faces, key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]))
        return largest_face
    
    def align_face(
        self, 
        image: np.ndarray, 
        face: FaceData,
        output_size: int = 512
    ) -> np.ndarray:
        """
        Align face using 5 keypoints.
        
        Args:
            image: Source image
            face: FaceData with keypoints
            output_size: Output image size
            
        Returns:
            Aligned face image
        """
        dst = np.array([
            [38.2946, 51.6963],
            [73.5318, 51.5014],
            [56.0252, 71.7366],
            [41.5493, 92.3655],
            [70.7299, 92.2041]
        ], dtype=np.float32)
        
        if output_size != 112:
            dst[:, 0] += 8
            dst *= (output_size / 112.0)
        
        # Get transformation matrix
        src = face.kps.astype(np.float32)
        M = cv2.estimateAffinePartial2D(src, dst, method=cv2.LMEDS)[0]
        
        # Apply transformation
        aligned = cv2.warpAffine(image, M, (output_size, output_size), borderValue=0.0)
        
        return aligned
    
    def get_face_embedding(self, image: np.ndarray, face: FaceData) -> np.ndarray:
        """Extract face embedding/recognition features"""
        if face.embedding is not None:
            return face.embedding
        
        # Align face first
        aligned = self.align_face(image, face, output_size=112)
        
        # Get embedding using recognition model
        # This is handled internally by FaceAnalysis
        faces = self.app.get(aligned)
        if faces:
            return faces[0].embedding
        
        return None
    
    def compute_similarity(self, emb1: np.ndarray, emb2: np.ndarray) -> float:
        """Compute cosine similarity between two embeddings"""
        return np.dot(emb1, emb2) / (np.linalg.norm(emb1) * np.linalg.norm(emb2))
    
    def draw_faces(self, image: np.ndarray, faces: List[FaceData]) -> np.ndarray:
        """Draw face bounding boxes and landmarks on image"""
        result = image.copy()
        
        for i, face in enumerate(faces):
            # Draw bbox
            x1, y1, x2, y2 = face.bbox
            cv2.rectangle(result, (x1, y1), (x2, y2), (0, 255, 0), 2)
            
            # Draw keypoints
            for kp in face.kps:
                cv2.circle(result, tuple(kp.astype(int)), 3, (0, 0, 255), -1)
            
            # Draw score
            score_text = f"{face.det_score:.2f}"
            if face.age:
                score_text += f" A:{face.age}"
            if face.gender:
                score_text += f" {face.gender[0]}"
            
            cv2.putText(result, score_text, (x1, y1 - 10),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)
        
        return result


class FaceMatcher:
    """Match faces across frames for tracking"""
    
    def __init__(self, similarity_threshold: float = 0.5):
        self.threshold = similarity_threshold
        self.known_faces: Dict[int, np.ndarray] = {}
        self.next_id = 0
    
    def match_face(self, embedding: np.ndarray) -> int:
        """
        Match face embedding to known faces.
        Returns face ID.
        """
        best_match = None
        best_score = -1
        
        for face_id, known_emb in self.known_faces.items():
            score = np.dot(embedding, known_emb) / (np.linalg.norm(embedding) * np.linalg.norm(known_emb))
            if score > best_score:
                best_score = score
                best_match = face_id
        
        if best_score > self.threshold:
            # Update embedding (moving average)
            self.known_faces[best_match] = 0.7 * self.known_faces[best_match] + 0.3 * embedding
            return best_match
        else:
            # New face
            face_id = self.next_id
            self.known_faces[face_id] = embedding
            self.next_id += 1
            return face_id
    
    def reset(self):
        """Reset all known faces"""
        self.known_faces.clear()
        self.next_id = 0
