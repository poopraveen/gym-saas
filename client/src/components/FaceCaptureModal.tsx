import React, { useState, useEffect, useRef } from 'react';
import { loadFaceModels, getDescriptorFromVideo } from '../utils/faceRecognition';
import './FaceCaptureModal.css';

type Props = {
  onCapture: (descriptor: number[]) => void;
  onClose: () => void;
  title?: string;
  captureButtonLabel?: string;
};

export default function FaceCaptureModal({ onCapture, onClose, title = 'Position your face in the frame', captureButtonLabel = 'Capture face' }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    const startCamera = async () => {
      try {
        await loadFaceModels();
        if (cancelled) return;
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 640, height: 480 } });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Camera or models failed');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    startCamera();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  const handleCapture = async () => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) {
      setError('Camera not ready. Wait a moment and try again.');
      return;
    }
    setCapturing(true);
    setError(null);
    try {
      const descriptor = await getDescriptorFromVideo(video);
      if (descriptor) {
        onCapture(descriptor);
        onClose();
      } else {
        setError('No face detected. Look at the camera and try again.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Face detection failed');
    } finally {
      setCapturing(false);
    }
  };

  return (
    <div className="face-capture-overlay" role="dialog" aria-modal="true" aria-label="Face capture">
      <div className="face-capture-modal">
        <div className="face-capture-header">
          <h3>{title}</h3>
          <button type="button" className="face-capture-close" onClick={onClose} aria-label="Close">&times;</button>
        </div>
        <div className="face-capture-video-wrap">
          {loading && <p className="face-capture-loading">Loading camera and face model…</p>}
          <video ref={videoRef} className="face-capture-video" playsInline muted width={640} height={480} />
        </div>
        {error && <p className="face-capture-error">{error}</p>}
        <div className="face-capture-actions">
          <button type="button" className="face-capture-btn face-capture-btn-capture" onClick={handleCapture} disabled={loading || capturing}>
            {capturing ? 'Detecting…' : captureButtonLabel}
          </button>
          <button type="button" className="face-capture-btn face-capture-btn-cancel" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
