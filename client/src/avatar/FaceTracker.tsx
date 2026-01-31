import { FaceMesh } from '@mediapipe/face_mesh';
import { Camera } from '@mediapipe/camera_utils';

export type FaceControlPayload = {
  headYaw: number;
  headPitch: number;
  mouthOpen: number;
  eyeBlink: number;
};

let faceMesh = null;
let camera = null;
let photoTimer: number | null = null;
let videoEl = null;
let running = false;
let lastEmit = 0;
const EMIT_INTERVAL_MS = 125;
let curCallback: ((payload: FaceControlPayload) => void) | null = null;

function clamp(v: number, a = -1, b = 1) {
  return Math.max(a, Math.min(b, v));
}

function normToRange(v: number, min: number, max: number) {
  if (max - min === 0) return 0;
  return (v - min) / (max - min);
}

function computeControls(landmarks: Array<{ x: number; y: number; z?: number }>): FaceControlPayload {

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



  const headYawRaw = (center.x - cx) / (width / 2 || 1);
  const headYaw = clamp(headYawRaw, -1, 1);



  const headPitchRaw = (center.y - cy) / (height / 2 || 1);
  const headPitch = clamp(headPitchRaw, -1, 1);



  const mouthCandidates = landmarks.filter((p) => Math.abs(p.x - cx) < width * 0.25 && p.y > cy - height * 0.05);
  let mouthOpen = 0;
  if (mouthCandidates.length > 0) {
    const mouthYs = mouthCandidates.map((p) => p.y);
    const mouthTop = Math.min(...mouthYs);
    const mouthBottom = Math.max(...mouthYs);
    const mouthHeight = mouthBottom - mouthTop;

    mouthOpen = clamp(mouthHeight / (height * 0.14), 0, 1);
  }



  const left = landmarks.filter((p) => p.x < cx && p.y < cy);
  const right = landmarks.filter((p) => p.x >= cx && p.y < cy);
  function eyeBlinkFromPartition(part: typeof left) {
    if (!part || part.length === 0) return 0;
    const ys = part.map((p) => p.y);
    const spread = Math.max(...ys) - Math.min(...ys);

    const blink = clamp(1 - spread / (height * 0.06), 0, 1);
    return blink;
  }
  const leftBlink = eyeBlinkFromPartition(left);
  const rightBlink = eyeBlinkFromPartition(right);
  const eyeBlink = (leftBlink + rightBlink) / 2;

  return { headYaw, headPitch, mouthOpen, eyeBlink };
}

import { computeControlsFromLandmarks } from "./utils/landmarks";

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
export async function startTracking(callback: (payload: FaceControlPayload) => void, opts?: { previewContainer?: HTMLElement | null; showVideo?: boolean; onLandmarks?: (lm: Array<{ x: number; y: number; z?: number }>) => void; onPhoto?: (dataUrl: string, w: number, h: number, lm: Array<{ x: number; y: number; z?: number }>) => void; photoIntervalMs?: number; landmarkSendIntervalMs?: number; }): Promise<HTMLVideoElement | null> {
  if (running) return null;
  curCallback = callback;

  const photoIntervalMs = opts?.photoIntervalMs ?? 30000;
  const landmarkSendIntervalMs = opts?.landmarkSendIntervalMs ?? 100; // 10fps
  let lastLandmarkSent = 0;
  let lastLandmarks: Array<{ x: number; y: number; z?: number }> | null = null;
  let lastPhotoSent = 0;

  try {
    await ensureFaceMesh();
  } catch (e) {
    console.warn('FaceMesh initialization failed', e);
    return null;
  }

  videoEl = document.createElement('video');
  videoEl.setAttribute('playsinline', '');
  videoEl.muted = true;
  videoEl.autoplay = true;
  videoEl.style.width = '100%';
  videoEl.style.height = '100%';
  videoEl.style.objectFit = 'cover';

  if (opts && opts.previewContainer) {
    const parent = opts.previewContainer;
    try {
      if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative';
    } catch (e) {
      console.warn('Failed to get computed style of preview container', e);
    }
    videoEl.style.position = 'absolute';
    videoEl.style.left = '0';
    videoEl.style.top = '0';
    parent.appendChild(videoEl);
  } else {
    videoEl.style.position = 'fixed';
    videoEl.style.left = '-10000px';
    videoEl.style.width = '320px';
    videoEl.style.height = '240px';
    document.body.appendChild(videoEl);
  }

  let lastHadFace = false;
  (faceMesh).onResults((results) => {
    const now = performance.now();
    if (!results.multiFaceLandmarks || !results.multiFaceLandmarks.length) {
      lastHadFace = false;
      return;
    }

    if (now - lastEmit < EMIT_INTERVAL_MS) return;
    lastEmit = now;

    const landmarks = results.multiFaceLandmarks[0] as Array<{ x: number; y: number; z?: number }>;
    if (!landmarks || landmarks.length === 0) {
      lastHadFace = false;
      return;
    }
    lastLandmarks = landmarks;

    const payload = computeControlsFromLandmarks(landmarks as any);
    lastHadFace = true;

    try {
      if (curCallback) curCallback(payload);
    } catch (e) {
      console.warn('FaceTracker callback error', e);
    }

    try {
      if (opts?.onLandmarks && now - lastLandmarkSent >= landmarkSendIntervalMs) {
        lastLandmarkSent = now;
        try { opts.onLandmarks(landmarks as any); } catch (e) { /* ignore */ }
      }
    } catch (e) { }

    // Photo capture logic integrated here to ensure we have landmarks
    if (opts?.onPhoto && now - lastPhotoSent > photoIntervalMs) {
      try {
        if (videoEl && videoEl.readyState >= 2) {
          const vw = videoEl.videoWidth;
          const vh = videoEl.videoHeight;
          const c = document.createElement('canvas');
          c.width = vw;
          c.height = vh;
          const ctx = c.getContext('2d');
          if (ctx) {
            ctx.drawImage(videoEl, 0, 0, vw, vh);
            const data = c.toDataURL('image/jpeg', 0.8);
            try { opts.onPhoto(data, vw, vh, landmarks); } catch (e) { }
            lastPhotoSent = now;
          }
        }
      } catch (e) {
        console.warn("FaceTracker photo capture failed", e);
      }
    }
  });

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    videoEl.srcObject = stream;

    camera = new Camera(videoEl, {
      onFrame: async () => {
        try {
          await (faceMesh).send({ image: videoEl });
        } catch (e) {
          console.warn('FaceMesh send error', e);
        }
      },
    });

    await camera.start();
    running = true;
  } catch (e) {
    console.warn('FaceTracker camera failed', e);
    stopTracking();
    throw e;
  }
}

export function stopTracking() {
  running = false;
  curCallback = null;

  try {
    if (camera && typeof camera.stop === 'function') camera.stop();
  } catch (e) {
    console.warn('FaceTracker camera stop failed', e);
  }

  try { if (photoTimer != null) { clearInterval(photoTimer); } } catch (e) { console.warn('FaceTracker clear photo timer failed', e); }
  photoTimer = null;

  camera = null;

  if (videoEl) {
    try {
      const s = videoEl.srcObject as MediaStream | null;
      if (s) s.getTracks().forEach((t) => t.stop());
    } catch (e) {
      console.warn('FaceTracker video stream stop failed', e);
    }
    try { videoEl.remove(); } catch {
      console.warn('FaceTracker video element remove failed');
    }
    videoEl = null;
  }

  if (faceMesh) {
    try { (faceMesh).close?.(); } catch {
      console.warn('FaceTracker FaceMesh close failed');
    }

  }
  lastEmit = 0;
}

export default { startTracking, stopTracking };
