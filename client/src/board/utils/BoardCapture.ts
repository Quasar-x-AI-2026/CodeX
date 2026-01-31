import diffFrames, { DiffOptions, DiffBox, detectBoardROI, calculateIoU, getIntersectionRatio, boxesOverlap } from "./diff";

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
  onROIChange?: (roi: ROI) => void;
  onROIsChange?: (rois: { board: ROI | null, person: ROI | null }) => void; // New callback
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
      const dm = navigator.mediaDevices as MediaDevices & {
        getDisplayMedia?: (
          opts: MediaStreamConstraints,
        ) => Promise<MediaStream>;
      };
      if (typeof dm.getDisplayMedia !== "function")
        throw new Error("getDisplayMedia not supported in this environment");
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
      if (cs.position === "static")
        opts.previewContainer.style.position = "relative";
    } catch (e) {
      console.warn("Failed to get computed style of preview container", e);
    }

    videoEl.style.position = "absolute";
    videoEl.style.left = "0";
    videoEl.style.top = "0";
    videoEl.style.width = "100%";
    videoEl.style.height = "100%";
    videoEl.style.objectFit = fit;

    opts.previewContainer.insertBefore(
      videoEl,
      opts.previewContainer.firstChild,
    );
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
  let manualRoiSelected = !!initialRoi;

  function setROI(r: ROI | null, fromUser: boolean = true) {
    roi = r ? normalizeROI(r) : null;
    if (fromUser) {
      manualRoiSelected = true;
    }
  }

  function normalizeROI(r: ROI) {
    if (r.x <= 1 && r.y <= 1 && r.w <= 1 && r.h <= 1) {
      return { ...r } as ROI;
    }
    return r as ROI;
  }

  let lastCaptureTime = 0;
  let lastDetectionTime = 0;
  let personRoi: ROI | null = null;
  let lastPersonDetectedTime = 0; // For debouncing exit
  let stableBoard: ImageData | null = null; // Buffer for clean background
  let boardHistory: { time: number, data: ImageData }[] = []; // Circular buffer for time-travel
  let lastHistoryTime = 0;
  let lastRepairTime = 0;

  // Speed up check to catch person faster: 200ms
  const detectionInterval = 200;
  const repairInterval = 200;
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



    // Auto-detection logic (Periodic, full-frame, stabilized)
    if (!manualRoiSelected && now - lastDetectionTime > detectionInterval) {
      lastDetectionTime = now;

      // We need to capture the *full* frame for detection, regardless of current ROI.
      // Since videoEl is available, we can draw it to a separate small canvas for detection.
      const detectScale = Math.min(1, 640 / Math.max(videoEl.videoWidth, videoEl.videoHeight));
      const detW = Math.max(1, Math.round(videoEl.videoWidth * detectScale));
      const detH = Math.max(1, Math.round(videoEl.videoHeight * detectScale));

      const detCanvas = document.createElement("canvas");
      detCanvas.width = detW;
      detCanvas.height = detH;
      const detCtx = detCanvas.getContext("2d");

      if (detCtx) {
        detCtx.drawImage(videoEl, 0, 0, detW, detH);
        const detImg = detCtx.getImageData(0, 0, detW, detH);

        detectBoardROI(detImg).then((result) => {
          if (!result || manualRoiSelected) return;

          let newRoi: ROI | null = null;
          let newPersonRoi: ROI | null = null;

          if (result.board) {
            newRoi = {
              x: result.board.x / detW,
              y: result.board.y / detH,
              w: result.board.width / detW,
              h: result.board.height / detH
            };
          }

          if (result.person) {
            newPersonRoi = {
              x: result.person.x / detW,
              y: result.person.y / detH,
              w: result.person.width / detW,
              h: result.person.height / detH
            };
            // Only update local tracker if the person is significant (e.g. head/face visible in top half)
            if (newPersonRoi.y < 0.5) {
              personRoi = newPersonRoi; // Update local tracker
              lastPersonDetectedTime = performance.now();
            } else {
              // If detected but low confidence/position, treat as "missing" for now,
              // but let debounce handle the clearing.
            }
          } else {
            // Person NOT detected in this frame.
            // Debounce check: Keep personRoi active for 1 second to handle flicker.
            if (personRoi && (performance.now() - lastPersonDetectedTime < 1000)) {
              // Keep it active
            } else {
              personRoi = null;
            }
          }

          if (newRoi) {
            // Stabilization: Check overlap with current ROI
            if (roi) {
              const currentAsBox: DiffBox = { x: roi.x, y: roi.y, width: roi.w, height: roi.h };
              const newAsBox: DiffBox = { x: newRoi.x, y: newRoi.y, width: newRoi.w, height: newRoi.h };
              const iou = calculateIoU(currentAsBox, newAsBox);

              // If highly overlapping (> 85%), assume it's the same object and don't jitter.
              if (iou <= 0.85) {
                console.log("Updating ROI from auto-detection", newRoi);
                roi = newRoi;
                if (opts.onROIChange) opts.onROIChange(newRoi);
              } else {
                console.log("ROI stabilized (IoU: " + iou.toFixed(2) + ")");
              }
            } else {
              // First detection
              console.log("Initial ROI detection", newRoi);
              roi = newRoi;
              if (opts.onROIChange) opts.onROIChange(newRoi);
            }
          }

          // Notify about both ROIs regardless of stability update
          if (opts.onROIsChange) {
            opts.onROIsChange({ board: roi, person: newPersonRoi });
          }
        });
      }
    }

    for (let i = 0; i < img.data.length; i += 4) {
      const r = img.data[i];
      const g = img.data[i + 1];
      const b = img.data[i + 2];
      const gray = (0.299 * r + 0.587 * g + 0.114 * b) | 0;
      img.data[i] = gray;
      img.data[i + 1] = gray;
      img.data[i + 2] = gray;
    }

    if (
      prevImage &&
      prevImage.width === img.width &&
      prevImage.height === img.height
    ) {
      const boxes = diffFrames(prevImage, img, diffOptions ?? undefined);

      const approvedBoxes: DiffBox[] = [];

      // Convert Person ROI to current frame coords for filtering
      let personBox: DiffBox | null = null;
      if (personRoi) {
        const px = Math.round(personRoi.x * dw);
        const py = Math.round(personRoi.y * dh);
        const pw = Math.round(personRoi.w * dw);
        const ph = Math.round(personRoi.h * dh);

        // Expand Person Box for better coverage (padding)
        const padding = Math.round(pw * 0.15); // Add 15% padding
        const expandedX = Math.max(0, px - padding);
        const expandedY = Math.max(0, py - padding);
        const expandedW = Math.min(dw - expandedX, pw + (padding * 2));
        const expandedH = Math.min(dh - expandedY, ph + (padding * 2));

        personBox = {
          x: expandedX,
          y: expandedY,
          width: expandedW,
          height: expandedH
        };

        // REPAIR LOGIC: If we have a stable board, send a "Repair Patch" to overwrite the person
        // with the clean background.
        if (stableBoard && now - lastRepairTime > repairInterval) {
          lastRepairTime = now;

          // Create repair patch from stableBoard
          const repairCanvas = document.createElement("canvas");
          repairCanvas.width = personBox.width;
          repairCanvas.height = personBox.height;
          const rCtx = repairCanvas.getContext("2d");
          if (rCtx) {
            // Draw the relevant slice of stableBoard
            rCtx.putImageData(stableBoard, 0, 0, personBox.x, personBox.y, personBox.width, personBox.height);

            const dataUrl = repairCanvas.toDataURL("image/png");
            const base64 = dataUrl.replace(/^data:image\/png;base64,/, "");

            try {
              // Send this synthetic patch to the student
              onPatch({ x: personBox.x, y: personBox.y, w: personBox.width, h: personBox.height, image: base64 });
            } catch (e) {
              // ignore
            }
          }
        }
      } else {
        // No person detected? Update stableBoard with current clean frame.
        // Only update if we are SURE there is no person (personRoi is null, which implies debounce passed).
        if (!personRoi) {
          stableBoard = new ImageData(
            new Uint8ClampedArray(img.data),
            img.width,
            img.height
          );
        }
      }

      if (boxes.length > 0) {
        for (const b of boxes) {

          // Person Filtering Logic (Strict)
          let overlapsPerson = false;
          // Use the expanded personBox directly. 
          // If ANY part of the update touches the person, block it.
          if (personBox && boxesOverlap(b, personBox)) {
            overlapsPerson = true;
          }

          if (overlapsPerson) {
            // This change coincides with the person. Ignore it.
            continue;
          }

          approvedBoxes.push(b);

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

      // Update prevImage ONLY for approved boxes
      // This effectively persists the "old" pixels where the person is standing (ghosting them out)
      const prevData = prevImage.data;
      const currData = img.data;
      const w = dw;

      for (const b of approvedBoxes) {
        // Copy box pixels from currData to prevData
        for (let y = b.y; y < b.y + b.height; y++) {
          const rowStart = (y * w + b.x) * 4;
          const rowEnd = rowStart + (b.width * 4);
          // Array copy for speed
          for (let idx = rowStart; idx < rowEnd; idx++) {
            prevData[idx] = currData[idx];
          }
        }
      }
      // If we didn't update prevImage for the person, it keeps the old pixels (board).
      // However, if the old pixels were "Person", we are stuck.
      // So, if we have a stableBoard, we should force-write stableBoard pixels into prevImage for the personBox area.
      // This ensures the local diff logic compares "Next Frame (Person)" vs "Prev Frame (Clean Board)".
      if (personBox && stableBoard) {
        const sData = stableBoard.data;
        const pData = prevData;

        // Only overwrite the area covered by personBox
        const startY = Math.max(0, personBox.y);
        const endY = Math.min(dh, personBox.y + personBox.height);
        const startX = Math.max(0, personBox.x);
        const endX = Math.min(dw, personBox.x + personBox.width);

        for (let y = startY; y < endY; y++) {
          const rowStart = (y * w + startX) * 4;
          const rowEnd = rowStart + ((endX - startX) * 4);
          for (let idx = rowStart; idx < rowEnd; idx++) {
            pData[idx] = sData[idx];
          }
        }
      }

    } else {
      // First frame or resize, full update
      prevImage = new ImageData(
        new Uint8ClampedArray(img.data),
        img.width,
        img.height,
      );
    }

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
      } catch (e) {
        console.warn("Failed to pause video element", e);
      }
      try {
        videoEl.srcObject = null;
      } catch (e) {
        console.warn("Failed to clear video element srcObject", e);
      }
      try {
        videoEl.remove();
      } catch (e) {
        console.warn("Failed to remove video element", e);
      }
      videoEl = null;
    }
    if (mediaStream) {
      try {
        mediaStream.getTracks().forEach((t) => t.stop());
      } catch (e) {
        console.warn("Failed to stop media stream tracks", e);
      }
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
