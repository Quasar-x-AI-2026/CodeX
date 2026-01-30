import socket, { addHandler, sendMessage } from "./socket";

export type AvatarPayload = {
  headYaw: number;
  headPitch: number;
  mouthOpen: number;
  eyeBlink: number;
};

/**
 * Avatar WS transport
 * - sendAvatar(payload): emits the latest payload to server (latest-wins, no buffering)
 * - onAvatar(cb): subscribe to incoming avatar payloads (latest-wins)
 */

// Outgoing coalescing (latest-wins)
let latestOutgoing: AvatarPayload | null = null;
let outgoingScheduled = false;

export function sendAvatar(payload: AvatarPayload) {
  latestOutgoing = payload;
  if (outgoingScheduled) return;
  outgoingScheduled = true;
  // schedule a single send on next animation frame to coalesce rapid updates
  requestAnimationFrame(() => {
    outgoingScheduled = false;
    const toSend = latestOutgoing;
    latestOutgoing = null;
    if (!toSend) return;
    // do not buffer if socket is closed - sendMessage will drop when disconnected
    sendMessage({ type: "avatar", payload: toSend });
  });
}

// Incoming latest-wins delivery
let latestIncoming: AvatarPayload | null = null;
let incomingScheduled = false;
const listeners = new Set<(p: AvatarPayload) => void>();

function deliverIncoming() {
  incomingScheduled = false;
  const p = latestIncoming;
  latestIncoming = null;
  if (!p) return;
  for (const cb of Array.from(listeners)) {
    try {
      cb(p);
    } catch (e) {
      // swallow listener errors
      // eslint-disable-next-line no-console
      console.warn("avatar listener error", e);
    }
  }
}

addHandler("avatar", (msg: any) => {
  if (!msg || !msg.payload) return;
  const payload = msg.payload as AvatarPayload;
  // overwrite latestIncoming; do not buffer older messages
  latestIncoming = payload;
  if (!incomingScheduled) {
    incomingScheduled = true;
    // schedule delivery on next animation frame
    requestAnimationFrame(deliverIncoming);
  }
});

export function onAvatar(cb: (p: AvatarPayload) => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export default { sendAvatar, onAvatar };
