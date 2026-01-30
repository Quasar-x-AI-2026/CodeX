import React, { useEffect, useRef } from "react";
import { onPatch, PatchPayload } from "../ws/board";

/**
 * BoardCanvas
 * - Maintains an offscreen (high-resolution) canvas representing the full board
 * - Applies incoming patches at absolute coordinates (patch.x, y, w, h)
 * - Scales the buffer to fit the rendered element while preserving aspect ratio
 */
export default function BoardCanvas({ className }: { className?: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const bufferRef = useRef<HTMLCanvasElement | null>(null);

  
  function ensureBuffer(w: number, h: number) {
    let buf = bufferRef.current;
    if (!buf) {
      buf = document.createElement("canvas");
      buf.width = w;
      buf.height = h;
      bufferRef.current = buf;
      return buf;
    }

    const needW = Math.max(buf.width, w);
    const needH = Math.max(buf.height, h);
    if (needW !== buf.width || needH !== buf.height) {
      const tmp = document.createElement("canvas");
      tmp.width = needW;
      tmp.height = needH;
      const tctx = tmp.getContext("2d");
      const bctx = buf.getContext("2d");
      if (tctx && bctx) {
        tctx.drawImage(buf, 0, 0);
      }
      bufferRef.current = tmp;
      return tmp;
    }
    return buf;
  }

  function drawBufferToCanvas() {
    const buf = bufferRef.current;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!buf || !canvas || !container) return;

    const cstyle = getComputedStyle(container);
    const cw = Math.max(10, Math.floor(container.clientWidth));
    const ch = Math.max(10, Math.floor(container.clientHeight));

    const dpr = window.devicePixelRatio || 1;
    canvas.style.width = `${cw}px`;
    canvas.style.height = `${ch}px`;
    canvas.width = Math.floor(cw * dpr);
    canvas.height = Math.floor(ch * dpr);

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    
    const bw = buf.width;
    const bh = buf.height;
    if (bw === 0 || bh === 0) return;

    const scale = Math.min(canvas.width / bw, canvas.height / bh);
    const tw = Math.round(bw * scale);
    const th = Math.round(bh * scale);
    const ox = Math.round((canvas.width - tw) / 2);
    const oy = Math.round((canvas.height - th) / 2);

    
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(buf, 0, 0, bw, bh, ox, oy, tw, th);
  }

  useEffect(() => {
    
    const pending: PatchPayload[] = [];
    let scheduled = false;

    const off = onPatch((p: PatchPayload) => {
      try {
        if (!p || !p.image) return;
        
        pending.push(p);
      } catch (e) {
        console.warn("BoardCanvas: onPatch handler error", e);
      }
    });

    
    function flushPending() {
      if (pending.length === 0) return;
      const toApply = pending.splice(0, pending.length);

      
      (async () => {
        for (const p of toApply) {
          try {
            const src = p.image.startsWith("data:") ? p.image : `data:image/png;base64,${p.image}`;
            
            await new Promise<void>((resolve) => {
              const img = new Image();
              img.onload = () => {
                try {
                  const buf = ensureBuffer(p.x + p.w, p.y + p.h);
                  const bctx = buf.getContext("2d");
                  if (!bctx) return resolve();
                  bctx.drawImage(img, 0, 0, img.width, img.height, p.x, p.y, p.w, p.h);
                } catch (e) {
                  console.warn("BoardCanvas: failed to apply patch", e);
                }
                resolve();
              };
              img.onerror = () => {
                console.warn("BoardCanvas: image load error for pending patch");
                resolve();
              };
              img.src = src;
            });
          } catch (e) {
            console.warn("BoardCanvas: error applying pending patch", e);
          }
        }

        
        drawBufferToCanvas();
      })();
    }

    
    const intervalMs = 1000;
    const intervalId = setInterval(flushPending, intervalMs);

    
    const onVisibility = () => flushPending();
    window.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("beforeunload", onVisibility);

    
    let ro: ResizeObserver | undefined;
    try {
      ro = new ResizeObserver(() => drawBufferToCanvas());
      if (containerRef.current) ro.observe(containerRef.current);
    } catch (e) {
      
      window.addEventListener("resize", drawBufferToCanvas);
    }

    
    drawBufferToCanvas();

    return () => {
      try { off(); } catch (e) {  }
      try { clearInterval(intervalId); } catch (e) { }
      try { window.removeEventListener("visibilitychange", onVisibility); } catch (e) { }
      try { window.removeEventListener("beforeunload", onVisibility); } catch (e) { }
      try { if (ro && containerRef.current) ro.unobserve(containerRef.current); } catch (e) { }
      try { window.removeEventListener("resize", drawBufferToCanvas); } catch (e) { }
    };
  }, []);

  return (
    <div ref={containerRef} className={`${className ?? ""} relative w-full h-full`}>
      <canvas ref={canvasRef} style={{ display: "block", width: "100%", height: "100%" }} />
    </div>
  );
}
