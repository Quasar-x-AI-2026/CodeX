/**
 * Avatar Pose Controllers
 *
 * Responsibilities:
 * - Map incoming control payloads to avatar pose (rotations + morph targets)
 * - Interpolate between poses smoothly
 * - Store last valid pose
 * - Export subscription and query APIs for renderers
 *
 * Notes:
 * - No rendering, networking, or global state outside this module
 * - If updates stop, the last pose is held
 */

export type ControlPayload = {
  headYaw: number; // -1 .. 1
  headPitch: number; // -1 .. 1
  mouthOpen: number; // 0 .. 1
  eyeBlink: number; // 0 .. 1
};

export type AvatarPose = {
  // Euler rotations in radians (pitch, yaw, roll)
  rotation: { x: number; y: number; z: number };
  // Morph target weights 0..1
  morph: { mouthOpen: number; eyeBlink: number };
  // timestamp ms
  t: number;
};

// internal state
let currentPose: AvatarPose = {
  rotation: { x: 0, y: 0, z: 0 },
  morph: { mouthOpen: 0, eyeBlink: 0 },
  t: Date.now(),
};

let targetPose: AvatarPose | null = null;
let lastValidPose: AvatarPose | null = null;

const subscribers = new Set<(p: AvatarPose) => void>();

let rafId: number | null = null;
let lastTick = performance.now();

// interpolation speed (how quickly current approaches target) — in seconds
const TIME_CONSTANT = 0.08; // lower => snappier

// mapping ranges (degrees)
const YAW_DEG = 30; // left/right
const PITCH_DEG = 20; // up/down

function degToRad(d: number) {
  return (d * Math.PI) / 180;
}

function mapControlsToPose(c: ControlPayload, now = Date.now()): AvatarPose {
  // headYaw: -1..1 => -YAW_DEG..YAW_DEG (y axis rotation)
  const yaw = degToRad(c.headYaw * YAW_DEG);
  // headPitch: -1..1 => -PITCH_DEG..PITCH_DEG (x axis rotation)
  const pitch = degToRad(c.headPitch * PITCH_DEG);
  // roll kept at 0 (no data)
  const roll = 0;

  const mouthOpen = clamp01(c.mouthOpen);
  const eyeBlink = clamp01(c.eyeBlink);

  return {
    rotation: { x: pitch, y: yaw, z: roll },
    morph: { mouthOpen, eyeBlink },
    t: now,
  };
}

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

function lerp(a: number, b: number, alpha: number) {
  return a + (b - a) * alpha;
}

/**
 * updateControls - provide new control payload (typically from tracker or network)
 * This updates the target pose and records it as the last valid pose.
 */
export function updateControls(ctrl: ControlPayload) {
  const now = Date.now();
  const pose = mapControlsToPose(ctrl, now);
  targetPose = pose;
  lastValidPose = pose;
  // ensure loop is running
  ensureLoop();
}

/**
 * getPose - returns the current interpolated pose (latest computed)
 */
export function getPose(): AvatarPose {
  return currentPose;
}

/**
 * getLastValidPose - returns the last valid mapped pose (or null if none)
 */
export function getLastValidPose(): AvatarPose | null {
  return lastValidPose;
}

/**
 * subscribe - subscribe to pose updates. Returns an unsubscribe function.
 */
export function subscribe(cb: (p: AvatarPose) => void) {
  subscribers.add(cb);
  // invoke immediately with current pose
  cb(currentPose);
  ensureLoop();
  return () => subscribers.delete(cb);
}

function notifySubscribers() {
  for (const cb of subscribers) {
    try {
      cb(currentPose);
    } catch (e) {
      // swallow
      // eslint-disable-next-line no-console
      console.warn("avatar controller subscriber error", e);
    }
  }
}

function step(dtSec: number) {
  if (!targetPose) return;

  const alpha = 1 - Math.exp(-dtSec / TIME_CONSTANT); // exponential smoothing

  // interpolate rotations component-wise
  currentPose.rotation.x = lerp(currentPose.rotation.x, targetPose.rotation.x, alpha);
  currentPose.rotation.y = lerp(currentPose.rotation.y, targetPose.rotation.y, alpha);
  currentPose.rotation.z = lerp(currentPose.rotation.z, targetPose.rotation.z, alpha);

  currentPose.morph.mouthOpen = lerp(currentPose.morph.mouthOpen, targetPose.morph.mouthOpen, alpha);
  currentPose.morph.eyeBlink = lerp(currentPose.morph.eyeBlink, targetPose.morph.eyeBlink, alpha);

  currentPose.t = Date.now();
}

function tick() {
  const now = performance.now();
  const dt = (now - lastTick) / 1000;
  lastTick = now;

  if (targetPose) {
    step(dt);
    notifySubscribers();
  } else {
    // no new targets; hold last pose
    // but still notify once per second maybe? Keep silent to avoid noise
  }

  rafId = requestAnimationFrame(tick);
}

function ensureLoop() {
  if (rafId == null) {
    lastTick = performance.now();
    rafId = requestAnimationFrame(tick);
  }
}

/**
 * stop - stops the internal animation loop. The last pose is still retained.
 */
export function stop() {
  if (rafId != null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
}

/**
 * reset - reset controller to neutral pose and clear last valid pose
 */
export function reset() {
  currentPose = {
    rotation: { x: 0, y: 0, z: 0 },
    morph: { mouthOpen: 0, eyeBlink: 0 },
    t: Date.now(),
  };
  targetPose = null;
  lastValidPose = null;
  notifySubscribers();
}

export default { updateControls, getPose, getLastValidPose, subscribe, stop, reset };
