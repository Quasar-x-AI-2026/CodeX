import { useCallback, useEffect, useRef, useState } from "react";
import { SignalingMessage } from "./webrtctypes";
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

    managerRef.current = new StudentAudioManager({
      send,
      sessionId: sessionId ?? "",
      onRemoteTrack: (stream: MediaStream) => {
        const el = audioElRef.current;
        if (debug) debug("student audio: receive remote track", stream.id, stream.getTracks().length);
        if (!el) {
          if (debug) debug("student audio: no audio element to attach to!");
          return;
        }

        try {
          el.srcObject = stream;
          if (debug) debug("student audio: assigned stream to audio element");
        } catch (e) {
          if (debug) debug("student audio: error assigning srcObject", e);
        }


        const playPromise = el.play();
        if (playPromise && typeof (playPromise).then === "function") {
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
        managerRef.current.close().catch(() => { });
        managerRef.current = null;
      }

      const el = audioElRef.current;
      if (el) {
        try { el.pause(); } catch { }
        try { el.srcObject = null; } catch { }
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
      if (playP && typeof (playP).then === "function") {
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
    if (debug) debug("student audio: receive signal", msg.type, (msg as any).from);
    if (!managerRef.current) {
      if (debug) debug("student audio: manager not ready yet");
      return;
    }

    try {
      if (msg.type === "sdp" && msg.sdpType === "offer") {
        // Accept offers addressed to us via targetSocketId or those broadcasted (use msg.from)
        // Critical Fix: Use msg.from as the sender identifier (the teacher)
        const fromId = (msg as any).from as string | undefined;
        if (!fromId) {
          if (debug) debug("student audio: offer received without fromId, ignoring");
          console.warn("student audio: offer received without fromId (critical failure), ignoring");
          return;
        }
        await managerRef.current.handleOffer(fromId, msg.sdp);
      } else if (msg.type === "ice") {
        // Critical Fix: Use msg.from as the sender identifier
        const fromId = (msg as any).from as string | undefined;
        if (!fromId) return;
        await managerRef.current.handleIce(fromId, msg.candidate);
      }
    } catch (e) {

      if (debug) debug("handleSignalingMessage error", e);
    }
  }, [debug]);

  const stop = useCallback(() => {
    if (managerRef.current) {
      managerRef.current.close().catch(() => { });
      managerRef.current = null;
    }
    const el = audioElRef.current;
    if (el) {
      try { el.pause(); } catch { }
      try { el.srcObject = null; } catch { }
      audioElRef.current = null;
    }
    setIsPlaying(false);
    setError(null);
  }, []);

  return { attachAudioElement, handleSignalingMessage, stop, isPlaying, error };
}
