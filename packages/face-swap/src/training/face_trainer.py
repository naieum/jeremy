"""
Face Model Training Pipeline
Train custom face embeddings and LoRA adapters for diffusion models.
Cost-effective training (~$100) using LoRA and dreambooth techniques.
"""
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import Dataset, DataLoader
import numpy as np
import cv2
from pathlib import Path
from typing import List, Dict, Optional, Tuple
import json
from tqdm import tqdm
import os

from ..models.face_analyzer import FaceAnalyzer


class FaceDataset(Dataset):
    """Dataset for face training"""
    
    def __init__(
        self,
        image_paths: List[Path],
        analyzer: FaceAnalyzer,
        image_size: int = 512,
        augment: bool = True
    ):
        self.image_paths = image_paths
        self.analyzer = analyzer
        self.image_size = image_size
        self.augment = augment
        
        # Preprocess: detect and align faces
        self.samples = []
        self._preprocess()
    
    def _preprocess(self):
        """Preprocess all images to extract faces"""
        print(f"Preprocessing {len(self.image_paths)} images...")
        
        for img_path in tqdm(self.image_paths):
            img = cv2.imread(str(img_path))
            if img is None:
                continue
            
            # Detect face
            face = self.analyzer.get_largest_face(img)
            if face is None:
                continue
            
            # Align face
            aligned = self.analyzer.align_face(img, face, output_size=self.image_size)
            
            # Convert to RGB tensor
            aligned_rgb = cv2.cvtColor(aligned, cv2.COLOR_BGR2RGB)
            tensor = torch.from_numpy(aligned_rgb).float() / 255.0
            tensor = tensor.permute(2, 0, 1)  # HWC -> CHW
            
            self.samples.append({
                'image': tensor,
                'embedding': torch.from_numpy(face.embedding) if face.embedding is not None else None,
                'path': str(img_path)
            })
        
        print(f"Loaded {len(self.samples)} valid face samples")
    
    def __len__(self):
        return len(self.samples)
    
    def __getitem__(self, idx):
        sample = self.samples[idx]
        
        image = sample['image']
        
        # Augmentation
        if self.augment:
            # Random horizontal flip
            if torch.rand(1) > 0.5:
                image = torch.flip(image, dims=[2])
            
            # Random color jitter
            if torch.rand(1) > 0.5:
                image = self._color_jitter(image)
            
            # Random noise
            if torch.rand(1) > 0.8:
                noise = torch.randn_like(image) * 0.02
                image = torch.clamp(image + noise, 0, 1)
        
        return {
            'image': image,
            'embedding': sample['embedding'],
            'path': sample['path']
        }
    
    def _color_jitter(self, image: torch.Tensor, brightness: float = 0.1, contrast: float = 0.1) -> torch.Tensor:
        """Apply color jittering"""
        # Brightness
        if torch.rand(1) > 0.5:
            factor = 1.0 + torch.randn(1).item() * brightness
            image = torch.clamp(image * factor, 0, 1)
        
        # Contrast
        if torch.rand(1) > 0.5:
            factor = 1.0 + torch.randn(1).item() * contrast
            mean = image.mean()
            image = torch.clamp((image - mean) * factor + mean, 0, 1)
        
        return image


class EmbeddingRefiner(nn.Module):
    """
    Refine face embeddings for better identity preservation.
    Small network that adapts base embeddings to specific person.
    """
    
    def __init__(
        self,
        embedding_dim: int = 512,
        hidden_dim: int = 256,
        num_layers: int = 3
    ):
        super().__init__()
        
        layers = []
        in_dim = embedding_dim
        
        for i in range(num_layers):
            out_dim = hidden_dim if i < num_layers - 1 else embedding_dim
            layers.extend([
                nn.Linear(in_dim, out_dim),
                nn.LayerNorm(out_dim),
                nn.ReLU(inplace=True),
                nn.Dropout(0.1)
            ])
            in_dim = out_dim
        
        # Remove last ReLU and dropout
        layers = layers[:-2]
        
        self.mlp = nn.Sequential(*layers)
        
        # Residual scaling
        self.residual_scale = nn.Parameter(torch.ones(1) * 0.1)
    
    def forward(self, embedding: torch.Tensor) -> torch.Tensor:
        """Refine embedding"""
        refined = self.mlp(embedding)
        # Residual connection with learnable scale
        return embedding + self.residual_scale * refined


class FaceTrainer:
    """
    Train custom face models.
    Supports embedding refinement and LoRA for diffusion models.
    """
    
    def __init__(
        self,
        output_dir: str = './trained_models',
        device: str = 'cuda' if torch.cuda.is_available() else 'cpu'
    ):
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.device = device
        
        self.analyzer = FaceAnalyzer(device=device)
        self.embedding_refiner: Optional[EmbeddingRefiner] = None
    
    def prepare_dataset(
        self,
        image_dir: str,
        min_face_size: int = 100,
        output_json: Optional[str] = None
    ) -> List[Path]:
        """
        Prepare training dataset from images.
        Filters for high-quality face images.
        
        Args:
            image_dir: Directory containing images
            min_face_size: Minimum face dimension
            output_json: Save metadata to JSON
            
        Returns:
            List of valid image paths
        """
        image_dir = Path(image_dir)
        image_paths = list(image_dir.glob('*.jpg')) + list(image_dir.glob('*.png'))
        
        valid_paths = []
        metadata = []
        
        print(f"Scanning {len(image_paths)} images...")
        
        for img_path in tqdm(image_paths):
            img = cv2.imread(str(img_path))
            if img is None:
                continue
            
            faces = self.analyzer.detect_faces(img)
            
            for face in faces:
                w = face.bbox[2] - face.bbox[0]
                h = face.bbox[3] - face.bbox[1]
                
                if w >= min_face_size and h >= min_face_size and face.det_score > 0.8:
                    valid_paths.append(img_path)
                    metadata.append({
                        'path': str(img_path),
                        'face_size': [w, h],
                        'confidence': float(face.det_score),
                        'age': face.age,
                        'gender': face.gender
                    })
                    break  # Only count each image once
        
        print(f"Found {len(valid_paths)} valid images")
        
        if output_json:
            with open(output_json, 'w') as f:
                json.dump(metadata, f, indent=2)
        
        return valid_paths
    
    def train_embedding_refiner(
        self,
        image_paths: List[Path],
        num_epochs: int = 100,
        batch_size: int = 8,
        lr: float = 1e-4,
        val_split: float = 0.1
    ) -> EmbeddingRefiner:
        """
        Train embedding refiner for specific person.
        Fast training (~$1-5 in compute).
        
        Args:
            image_paths: List of training images
            num_epochs: Training epochs
            batch_size: Batch size
            lr: Learning rate
            val_split: Validation split ratio
            
        Returns:
            Trained EmbeddingRefiner
        """
        # Split train/val
        num_val = int(len(image_paths) * val_split)
        train_paths = image_paths[num_val:]
        val_paths = image_paths[:num_val]
        
        # Create datasets
        train_dataset = FaceDataset(train_paths, self.analyzer, augment=True)
        val_dataset = FaceDataset(val_paths, self.analyzer, augment=False)
        
        train_loader = DataLoader(train_dataset, batch_size=batch_size, shuffle=True)
        val_loader = DataLoader(val_dataset, batch_size=batch_size)
        
        # Create model
        self.embedding_refiner = EmbeddingRefiner().to(self.device)
        
        # Optimizer
        optimizer = torch.optim.AdamW(
            self.embedding_refiner.parameters(),
            lr=lr,
            weight_decay=1e-5
        )
        
        scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(
            optimizer, T_max=num_epochs
        )
        
        # Loss
        criterion = nn.CosineEmbeddingLoss()
        
        # Training loop
        best_loss = float('inf')
        
        print(f"Training embedding refiner for {num_epochs} epochs...")
        
        for epoch in range(num_epochs):
            # Train
            self.embedding_refiner.train()
            train_loss = 0.0
            
            for batch in tqdm(train_loader, desc=f"Epoch {epoch+1}/{num_epochs}"):
                images = batch['image'].to(self.device)
                embeddings = batch['embedding'].to(self.device)
                
                # Forward
                refined = self.embedding_refiner(embeddings)
                
                # Compute embedding from image (using a pretrained encoder)
                # For simplicity, we use the original embeddings as target
                # In practice, you'd use a face recognition model
                target = embeddings
                
                # Loss - encourage refined embeddings to be consistent
                loss = F.mse_loss(refined, target)
                
                # Backward
                optimizer.zero_grad()
                loss.backward()
                optimizer.step()
                
                train_loss += loss.item()
            
            train_loss /= len(train_loader)
            
            # Validate
            val_loss = self._validate(val_loader, criterion)
            
            scheduler.step()
            
            print(f"Epoch {epoch+1}: train_loss={train_loss:.4f}, val_loss={val_loss:.4f}")
            
            # Save best
            if val_loss < best_loss:
                best_loss = val_loss
                self.save_refiner(self.output_dir / 'embedding_refiner_best.pt')
        
        return self.embedding_refiner
    
    def _validate(self, val_loader: DataLoader, criterion) -> float:
        """Validate model"""
        self.embedding_refiner.eval()
        total_loss = 0.0
        
        with torch.no_grad():
            for batch in val_loader:
                images = batch['image'].to(self.device)
                embeddings = batch['embedding'].to(self.device)
                
                refined = self.embedding_refiner(embeddings)
                loss = F.mse_loss(refined, embeddings)
                
                total_loss += loss.item()
        
        return total_loss / len(val_loader)
    
    def train_lora_diffusion(
        self,
        image_paths: List[Path],
        instance_prompt: str = "photo of zwx person",
        class_prompt: str = "photo of a person",
        num_epochs: int = 800,
        lr: float = 1e-4,
        rank: int = 4,
        use_dreambooth: bool = True
    ):
        """
        Train LoRA for diffusion model (dreambooth style).
        ~$10-50 in compute depending on settings.
        
        Args:
            image_paths: Training images
            instance_prompt: Prompt for instance (e.g., "photo of zwx person")
            class_prompt: General class prompt
            num_epochs: Training iterations
            lr: Learning rate
            rank: LoRA rank (lower = faster, less capacity)
            use_dreambooth: Use prior preservation
        """
        from diffusers import StableDiffusionPipeline, DDPMScheduler
        from peft import LoraConfig, get_peft_model
        
        print("Initializing diffusion model...")
        
        # Load base model
        model_id = "runwayml/stable-diffusion-v1-5"
        pipe = StableDiffusionPipeline.from_pretrained(
            model_id,
            torch_dtype=torch.float16 if self.device == 'cuda' else torch.float32
        ).to(self.device)
        
        # Configure LoRA
        lora_config = LoraConfig(
            r=rank,
            lora_alpha=rank * 2,
            target_modules=["q_proj", "v_proj"],
            lora_dropout=0.1,
            bias="none"
        )
        
        # Apply LoRA to UNet
        pipe.unet = get_peft_model(pipe.unet, lora_config)
        
        # Prepare dataset
        dataset = FaceDataset(image_paths, self.analyzer, image_size=512)
        dataloader = DataLoader(dataset, batch_size=1, shuffle=True)
        
        # Optimizer
        optimizer = torch.optim.AdamW(
            pipe.unet.parameters(),
            lr=lr,
            weight_decay=1e-4
        )
        
        # Training
        print(f"Training LoRA for {num_epochs} epochs...")
        
        for epoch in range(num_epochs):
            pipe.unet.train()
            
            for batch in dataloader:
                images = batch['image'].to(self.device)
                
                # Encode images to latent space
                with torch.no_grad():
                    latents = pipe.vae.encode(images).latent_dist.sample()
                    latents = latents * pipe.vae.config.scaling_factor
                
                # Add noise
                noise = torch.randn_like(latents)
                timesteps = torch.randint(0, pipe.scheduler.config.num_train_timesteps, (1,))
                noisy_latents = pipe.scheduler.add_noise(latents, noise, timesteps)
                
                # Predict noise
                encoder_hidden_states = pipe.text_encoder(
                    pipe.tokenizer(instance_prompt, return_tensors="pt").input_ids.to(self.device)
                )[0]
                
                noise_pred = pipe.unet(noisy_latents, timesteps, encoder_hidden_states).sample
                
                # Compute loss
                loss = F.mse_loss(noise_pred, noise)
                
                # Backward
                optimizer.zero_grad()
                loss.backward()
                optimizer.step()
            
            if (epoch + 1) % 100 == 0:
                print(f"Epoch {epoch+1}/{num_epochs}, Loss: {loss.item():.4f}")
        
        # Save LoRA weights
        save_path = self.output_dir / 'lora_weights.safetensors'
        pipe.unet.save_pretrained(save_path)
        print(f"LoRA weights saved to {save_path}")
    
    def save_refiner(self, path: Path):
        """Save embedding refiner"""
        if self.embedding_refiner is None:
            return
        
        torch.save({
            'model_state_dict': self.embedding_refiner.state_dict(),
            'embedding_dim': 512,
            'hidden_dim': 256,
            'num_layers': 3
        }, path)
        print(f"Refiner saved to {path}")
    
    def load_refiner(self, path: Path) -> EmbeddingRefiner:
        """Load embedding refiner"""
        checkpoint = torch.load(path, map_location=self.device)
        
        self.embedding_refiner = EmbeddingRefiner(
            embedding_dim=checkpoint['embedding_dim'],
            hidden_dim=checkpoint['hidden_dim'],
            num_layers=checkpoint['num_layers']
        ).to(self.device)
        
        self.embedding_refiner.load_state_dict(checkpoint['model_state_dict'])
        self.embedding_refiner.eval()
        
        return self.embedding_refiner


class CostEstimator:
    """Estimate training costs for different configurations"""
    
    PRICING = {
        'rtxa4000': {'hourly': 0.50, 'vram': 16},    # Budget option
        'rtxa5000': {'hourly': 0.80, 'vram': 24},    # Mid-range
        'a100': {'hourly': 2.50, 'vram': 40},        # High-end
        'a100_80gb': {'hourly': 3.50, 'vram': 80},   # Premium
    }
    
    @staticmethod
    def estimate_embedding_training(
        num_images: int,
        gpu: str = 'rtxa4000'
    ) -> Dict[str, float]:
        """Estimate cost for embedding refiner training"""
        # ~1-2 minutes per epoch for 50-100 images
        estimated_hours = max(0.1, num_images / 500)
        cost = estimated_hours * CostEstimator.PRICING[gpu]['hourly']
        
        return {
            'estimated_hours': estimated_hours,
            'estimated_cost_usd': cost,
            'gpu': gpu
        }
    
    @staticmethod
    def estimate_lora_training(
        num_images: int,
        num_steps: int = 800,
        gpu: str = 'rtxa5000'
    ) -> Dict[str, float]:
        """Estimate cost for LoRA training"""
        # ~10-30 minutes for 800 steps
        estimated_hours = num_steps / 1600  # ~30 min for 800 steps
        cost = estimated_hours * CostEstimator.PRICING[gpu]['hourly']
        
        return {
            'estimated_hours': estimated_hours,
            'estimated_cost_usd': cost,
            'gpu': gpu
        }
    
    @staticmethod
    def print_estimates(num_images: int):
        """Print cost estimates for all configurations"""
        print(f"\nTraining Cost Estimates for {num_images} images:\n")
        print("=" * 60)
        
        print("\nEmbedding Refiner (Fast, Good for real-time):")
        for gpu in CostEstimator.PRICING:
            est = CostEstimator.estimate_embedding_training(num_images, gpu)
            print(f"  {gpu}: ${est['estimated_cost_usd']:.2f} ({est['estimated_hours']*60:.0f} min)")
        
        print("\nLoRA Diffusion (Higher quality, Slower):")
        for gpu in CostEstimator.PRICING:
            est = CostEstimator.estimate_lora_training(num_images, 800, gpu)
            print(f"  {gpu}: ${est['estimated_cost_usd']:.2f} ({est['estimated_hours']*60:.0f} min)")
        
        print("\n" + "=" * 60)
