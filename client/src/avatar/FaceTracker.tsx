/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * FaceTracker
 *
 * Exports:
 * - startTracking(callback)
 * - stopTracking()
 *
 * Behavior:
 * - Uses MediaPipe FaceMesh to detect a single face on-device
 * - Converts landmarks into 4 control values: headYaw, headPitch, mouthOpen, eyeBlink
 * - Normalizes values approximately to -1..1 (where appropriate)
 * - Throttles callback to ~8 FPS (125ms)
 * - If face is not detected, stops emitting values (does not emit zeros)
 *
 * Notes:
 * - No smoothing or rendering is performed here
 * - No networking is performed here; callback receives the control payload
 */

import { FaceMesh } from '@mediapipe/face_mesh';
import { Camera } from '@mediapipe/camera_utils';

export type FaceControlPayload = {
  headYaw: number; // ~ -1 (left) to 1 (right)
  headPitch: number; // ~ -1 (up) to 1 (down)
  mouthOpen: number; // 0 (closed) to 1 (open)
  eyeBlink: number; // 0 (open) to 1 (closed)
};

let faceMesh: any = null;
let camera: any = null;
let videoEl: HTMLVideoElement | null = null;
let running = false;
let lastEmit = 0;
const EMIT_INTERVAL_MS = 125; // ~8 FPS
let curCallback: ((payload: FaceControlPayload) => void) | null = null;

function clamp(v: number, a = -1, b = 1) {
  return Math.max(a, Math.min(b, v));
}

function normToRange(v: number, min: number, max: number) {
  if (max - min === 0) return 0;
  return (v - min) / (max - min);
}

function computeControls(landmarks: Array<{ x: number; y: number; z?: number }>): FaceControlPayload {
  // landmarks are normalized to image coordinates (0..1)
  const xs = landmarks.map((p) => p.x);
  const ys = landmarks.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const width = maxX - minX;
  const height = maxY - minY || 1;

  // Estimate center landmark (likely nose) as the landmark nearest to face center
  let bestIndex = 0;
  let bestDist = Infinity;
  for (let i = 0; i < landmarks.length; i++) {
    const dx = landmarks[i].x - cx;
    const dy = landmarks[i].y - cy;
    const d = dx * dx + dy * dy;
    if (d < bestDist) {
      bestDist = d;
      bestIndex = i;
    }
  }
  const center = landmarks[bestIndex];

  // head yaw: horizontal offset of nose center relative to face center
  // normalized by half-face width to be roughly within -1..1
  const headYawRaw = (center.x - cx) / (width / 2 || 1);
  const headYaw = clamp(headYawRaw, -1, 1);

  // head pitch: vertical offset of nose center relative to face center
  // inverted so looking down -> positive
  const headPitchRaw = (center.y - cy) / (height / 2 || 1);
  const headPitch = clamp(headPitchRaw, -1, 1);

  // mouth open: estimate by taking vertical spread of points in the mouth region
  // mouth region: landmarks whose x within center +/- 0.25*width and y > cy
  const mouthCandidates = landmarks.filter((p) => Math.abs(p.x - cx) < width * 0.25 && p.y > cy - height * 0.05);
  let mouthOpen = 0;
  if (mouthCandidates.length > 0) {
    const mouthYs = mouthCandidates.map((p) => p.y);
    const mouthTop = Math.min(...mouthYs);
    const mouthBottom = Math.max(...mouthYs);
    const mouthHeight = mouthBottom - mouthTop;
    // normalize by face height; typical open mouth might be ~0.08 of face height
    mouthOpen = clamp(mouthHeight / (height * 0.14), 0, 1);
  }

  // eye blink: estimate by measuring vertical spread in upper regions on both sides
  // left/right partitions
  const left = landmarks.filter((p) => p.x < cx && p.y < cy);
  const right = landmarks.filter((p) => p.x >= cx && p.y < cy);
  function eyeBlinkFromPartition(part: typeof left) {
    if (!part || part.length === 0) return 0;
    const ys = part.map((p) => p.y);
    const spread = Math.max(...ys) - Math.min(...ys);
    // expected open eye spread ~ 0.04*faceHeight; when smaller => blink
    const blink = clamp(1 - spread / (height * 0.06), 0, 1);
    return blink;
  }
  const leftBlink = eyeBlinkFromPartition(left);
  const rightBlink = eyeBlinkFromPartition(right);
  const eyeBlink = (leftBlink + rightBlink) / 2;

  return { headYaw, headPitch, mouthOpen, eyeBlink };
}

async function ensureFaceMesh() {
  if (faceMesh) return faceMesh;

  faceMesh = new FaceMesh({
    locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
  });

  faceMesh.setOptions({
    maxNumFaces: 1,
    refineLandmarks: true,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });

  return faceMesh;
}

/**
 * startTracking(callback)
 * - callback will be called with { headYaw, headPitch, mouthOpen, eyeBlink }
 */
export async function startTracking(callback: (payload: FaceControlPayload) => void, opts?: { previewContainer?: HTMLElement | null; showVideo?: boolean; }): Promise<HTMLVideoElement | null> {
  if (running) return null;
  curCallback = callback;

  try {
    await ensureFaceMesh();
  } catch (e) {
    // FaceMesh couldn't be constructed
    // eslint-disable-next-line no-console
    console.warn('FaceMesh initialization failed', e);
    return null;
  }

  // Create video element; will be appended to preview container if provided, otherwise keep hidden offscreen
  videoEl = document.createElement('video');
  videoEl.setAttribute('playsinline', '');
  videoEl.muted = true;
  videoEl.autoplay = true;
  videoEl.style.width = '100%';
  videoEl.style.height = '100%';
  videoEl.style.objectFit = 'cover';

  if (opts && opts.previewContainer) {
    const parent = opts.previewContainer;
    // ensure parent can contain absolutely positioned child
    try {
      if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative';
    } catch (e) {
      // ignore (Server-side or test env may throw)
    }
    videoEl.style.position = 'absolute';
    videoEl.style.left = '0';
    videoEl.style.top = '0';
    parent.appendChild(videoEl);
  } else {
    // keep offscreen but still playable
    videoEl.style.position = 'fixed';
    videoEl.style.left = '-10000px';
    videoEl.style.width = '320px';
    videoEl.style.height = '240px';
    document.body.appendChild(videoEl);
  }

  // handler for mediapipe results
  let lastHadFace = false;
  (faceMesh as any).onResults((results: any) => {
    const now = performance.now();
    if (!results.multiFaceLandmarks || !results.multiFaceLandmarks.length) {
      // No face detected; stop emitting
      lastHadFace = false;
      return;
    }

    // throttle
    if (now - lastEmit < EMIT_INTERVAL_MS) return;
    lastEmit = now;

    const landmarks = results.multiFaceLandmarks[0] as Array<{ x: number; y: number; z?: number }>;
    if (!landmarks || landmarks.length === 0) {
      lastHadFace = false;
      return;
    }

    // Compute controls
    const payload = computeControls(landmarks);

    // Emit only when a face is detected (do not emit zeros on failure)
    lastHadFace = true;

    try {
      if (curCallback) curCallback(payload);
    } catch (e) {
      // swallow callback errors
      // eslint-disable-next-line no-console
      console.warn('FaceTracker callback error', e);
    }
  });

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    videoEl.srcObject = stream;

    // Create Camera helper to drive FaceMesh
    camera = new Camera(videoEl, {
      onFrame: async () => {
        try {
          await (faceMesh as any).send({ image: videoEl });
        } catch (e) {
          // ignore errors from send
        }
      },
    });

    await camera.start();
    running = true;
  } catch (e) {
    // permission denied or other camera error
    // cleanup any partial resources
    // eslint-disable-next-line no-console
    console.warn('FaceTracker camera failed', e);
    stopTracking();
    // Rethrow so callers can surface the error to UI
    throw e;
  }
}

export function stopTracking() {
  running = false;
  curCallback = null;

  try {
    if (camera && typeof camera.stop === 'function') camera.stop();
  } catch (e) {
    // ignore
  }
  camera = null;

  if (videoEl) {
    try {
      const s = videoEl.srcObject as MediaStream | null;
      if (s) s.getTracks().forEach((t) => t.stop());
    } catch (e) {
      // ignore
    }
    try { videoEl.remove(); } catch {
      // ignore
    }
    videoEl = null;
  }

  if (faceMesh) {
    try { (faceMesh as any).close?.(); } catch {
      // ignore
    }
    // keep faceMesh instance for potential reuse (cheap to keep)
  }
  lastEmit = 0;
}

export default { startTracking, stopTracking };
