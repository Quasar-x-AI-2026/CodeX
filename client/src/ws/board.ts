import { addHandler, sendMessage } from "./socket";

export type PatchPayload = {
  x: number;
  y: number;
  w: number;
  h: number;
  image: string; // base64
};

/**
 * Board WS transport
 * - sendPatch(patch): emits a patch to the server (no retries, drop when socket closed)
 * - onPatch(cb): subscribe to incoming patches (delivered in arrival order)
 */

export function sendPatch(patch: PatchPayload): boolean {
  // Order and retries handled by server; client simply sends and does not buffer
  return sendMessage({ type: "board.patch", payload: patch });
}

const listeners = new Set<(p: PatchPayload) => void>();

addHandler("board.patch", (msg: Record<string, unknown>) => {
  const payload = msg?.payload as PatchPayload | undefined;
  if (!payload) return;
  // deliver immediately in arrival order; do not buffer or coalesce
  for (const cb of Array.from(listeners)) {
    try {
      cb(payload);
    } catch (e) {
      // swallow listener errors
      // eslint-disable-next-line no-console
      console.warn("board listener error", e);
    }
  }
});

export function onPatch(cb: (p: PatchPayload) => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export default { sendPatch, onPatch };
