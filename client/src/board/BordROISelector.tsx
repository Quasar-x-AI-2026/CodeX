import React, { useEffect, useRef, useState } from "react";

export type NormalizedROI = { x: number; y: number; w: number; h: number };

type Props = {
  children: React.ReactNode; // camera preview goes here
  value?: NormalizedROI | null;
  onChange?: (roi: NormalizedROI | null) => void;
};

type DragMode = "draw" | "move" | "resize" | null;
type Handle = "nw" | "ne" | "sw" | "se" | null;

const MIN_SIZE = 0.03;

export default function BoardROISelector({ children, value, onChange }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [roi, setRoi] = useState<NormalizedROI | null>(value ?? null);

  const dragMode = useRef<DragMode>(null);
  const handle = useRef<Handle>(null);
  const start = useRef<{ x: number; y: number; roi: NormalizedROI | null } | null>(null);

  useEffect(() => setRoi(value ?? null), [value]);

  const clamp = (v: number) => Math.max(0, Math.min(1, v));

  const toNorm = (x: number, y: number) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: clamp((x - r.left) / r.width), y: clamp((y - r.top) / r.height) };
  };

  const onDown = (e: React.MouseEvent, h: Handle = null) => {
    e.preventDefault();
    const p = toNorm(e.clientX, e.clientY);

    if (roi && h) {
      dragMode.current = "resize";
      handle.current = h;
    } else if (roi && inside(p, roi)) {
      dragMode.current = "move";
    } else {
      dragMode.current = "draw";
      setRoi({ x: p.x, y: p.y, w: 0, h: 0 });
    }

    start.current = { x: p.x, y: p.y, roi };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const onMove = (e: MouseEvent) => {
    if (!start.current) return;
    const p = toNorm(e.clientX, e.clientY);
    const s = start.current;

    let next: NormalizedROI | null = roi;

    if (dragMode.current === "draw") {
      next = rect(s.x, s.y, p.x, p.y);
    }

    if (dragMode.current === "move" && s.roi) {
      next = {
        ...s.roi,
        x: clamp(p.x - s.x + s.roi.x),
        y: clamp(p.y - s.y + s.roi.y),
      };
    }

    if (dragMode.current === "resize" && s.roi && handle.current) {
      next = resize(s.roi, handle.current, p);
    }

    if (next && next.w >= MIN_SIZE && next.h >= MIN_SIZE) {
      setRoi(next);
      onChange?.(next);
    }
  };

  const onUp = () => {
    dragMode.current = null;
    handle.current = null;
    start.current = null;
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
  };

  return (
    <div ref={ref} style={{ position: "relative", width: "100%", height: "100%" }}>
      {children}

      {roi && (
        <div style={boxStyle(roi)} onMouseDown={e => onDown(e)}>
          {["nw", "ne", "sw", "se"].map(h => (
            <div
              key={h}
              onMouseDown={e => onDown(e, h as Handle)}
              style={handleStyle(h as Handle)}
            />
          ))}
        </div>
      )}

      <div
        style={{ position: "absolute", inset: 0 }}
        onMouseDown={onDown}
      />
    </div>
  );
}

/* ---------- helpers ---------- */

const rect = (x1: number, y1: number, x2: number, y2: number): NormalizedROI => ({
  x: Math.min(x1, x2),
  y: Math.min(y1, y2),
  w: Math.abs(x2 - x1),
  h: Math.abs(y2 - y1),
});

const inside = (p: any, r: NormalizedROI) =>
  p.x > r.x && p.x < r.x + r.w && p.y > r.y && p.y < r.y + r.h;

const resize = (r: NormalizedROI, h: Handle, p: any): NormalizedROI => {
  const x2 = r.x + r.w;
  const y2 = r.y + r.h;

  if (h === "nw") return rect(p.x, p.y, x2, y2);
  if (h === "ne") return rect(r.x, p.y, p.x, y2);
  if (h === "sw") return rect(p.x, r.y, x2, p.y);
  return rect(r.x, r.y, p.x, p.y);
};

const boxStyle = (r: NormalizedROI) => ({
  position: "absolute" as const,
  left: `${r.x * 100}%`,
  top: `${r.y * 100}%`,
  width: `${r.w * 100}%`,
  height: `${r.h * 100}%`,
  border: "2px solid #007bff",
  background: "rgba(0,123,255,0.1)",
  boxSizing: "border-box",
});

const handleStyle = (h: Handle) => ({
  position: "absolute" as const,
  width: 10,
  height: 10,
  background: "#007bff",
  cursor: `${h}-resize`,
  ...(h === "nw" && { left: -5, top: -5 }),
  ...(h === "ne" && { right: -5, top: -5 }),
  ...(h === "sw" && { left: -5, bottom: -5 }),
  ...(h === "se" && { right: -5, bottom: -5 }),
});
