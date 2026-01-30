import { addHandler, sendMessage } from "./socket";

export type PatchPayload = {
  x: number;
  y: number;
  w: number;
  h: number;
  image: string; 
};

/**
 * Board WS transport
 * - sendPatch(patch): emits a patch to the server (no retries, drop when socket closed)
 * - onPatch(cb): subscribe to incoming patches (delivered in arrival order)
 */

export function sendPatch(patch: PatchPayload): boolean {
  
  return sendMessage({ type: "board.patch", payload: patch });
}

const listeners = new Set<(p: PatchPayload) => void>();

addHandler("board.patch", (msg: Record<string, unknown>) => {
  const payload = msg?.payload as PatchPayload | undefined;
  if (!payload) return;
  
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
