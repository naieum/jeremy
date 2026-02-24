# Real-Time Face Swap System

A production-ready, real-time face swapping system using state-of-the-art AI models. Optimized for streaming with GPU acceleration and cost-effective training.

![Face Swap Demo](demo.gif)

## Features

- **Real-time Face Swapping**: 30+ FPS on modern GPUs using optimized ONNX models
- **Background Removal**: Multiple segmentation modes (MediaPipe, MODNet, BRIA RMBG-2)
- **Diffusion Model Integration**: High-quality face generation with LoRA fine-tuning
- **Cost-Effective Training**: Train custom face models for ~$10-100
- **WebRTC Streaming**: Browser-based real-time streaming support
- **REST API**: Easy integration with existing applications

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   Webcam    │────▶│ Face Analyzer │────▶│ Face Swap  │
│   / Video   │     │ (InsightFace) │     │  (ONNX)    │
└─────────────┘     └──────────────┘     └──────┬──────┘
                                                 │
┌─────────────┐     ┌──────────────┐            ▼
│   Output    │◀────│  BG Removal  │◀────┌──────────┐
│  Stream/UI  │     │  (MediaPipe) │     │ Enhanced │
└─────────────┘     └──────────────┘     │  Result  │
                                         └──────────┘
```

## Quick Start

### Installation

```bash
# Clone and setup
cd packages/face-swap

# Create virtual environment
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Download models (automatic on first run, or manual)
python -c "from src.models.face_analyzer import FaceAnalyzer; FaceAnalyzer()"
```

### Basic Usage

```bash
# Webcam demo
python face_swap_demo.py --source path/to/face.jpg

# Process image
python face_swap_cli.py process -s source.jpg -i target.jpg -o result.jpg

# Process video
python face_swap_cli.py process -s source.jpg -i video.mp4 -o output.mp4 --remove-bg

# Start API server
python face_swap_cli.py server --port 8000
```

### Python API

```python
from src.pipeline.realtime_pipeline import RealtimeFaceSwapPipeline, PipelineConfig
import cv2

# Initialize
config = PipelineConfig(target_fps=30, remove_bg=True)
pipeline = RealtimeFaceSwapPipeline(config)

# Set source face
source = cv2.imread('source_face.jpg')
pipeline.set_source_face(source)

# Process frames
cap = cv2.VideoCapture(0)
while True:
    ret, frame = cap.read()
    result = pipeline.process_frame(frame)
    cv2.imshow('Face Swap', result)
```

## Training Custom Faces

### Option 1: Embedding Refiner (~$5, 10 minutes)

Fast training for real-time face swapping:

```bash
# Prepare 20-50 photos of the target person
python face_swap_cli.py train \
    --images ./my_photos \
    --epochs 100 \
    --output ./models/my_face
```

### Option 2: LoRA for Diffusion (~$30, 30-60 minutes)

Higher quality for diffusion-based generation:

```bash
python face_swap_cli.py train \
    --images ./my_photos \
    --lora \
    --epochs 800 \
    --prompt "photo of zwx person"
```

### Cost Estimation

```bash
python face_swap_cli.py train --estimate --num-images 50
```

## API Endpoints

### REST API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/source-face` | POST | Upload source face |
| `/swap-image` | POST | Swap face in image |
| `/settings` | POST | Update pipeline settings |
| `/training/start` | POST | Start training job |

### WebSocket Streaming

```javascript
const ws = new WebSocket('ws://localhost:8000/ws/stream');

// Send frame
ws.send(JSON.stringify({
    type: 'frame',
    image: 'data:image/jpeg;base64,...'
}));

// Receive result
ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    imgElement.src = data.image;
};
```

## Performance

| Hardware | Resolution | FPS | Latency |
|----------|-----------|-----|---------|
| RTX 4090 | 1280x720 | 60+ | ~16ms |
| RTX 3080 | 1280x720 | 45+ | ~22ms |
| RTX 3060 | 1280x720 | 30+ | ~33ms |
| Apple M2 | 1280x720 | 25+ | ~40ms |
| CPU Only | 640x480 | 10+ | ~100ms |

## Models

| Model | Size | Purpose | Speed |
|-------|------|---------|-------|
| `buffalo_l` | 326MB | Detection + Recognition | Fast |
| `inswapper_128.onnx` | 258MB | Face Swapping | Fast |
| `modnet_photographic` | 25MB | Portrait Matting | Medium |
| `bria-rmbg-2` | 380MB | Background Removal | Slow |

## Configuration

### PipelineConfig

```python
from src.pipeline.realtime_pipeline import PipelineConfig
from src.models.background_removal import SegmentationMode

config = PipelineConfig(
    # Face detection
    det_size=(320, 320),      # Smaller = faster
    det_thresh=0.5,           # Detection threshold
    
    # Face swap
    swap_model='./models/inswapper_128.onnx',
    enhance_face=False,       # Face enhancement (slower)
    
    # Background
    remove_bg=True,
    bg_mode=SegmentationMode.MEDIAPIPE,  # or REMBG, MODNET, RMBG2
    blur_bg=False,
    
    # Performance
    target_fps=30,
    frame_skip=0,             # Skip every N frames
    async_processing=True
)
```

## Development

```bash
# Install dev dependencies
pip install -e ".[dev]"

# Run tests
pytest tests/

# Type checking
mypy src/

# Format code
black src/
isort src/
```

## Docker

```bash
# Build
docker build -t face-swap .

# Run with GPU
docker run --gpus all -p 8000:8000 face-swap

# Run CPU only
docker run -p 8000:8000 face-swap
```

## Troubleshooting

### Low FPS
- Reduce `det_size` to (256, 256) or (160, 160)
- Enable `frame_skip=1` or `frame_skip=2`
- Disable face enhancement
- Use MediaPipe instead of MODNet for background removal

### Face Not Detected
- Ensure good lighting on source face
- Face should be front-facing
- Try different `det_thresh` values

### CUDA Out of Memory
- Use smaller `det_size`
- Process at lower resolution
- Enable `async_processing=False`

## License

MIT License - See LICENSE file

## Acknowledgments

- [InsightFace](https://github.com/deepinsight/insightface) - Face detection and recognition
- [SimSwap](https://github.com/neuralchen/SimSwap) - Face swapping
- [CodeFormer](https://github.com/sczhou/CodeFormer) - Face restoration
- [MODNet](https://github.com/ZHKKKe/MODNet) - Portrait matting
- [BRIA AI](https://bria.ai/) - Background removal
