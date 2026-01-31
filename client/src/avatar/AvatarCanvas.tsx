import React, { useEffect, useRef } from "react";
import controllers, { AvatarPose } from "./utils/controllers";
import { onAvatar } from "../ws/avatar";
import { sendMessage } from "../ws/socket";
import useSession from "../state/session";
import { computeControlsFromLandmarks, expandLandmarks } from "./utils/landmarks";
import Delaunator from "delaunator";

type AvatarCanvasProps = {
  width?: number;
  height?: number;
  pixelRatio?: number;
  meshScale?: number;

  debug?: (msg: string, ...args: unknown[]) => void;
};

export default function AvatarCanvas({ width = 480, height = 480, pixelRatio = window.devicePixelRatio || 1, meshScale = 2.4, debug }: AvatarCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const targetPoseRef = useRef<AvatarPose>(controllers.getPose());
  const drawPoseRef = useRef<AvatarPose>(controllers.getPose());
  const lastUpdateRef = useRef<number>(Date.now());
  const subscriptionRef = useRef<(() => void) | null>(null);
  const sessionId = useSession((s) => s.sessionId);

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


    const photoRef = { current: null as HTMLImageElement | null } as { current: HTMLImageElement | null };
    const photoSizeRef = { current: { w: 0, h: 0 } } as { current: { w: number; h: number } };
    const landmarksRef = { current: null as Array<{ x: number; y: number; z?: number }> | null } as { current: Array<{ x: number; y: number; z?: number }> | null };

    // Texture mapping state
    const textureLandmarksRef = { current: null as Array<{ x: number; y: number }> | null } as { current: Array<{ x: number; y: number }> | null };
    const meshIndicesRef = { current: null as Array<number> | null } as { current: Array<number> | null };

    subscriptionRef.current = controllers.subscribe((p) => {
      targetPoseRef.current = p;
      lastUpdateRef.current = Date.now();
    });

    const offNet = onAvatar((p) => {
      try {
        try { console.debug && console.debug("AvatarCanvas: onAvatar payload", p); } catch (e) { }


        if (Array.isArray((p as any).landmarks)) {
          try {
            landmarksRef.current = (p as any).landmarks.slice(0);
            const c = computeControlsFromLandmarks(landmarksRef.current as any);
            controllers.updateControls({ headYaw: c.headYaw, headPitch: c.headPitch, mouthOpen: c.mouthOpen, eyeBlink: c.eyeBlink } as any);
            try { console.debug && console.debug("AvatarCanvas: received landmarks -> controls", c); } catch (e) { }
          } catch (e) {
            console.warn("AvatarCanvas: failed to process landmarks", e);
          }
        }

        if ((p as any).photo) {
          try {
            const dataUrl = (p as any).photo;
            const w = (p as any).w || 0;
            const h = (p as any).h || 0;
            let img = photoRef.current;
            if (!img) {
              img = new Image();
              photoRef.current = img;
              img.onload = () => {
                try { console.debug && console.debug("AvatarCanvas: photo loaded", img?.width, img?.height); } catch (e) { }
              };
              img.onerror = (e) => {
                console.warn("AvatarCanvas: failed to load photo", e);
              };
            }
            img.src = dataUrl;
            photoSizeRef.current = { w, h };

            // Texture mapping: compute triangulation if landmarks provided
            const plm = (p as any).photoLandmarks as Array<{ x: number; y: number; z?: number }> | undefined;
            if (plm && Array.isArray(plm) && plm.length > 0) {
              try {
                const expandedPlm = expandLandmarks(plm);
                const points = expandedPlm.map(pt => [pt.x, pt.y]);
                const del = Delaunator.from(points);
                meshIndicesRef.current = Array.from(del.triangles);
                textureLandmarksRef.current = expandedPlm.map(pt => ({ x: pt.x, y: pt.y }));
                try { console.debug && console.debug("AvatarCanvas: computed triangulation", meshIndicesRef.current.length / 3, "triangles", "pts", expandedPlm.length); } catch (e) { }
              } catch (e) {
                console.warn("AvatarCanvas: failed to compute triangulation", e);
              }
            }
            try { console.debug && console.debug("AvatarCanvas: stored photo", w, h); } catch (e) { }
          } catch (e) {
            console.warn("AvatarCanvas: failed to process photo payload", e);
          }
        }


        try {
          controllers.updateControls(p);
          try { console.debug && console.debug("AvatarCanvas: lastValidPose", controllers.getLastValidPose()); } catch (e) { }
        } catch (e) { }


        try {
          const last = controllers.getLastValidPose();
          if (last) {
            targetPoseRef.current = last;

            drawPoseRef.current = { ...last } as any;
            lastUpdateRef.current = Date.now();
            try { console.debug && console.debug("AvatarCanvas: applied immediate pose", last); } catch (e) { }
          }
        } catch (e) {

        }
      } catch (e) {
        console.warn("AvatarCanvas: failed to apply network avatar payload", e);
      }
    });

    tryRequestState();

    function tryRequestState(attempts = 6) {
      const sid = sessionId;
      if (!sid) return;
      try {
        const ok = sendMessage({ type: "request-state", sessionId: sid });
        if (!ok && attempts > 0) {
          setTimeout(() => tryRequestState(attempts - 1), 200);
        }
      } catch (e) {
        if (attempts > 0) setTimeout(() => tryRequestState(attempts - 1), 200);
      }
    }

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


      render(ctx, draw, width, height, photoRef.current, photoSizeRef.current, landmarksRef.current, meshScale, textureLandmarksRef.current, meshIndicesRef.current);

      rafRef.current = requestAnimationFrame(step);
    }

    rafRef.current = requestAnimationFrame(step);

    return () => {

      if (subscriptionRef.current) subscriptionRef.current();
      subscriptionRef.current = null;
      try { offNet(); } catch (e) { /* ignore */ }
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };

  }, [canvasRef, width, height, pixelRatio, sessionId]);

  return <canvas ref={canvasRef} />;
}


function lerp(a: number, b: number, alpha: number) {
  return a + (b - a) * alpha;
}

// Helper to draw a textured triangle
function drawTriangle(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  src: Array<{ x: number, y: number }>,
  dst: Array<{ x: number, y: number }>
) {
  // src and dst are arrays of 3 points
  const [s0, s1, s2] = src;
  const [d0, d1, d2] = dst;

  // Clip to destination triangle
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(d0.x, d0.y);
  ctx.lineTo(d1.x, d1.y);
  ctx.lineTo(d2.x, d2.y);
  ctx.closePath();
  ctx.clip();

  // Compute affine transform
  // We want to map s0->d0, s1->d1, s2->d2
  // x_d = a*x_s + c*y_s + e
  // y_d = b*x_s + d*y_s + f

  const den = s0.x * (s2.y - s1.y) - s1.x * s2.y + s2.x * s1.y + (s1.x - s2.x) * s0.y;
  if (Math.abs(den) < 0.0001) {
    ctx.restore();
    return;
  }

  const a = -(s0.y * (d2.x - d1.x) - s1.y * d2.x + s2.y * d1.x + (s1.y - s2.y) * d0.x) / den;
  const b = -(s0.y * (d2.y - d1.y) - s1.y * d2.y + s2.y * d1.y + (s1.y - s2.y) * d0.y) / den;
  const c = (s0.x * (d2.x - d1.x) - s1.x * d2.x + s2.x * d1.x + (s1.x - s2.x) * d0.x) / den;
  const d = (s0.x * (d2.y - d1.y) - s1.x * d2.y + s2.x * d1.y + (s1.x - s2.x) * d0.y) / den;
  const e = (s0.x * (s2.y * d1.x - s1.y * d2.x) + s0.y * (s1.x * d2.x - s2.x * d1.x) + (s2.x * s1.y - s1.x * s2.y) * d0.x) / den;
  const f = (s0.x * (s2.y * d1.y - s1.y * d2.y) + s0.y * (s1.x * d2.y - s2.x * d1.y) + (s2.x * s1.y - s1.x * s2.y) * d0.y) / den;

  ctx.transform(a, b, c, d, e, f);
  ctx.drawImage(img, 0, 0);
  ctx.restore();
}

function render(
  ctx: CanvasRenderingContext2D,
  pose: AvatarPose,
  w: number,
  h: number,
  photo: HTMLImageElement | null,
  photoSize: { w: number; h: number } | null,
  landmarks: Array<{ x: number; y: number; z?: number }> | null,
  meshScale?: number,
  textureLandmarks?: Array<{ x: number; y: number }> | null,
  meshIndices?: Array<number> | null
) {

  ctx.clearRect(0, 0, w, h);

  const cx = w / 2;
  const cy = h / 2;
  const headRadius = Math.min(w, h) * 0.28;

  // New Texture Mapping Path
  if (photo && landmarks && landmarks.length > 0 && textureLandmarks && textureLandmarks.length > 0 && meshIndices && meshIndices.length > 0) {
    try {
      const mScale = (typeof meshScale === 'number' && meshScale > 0) ? meshScale : 1.4;
      const meshW = headRadius * 2 * mScale;
      const meshH = headRadius * 2 * 1.12 * mScale;
      const left = cx - meshW / 2;
      const top = cy - meshH / 2;

      // Destination points (live face)
      const dstPts = expandLandmarks(landmarks).map((lm) => ({ x: left + lm.x * meshW, y: top + lm.y * meshH }));

      const pW = photo.width;
      const pH = photo.height;
      const srcPts = textureLandmarks.map(p => ({ x: p.x * pW, y: p.y * pH }));

      // Draw triangles
      for (let i = 0; i < meshIndices.length; i += 3) {
        const i0 = meshIndices[i];
        const i1 = meshIndices[i + 1];
        const i2 = meshIndices[i + 2];

        if (i0 >= srcPts.length || i1 >= srcPts.length || i2 >= srcPts.length) continue;
        if (i0 >= dstPts.length || i1 >= dstPts.length || i2 >= dstPts.length) continue;

        const triSrc = [srcPts[i0], srcPts[i1], srcPts[i2]];
        const triDst = [dstPts[i0], dstPts[i1], dstPts[i2]];

        drawTriangle(ctx, photo, triSrc, triDst);
      }

      // Return here to skip fallback rendering
      return;
    } catch (e) {
      console.warn("AvatarCanvas: failed rendering textured mesh", e);
    }
  }


  if (photo) {
    try {
      const imgW = Math.min(w * 0.95, (photoSize && photoSize.w) || photo.width || w);
      const imgAspect = ((photoSize && photoSize.w && photoSize.h) ? (photoSize.w / photoSize.h) : (photo.width / photo.height)) || 1;
      const imgH = imgW / imgAspect;

      const offsetX = pose.rotation.y * w * 0.06;
      const offsetY = pose.rotation.x * h * 0.04;
      const scale = 1 + Math.max(-0.06, Math.min(0.06, pose.morph.mouthOpen * 0.02));


      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(pose.rotation.y * 0.12);
      ctx.scale(scale, scale);
      ctx.beginPath();
      ctx.ellipse(0, 0, headRadius, headRadius * 1.12, 0, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(photo, -imgW / 2 + offsetX, -imgH / 2 + offsetY, imgW, imgH);
      ctx.restore();


      if (landmarks && landmarks.length > 0) {
        ctx.save();
        ctx.fillStyle = "rgba(255,0,0,0.85)";
        ctx.strokeStyle = "rgba(0,0,0,0.4)";
        ctx.lineWidth = 1;

        const left = cx - imgW / 2 + offsetX;
        const top = cy - imgH / 2 + offsetY;
        for (let i = 0; i < landmarks.length; i++) {
          const lm = landmarks[i];
          const x = left + lm.x * imgW;
          const y = top + lm.y * imgH;
          ctx.beginPath();
          ctx.arc(x, y, Math.max(1, Math.min(3, (w + h) * 0.0025)), 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

    } catch (e) {
      try { console.warn("AvatarCanvas: failed rendering photo", e); } catch (e) { }
    }
  }


  if (!photo && landmarks && landmarks.length > 0) {
    try {
      ctx.save();


      ctx.fillStyle = "#f1c27d";
      ctx.beginPath();
      ctx.ellipse(cx, cy, headRadius, headRadius * 1.12, 0, 0, Math.PI * 2);
      ctx.fill();


      const mScale = (typeof meshScale === 'number' && meshScale > 0) ? meshScale : 1.4;
      const meshW = headRadius * 2 * mScale;
      const meshH = headRadius * 2 * 1.12 * mScale;
      const left = cx - meshW / 2;
      const top = cy - meshH / 2;
      const pts = landmarks.map((lm) => ({ x: left + lm.x * meshW, y: top + lm.y * meshH }));


      ctx.strokeStyle = "rgba(10,10,10,0.6)";
      ctx.lineWidth = Math.max(0.5, (w + h) * 0.0008);
      for (let i = 0; i < pts.length; i++) {
        for (let k = 1; k <= 3; k++) {
          const j = i + k;
          if (j < pts.length) {
            ctx.beginPath();
            ctx.moveTo(pts[i].x, pts[i].y);
            ctx.lineTo(pts[j].x, pts[j].y);
            ctx.stroke();
          }
        }
      }


      ctx.fillStyle = "rgba(34,34,34,0.9)";
      const dotR = Math.max(0.8, (w + h) * 0.0015);
      for (const p of pts) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, dotR, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    } catch (e) {
      console.warn("AvatarCanvas: failed rendering mesh", e);
    }

    return;
  }

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
