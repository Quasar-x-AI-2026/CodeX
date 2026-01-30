





let socket: WebSocket | null = null;
const sessionId: string | null = null;
let reconnectAttempts = 0;
const maxReconnectAttempts = 5;
const reconnectDelay = 1000;

type MsgHandler = (msg: Record<string, unknown>) => void;
const handlers: Map<string, Set<MsgHandler>> = new Map();

function connect() {
  socket = new WebSocket("ws://your-websocket-url");

  socket.onopen = () => {
    console.log("WebSocket connected");
    reconnectAttempts = 0;
  };

  socket.onclose = () => {
    console.log("WebSocket closed, attempting to reconnect...");
    reconnect();
  };

  socket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      const type = data?.type;
      if (type && handlers.has(type)) {
        for (const h of handlers.get(type) ?? []) h(data);
      }
    } catch (e) {
      console.warn("Failed to parse websocket message", e);
    }
  };
}

function reconnect() {
  if (reconnectAttempts < maxReconnectAttempts) {
    reconnectAttempts++;
    const delay = reconnectDelay * Math.pow(2, reconnectAttempts - 1);
    setTimeout(() => {
      console.log(`Reconnecting in ${delay / 1000} seconds...`);
      connect();
    }, delay);
  } else {
    console.error("Max reconnect attempts reached.");
  }
}

export function sendMessage(obj: unknown) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    // Do not buffer or queue messages - drop when not connected
    console.warn("WebSocket not open, dropping message");
    return false;
  }
  try {
    socket.send(JSON.stringify(obj));
    return true;
  } catch (e) {
    console.warn("Failed to send websocket message", e);
    return false;
  }
}

export function addHandler(type: string, cb: MsgHandler) {
  if (!handlers.has(type)) handlers.set(type, new Set());
  handlers.get(type)!.add(cb);
  return () => removeHandler(type, cb);
}

export function removeHandler(type: string, cb: MsgHandler) {
  handlers.get(type)?.delete(cb);
}

export function isConnected() {
  return !!socket && socket.readyState === WebSocket.OPEN;
}

export default { connect, sendMessage, addHandler, removeHandler, isConnected };

// auto connect
connect();
