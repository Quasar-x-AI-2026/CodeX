import { create } from "zustand";

export type SessionPhase = "idle" | "connecting" | "active" | "ended" | "error";

export interface SessionState {
  sessionId: string | null;
  phase: SessionPhase;
  error: string | null;
  
  started: boolean;

  
  startConnecting: (sessionId?: string) => void; 
  startSession: (sessionId?: string) => void; 
  endSession: () => void; 
  setError: (message: string) => void; 
  reset: () => void; 
}

const useSession = create<SessionState>((set) => ({
  sessionId: null,
  phase: "idle",
  error: null,
  started: false,

  startConnecting: (sessionId?: string) =>
    set(() => ({ sessionId: sessionId ?? null, phase: "connecting", error: null, started: false })),

  startSession: (sessionId?: string) =>
    set(() => ({ sessionId: sessionId ?? null, phase: "active", error: null, started: true })),

  endSession: () => set(() => ({ sessionId: null, phase: "ended", error: null, started: false })),

  setError: (message: string) => set(() => ({ phase: "error", error: message, started: false })),

  reset: () => set(() => ({ sessionId: null, phase: "idle", error: null, started: false })),
}));

export default useSession;
