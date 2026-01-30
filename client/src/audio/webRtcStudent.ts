import { useCallback, useEffect, useRef, useState } from "react";
import { SignalingMessage } from "./webRtcTypes";
import { StudentAudioManager } from "./webRtc";

type SendSignal = (msg: SignalingMessage) => void;

export type UseStudentAudioReturn = {
  attachAudioElement: (el: HTMLAudioElement | null) => void;
  handleSignalingMessage: (msg: SignalingMessage) => Promise<void>;
  stop: () => void;
  isPlaying: boolean;
  error: string | null;
};

/**
 * useStudentAudio - receives teacher audio and attaches it to an <audio> element
 *
 * Responsibilities:
 * - handle incoming SDP offers and ICE via StudentAudioManager
 * - attach remote MediaStream to provided <audio> element and attempt autoplay
 * - handle reconnects silently (silence on failure)
 */
export default function useStudentAudio(send: SendSignal, sessionId?: string, debug?: (msg: string, ...args: unknown[]) => void): UseStudentAudioReturn {
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const managerRef = useRef<StudentAudioManager | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    
    managerRef.current = new StudentAudioManager({
      send,
      sessionId: sessionId ?? "",
      onRemoteTrack: (stream: MediaStream) => {
        const el = audioElRef.current;
        if (!el) return;
        
        try {
          el.srcObject = stream;
        } catch (e) {
          
        }

        
        const playPromise = el.play();
        if (playPromise && typeof (playPromise ).then === "function") {
          (playPromise as Promise<void>)
            .then(() => {
              setIsPlaying(true);
              setError(null);
            })
            .catch((err) => {
              
              setIsPlaying(false);
              setError("Autoplay blocked or playback failed");
              if (debug) debug("audio play failed", err);
            });
        }
      },
      debug,
    });

    return () => {
      if (managerRef.current) {
        managerRef.current.close().catch(() => {});
        managerRef.current = null;
      }

      const el = audioElRef.current;
      if (el) {
        try { el.pause(); } catch {}
        try { el.srcObject = null; } catch {}
        audioElRef.current = null;
      }
      setIsPlaying(false);
    };
    
  }, [send, sessionId]);

  const attachAudioElement = useCallback((el: HTMLAudioElement | null) => {
    audioElRef.current = el;
    setIsPlaying(false);
    setError(null);

    if (!el) return;

    
    if (el.srcObject) {
      const playP = el.play();
      if (playP && typeof (playP ).then === "function") {
        (playP as Promise<void>)
          .then(() => setIsPlaying(true))
          .catch((err) => {
            setIsPlaying(false);
            setError("Autoplay blocked or playback failed");
            if (debug) debug("attach audio play failed", err);
          });
      }
    }
  }, [debug]);

  const handleSignalingMessage = useCallback(async (msg: SignalingMessage) => {
    if (!managerRef.current) return;

    try {
      if (msg.type === "sdp" && msg.sdpType === "offer") {
        if (!msg.targetSocketId) return;
        await managerRef.current.handleOffer(msg.targetSocketId, msg.sdp);
      } else if (msg.type === "ice") {
        if (!msg.targetSocketId) return;
        await managerRef.current.handleIce(msg.targetSocketId, msg.candidate);
      }
    } catch (e) {
      
      if (debug) debug("handleSignalingMessage error", e);
    }
  }, [debug]);

  const stop = useCallback(() => {
    if (managerRef.current) {
      managerRef.current.close().catch(() => {});
      managerRef.current = null;
    }
    const el = audioElRef.current;
    if (el) {
      try { el.pause(); } catch {}
      try { el.srcObject = null; } catch {}
      audioElRef.current = null;
    }
    setIsPlaying(false);
    setError(null);
  }, []);

  return { attachAudioElement, handleSignalingMessage, stop, isPlaying, error };
}
