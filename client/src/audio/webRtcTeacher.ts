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

  
  useEffect(() => {
    const getLocalStream = async () => {
      
      try {
        await mic.start();
      } catch (e) {
        
      }
      
      return mic.stream as MediaStream;
    };

    managerRef.current = new TeacherAudioManager({ send, sessionId: sessionId ?? "", getLocalStream, debug });

    return () => {
      if (managerRef.current) {
        managerRef.current.close().catch(() => {});
        managerRef.current = null;
      }
      
    };
    
  }, [send, sessionId]);

  const start = useCallback(async () => {
    try {
      await mic.start();
      setIsActive(true);
    } catch (e) {
      
      setIsActive(false);
    }
  }, [mic]);

  const stop = useCallback(() => {
    try {
      mic.stop();
    } catch (e) {
      
    }
    setIsActive(false);
    
    if (managerRef.current) managerRef.current.close().catch(() => {});
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
        if (!msg.targetSocketId) return;
        await managerRef.current.handleAnswer(msg.targetSocketId, msg.sdp);
      } else if (msg.type === "ice") {
        if (!msg.targetSocketId) return;
        await managerRef.current.handleIce(msg.targetSocketId, msg.candidate);
      } else if (msg.type === "sdp" && msg.sdpType === "offer") {
        
        if (!msg.targetSocketId) return;
        await managerRef.current.handleWorkerOffer(msg.targetSocketId, msg.sdp);
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
