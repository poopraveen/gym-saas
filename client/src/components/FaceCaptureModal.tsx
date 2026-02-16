import React, { useState, useEffect, useRef } from 'react';
import { loadFaceModels, getDescriptorFromVideo } from '../utils/faceRecognition';
import './FaceCaptureModal.css';

type Props = {
  onCapture: (descriptor: number[]) => void;
  onClose: () => void;
  title?: string;
  captureButtonLabel?: string;
  /** Shown in watermark after successful recognition (e.g. "Recognized" or "Welcome!") */
  successWatermarkText?: string;
};

const SUCCESS_DISPLAY_MS = 1800;

export default function FaceCaptureModal({
  onCapture,
  onClose,
  title = 'Position your face in the frame',
  captureButtonLabel = 'Capture face',
  successWatermarkText = 'Recognized',
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const pendingDescriptorRef = useRef<number[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    const startCamera = async () => {
      try {
        await loadFaceModels();
        if (cancelled) return;
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });
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

  useEffect(() => {
    if (!showSuccess || !pendingDescriptorRef.current) return;
    const t = setTimeout(() => {
      const desc = pendingDescriptorRef.current;
      pendingDescriptorRef.current = null;
      if (desc) onCapture(desc);
      onClose();
    }, SUCCESS_DISPLAY_MS);
    return () => clearTimeout(t);
  }, [showSuccess, onCapture, onClose]);

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
        pendingDescriptorRef.current = descriptor;
        setShowSuccess(true);
      } else {
        setError('No face detected. Look at the camera and try again.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Face detection failed');
    } finally {
      setCapturing(false);
    }
  };

  if (showSuccess) {
    return (
      <div className="face-capture-overlay face-capture-overlay--fullscreen" role="dialog" aria-modal="true" aria-label="Face recognized">
        <div className="face-capture-success-watermark">
          <span className="face-capture-success-check">✓</span>
          <span className="face-capture-success-text">{successWatermarkText}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="face-capture-overlay face-capture-overlay--fullscreen" role="dialog" aria-modal="true" aria-label="Face capture">
      <div className="face-capture-video-container">
        <video ref={videoRef} className="face-capture-video face-capture-video--fullscreen" playsInline muted />
      </div>
      <div className="face-capture-header face-capture-header--overlay">
        <h3>{title}</h3>
        <button type="button" className="face-capture-close" onClick={onClose} aria-label="Close">&times;</button>
      </div>
      <div className="face-capture-video-wrap face-capture-video-wrap--fullscreen">
        {loading && <p className="face-capture-loading">Loading camera and face model…</p>}
        {!loading && !error && (
          <p className="face-capture-look-hint">
            <span className="face-capture-look-hint-icon">👁</span>
            <span className="face-capture-look-hint-text">Look at the camera</span>
          </p>
        )}
      </div>
      {error && <p className="face-capture-error face-capture-error--overlay">{error}</p>}
      <div className="face-capture-actions face-capture-actions--overlay">
        <button type="button" className="face-capture-btn face-capture-btn-capture" onClick={handleCapture} disabled={loading || capturing}>
          {capturing ? 'Detecting…' : captureButtonLabel}
        </button>
        <button type="button" className="face-capture-btn face-capture-btn-cancel" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}
