import { addHandler, sendMessage } from "./socket";

export type PatchPayload = {
  x: number;
  y: number;
  w: number;
  h: number;
  image: string;
};

export function sendPatch(patch: PatchPayload): boolean {
  return sendMessage({ type: "board.patch", payload: patch });
}

const listeners = new Set<(p: PatchPayload) => void>();

addHandler("board.patch", (msg: Record<string, unknown>) => {
  const payload = msg?.payload as PatchPayload | undefined;
  if (!payload) return;

  try { console.debug && console.debug("ws.board: incoming patch", { x: payload.x, y: payload.y, w: payload.w, h: payload.h, imgLen: payload.image ? String(payload.image.length) : 0 }); } catch (e) {}

  for (const cb of Array.from(listeners)) {
    try {
      cb(payload);
    } catch (e) {
      console.warn("board listener error", e);
    }
  }
});

export function onPatch(cb: (p: PatchPayload) => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export default { sendPatch, onPatch };
