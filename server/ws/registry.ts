import type { WebSocket } from "ws";

const sockets = new Map<string, WebSocket>();

export function register(socketId: string, ws: WebSocket) {
  sockets.set(socketId, ws);
}

export function unregister(socketId: string) {
  sockets.delete(socketId);
}

export function get(socketId: string): WebSocket | undefined {
  return sockets.get(socketId);
}

function safeSend(ws: WebSocket, message: unknown) {
  try {
    
    if ((ws as any).readyState === 1) {
      ws.send(JSON.stringify(message));
    }
  } catch (err) {
    console.warn("ws.registry: failed to send", err);
  }
}

export function sendTo(socketId: string, message: unknown) {
  const ws = get(socketId);
  if (!ws) {
    console.warn("ws.registry: socket not found", socketId, message);
    return false;
  }
  try {
    safeSend(ws, message);
    return true;
  } catch (e) {
    console.warn("ws.registry: failed to send to", socketId, e);
    return false;
  }
}

export function sendMany(socketIds: string[] | Iterable<string>, message: unknown) {
  for (const id of socketIds) {
    sendTo(id, message);
  }
}

export function _clearAll() {
  sockets.clear();
}
