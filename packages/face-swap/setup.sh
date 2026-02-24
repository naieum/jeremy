#!/bin/bash
# Setup script for face-swap-realtime

set -e

echo "========================================"
echo "Face Swap Real-time Setup"
echo "========================================"

# Check Python version
PYTHON_VERSION=$(python3 --version 2>&1 | awk '{print $2}')
echo "Python version: $PYTHON_VERSION"

# Create virtual environment
echo ""
echo "Creating virtual environment..."
python3 -m venv venv

# Activate
source venv/bin/activate

# Upgrade pip
echo ""
echo "Upgrading pip..."
pip install --upgrade pip

# Install PyTorch (CPU or CUDA)
echo ""
echo "Select PyTorch version:"
echo "1) CPU only (slower, no GPU required)"
echo "2) CUDA 11.8 (NVIDIA GPU)"
echo "3) CUDA 12.1 (NVIDIA GPU)"
read -p "Choice [1-3]: " torch_choice

case $torch_choice in
    1)
        echo "Installing PyTorch (CPU)..."
        pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
        ;;
    2)
        echo "Installing PyTorch (CUDA 11.8)..."
        pip install torch torchvision --index-url https://download.pytorch.org/whl/cu118
        pip install onnxruntime-gpu
        ;;
    3)
        echo "Installing PyTorch (CUDA 12.1)..."
        pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121
        pip install onnxruntime-gpu
        ;;
    *)
        echo "Invalid choice, defaulting to CPU"
        pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
        ;;
esac

# Install other requirements
echo ""
echo "Installing dependencies..."
pip install -r requirements.txt

# Create models directory
echo ""
echo "Creating models directory..."
mkdir -p models

# Download InsightFace models
echo ""
echo "Downloading InsightFace models..."
python3 << 'PYTHON_EOF'
import os
import urllib.request
import zipfile
from pathlib import Path

models_dir = Path('models')
models_dir.mkdir(exist_ok=True)

# Download buffalo_l model
buffalo_url = 'https://github.com/deepinsight/insightface/releases/download/v0.7/buffalo_l.zip'
buffalo_zip = models_dir / 'buffalo_l.zip'

if not (models_dir / 'buffalo_l').exists():
    print(f"Downloading {buffalo_url}...")
    urllib.request.urlretrieve(buffalo_url, buffalo_zip)
    
    print("Extracting...")
    with zipfile.ZipFile(buffalo_zip, 'r') as zip_ref:
        zip_ref.extractall(models_dir)
    
    buffalo_zip.unlink()
    print("buffalo_l model ready!")
else:
    print("buffalo_l model already exists")

# Download inswapper model
inswapper_url = 'https://github.com/facefusion/facefusion-assets/releases/download/models/inswapper_128.onnx'
inswapper_path = models_dir / 'inswapper_128.onnx'

if not inswapper_path.exists():
    print(f"Downloading {inswapper_url}...")
    urllib.request.urlretrieve(inswapper_url, inswapper_path)
    print("inswapper_128 model ready!")
else:
    print("inswapper_128 model already exists")

print("\nAll models downloaded!")
PYTHON_EOF

# Create sample directories
echo ""
echo "Creating sample directories..."
mkdir -p samples/source
mkdir -p samples/target
mkdir -p samples/output
mkdir -p trained_models

# Make scripts executable
echo ""
echo "Setting up scripts..."
chmod +x face_swap_demo.py
chmod +x face_swap_cli.py

# Test import
echo ""
echo "Testing installation..."
python3 -c "
import sys
sys.path.insert(0, 'src')
try:
    from models.face_analyzer import FaceAnalyzer
    print('✓ face_analyzer module imported successfully')
except Exception as e:
    print(f'✗ face_analyzer import failed: {e}')

try:
    from pipeline.realtime_pipeline import RealtimeFaceSwapPipeline
    print('✓ realtime_pipeline module imported successfully')
except Exception as e:
    print(f'✗ realtime_pipeline import failed: {e}')
"

echo ""
echo "========================================"
echo "Setup Complete!"
echo "========================================"
echo ""
echo "To activate the environment:"
echo "  source venv/bin/activate"
echo ""
echo "Quick start:"
echo "  # Webcam demo:"
echo "  python face_swap_demo.py --source samples/source/face.jpg"
echo ""
echo "  # Process image:"
echo "  python face_swap_cli.py process -s source.jpg -i target.jpg -o result.jpg"
echo ""
echo "  # Start API server:"
echo "  python face_swap_cli.py server --port 8000"
echo ""
