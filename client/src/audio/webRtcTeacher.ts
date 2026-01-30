import { useCallback, useEffect, useRef, useState } from "react";
import useMicrophone from "./useMicrophone";
import { SignalingMessage } from "./webRtcTypes";
import { TeacherAudioManager } from "./webRtc";

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

  // Create manager once
  useEffect(() => {
    const getLocalStream = async () => {
      // Ensure microphone is started and return stream
      try {
        await mic.start();
      } catch (e) {
        // start may fail (permission) — swallow; caller can check mic.error
      }
      // Always return current stream (may be null) — TeacherAudioManager handles missing stream
      return mic.stream as MediaStream;
    };

    managerRef.current = new TeacherAudioManager({ send, sessionId: sessionId ?? "", getLocalStream, debug });

    return () => {
      if (managerRef.current) {
        managerRef.current.close().catch(() => {});
        managerRef.current = null;
      }
      // Do not stop microphone here; leave lifecycle to caller
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [send, sessionId]);

  const start = useCallback(async () => {
    try {
      await mic.start();
      setIsActive(true);
    } catch (e) {
      // permission denied or failure -> mic.error will reflect state
      setIsActive(false);
    }
  }, [mic]);

  const stop = useCallback(() => {
    try {
      mic.stop();
    } catch (e) {
      // ignore
    }
    setIsActive(false);
    // close all peer connections to stop sending audio
    if (managerRef.current) managerRef.current.close().catch(() => {});
  }, [mic]);

  const addStudent = useCallback(async (targetSocketId: string) => {
    if (!managerRef.current) return;
    try {
      await managerRef.current.addStudent(targetSocketId);
    } catch (e) {
      // silence on failures
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
        if (!msg.targetSocketId) return;
        await managerRef.current.handleAnswer(msg.targetSocketId, msg.sdp);
      } else if (msg.type === "ice") {
        if (!msg.targetSocketId) return;
        await managerRef.current.handleIce(msg.targetSocketId, msg.candidate);
      } else if (msg.type === "sdp" && msg.sdpType === "offer") {
        // worker offer or other incoming offer to teacher
        if (!msg.targetSocketId) return;
        await managerRef.current.handleWorkerOffer(msg.targetSocketId, msg.sdp);
      }
    } catch (e) {
      // Do not throw; silence is preferable
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
