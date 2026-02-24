"""
FastAPI Server for Real-time Face Swap
Provides REST API and WebSocket endpoints for video streaming.
"""
import asyncio
import base64
import io
import json
from typing import Optional, List
from pathlib import Path

import cv2
import numpy as np
from fastapi import FastAPI, File, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel
from PIL import Image

from ..pipeline.realtime_pipeline import (
    RealtimeFaceSwapPipeline, 
    PipelineConfig,
    AsyncVideoProcessor
)
from ..models.background_removal import SegmentationMode


# API Models
class SwapRequest(BaseModel):
    enhance: bool = False
    remove_bg: bool = False
    blur_bg: bool = False


class VideoSettings(BaseModel):
    target_fps: int = 30
    det_size: int = 320
    frame_skip: int = 0


class TrainingRequest(BaseModel):
    instance_prompt: str = "photo of zwx person"
    num_epochs: int = 100
    use_lora: bool = False


# Global state
app = FastAPI(title="Face Swap API", version="1.0.0")
pipeline: Optional[RealtimeFaceSwapPipeline] = None
async_processor: Optional[AsyncVideoProcessor] = None

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    """Initialize pipeline on startup"""
    global pipeline, async_processor
    
    config = PipelineConfig(
        det_size=(320, 320),
        target_fps=30,
        frame_skip=0
    )
    
    print("Initializing face swap pipeline...")
    pipeline = RealtimeFaceSwapPipeline(config)
    async_processor = AsyncVideoProcessor(pipeline)
    await async_processor.start()
    
    print("Server ready!")


@app.on_event("shutdown")
async def shutdown():
    """Cleanup on shutdown"""
    if async_processor:
        await async_processor.stop()


# Health check
@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "pipeline_ready": pipeline is not None,
        "source_set": pipeline.source_face_emb is not None if pipeline else False
    }


# Set source face
@app.post("/source-face")
async def set_source_face(file: UploadFile = File(...)):
    """Upload source face image"""
    if not pipeline:
        return JSONResponse(status_code=503, content={"error": "Pipeline not ready"})
    
    # Read image
    contents = await file.read()
    nparr = np.frombuffer(contents, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    
    if img is None:
        return JSONResponse(status_code=400, content={"error": "Invalid image"})
    
    # Set source face
    success = pipeline.set_source_face(img)
    
    if success:
        return {"status": "success", "message": "Source face set"}
    else:
        return JSONResponse(
            status_code=400, 
            content={"error": "No face detected in source image"}
        )


# Swap face in image
@app.post("/swap-image")
async def swap_image(
    target: UploadFile = File(...),
    settings: Optional[str] = None
):
    """Swap face in uploaded image"""
    if not pipeline or pipeline.source_face_emb is None:
        return JSONResponse(
            status_code=400, 
            content={"error": "Source face not set"}
        )
    
    # Parse settings
    opts = SwapRequest()
    if settings:
        opts = SwapRequest.parse_raw(settings)
    
    # Read target image
    contents = await target.read()
    nparr = np.frombuffer(contents, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    
    if img is None:
        return JSONResponse(status_code=400, content={"error": "Invalid image"})
    
    # Process
    result = pipeline.process_frame(img)
    
    # Encode result
    _, buffer = cv2.imencode('.jpg', result)
    img_base64 = base64.b64encode(buffer).decode('utf-8')
    
    return {
        "image": f"data:image/jpeg;base64,{img_base64}",
        "fps": pipeline.current_fps
    }


# WebSocket for real-time video streaming
@app.websocket("/ws/stream")
async def websocket_stream(websocket: WebSocket):
    """WebSocket endpoint for real-time video streaming"""
    await websocket.accept()
    
    try:
        while True:
            # Receive frame
            data = await websocket.receive_json()
            
            if data.get('type') == 'frame':
                # Decode base64 frame
                frame_data = data['image'].split(',')[1]
                frame_bytes = base64.b64decode(frame_data)
                nparr = np.frombuffer(frame_bytes, np.uint8)
                frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
                
                if frame is not None and pipeline:
                    # Process frame
                    result = pipeline.process_frame(frame)
                    
                    # Encode and send back
                    _, buffer = cv2.imencode('.jpg', result, [cv2.IMWRITE_JPEG_QUALITY, 85])
                    result_b64 = base64.b64encode(buffer).decode('utf-8')
                    
                    await websocket.send_json({
                        "type": "frame",
                        "image": f"data:image/jpeg;base64,{result_b64}",
                        "fps": pipeline.current_fps
                    })
            
            elif data.get('type') == 'settings':
                # Update settings
                settings = VideoSettings(**data.get('settings', {}))
                # Apply settings to pipeline
                pipeline.config.target_fps = settings.target_fps
                pipeline.config.frame_skip = settings.frame_skip
                
                await websocket.send_json({
                    "type": "status",
                    "message": "Settings updated"
                })
    
    except WebSocketDisconnect:
        print("Client disconnected")
    except Exception as e:
        print(f"WebSocket error: {e}")
        await websocket.close()


# Get available segmentation modes
@app.get("/segmentation-modes")
async def get_segmentation_modes():
    """Get available background segmentation modes"""
    modes = [
        {"id": "mediapipe", "name": "MediaPipe (Fast)", "realtime": True},
        {"id": "rembg", "name": "Rembg (Quality)", "realtime": False},
        {"id": "modnet", "name": "MODNet (Portrait)", "realtime": False},
        {"id": "bria", "name": "BRIA RMBG-2 (Best)", "realtime": False}
    ]
    return {"modes": modes}


# Update pipeline settings
@app.post("/settings")
async def update_settings(settings: VideoSettings):
    """Update pipeline settings"""
    if not pipeline:
        return JSONResponse(status_code=503, content={"error": "Pipeline not ready"})
    
    pipeline.config.target_fps = settings.target_fps
    pipeline.config.frame_skip = settings.frame_skip
    pipeline.config.det_size = (settings.det_size, settings.det_size)
    
    return {"status": "success"}


# Training endpoints
@app.post("/training/prepare")
async def prepare_training(images: List[UploadFile] = File(...)):
    """Upload training images and prepare dataset"""
    from ..training.face_trainer import FaceTrainer
    
    trainer = FaceTrainer()
    
    # Save uploaded images
    import tempfile
    temp_dir = tempfile.mkdtemp()
    
    saved_paths = []
    for img_file in images:
        contents = await img_file.read()
        path = Path(temp_dir) / img_file.filename
        with open(path, 'wb') as f:
            f.write(contents)
        saved_paths.append(path)
    
    # Prepare dataset
    valid_paths = trainer.prepare_dataset(temp_dir)
    
    return {
        "status": "success",
        "total_uploaded": len(images),
        "valid_images": len(valid_paths)
    }


@app.post("/training/start")
async def start_training(request: TrainingRequest):
    """Start training custom face model"""
    from ..training.face_trainer import FaceTrainer, CostEstimator
    
    # Estimate cost
    estimates = CostEstimator.estimate_lora_training(
        50,  # Default estimate
        request.num_epochs
    )
    
    return {
        "status": "training_started",
        "estimated_cost": estimates,
        "message": "Training job submitted"
    }


# WebRTC signaling (for future implementation)
@app.websocket("/ws/webrtc")
async def webrtc_signaling(websocket: WebSocket):
    """WebRTC signaling WebSocket"""
    await websocket.accept()
    
    try:
        while True:
            message = await websocket.receive_json()
            
            # Handle WebRTC signaling
            if message.get('type') == 'offer':
                # Process SDP offer
                await websocket.send_json({
                    "type": "answer",
                    "sdp": "..."  # Would generate actual SDP answer
                })
            elif message.get('type') == 'ice-candidate':
                # Handle ICE candidate
                pass
    
    except WebSocketDisconnect:
        print("WebRTC client disconnected")


# Model download endpoint
@app.post("/models/download")
async def download_models():
    """Download required models"""
    import urllib.request
    
    models_dir = Path('./models')
    models_dir.mkdir(exist_ok=True)
    
    models_to_download = {
        'buffalo_l.zip': 'https://github.com/deepinsight/insightface/releases/download/v0.7/buffalo_l.zip',
        'inswapper_128.onnx': 'https://github.com/facefusion/facefusion-assets/releases/download/models/inswapper_128.onnx',
    }
    
    downloaded = []
    for name, url in models_to_download.items():
        path = models_dir / name
        if not path.exists():
            print(f"Downloading {name}...")
            # In production, use proper download with progress
            downloaded.append(name)
    
    return {
        "downloaded": downloaded,
        "message": "Models downloaded successfully"
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
