import { useCallback, useEffect, useRef, useState } from "react";

type UseMicrophoneReturn = {
  stream: MediaStream | null;
  start: () => Promise<void>;
  stop: () => void;
  error: string | null;
};

/**
 * useMicrophone - requests microphone permission and exposes a MediaStream
 *
 * Responsibilities:
 * - use navigator.mediaDevices.getUserMedia({ audio: true })
 * - expose start() and stop()
 * - track error state
 * - stop all tracks on stop or unmount
 *
 * Must not include any WebRTC, socket, UI, or audio processing logic.
 */
export default function useMicrophone(): UseMicrophoneReturn {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
    
    
  }, []);

  const start = useCallback(async (): Promise<void> => {
    
    if (streamRef.current) {
      return;
    }

    if (!navigator?.mediaDevices?.getUserMedia) {
      setError("getUserMedia is not supported in this browser");
      return;
    }

    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mountedRef.current) {
        
        s.getTracks().forEach((t) => t.stop());
        return;
      }

      streamRef.current = s;
      setStream(s);
      setError(null);
    } catch (err: unknown) {
      
      let msg = "Failed to access microphone";

      
      if (err instanceof Error) {
        
        
        const name = (err).name;
        if (name === "NotAllowedError" || name === "PermissionDeniedError") {
          msg = "Microphone permission denied";
        } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
          msg = "No microphone found";
        } else {
          msg = err.message || String(err);
        }
      } else {
        msg = String(err);
      }

      setError(msg);
    }
  }, []);

  const stop = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setStream(null);
    }
    
  }, []);

  return { stream, start, stop, error };
}
