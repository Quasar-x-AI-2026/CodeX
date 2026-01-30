let socket: WebSocket | null = null;
let socketId: string | null = null;
const sessionId: string | null = null;
let reconnectAttempts = 0;
const maxReconnectAttempts = 5;
const reconnectDelay = 1000;

type MsgHandler = (msg: Record<string, unknown>) => void;
const handlers: Map<string, Set<MsgHandler>> = new Map();

function connect() {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";

  const port = 3000;
  const url = `${proto}//${window.location.hostname}:${port}`;

  socket = new WebSocket(url);

  socket.onopen = () => {
    console.log("WebSocket connected", url);
    reconnectAttempts = 0;
  };

  socket.onclose = () => {
    console.log("WebSocket closed, attempting to reconnect...");
    reconnect();
  };

  socket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);

      if (data && typeof data === "object") {
        if (data.type === "welcome" && typeof data.socketId === "string") {
          socketId = data.socketId;
        }

        if (typeof data.channel === "string") {
          const ch = data.channel as string;
          const payload = data.payload;

          let eventType: string | null = null;
          if (ch === "/avatar") eventType = "avatar";
          else if (ch === "/board") eventType = "board.patch";
          else if (ch === "/signal") {
            if (
              payload &&
              typeof payload === "object" &&
              typeof payload.type === "string"
            ) {
              eventType = payload.type;
            } else {
              eventType = "signal";
            }
          } else if (ch === "/audio") {
            if (
              payload &&
              typeof payload === "object" &&
              typeof payload.type === "string"
            )
              eventType = `audio.${payload.type}`;
            else eventType = "audio";
          }

          if (eventType && handlers.has(eventType)) {
            for (const h of handlers.get(eventType) ?? []) {
              try {
                if (ch === "/signal" || ch === "/audio") {
                  const msg = Object.assign({}, payload, { from: data.from });
                  h(msg as Record<string, unknown>);
                } else {
                  h({ type: eventType, payload, from: data.from });
                }
              } catch (e) {
                console.warn(e);
              }
            }
          }

          
          if (ch === "/avatar") {
            try { console.debug("ws.socket: /avatar", payload, "from", data.from); } catch (e) {}
          }

          const chKey = ch.replace(/^\//, "");
          if (handlers.has(chKey)) {
            for (const h of handlers.get(chKey) ?? []) {
              try {
                h({ channel: chKey, payload, from: data.from });
              } catch (e) {
                console.warn(e);
              }
            }
          }

          return;
        }

        const type = data.type as string | undefined;
        if (type && handlers.has(type)) {
          for (const h of handlers.get(type) ?? []) {
            try {
              h(data as Record<string, unknown>);
            } catch (e) {
              console.warn(e);
            }
          }
          return;
        }
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

function mapTypeToChannel(obj) {
  if (obj && typeof obj.channel === "string") return obj;

  if (!obj || typeof obj !== "object") return obj;

  const t = obj.type as string | undefined;
  switch (t) {
    case "avatar":
      return { channel: "/avatar", payload: obj.payload };
    case "board.patch":
      return { channel: "/board", payload: obj.payload };
    case "join":
    case "sdp":
    case "ice":
    case "peer-joined":
    case "request-state":
      return { channel: "/signal", payload: obj };
    case "audio":
      return { channel: "/audio", payload: obj.payload ?? obj };
    default:
      return obj;
  }
}

export function sendMessage(obj: unknown) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    console.warn("WebSocket not open, dropping message");
    return false;
  }
  try {
    const toSend = mapTypeToChannel(obj);
    socket.send(JSON.stringify(toSend));
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

export function getSocketId() {
  return socketId;
}

export default {
  connect,
  sendMessage,
  addHandler,
  removeHandler,
  isConnected,
  getSocketId,
};

connect();
