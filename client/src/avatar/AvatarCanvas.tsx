import React, { useEffect, useRef } from "react";
import controllers, { AvatarPose } from "./controllers";

type AvatarCanvasProps = {
  width?: number;
  height?: number;
  pixelRatio?: number;
  
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

    
    const ratio = pixelRatio;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

    
    subscriptionRef.current = controllers.subscribe((p) => {
      targetPoseRef.current = p;
      lastUpdateRef.current = Date.now();
    });

    let lastTime = performance.now();

    function step(now: number) {
      const dt = Math.min(0.05, (now - lastTime) / 1000); 
      lastTime = now;

      
      const target = targetPoseRef.current;
      const draw = drawPoseRef.current;

      
      const SMOOTH_SEC = 0.06; 
      const alpha = 1 - Math.exp(-dt / SMOOTH_SEC);

      
      draw.rotation.x = lerp(draw.rotation.x, target.rotation.x, alpha);
      draw.rotation.y = lerp(draw.rotation.y, target.rotation.y, alpha);
      draw.rotation.z = lerp(draw.rotation.z, target.rotation.z, alpha);
      
      draw.morph.mouthOpen = lerp(draw.morph.mouthOpen, target.morph.mouthOpen, alpha);
      draw.morph.eyeBlink = lerp(draw.morph.eyeBlink, target.morph.eyeBlink, alpha);
      draw.t = Date.now();

      
      render(ctx, draw, width, height);

      rafRef.current = requestAnimationFrame(step);
    }

    rafRef.current = requestAnimationFrame(step);

    return () => {
      
      if (subscriptionRef.current) subscriptionRef.current();
      subscriptionRef.current = null;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
    
  }, [canvasRef, width, height, pixelRatio]);

  return <canvas ref={canvasRef} />;
}


function lerp(a: number, b: number, alpha: number) {
  return a + (b - a) * alpha;
}

function render(ctx: CanvasRenderingContext2D, pose: AvatarPose, w: number, h: number) {
  
  ctx.clearRect(0, 0, w, h);

  const cx = w / 2;
  const cy = h / 2;
  const headRadius = Math.min(w, h) * 0.28;

  ctx.save();

  
  
  
  ctx.translate(cx, cy);
  ctx.rotate(pose.rotation.y * 0.35); 
  ctx.translate(-cx, -cy);

  
  ctx.beginPath();
  ctx.fillStyle = "#f1c27d";
  ctx.ellipse(cx, cy, headRadius, headRadius * 1.12, 0, 0, Math.PI * 2);
  ctx.fill();

  
  const eyeOffsetX = headRadius * 0.45;
  const eyeOffsetY = -headRadius * 0.12 + pose.rotation.x * 12; 
  const eyeRadiusX = headRadius * 0.11;
  const eyeRadiusY = Math.max(0.01, headRadius * 0.11 * (1 - pose.morph.eyeBlink));

  ctx.fillStyle = "#222";
  
  ctx.beginPath();
  ctx.ellipse(cx - eyeOffsetX, cy + eyeOffsetY, eyeRadiusX, eyeRadiusY, 0, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.beginPath();
  ctx.ellipse(cx + eyeOffsetX, cy + eyeOffsetY, eyeRadiusX, eyeRadiusY, 0, 0, Math.PI * 2);
  ctx.fill();

  
  const mouthW = headRadius * 0.7;
  const mouthH = headRadius * (0.06 + 0.32 * pose.morph.mouthOpen);
  const mouthY = cy + headRadius * 0.44 + pose.rotation.x * 8;

  ctx.fillStyle = "#9b3b3b";
  ctx.beginPath();
  ctx.ellipse(cx, mouthY, mouthW / 2, mouthH / 2, 0, 0, Math.PI * 2);
  ctx.fill();

  
  ctx.strokeStyle = "#b07b61";
  ctx.lineWidth = Math.max(1, headRadius * 0.03);
  ctx.beginPath();
  ctx.moveTo(cx, cy - headRadius * 0.02);
  ctx.lineTo(cx, cy + headRadius * 0.28);
  ctx.stroke();

  ctx.restore();
}
