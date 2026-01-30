import diffFrames, { DiffOptions, DiffBox } from "./diff";

export type ROI = { x: number; y: number; w: number; h: number };

export type PatchPayload = {
  x: number;
  y: number;
  w: number;
  h: number;
  image: string; 
};

export type StartCaptureOptions = {
  source?: "camera" | "screen";
  
  roi?: ROI | { x: number; y: number; w: number; h: number };
  onPatch: (patch: PatchPayload) => void;
  onError?: (err: Error) => void;
  
  downscaleMax?: number;
  
  fps?: number;
  
  diffOptions?: DiffOptions;
  
  previewContainer?: HTMLElement | null;
  
  previewFit?: "cover" | "contain";
};

let running = false;
let mediaStream: MediaStream | null = null;
let videoEl: HTMLVideoElement | null = null;
let offscreenCanvas: HTMLCanvasElement | null = null;
let offscreenCtx: CanvasRenderingContext2D | null = null;
let prevImage: ImageData | null = null;
let rafId: number | null = null;

/**
 * startBoardCapture - starts capturing from camera or screen.
 * Returns a controller with stop() and setROI().
 */
export async function startBoardCapture(opts: StartCaptureOptions) {
  if (running) throw new Error("startBoardCapture: already running");
  running = true;

  const {
    source = "camera",
    roi: initialRoi,
    onPatch,
    onError,
    downscaleMax = 640,
    fps = 8,
    diffOptions,
  } = opts;

  
  try {
    if (source === "screen") {
      
      const dm = navigator.mediaDevices as MediaDevices & { getDisplayMedia?: (opts: MediaStreamConstraints) => Promise<MediaStream> };
      if (typeof dm.getDisplayMedia !== "function") throw new Error("getDisplayMedia not supported in this environment");
      mediaStream = await dm.getDisplayMedia({ video: true });
    } else {
      mediaStream = await navigator.mediaDevices.getUserMedia({ video: true });
    }
  } catch (e) {
    running = false;
    if (onError) onError(e as Error);
    
    throw e;
  }

  
  videoEl = document.createElement("video");
  videoEl.autoplay = true;
  videoEl.muted = true;
  videoEl.playsInline = true;
  videoEl.srcObject = mediaStream;

  const fit = opts?.previewFit ?? "cover";
  if (opts?.previewContainer) {
    
    try {
      const cs = getComputedStyle(opts.previewContainer);
      if (cs.position === "static") opts.previewContainer.style.position = "relative";
    } catch (e) {
      
    }

    videoEl.style.position = "absolute";
    videoEl.style.left = "0";
    videoEl.style.top = "0";
    videoEl.style.width = "100%";
    videoEl.style.height = "100%";
    videoEl.style.objectFit = fit;
    
    opts.previewContainer.insertBefore(videoEl, opts.previewContainer.firstChild);
  } else {
    
    videoEl.style.position = "fixed";
    videoEl.style.left = "-10000px";
    videoEl.style.width = "320px";
    videoEl.style.height = "240px";
    videoEl.style.display = "none";
    document.body.appendChild(videoEl);
  }

  
  offscreenCanvas = document.createElement("canvas");
  offscreenCanvas.style.display = "none";
  offscreenCtx = offscreenCanvas.getContext("2d");

  let roi: ROI | null = initialRoi ? normalizeROI(initialRoi) : null;

  function setROI(r: ROI | null) {
    roi = r ? normalizeROI(r) : null;
  }

  function normalizeROI(r: ROI) {
    
    if (r.x <= 1 && r.y <= 1 && r.w <= 1 && r.h <= 1) {
      
      return { ...r } as ROI;
    }
    return r as ROI;
  }

  let lastCaptureTime = 0;
  const interval = 1000 / fps;

  async function captureFrame() {
    if (!running || !videoEl || !offscreenCtx) return;

    const now = performance.now();
    if (now - lastCaptureTime < interval) {
      rafId = requestAnimationFrame(captureFrame);
      return;
    }
    lastCaptureTime = now;

    const vw = videoEl.videoWidth || videoEl.clientWidth;
    const vh = videoEl.videoHeight || videoEl.clientHeight;
    if (vw === 0 || vh === 0) {
      rafId = requestAnimationFrame(captureFrame);
      return;
    }

    
    let sx = 0;
    let sy = 0;
    let sw = vw;
    let sh = vh;
    if (roi) {
      if (roi.x <= 1 && roi.y <= 1 && roi.w <= 1 && roi.h <= 1) {
        sx = Math.round(roi.x * vw);
        sy = Math.round(roi.y * vh);
        sw = Math.round(roi.w * vw);
        sh = Math.round(roi.h * vh);
      } else {
        sx = Math.round(roi.x);
        sy = Math.round(roi.y);
        sw = Math.round(roi.w);
        sh = Math.round(roi.h);
      }
      
      sx = Math.max(0, Math.min(sx, vw - 1));
      sy = Math.max(0, Math.min(sy, vh - 1));
      sw = Math.max(1, Math.min(sw, vw - sx));
      sh = Math.max(1, Math.min(sh, vh - sy));
    }

    
    const scale = Math.min(1, downscaleMax / Math.max(sw, sh));
    const dw = Math.max(1, Math.round(sw * scale));
    const dh = Math.max(1, Math.round(sh * scale));

    offscreenCanvas.width = dw;
    offscreenCanvas.height = dh;

    
    try {
      offscreenCtx.drawImage(videoEl, sx, sy, sw, sh, 0, 0, dw, dh);
    } catch (e) {
      
      rafId = requestAnimationFrame(captureFrame);
      return;
    }

    
    const img = offscreenCtx.getImageData(0, 0, dw, dh);
    for (let i = 0; i < img.data.length; i += 4) {
      const r = img.data[i];
      const g = img.data[i + 1];
      const b = img.data[i + 2];
      const gray = (0.299 * r + 0.587 * g + 0.114 * b) | 0;
      img.data[i] = gray;
      img.data[i + 1] = gray;
      img.data[i + 2] = gray;
    }

    
    if (prevImage && prevImage.width === img.width && prevImage.height === img.height) {
      const boxes = diffFrames(prevImage, img, diffOptions ?? undefined);
      if (boxes.length > 0) {
        
        for (const b of boxes) {
          
          const scaleX = sw / dw;
          const scaleY = sh / dh;
          const bx = Math.round(sx + b.x * scaleX);
          const by = Math.round(sy + b.y * scaleY);
          const bw = Math.max(1, Math.round(b.width * scaleX));
          const bh = Math.max(1, Math.round(b.height * scaleY));

          
          const patchCanvas = document.createElement("canvas");
          patchCanvas.width = bw;
          patchCanvas.height = bh;
          const patchCtx = patchCanvas.getContext("2d");
          if (!patchCtx) continue;

          
          try {
            patchCtx.drawImage(videoEl, bx, by, bw, bh, 0, 0, bw, bh);
          } catch (e) {
            
            continue;
          }

          const dataUrl = patchCanvas.toDataURL("image/png");
          const base64 = dataUrl.replace(/^data:image\/png;base64,/, "");

          const patch = { x: bx, y: by, w: bw, h: bh, image: base64 };
          try {
            onPatch(patch);
          } catch (e) {
            
            if (onError) onError(e as Error);
          }
        }
      }
    }

    
    prevImage = new ImageData(new Uint8ClampedArray(img.data), img.width, img.height);

    rafId = requestAnimationFrame(captureFrame);
  }

  rafId = requestAnimationFrame(captureFrame);

  function stop() {
    running = false;
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    prevImage = null;
    if (videoEl) {
      try {
        videoEl.pause();
      } catch (e) {  }
      try { videoEl.srcObject = null; } catch (e) {  }
      try { videoEl.remove(); } catch (e) {  }
      videoEl = null;
    }
    if (mediaStream) {
      try { mediaStream.getTracks().forEach((t) => t.stop()); } catch (e) {  }
      mediaStream = null;
    }
    offscreenCanvas = null;
    offscreenCtx = null;
  }

  return { stop, setROI, isRunning: () => running };
}

export function stopBoardCapture() {
  
  running = false;
}

export default { startBoardCapture, stopBoardCapture };
