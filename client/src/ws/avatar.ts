import socket, { addHandler, sendMessage } from "./socket";

export type AvatarPayload = {
  headYaw: number;
  headPitch: number;
  mouthOpen: number;
  eyeBlink: number;
};

let latestOutgoing: AvatarPayload | null = null;
let outgoingScheduled = false;

export function sendAvatar(payload: AvatarPayload) {
  latestOutgoing = payload;
  if (outgoingScheduled) return;
  outgoingScheduled = true;

  requestAnimationFrame(() => {
    outgoingScheduled = false;
    const toSend = latestOutgoing;
    latestOutgoing = null;
    if (!toSend) return;

    // dev debug
    try { console.debug("ws.avatar: sending", toSend); } catch (e) {}
    const ok = sendMessage({ type: "avatar", payload: toSend });
    if (!ok) {
      try { console.warn("ws.avatar: dropped send — socket not open or failed"); } catch (e) {}
    }
  });
}

let latestIncoming: AvatarPayload | null = null;
let incomingScheduled = false;
const listeners = new Set<(p: AvatarPayload) => void>();

function deliverIncoming() {
  incomingScheduled = false;
  const p = latestIncoming;
  latestIncoming = null;
  if (!p) return;
  // dev debug
  try { console.debug("ws.avatar: incoming payload", p); } catch (e) {}
  for (const cb of Array.from(listeners)) {
    try {
      cb(p);
    } catch (e) {
      console.warn("avatar listener error", e);
    }
  }
}

addHandler("avatar", (msg) => {
  if (!msg || !msg.payload) return;
  const payload = msg.payload as AvatarPayload;

  latestIncoming = payload;
  if (!incomingScheduled) {
    incomingScheduled = true;

    requestAnimationFrame(deliverIncoming);
  }
});

export function onAvatar(cb: (p: AvatarPayload) => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export default { sendAvatar, onAvatar };
