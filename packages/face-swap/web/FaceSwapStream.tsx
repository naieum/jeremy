/**
 * React Component for Real-time Face Swap Streaming
 * Integrates with the FastAPI backend via WebSocket
 */
import React, { useRef, useState, useEffect, useCallback } from 'react';

interface FaceSwapStreamProps {
  apiUrl?: string;
  wsUrl?: string;
  width?: number;
  height?: number;
}

interface StreamState {
  isStreaming: boolean;
  isSourceSet: boolean;
  fps: number;
  error: string | null;
}

export const FaceSwapStream: React.FC<FaceSwapStreamProps> = ({
  apiUrl = 'http://localhost:8000',
  wsUrl = 'ws://localhost:8000/ws/stream',
  width = 1280,
  height = 720,
}) => {
  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const outputCanvasRef = useRef<HTMLCanvasElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const frameIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const sourceImageRef = useRef<string | null>(null);

  // State
  const [state, setState] = useState<StreamState>({
    isStreaming: false,
    isSourceSet: false,
    fps: 0,
    error: null,
  });
  const [settings, setSettings] = useState({
    removeBg: false,
    blurBg: false,
    enhance: false,
    targetFps: 30,
  });

  // Initialize WebSocket
  const connectWebSocket = useCallback(() => {
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('WebSocket connected');
      setState((prev) => ({ ...prev, error: null }));
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === 'frame') {
        // Display processed frame
        const img = new Image();
        img.onload = () => {
          const canvas = outputCanvasRef.current;
          if (canvas) {
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(img, 0, 0, width, height);
            }
          }
        };
        img.src = data.image;

        // Update FPS
        setState((prev) => ({ ...prev, fps: data.fps }));
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      setState((prev) => ({ ...prev, error: 'WebSocket connection failed' }));
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected');
      setState((prev) => ({ ...prev, isStreaming: false }));
    };

    wsRef.current = ws;
  }, [wsUrl, width, height]);

  // Start camera
  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width,
          height,
          frameRate: settings.targetFps,
        },
        audio: false,
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      setState((prev) => ({ ...prev, isStreaming: true }));
      connectWebSocket();
    } catch (err) {
      setState((prev) => ({
        ...prev,
        error: 'Failed to access camera: ' + (err as Error).message,
      }));
    }
  }, [width, height, settings.targetFps, connectWebSocket]);

  // Stop camera
  const stopCamera = useCallback(() => {
    if (videoRef.current?.srcObject) {
      const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
      tracks.forEach((track) => track.stop());
    }

    if (wsRef.current) {
      wsRef.current.close();
    }

    if (frameIntervalRef.current) {
      clearInterval(frameIntervalRef.current);
    }

    setState((prev) => ({ ...prev, isStreaming: false }));
  }, []);

  // Send frame to server
  const sendFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ws = wsRef.current;

    if (!video || !canvas || !ws || ws.readyState !== WebSocket.OPEN) {
      return;
    }

    // Draw video frame to canvas
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, width, height);

    // Compress and send
    const jpegQuality = 0.85;
    const dataUrl = canvas.toDataURL('image/jpeg', jpegQuality);

    ws.send(
      JSON.stringify({
        type: 'frame',
        image: dataUrl,
      })
    );
  }, [width, height]);

  // Start/stop frame capture
  useEffect(() => {
    if (state.isStreaming) {
      const interval = 1000 / settings.targetFps;
      frameIntervalRef.current = setInterval(sendFrame, interval);
    } else {
      if (frameIntervalRef.current) {
        clearInterval(frameIntervalRef.current);
      }
    }

    return () => {
      if (frameIntervalRef.current) {
        clearInterval(frameIntervalRef.current);
      }
    };
  }, [state.isStreaming, settings.targetFps, sendFrame]);

  // Upload source face
  const handleSourceUpload = async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch(`${apiUrl}/source-face`, {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        // Store preview
        const reader = new FileReader();
        reader.onloadend = () => {
          sourceImageRef.current = reader.result as string;
        };
        reader.readAsDataURL(file);

        setState((prev) => ({ ...prev, isSourceSet: true }));
      } else {
        const error = await response.json();
        setState((prev) => ({ ...prev, error: error.error }));
      }
    } catch (err) {
      setState((prev) => ({
        ...prev,
        error: 'Failed to upload source face',
      }));
    }
  };

  // Update settings
  const updateSettings = async (newSettings: Partial<typeof settings>) => {
    const updated = { ...settings, ...newSettings };
    setSettings(updated);

    // Send to server
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'settings',
          settings: {
            target_fps: updated.targetFps,
          },
        })
      );
    }
  };

  return (
    <div className="face-swap-stream">
      <style>{`
        .face-swap-stream {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          padding: 1rem;
          font-family: system-ui, -apple-system, sans-serif;
        }
        .video-container {
          position: relative;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1rem;
        }
        .video-box {
          position: relative;
          background: #000;
          border-radius: 8px;
          overflow: hidden;
        }
        .video-box video,
        .video-box canvas {
          width: 100%;
          height: auto;
          display: block;
        }
        .video-label {
          position: absolute;
          top: 8px;
          left: 8px;
          background: rgba(0, 0, 0, 0.7);
          color: white;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 12px;
        }
        .controls {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          padding: 1rem;
          background: #f5f5f5;
          border-radius: 8px;
        }
        .control-row {
          display: flex;
          gap: 1rem;
          align-items: center;
          flex-wrap: wrap;
        }
        .button {
          padding: 0.5rem 1rem;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
          transition: background 0.2s;
        }
        .button-primary {
          background: #0066cc;
          color: white;
        }
        .button-primary:hover {
          background: #0052a3;
        }
        .button-danger {
          background: #dc3545;
          color: white;
        }
        .button-danger:hover {
          background: #c82333;
        }
        .button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .file-input {
          display: none;
        }
        .file-label {
          padding: 0.5rem 1rem;
          background: #28a745;
          color: white;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
        }
        .file-label:hover {
          background: #218838;
        }
        .checkbox-group {
          display: flex;
          gap: 1rem;
          align-items: center;
        }
        .checkbox-label {
          display: flex;
          align-items: center;
          gap: 0.25rem;
          cursor: pointer;
        }
        .stats {
          display: flex;
          gap: 1rem;
          font-size: 14px;
        }
        .stat {
          padding: 0.25rem 0.5rem;
          background: #e9ecef;
          border-radius: 4px;
        }
        .error {
          padding: 0.75rem;
          background: #f8d7da;
          color: #721c24;
          border-radius: 4px;
        }
        .source-preview {
          width: 100px;
          height: 100px;
          object-fit: cover;
          border-radius: 4px;
          border: 2px solid #28a745;
        }
      `}</style>

      {/* Error display */}
      {state.error && <div className="error">{state.error}</div>}

      {/* Video containers */}
      <div className="video-container">
        <div className="video-box">
          <span className="video-label">Camera Input</span>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            width={width}
            height={height}
          />
        </div>
        <div className="video-box">
          <span className="video-label">Face Swap Output</span>
          <canvas
            ref={outputCanvasRef}
            width={width}
            height={height}
          />
        </div>
      </div>

      {/* Hidden canvas for frame capture */}
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        style={{ display: 'none' }}
      />

      {/* Controls */}
      <div className="controls">
        <div className="control-row">
          {/* Source face upload */}
          <input
            type="file"
            id="source-upload"
            className="file-input"
            accept="image/*"
            onChange={(e) => e.target.files?.[0] && handleSourceUpload(e.target.files[0])}
          />
          <label htmlFor="source-upload" className="file-label">
            📷 Upload Source Face
          </label>

          {sourceImageRef.current && (
            <img
              src={sourceImageRef.current}
              alt="Source"
              className="source-preview"
            />
          )}

          {/* Stream controls */}
          <button
            className="button button-primary"
            onClick={startCamera}
            disabled={state.isStreaming || !state.isSourceSet}
          >
            ▶️ Start Stream
          </button>
          <button
            className="button button-danger"
            onClick={stopCamera}
            disabled={!state.isStreaming}
          >
            ⏹️ Stop
          </button>
        </div>

        <div className="control-row">
          {/* Settings */}
          <div className="checkbox-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={settings.removeBg}
                onChange={(e) => updateSettings({ removeBg: e.target.checked })}
              />
              Remove Background
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={settings.blurBg}
                onChange={(e) => updateSettings({ blurBg: e.target.checked })}
              />
              Blur Background
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={settings.enhance}
                onChange={(e) => updateSettings({ enhance: e.target.checked })}
              />
              Enhance Face
            </label>
          </div>

          {/* FPS selector */}
          <label>
            Target FPS:
            <select
              value={settings.targetFps}
              onChange={(e) => updateSettings({ targetFps: Number(e.target.value) })}
              style={{ marginLeft: '0.5rem' }}
            >
              <option value={15}>15</option>
              <option value={30}>30</option>
              <option value={60}>60</option>
            </select>
          </label>
        </div>

        {/* Stats */}
        <div className="stats">
          <span className="stat">FPS: {state.fps.toFixed(1)}</span>
          <span className="stat">
            Status: {state.isStreaming ? '🟢 Streaming' : '🔴 Stopped'}
          </span>
          <span className="stat">
            Source: {state.isSourceSet ? '✅ Set' : '❌ Not Set'}
          </span>
        </div>
      </div>
    </div>
  );
};

export default FaceSwapStream;
