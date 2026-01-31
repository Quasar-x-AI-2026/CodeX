import { useCallback, useEffect, useRef, useState } from "react";
import useMicrophone from "./useMicrophone";
import { SignalingMessage } from "./webrtctypes";
import { TeacherAudioManager } from "./webrtc";

type SendSignal = (msg: SignalingMessage) => void;

export type UseTeacherAudioReturn = {
  start: () => Promise<void>;
  stop: () => void;
  addStudent: (targetSocketId: string) => Promise<void>;
  removeStudent: (targetSocketId: string) => Promise<void>;
  handleSignalingMessage: (msg: SignalingMessage) => Promise<void>;
  error: string | null;
  isActive: boolean;
};

/**
 * useTeacherAudio - hook for teacher-side audio sender
 *
 * Responsibilities:
 * - use useMicrophone() to capture audio
 * - create TeacherAudioManager and provide getLocalStream
 * - expose start/stop, add/remove student, and message handler
 * - send signaling via provided `send` callback
 *
 * Notes:
 * - This hook does not perform signaling itself; it simply calls `send` with messages
 * - If WebRTC operations fail, errors are swallowed (silence) and not propagated
 */
export default function useTeacherAudio(send: SendSignal, sessionId?: string, debug?: (msg: string, ...args: unknown[]) => void): UseTeacherAudioReturn {
  const mic = useMicrophone();
  const managerRef = useRef<TeacherAudioManager | null>(null);
  const [isActive, setIsActive] = useState(false);


  useEffect(() => {
    const getLocalStream = async () => {
      // Logic fix: return stream explicitly from start() promise
      try {
        return await mic.start();
      } catch (e) {
        console.warn("getLocalStream failed", e);
        throw e;
      }
    };

    managerRef.current = new TeacherAudioManager({ send, sessionId: sessionId ?? "", getLocalStream, debug });

    return () => {
      if (managerRef.current) {
        managerRef.current.close().catch(() => { });
        managerRef.current = null;
      }

    };

  }, [send, sessionId]);

  const start = useCallback(async () => {
    try {
      if (debug) debug("useTeacherAudio: parsing mic start");
      await mic.start();
      if (debug) debug("useTeacherAudio: mic started successfully");
      setIsActive(true);
    } catch (e) {
      if (debug) debug("useTeacherAudio: mic start failed", e);
      setIsActive(false);
    }
  }, [mic, debug]);

  const stop = useCallback(() => {
    try {
      mic.stop();
    } catch (e) {

    }
    setIsActive(false);

    if (managerRef.current) managerRef.current.close().catch(() => { });
  }, [mic]);

  const addStudent = useCallback(async (targetSocketId: string) => {
    if (!managerRef.current) return;
    try {
      await managerRef.current.addStudent(targetSocketId);
    } catch (e) {

      if (debug) debug("addStudent failed", e);
    }
  }, [debug]);

  const removeStudent = useCallback(async (targetSocketId: string) => {
    if (!managerRef.current) return;
    try {
      await managerRef.current.removeStudent(targetSocketId);
    } catch (e) {
      if (debug) debug("removeStudent failed", e);
    }
  }, [debug]);

  const handleSignalingMessage = useCallback(async (msg: SignalingMessage) => {
    if (!managerRef.current) return;

    try {
      if (msg.type === "sdp" && msg.sdpType === "answer") {
        // answers should target the teacher; allow fallback to msg.from
        // Critical Fix: Use msg.from to identify the student who sent the answer!
        const fromId = (msg as any).from as string | undefined;
        if (!fromId) return;
        await managerRef.current.handleAnswer(fromId, msg.sdp);
      } else if (msg.type === "ice") {
        // Critical Fix: Use msg.from to identify the student sender!
        const fromId = (msg as any).from as string | undefined;
        if (!fromId) return;
        await managerRef.current.handleIce(fromId, msg.candidate);
      } else if (msg.type === "sdp" && msg.sdpType === "offer") {
        // worker offers: if not targeted, fallback to msg.from
        const fromId = (msg as any).from as string | undefined;
        if (!fromId) return;
        await managerRef.current.handleWorkerOffer(fromId, msg.sdp);
      }
    } catch (e) {

      if (debug) debug("handleSignalingMessage error", e);
    }
  }, [debug]);

  return {
    start,
    stop,
    addStudent,
    removeStudent,
    handleSignalingMessage,
    error: mic.error,
    isActive,
  };
}
