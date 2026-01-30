export type Landmark = { x: number; y: number; z?: number };

function clamp(v: number, a = -1, b = 1) {
  return Math.max(a, Math.min(b, v));
}

export function computeControlsFromLandmarks(landmarks: Landmark[]) {
  if (!landmarks || landmarks.length === 0) return { headYaw: 0, headPitch: 0, mouthOpen: 0, eyeBlink: 0 };

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
