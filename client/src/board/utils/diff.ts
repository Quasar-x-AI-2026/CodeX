import "@tensorflow/tfjs";
import * as cocoSsd from "@tensorflow-models/coco-ssd";

export type DiffBox = { x: number; y: number; width: number; height: number };

export type DiffOptions = {

  threshold?: number;

  minArea?: number;

  mergeDistance?: number;
};

export function diffFrames(prev: ImageData, next: ImageData, opts: DiffOptions = {}): DiffBox[] {
  const threshold = opts.threshold ?? 30;
  const minArea = opts.minArea ?? 40;
  const mergeDistance = opts.mergeDistance ?? 8;

  if (prev.width !== next.width || prev.height !== next.height) {
    throw new Error("diffFrames: prev and next must have same dimensions");
  }

  const w = prev.width;
  const h = prev.height;
  const n = w * h;
  const mask = new Uint8Array(n);

  const p = prev.data;
  const q = next.data;


  for (let i = 0, px = 0; px < n; px++, i += 4) {
    const dr = Math.abs(p[i] - q[i]);
    const dg = Math.abs(p[i + 1] - q[i + 1]);
    const db = Math.abs(p[i + 2] - q[i + 2]);
    const diff = dr > dg ? (dr > db ? dr : db) : (dg > db ? dg : db);
    if (diff > threshold) mask[px] = 1;
  }


  const visited = new Uint8Array(n);
  const boxes: DiffBox[] = [];

  const stack: number[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (mask[idx] && !visited[idx]) {

        let minX = x;
        let maxX = x;
        let minY = y;
        let maxY = y;
        let area = 0;

        stack.push(idx);
        visited[idx] = 1;

        while (stack.length) {
          const cur = stack.pop()!;
          area++;
          const cy = (cur / w) | 0;
          const cx = cur - cy * w;
          if (cx < minX) minX = cx;
          if (cx > maxX) maxX = cx;
          if (cy < minY) minY = cy;
          if (cy > maxY) maxY = cy;


          const up = cur - w;
          const down = cur + w;
          const left = cur - 1;
          const right = cur + 1;

          if (cy > 0 && mask[up] && !visited[up]) {
            visited[up] = 1;
            stack.push(up);
          }
          if (cy < h - 1 && mask[down] && !visited[down]) {
            visited[down] = 1;
            stack.push(down);
          }
          if (cx > 0 && mask[left] && !visited[left]) {
            visited[left] = 1;
            stack.push(left);
          }
          if (cx < w - 1 && mask[right] && !visited[right]) {
            visited[right] = 1;
            stack.push(right);
          }
        }

        if (area >= minArea) {
          boxes.push({ x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 });
        }
      }
    }
  }

  if (boxes.length === 0) return [];


  const expanded = boxes.map((b) => ({
    x: Math.max(0, b.x - mergeDistance),
    y: Math.max(0, b.y - mergeDistance),
    width: Math.min(w - 1, b.x + b.width - 1 + mergeDistance) - Math.max(0, b.x - mergeDistance) + 1,
    height: Math.min(h - 1, b.y + b.height - 1 + mergeDistance) - Math.max(0, b.y - mergeDistance) + 1,
  }));


  const merged: DiffBox[] = [];
  const taken = new Array(expanded.length).fill(false);

  for (let i = 0; i < expanded.length; i++) {
    if (taken[i]) continue;
    let a = expanded[i];
    let didMerge = true;
    while (didMerge) {
      didMerge = false;
      for (let j = i + 1; j < expanded.length; j++) {
        if (taken[j]) continue;
        const b = expanded[j];
        if (boxesOverlap(a, b)) {
          a = mergeBoxes(a, b, w, h);
          taken[j] = true;
          didMerge = true;
        }
      }
    }
    merged.push(a);
  }


  const finalBoxes = merged.map((b) => shrinkBox(b, mergeDistance, w, h));

  return finalBoxes;
}

// Calculate Intersection over Union (IoU)
export function calculateIoU(a: DiffBox, b: DiffBox): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);

  const intersectionW = Math.max(0, x2 - x1);
  const intersectionH = Math.max(0, y2 - y1);
  const intersectionArea = intersectionW * intersectionH;

  const areaA = a.width * a.height;
  const areaB = b.width * b.height;
  const unionArea = areaA + areaB - intersectionArea;

  if (unionArea === 0) return 0;
  return intersectionArea / unionArea;
}

function boxesOverlap(a: DiffBox, b: DiffBox) {
  return !(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y);
}

function mergeBoxes(a: DiffBox, b: DiffBox, maxW: number, maxH: number): DiffBox {
  const x1 = Math.min(a.x, b.x);
  const y1 = Math.min(a.y, b.y);
  const x2 = Math.max(a.x + a.width - 1, b.x + b.width - 1);
  const y2 = Math.max(a.y + a.height - 1, b.y + b.height - 1);
  return { x: Math.max(0, x1), y: Math.max(0, y1), width: Math.min(maxW - x1, x2 - x1 + 1), height: Math.min(maxH - y1, y2 - y1 + 1) };
}

function shrinkBox(b: DiffBox, d: number, maxW: number, maxH: number): DiffBox {
  const x = Math.max(0, b.x + d);
  const y = Math.max(0, b.y + d);
  const x2 = Math.min(maxW - 1, b.x + b.width - 1 - d);
  const y2 = Math.min(maxH - 1, b.y + b.height - 1 - d);
  if (x2 < x || y2 < y) return { x: 0, y: 0, width: 0, height: 0 };
  return { x, y, width: x2 - x + 1, height: y2 - y + 1 };
}

export default diffFrames;

let modelPromise: Promise<cocoSsd.ObjectDetection> | null = null;

export async function detectBoardROI(imageData: ImageData): Promise<DiffBox | null> {
  if (!modelPromise) {
    modelPromise = cocoSsd.load();
  }

  try {
    const model = await modelPromise;
    const canvas = document.createElement("canvas");
    canvas.width = imageData.width;
    canvas.height = imageData.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.putImageData(imageData, 0, 0);

    const predictions = await model.detect(canvas);

    if (predictions.length > 0) {
      console.log("Board detection candidates:", predictions);

      // Filter for likely classes if we want to be specific, or just take largest.
      // Common classes for a board: 'tv', 'laptop', 'book', 'refrigerator' (whiteboard?), or just generic objects.
      // For now, largest area is the best heuristic for a "main subject".

      const sorted = predictions.sort((a, b) => {
        const areaA = a.bbox[2] * a.bbox[3];
        const areaB = b.bbox[2] * b.bbox[3];
        return areaB - areaA;
      });

      const best = sorted[0];
      return {
        x: best.bbox[0],
        y: best.bbox[1],
        width: best.bbox[2],
        height: best.bbox[3],
      };
    }
  } catch (e) {
    console.warn("detectBoardROI failed", e);
  }
  return null;
}
