import React, { useState, useEffect, useRef } from 'react';
import { loadFaceModels, getDescriptorFromVideo } from '../utils/faceRecognition';
import './FaceCaptureModal.css';

export type FaceCaptureResult = { success: true } | { success: false };

type Props = {
  /** Called with descriptor; return { success: true } to show green and close, { success: false } to show red and stay. */
  onCapture: (descriptor: number[]) => Promise<FaceCaptureResult>;
  onClose: () => void;
  title?: string;
  captureButtonLabel?: string;
  /** Shown in watermark after successful recognition (e.g. "Recognized" or "Welcome!") */
  successWatermarkText?: string;
  /** Message when recognition failed (red state). */
  failureMessage?: string;
  /** When set, capture is sent as image blob (Python fallback). Still validates face presence. */
  onCaptureImage?: (blob: Blob) => Promise<FaceCaptureResult>;
};

const SUCCESS_DISPLAY_MS = 1800;

function videoFrameToBlob(video: HTMLVideoElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      reject(new Error('Canvas context'));
      return;
    }
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('toBlob failed'))),
      'image/jpeg',
      0.92,
    );
  });
}

export default function FaceCaptureModal({
  onCapture,
  onClose,
  title = 'Position your face in the frame',
  captureButtonLabel = 'Capture face',
  successWatermarkText = 'Recognized',
  failureMessage = 'Face not recognized. Gym owner has been notified.',
  onCaptureImage,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [recognitionFailed, setRecognitionFailed] = useState(false);

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
    if (!showSuccess) return;
    const t = setTimeout(() => onClose(), SUCCESS_DISPLAY_MS);
    return () => clearTimeout(t);
  }, [showSuccess, onClose]);

  useEffect(() => {
    document.body.classList.add('face-capture-open');
    return () => document.body.classList.remove('face-capture-open');
  }, []);

  const handleCapture = async () => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) {
      setError('Camera not ready. Wait a moment and try again.');
      return;
    }
    setCapturing(true);
    setError(null);
    setRecognitionFailed(false);
    try {
      if (onCaptureImage) {
        const descriptor = await getDescriptorFromVideo(video);
        if (!descriptor) {
          setError('No face detected. Look at the camera and try again.');
          setCapturing(false);
          return;
        }
        const blob = await videoFrameToBlob(video);
        const result = await onCaptureImage(blob);
        if (result.success) setShowSuccess(true);
        else setRecognitionFailed(true);
      } else {
        const descriptor = await getDescriptorFromVideo(video);
        if (!descriptor) {
          setError('No face detected. Look at the camera and try again.');
          setCapturing(false);
          return;
        }
        const result = await onCapture(descriptor);
        if (result.success) setShowSuccess(true);
        else setRecognitionFailed(true);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Face detection failed');
    } finally {
      setCapturing(false);
    }
  };

  const handleTryAgain = () => {
    setRecognitionFailed(false);
    setError(null);
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
          <div className="face-detect-animation" aria-hidden>
            <div className={`face-detect-frame ${recognitionFailed ? 'face-detect-frame--failure' : ''}`}>
              <div className={`face-detect-scan ${recognitionFailed ? 'face-detect-scan--failure' : ''}`} />
              <div className={`face-detect-corner face-detect-corner--tl ${recognitionFailed ? 'face-detect-corner--failure' : ''}`} />
              <div className={`face-detect-corner face-detect-corner--tr ${recognitionFailed ? 'face-detect-corner--failure' : ''}`} />
              <div className={`face-detect-corner face-detect-corner--bl ${recognitionFailed ? 'face-detect-corner--failure' : ''}`} />
              <div className={`face-detect-corner face-detect-corner--br ${recognitionFailed ? 'face-detect-corner--failure' : ''}`} />
            </div>
            <p className="face-detect-text">
              {recognitionFailed ? (
                <span className="face-detect-text-line face-detect-text-line-1 face-detect-text-line--failure">{failureMessage}</span>
              ) : (
                <>
                  <span className="face-detect-text-line face-detect-text-line-1">Position your face in the frame</span>
                  <span className="face-detect-text-line face-detect-text-line-2">Then tap Capture</span>
                </>
              )}
            </p>
          </div>
        )}
      </div>
      {error && <p className="face-capture-error face-capture-error--overlay">{error}</p>}
      <div className="face-capture-actions face-capture-actions--overlay">
        {recognitionFailed ? (
          <>
            <button type="button" className="face-capture-btn face-capture-btn-capture" onClick={handleTryAgain}>
              Try again
            </button>
            <button type="button" className="face-capture-btn face-capture-btn-cancel" onClick={onClose}>Cancel</button>
          </>
        ) : (
          <>
            <button type="button" className="face-capture-btn face-capture-btn-capture" onClick={handleCapture} disabled={loading || capturing}>
              {capturing ? 'Detecting…' : captureButtonLabel}
            </button>
            <button type="button" className="face-capture-btn face-capture-btn-cancel" onClick={onClose}>Cancel</button>
          </>
        )}
      </div>
    </div>
  );
}
