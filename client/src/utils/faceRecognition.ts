/**
 * Face recognition for check-in using face-api.js (open source).
 * Loads models from CDN, returns 128-d descriptor for enrollment and matching.
 */

import * as faceapi from 'face-api.js';

/** Weights live in the main face-api.js repo under /weights (not face-api.js-models). */
const MODEL_URL = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights';

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
 * Returns array of 128 numbers or null if no face detected.
 */
export async function getDescriptorFromVideo(video: HTMLVideoElement): Promise<number[] | null> {
  if (!modelsLoaded) await loadFaceModels();
  const detection = await faceapi
    .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 224 }))
    .withFaceLandmarks()
    .withFaceDescriptor();
  if (!detection?.descriptor) return null;
  return Array.from(detection.descriptor);
}

/**
 * Get 128-d face descriptor from an image/canvas element.
 */
export async function getDescriptorFromInput(input: HTMLImageElement | HTMLCanvasElement): Promise<number[] | null> {
  if (!modelsLoaded) await loadFaceModels();
  const detection = await faceapi
    .detectSingleFace(input, new faceapi.TinyFaceDetectorOptions({ inputSize: 224 }))
    .withFaceLandmarks()
    .withFaceDescriptor();
  if (!detection?.descriptor) return null;
  return Array.from(detection.descriptor);
}

