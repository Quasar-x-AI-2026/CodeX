import http from "http";
import { WebSocketServer, type WebSocket } from "ws";
import * as signaling from "./signaling";
import * as board from "./board";
import * as avatar from "./avatar";

export type IncomingMessage = {
  channel: string;
  payload?: unknown;
};

function safeInvoke(handler: (ws: WebSocket, payload: unknown) => void, ws: WebSocket, payload: unknown) {
  try {
    handler(ws, payload);
  } catch (err) {
    
    console.warn("ws handler error:", err);
  }
}

function routeMessage(ws: WebSocket, msg: unknown) {
  if (!msg || typeof msg !== "object") {
    console.warn("ws: message not an object, ignoring");
    return;
  }

  const m = msg as IncomingMessage;
  if (typeof m.channel !== "string") {
    console.warn("ws: missing or invalid channel, ignoring message");
    return;
  }

  switch (m.channel) {
    case "/signal":
      safeInvoke(signaling.handle, ws, m.payload);
      break;
    case "/board":
      safeInvoke(board.handle, ws, m.payload);
      break;
    case "/avatar":
      safeInvoke(avatar.handle, ws, m.payload);
      break;
    default:
      console.warn("ws: unknown channel:", m.channel);
  }
}


export function createWebSocketServer(server: http.Server) {
  const wss = new WebSocketServer({ server });

  wss.on("connection", (ws) => {
    ws.on("message", (raw) => {
      try {
        const text = raw instanceof Buffer ? raw.toString("utf8") : String(raw);
        let parsed: unknown;
        try {
          parsed = JSON.parse(text);
        } catch (e) {
          
          console.warn("ws: failed to parse message JSON", e instanceof Error ? e.message : e);
          return;
        }

        routeMessage(ws, parsed);
      } catch (err) {
        
        console.warn("ws: unexpected error handling message", err);
      }
    });

    ws.on("error", (err) => {
      console.warn("ws connection error", err);
    });
  });

  return wss;
}
