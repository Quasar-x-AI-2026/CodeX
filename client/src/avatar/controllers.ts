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
  headYaw: number; 
  headPitch: number; 
  mouthOpen: number; 
  eyeBlink: number; 
};

export type AvatarPose = {
  
  rotation: { x: number; y: number; z: number };
  
  morph: { mouthOpen: number; eyeBlink: number };
  
  t: number;
};


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


const TIME_CONSTANT = 0.08; 


const YAW_DEG = 30; 
const PITCH_DEG = 20; 

function degToRad(d: number) {
  return (d * Math.PI) / 180;
}

function mapControlsToPose(c: ControlPayload, now = Date.now()): AvatarPose {
  
  const yaw = degToRad(c.headYaw * YAW_DEG);
  
  const pitch = degToRad(c.headPitch * PITCH_DEG);
  
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
  
  cb(currentPose);
  ensureLoop();
  return () => subscribers.delete(cb);
}

function notifySubscribers() {
  for (const cb of subscribers) {
    try {
      cb(currentPose);
    } catch (e) {
      
      
      console.warn("avatar controller subscriber error", e);
    }
  }
}

function step(dtSec: number) {
  if (!targetPose) return;

  const alpha = 1 - Math.exp(-dtSec / TIME_CONSTANT); 

  
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
