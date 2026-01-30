import React, { useEffect, useRef } from "react";
import controllers, { AvatarPose } from "./controllers";

type AvatarCanvasProps = {
  width?: number;
  height?: number;
  pixelRatio?: number;
  // optional hook for external debugging
  debug?: (msg: string, ...args: unknown[]) => void;
};

/**
 * AvatarCanvas
 * - Renders a simple stylized avatar using Canvas2D
 * - Subscribes to `controllers` for pose updates
 * - Runs an internal RAF loop and decouples render FPS from input FPS
 * - On missing updates, holds the last pose (does not reset)
 */
export default function AvatarCanvas({ width = 300, height = 300, pixelRatio = window.devicePixelRatio || 1, debug }: AvatarCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const targetPoseRef = useRef<AvatarPose>(controllers.getPose());
  const drawPoseRef = useRef<AvatarPose>(controllers.getPose());
  const lastUpdateRef = useRef<number>(Date.now());
  const subscriptionRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // device pixel ratio handling
    const ratio = pixelRatio;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

    // subscribe to pose updates
    subscriptionRef.current = controllers.subscribe((p) => {
      targetPoseRef.current = p;
      lastUpdateRef.current = Date.now();
    });

    let lastTime = performance.now();

    function step(now: number) {
      const dt = Math.min(0.05, (now - lastTime) / 1000); // clamp dt to avoid huge jumps
      lastTime = now;

      // interpolate drawPose toward targetPose to smooth visual (decoupled from input FPS)
      const target = targetPoseRef.current;
      const draw = drawPoseRef.current;

      // smoothing factor per second
      const SMOOTH_SEC = 0.06; // visual smoothing time constant
      const alpha = 1 - Math.exp(-dt / SMOOTH_SEC);

      // lerp rotations
      draw.rotation.x = lerp(draw.rotation.x, target.rotation.x, alpha);
      draw.rotation.y = lerp(draw.rotation.y, target.rotation.y, alpha);
      draw.rotation.z = lerp(draw.rotation.z, target.rotation.z, alpha);
      // lerp morph targets
      draw.morph.mouthOpen = lerp(draw.morph.mouthOpen, target.morph.mouthOpen, alpha);
      draw.morph.eyeBlink = lerp(draw.morph.eyeBlink, target.morph.eyeBlink, alpha);
      draw.t = Date.now();

      // render current draw pose
      render(ctx, draw, width, height);

      rafRef.current = requestAnimationFrame(step);
    }

    rafRef.current = requestAnimationFrame(step);

    return () => {
      // cleanup
      if (subscriptionRef.current) subscriptionRef.current();
      subscriptionRef.current = null;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasRef, width, height, pixelRatio]);

  return <canvas ref={canvasRef} />;
}

// helpers
function lerp(a: number, b: number, alpha: number) {
  return a + (b - a) * alpha;
}

function render(ctx: CanvasRenderingContext2D, pose: AvatarPose, w: number, h: number) {
  // clear
  ctx.clearRect(0, 0, w, h);

  const cx = w / 2;
  const cy = h / 2;
  const headRadius = Math.min(w, h) * 0.28;

  ctx.save();

  // apply head rotation (yaw -> rotate about y axis simulated by simple horizontal displacement
  // and pitch -> small vertical translation). For simplicity, we rotate the 2D canvas slightly by yaw.
  // yaw affects rotation around z in 2D rendering to emulate head turn;
  ctx.translate(cx, cy);
  ctx.rotate(pose.rotation.y * 0.35); // scale down rotation for nicer visuals
  ctx.translate(-cx, -cy);

  // head
  ctx.beginPath();
  ctx.fillStyle = "#f1c27d";
  ctx.ellipse(cx, cy, headRadius, headRadius * 1.12, 0, 0, Math.PI * 2);
  ctx.fill();

  // eyes - positions relative to head center
  const eyeOffsetX = headRadius * 0.45;
  const eyeOffsetY = -headRadius * 0.12 + pose.rotation.x * 12; // pitch pushes eyes up/down
  const eyeRadiusX = headRadius * 0.11;
  const eyeRadiusY = Math.max(0.01, headRadius * 0.11 * (1 - pose.morph.eyeBlink));

  ctx.fillStyle = "#222";
  // left eye
  ctx.beginPath();
  ctx.ellipse(cx - eyeOffsetX, cy + eyeOffsetY, eyeRadiusX, eyeRadiusY, 0, 0, Math.PI * 2);
  ctx.fill();
  // right eye
  ctx.beginPath();
  ctx.ellipse(cx + eyeOffsetX, cy + eyeOffsetY, eyeRadiusX, eyeRadiusY, 0, 0, Math.PI * 2);
  ctx.fill();

  // mouth - simple ellipse whose height depends on mouthOpen
  const mouthW = headRadius * 0.7;
  const mouthH = headRadius * (0.06 + 0.32 * pose.morph.mouthOpen);
  const mouthY = cy + headRadius * 0.44 + pose.rotation.x * 8;

  ctx.fillStyle = "#9b3b3b";
  ctx.beginPath();
  ctx.ellipse(cx, mouthY, mouthW / 2, mouthH / 2, 0, 0, Math.PI * 2);
  ctx.fill();

  // simple nose as a line
  ctx.strokeStyle = "#b07b61";
  ctx.lineWidth = Math.max(1, headRadius * 0.03);
  ctx.beginPath();
  ctx.moveTo(cx, cy - headRadius * 0.02);
  ctx.lineTo(cx, cy + headRadius * 0.28);
  ctx.stroke();

  ctx.restore();
}
