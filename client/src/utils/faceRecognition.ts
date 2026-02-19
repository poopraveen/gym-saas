/**
 * Face recognition for check-in using face-api.js (open source).
 * Loads models from CDN, returns 128-d descriptor for enrollment and matching.
 *
 * Refinements to reduce false positives (unenrolled matching wrong person):
 * - Higher inputSize (416) for better descriptor quality
 * - scoreThreshold 0.6: reject low-confidence face detections
 * - Minimum detection score 0.75: require clear face in frame
 */

import * as faceapi from 'face-api.js';

/** Weights live in the main face-api.js repo under /weights (not face-api.js-models). */
const MODEL_URL = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights';

/** Require detection score >= this to use descriptor (avoid poor-quality captures). */
const MIN_DETECTION_SCORE = 0.75;

const FACE_DETECTOR_OPTS = new faceapi.TinyFaceDetectorOptions({
  inputSize: 416,
  scoreThreshold: 0.6,
});

let modelsLoaded = false;

export async function loadFaceModels(): Promise<void> {
  if (modelsLoaded) return;
  await Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
    faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
    faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
  ]);
  modelsLoaded = true;
}

/**
 * Get 128-d face descriptor from a video element (current frame).
 * Returns array of 128 numbers or null if no face detected or quality too low.
 */
export async function getDescriptorFromVideo(video: HTMLVideoElement): Promise<number[] | null> {
  if (!modelsLoaded) await loadFaceModels();
  const detection = await faceapi
    .detectSingleFace(video, FACE_DETECTOR_OPTS)
    .withFaceLandmarks()
    .withFaceDescriptor();
  if (!detection?.descriptor) return null;
  const score = (detection as { detection?: { score?: number } }).detection?.score ?? 0;
  if (score < MIN_DETECTION_SCORE) return null;
  return Array.from(detection.descriptor);
}

/**
 * Get 128-d face descriptor from an image/canvas element.
 */
export async function getDescriptorFromInput(input: HTMLImageElement | HTMLCanvasElement): Promise<number[] | null> {
  if (!modelsLoaded) await loadFaceModels();
  const detection = await faceapi
    .detectSingleFace(input, FACE_DETECTOR_OPTS)
    .withFaceLandmarks()
    .withFaceDescriptor();
  if (!detection?.descriptor) return null;
  const score = (detection as { detection?: { score?: number } }).detection?.score ?? 0;
  if (score < MIN_DETECTION_SCORE) return null;
  return Array.from(detection.descriptor);
}

