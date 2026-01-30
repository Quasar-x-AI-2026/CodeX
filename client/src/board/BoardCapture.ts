import diffFrames, { DiffOptions, DiffBox } from "./diff";

export type ROI = { x: number; y: number; w: number; h: number };

export type PatchPayload = {
  x: number;
  y: number;
  w: number;
  h: number;
  image: string; // base64 (PNG)
};

export type StartCaptureOptions = {
  source?: "camera" | "screen";
  /** ROI expressed either in pixels or normalized (0..1). Values <=1 are considered normalized. */
  roi?: ROI | { x: number; y: number; w: number; h: number };
  onPatch: (patch: PatchPayload) => void;
  onError?: (err: Error) => void;
  /** longer side downscale target in pixels */
  downscaleMax?: number;
  /** capture sampling FPS */
  fps?: number;
  /** options forwarded to diffFrames */
  diffOptions?: DiffOptions;
  /** optional container element where the camera preview video will be mounted (fills container) */
  previewContainer?: HTMLElement | null;
  /** how the preview video should fit the container; default 'cover' */
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

  // acquire media
  try {
    if (source === "screen") {
      // screen capture - getDisplayMedia may not be present on all platforms
      const dm = navigator.mediaDevices as MediaDevices & { getDisplayMedia?: (opts: MediaStreamConstraints) => Promise<MediaStream> };
      if (typeof dm.getDisplayMedia !== "function") throw new Error("getDisplayMedia not supported in this environment");
      mediaStream = await dm.getDisplayMedia({ video: true });
    } else {
      mediaStream = await navigator.mediaDevices.getUserMedia({ video: true });
    }
  } catch (e) {
    running = false;
    if (onError) onError(e as Error);
    // Surface error to the caller so the UI can react (e.g., show error message)
    throw e;
  }

  // create video element: mount into previewContainer when requested, otherwise keep hidden offscreen
  videoEl = document.createElement("video");
  videoEl.autoplay = true;
  videoEl.muted = true;
  videoEl.playsInline = true;
  videoEl.srcObject = mediaStream;

  const fit = opts?.previewFit ?? "cover";
  if (opts?.previewContainer) {
    // ensure parent can contain positioned children
    try {
      const cs = getComputedStyle(opts.previewContainer);
      if (cs.position === "static") opts.previewContainer.style.position = "relative";
    } catch (e) {
      // ignore in non-browser env
    }

    videoEl.style.position = "absolute";
    videoEl.style.left = "0";
    videoEl.style.top = "0";
    videoEl.style.width = "100%";
    videoEl.style.height = "100%";
    videoEl.style.objectFit = fit;
    // insert as first child so overlay/controls render above
    opts.previewContainer.insertBefore(videoEl, opts.previewContainer.firstChild);
  } else {
    // keep offscreen but still playable
    videoEl.style.position = "fixed";
    videoEl.style.left = "-10000px";
    videoEl.style.width = "320px";
    videoEl.style.height = "240px";
    videoEl.style.display = "none";
    document.body.appendChild(videoEl);
  }

  // create capture canvas lazily once we know video size
  offscreenCanvas = document.createElement("canvas");
  offscreenCanvas.style.display = "none";
  offscreenCtx = offscreenCanvas.getContext("2d");

  let roi: ROI | null = initialRoi ? normalizeROI(initialRoi) : null;

  function setROI(r: ROI | null) {
    roi = r ? normalizeROI(r) : null;
  }

  function normalizeROI(r: ROI) {
    // if values are <=1, treat as normalized (fractions)
    if (r.x <= 1 && r.y <= 1 && r.w <= 1 && r.h <= 1) {
      // will be converted later once video dimensions known
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

    // compute absolute ROI in source pixels
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
      // clamp
      sx = Math.max(0, Math.min(sx, vw - 1));
      sy = Math.max(0, Math.min(sy, vh - 1));
      sw = Math.max(1, Math.min(sw, vw - sx));
      sh = Math.max(1, Math.min(sh, vh - sy));
    }

    // downscale preserving aspect ratio such that longer side <= downscaleMax
    const scale = Math.min(1, downscaleMax / Math.max(sw, sh));
    const dw = Math.max(1, Math.round(sw * scale));
    const dh = Math.max(1, Math.round(sh * scale));

    offscreenCanvas.width = dw;
    offscreenCanvas.height = dh;

    // draw ROI into canvas scaled
    try {
      offscreenCtx.drawImage(videoEl, sx, sy, sw, sh, 0, 0, dw, dh);
    } catch (e) {
      // drawImage can throw if the stream is not ready; skip frame
      rafId = requestAnimationFrame(captureFrame);
      return;
    }

    // get ImageData and convert to grayscale
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

    // diff with previous
    if (prevImage && prevImage.width === img.width && prevImage.height === img.height) {
      const boxes = diffFrames(prevImage, img, diffOptions ?? undefined);
      if (boxes.length > 0) {
        // emit patches immediately
        for (const b of boxes) {
          // map box from downscaled coords (dw,dh) back to source ROI pixels
          const scaleX = sw / dw;
          const scaleY = sh / dh;
          const bx = Math.round(sx + b.x * scaleX);
          const by = Math.round(sy + b.y * scaleY);
          const bw = Math.max(1, Math.round(b.width * scaleX));
          const bh = Math.max(1, Math.round(b.height * scaleY));

          // create patch canvas at source resolution
          const patchCanvas = document.createElement("canvas");
          patchCanvas.width = bw;
          patchCanvas.height = bh;
          const patchCtx = patchCanvas.getContext("2d");
          if (!patchCtx) continue;

          // draw the patch from the original video element to keep quality
          try {
            patchCtx.drawImage(videoEl, bx, by, bw, bh, 0, 0, bw, bh);
          } catch (e) {
            // drawing failed; skip this box
            continue;
          }

          const dataUrl = patchCanvas.toDataURL("image/png");
          const base64 = dataUrl.replace(/^data:image\/png;base64,/, "");

          const patch = { x: bx, y: by, w: bw, h: bh, image: base64 };
          try {
            onPatch(patch);
          } catch (e) {
            // swallow callback errors
            if (onError) onError(e as Error);
          }
        }
      }
    }

    // store current as previous (clone)
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
      } catch (e) { /* ignore */ }
      try { videoEl.srcObject = null; } catch (e) { /* ignore */ }
      try { videoEl.remove(); } catch (e) { /* ignore */ }
      videoEl = null;
    }
    if (mediaStream) {
      try { mediaStream.getTracks().forEach((t) => t.stop()); } catch (e) { /* ignore */ }
      mediaStream = null;
    }
    offscreenCanvas = null;
    offscreenCtx = null;
  }

  return { stop, setROI, isRunning: () => running };
}

export function stopBoardCapture() {
  // convenience when only single capture used in page
  running = false;
}

export default { startBoardCapture, stopBoardCapture };
