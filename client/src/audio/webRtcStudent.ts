import { useCallback, useEffect, useRef, useState } from "react";
import { SignalingMessage } from "./webRtcTypes";
import { StudentAudioManager } from "./webrtc";

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
    // Create manager with onRemoteTrack callback
    managerRef.current = new StudentAudioManager({
      send,
      sessionId: sessionId ?? "",
      onRemoteTrack: (stream: MediaStream) => {
        const el = audioElRef.current;
        if (!el) return;
        // Attach stream
        try {
          el.srcObject = stream;
        } catch (e) {
          // ignore
        }

        // Attempt to autoplay; if blocked, we do not throw, just record state
        const playPromise = el.play();
        if (playPromise && typeof (playPromise as any).then === "function") {
          (playPromise as Promise<void>)
            .then(() => {
              setIsPlaying(true);
              setError(null);
            })
            .catch((err) => {
              // Autoplay blocked or playback error; remain silent
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [send, sessionId]);

  const attachAudioElement = useCallback((el: HTMLAudioElement | null) => {
    audioElRef.current = el;
    setIsPlaying(false);
    setError(null);

    if (!el) return;

    // If there's already a stream attached by the manager, try to play
    if (el.srcObject) {
      const playP = el.play();
      if (playP && typeof (playP as any).then === "function") {
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
      // Silence is preferable on errors
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
