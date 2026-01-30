import type { WebSocket } from "ws";
import { getSession } from "../state/inMemory";
import { getSessionForSocket } from "../sessions/join";
import * as registry from "./registry";
import { join as joinSession } from "../sessions/join";
import type { Role } from "../state/inMemory";


export function handle(ws: WebSocket, payload: unknown) {
  try {
    const from = (ws as any).id as string | undefined;
    if (!from) {
      console.warn("signaling: missing socket id on connection");
      return;
    }

    if (!payload || typeof payload !== "object") {
      console.warn("signaling: invalid payload");
      return;
    }

    const p: any = payload;

    // Handle join message first - before checking if socket is in a session
    if (p.type === "join") {
      handleJoin(ws, from, p);
      return;
    }

    const sessionId = getSessionForSocket(from);
    if (!sessionId) {
      console.warn("signaling: socket not associated with a session", from);
      return;
    }

    const session = getSession(sessionId);
    if (!session) {
      console.warn("signaling: session missing", sessionId);
      return;
    }

    const out = {
      channel: "/signal",
      payload: { ...p, from },
    };

    
    if (typeof p.targetSocketId === "string") {
      registry.sendTo(p.targetSocketId, out);
      return;
    }

    
    if (p.recipient === "teacher") {
      if (session.teacher) registry.sendTo(session.teacher, out);
      return;
    }

    if (p.recipient === "students") {
      registry.sendMany(session.students, out);
      return;
    }

    
    if (session.teacher === from) {
      
      registry.sendMany(session.students, out);
    } else {
      
      if (session.teacher) registry.sendTo(session.teacher, out);
    }
  } catch (err) {
    console.warn("signaling.handle error", err);
  }
}

function handleJoin(ws: WebSocket, socketId: string, payload: any) {
  try {
    const { sessionId, role } = payload;

    if (!sessionId || typeof sessionId !== "string") {
      console.warn("signaling.join: invalid or missing sessionId");
      return;
    }

    if (!role || (role !== "teacher" && role !== "student")) {
      console.warn("signaling.join: invalid role");
      return;
    }

    const session = joinSession(sessionId, socketId, role as Role);
    console.log(`signaling.join: ${role} joined session ${sessionId}`, {
      teacher: session.teacher,
      students: session.students.length,
    });

  } catch (err) {
    console.warn("signaling.join error", err);
  }
}

