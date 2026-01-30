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

  // Keep a ref to the stream so stop() can access the latest stream synchronously
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      // Ensure we stop and release on unmount
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
    // We intentionally do not include streamRef or stream in deps; cleanup runs on unmount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = useCallback(async (): Promise<void> => {
    // If we already have a stream, do nothing
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
        // If unmounted while awaiting permission, stop the obtained tracks immediately
        s.getTracks().forEach((t) => t.stop());
        return;
      }

      streamRef.current = s;
      setStream(s);
      setError(null);
    } catch (err: unknown) {
      // Handle permission and device errors gracefully
      let msg = "Failed to access microphone";

      // DOMException for permission denied or device not found
      if (err instanceof Error) {
        // Some browsers set the name to 'NotAllowedError', 'PermissionDeniedError', 'NotFoundError'
        // Use the name property when available
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
    // Do not clear error here; stopping is a normal operation
  }, []);

  return { stream, start, stop, error };
}
