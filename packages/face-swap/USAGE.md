# Face Swap Usage Guide

## Quick Start

### 1. Setup
```bash
cd packages/face-swap
./setup.sh
source venv/bin/activate
```

### 2. Run Webcam Demo
```bash
# Place a face photo in samples/source/
python face_swap_demo.py --source samples/source/my_face.jpg
```

Controls:
- `q` - Quit
- `s` - Save screenshot
- `b` - Toggle background removal
- `d` - Toggle debug info

### 3. Process Single Image
```bash
python face_swap_cli.py process \
    -s samples/source/face.jpg \
    -i samples/target/photo.jpg \
    -o samples/output/result.jpg
```

### 4. Process Video
```bash
python face_swap_cli.py process \
    -s samples/source/face.jpg \
    -i samples/target/video.mp4 \
    -o samples/output/result.mp4 \
    --remove-bg
```

### 5. Start API Server
```bash
python face_swap_cli.py server --port 8000
```

Then open `web/demo.html` in a browser or use the React component.

## Training Custom Face Model

### Estimate Costs
```bash
python face_swap_cli.py train --estimate --num-images 50
```

### Prepare Dataset
1. Collect 20-50 photos of the target person
2. Photos should be:
   - Front-facing
   - Good lighting
   - Different expressions
   - Minimum 100x100 pixels face size

### Train Embedding Refiner (Fast)
```bash
python face_swap_cli.py train \
    --images ./my_face_photos \
    --epochs 100 \
    --output ./trained_models/my_face
```

Cost: ~$5, Time: ~10 minutes

### Train LoRA (Higher Quality)
```bash
python face_swap_cli.py train \
    --images ./my_face_photos \
    --lora \
    --epochs 800 \
    --prompt "photo of zwx person"
```

Cost: ~$30, Time: ~30-60 minutes

## Python API Usage

```python
from src.pipeline.realtime_pipeline import RealtimeFaceSwapPipeline, PipelineConfig
import cv2

# Configure
config = PipelineConfig(
    det_size=(320, 320),        # Smaller = faster
    target_fps=30,
    remove_bg=True,             # Enable background removal
    blur_bg=False,
    enhance_face=False          # Face enhancement (slower)
)

# Initialize
pipeline = RealtimeFaceSwapPipeline(config)

# Set source face
source = cv2.imread('source_face.jpg')
pipeline.set_source_face(source)

# Process video
cap = cv2.VideoCapture(0)  # or video file

while True:
    ret, frame = cap.read()
    if not ret:
        break
    
    # Process frame
    result = pipeline.process_frame(frame)
    
    # Add debug info
    result = pipeline.draw_debug_info(result)
    
    # Display
    cv2.imshow('Face Swap', result)
    
    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()
```

## React Component Usage

```tsx
import { FaceSwapStream } from './FaceSwapStream';

function App() {
  return (
    <FaceSwapStream
      apiUrl="http://localhost:8000"
      wsUrl="ws://localhost:8000/ws/stream"
      width={1280}
      height={720}
    />
  );
}
```

## API Endpoints

### Upload Source Face
```bash
curl -X POST -F "file=@source.jpg" http://localhost:8000/source-face
```

### Swap Face in Image
```bash
curl -X POST \
  -F "target=@target.jpg" \
  -F 'settings={"enhance":true}' \
  http://localhost:8000/swap-image
```

### WebSocket Stream
```javascript
const ws = new WebSocket('ws://localhost:8000/ws/stream');

ws.onopen = () => {
  // Send frame
  ws.send(JSON.stringify({
    type: 'frame',
    image: 'data:image/jpeg;base64,...'
  }));
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  // data.image contains processed frame
  // data.fps contains current FPS
};
```

## Performance Tuning

### For Maximum FPS
```python
config = PipelineConfig(
    det_size=(160, 160),    # Smallest detection
    frame_skip=1,           # Process every other frame
    enhance_face=False,     # Disable enhancement
    remove_bg=False         # Disable background removal
)
```

### For Best Quality
```python
config = PipelineConfig(
    det_size=(640, 640),    # Larger detection
    frame_skip=0,           # Process every frame
    enhance_face=True,      # Enable enhancement
    remove_bg=True,         # Enable background removal
    bg_mode=SegmentationMode.RMBG2  # Best quality
)
```

### For Balanced
```python
config = PipelineConfig(
    det_size=(320, 320),
    frame_skip=0,
    enhance_face=False,
    remove_bg=True,
    bg_mode=SegmentationMode.MEDIAPIPE  # Fast
)
```

## Troubleshooting

### Low FPS
1. Reduce `det_size` to (256, 256) or (160, 160)
2. Enable `frame_skip=1` or `frame_skip=2`
3. Disable face enhancement
4. Use MediaPipe instead of MODNet for background removal

### Face Not Detected
1. Check lighting - face should be well-lit
2. Face should be mostly front-facing
3. Try adjusting `det_thresh` (lower = more sensitive)
4. Ensure face is large enough in frame

### CUDA Out of Memory
1. Use smaller `det_size`
2. Process at lower resolution
3. Disable `async_processing`
4. Close other GPU applications

### Blurry Results
1. Use higher quality source face image
2. Enable `enhance_face=True`
3. Use larger `det_size`
4. Ensure source and target have similar angles

## Cloud Deployment

### RunPod / Vast.ai Template
```bash
# Setup on GPU cloud instance
git clone <repo>
cd face-swap
./setup.sh
source venv/bin/activate

# Run server
python face_swap_cli.py server --host 0.0.0.0 --port 8000
```

### Docker
```dockerfile
FROM nvidia/cuda:12.1-devel-ubuntu22.04

WORKDIR /app
COPY . .

RUN apt-get update && apt-get install -y python3-pip libgl1-mesa-glx
RUN ./setup.sh

EXPOSE 8000
CMD ["python", "face_swap_cli.py", "server", "--host", "0.0.0.0"]
```

```bash
docker build -t face-swap .
docker run --gpus all -p 8000:8000 face-swap
```
