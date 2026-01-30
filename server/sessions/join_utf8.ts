import { getSession, joinSession, removeSocket as removeSocketState } from "../state/inMemory";
import type { SessionData, Role } from "../state/inMemory";
import { cancelPendingCleanup } from "./cleanup"; 


const socketToSession: Map<string, string> = new Map();


export function join(sessionId: string, socketId: string, role: Role = "student"): SessionData {
  if (!sessionId) throw new Error("sessionId is required");
  if (!socketId) throw new Error("socketId is required");

  
  const s = getSession(sessionId);
  if (!s) throw new Error(`session not found: ${sessionId}`);

  
  const current = socketToSession.get(socketId);
  if (current && current !== sessionId) {
    
    removeSocketState(socketId);
    socketToSession.delete(socketId);
  }

  
  const updated = joinSession(sessionId, socketId, role);

  
  socketToSession.set(socketId, sessionId);

  
  if (role === "teacher") cancelPendingCleanup(sessionId);

  return updated;
}


export function getSessionForSocket(socketId: string): string | undefined {
  return socketToSession.get(socketId);
}


export function removeSocket(socketId: string) {
  socketToSession.delete(socketId);
  return removeSocketState(socketId);
}

