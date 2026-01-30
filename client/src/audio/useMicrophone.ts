import { useCallback, useEffect, useRef, useState } from "react";

export type UseMicrophoneResult = {
  stream: MediaStream | null;
  error: Error | null;
  requesting: boolean;
  start: () => Promise<void>;
  stop: () => void;
};

export function useMicrophone(
  autoStart: boolean = true,
  constraints: MediaStreamConstraints = { audio: true },
): UseMicrophoneResult {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [requesting, setRequesting] = useState<boolean>(false);

  const mountedRef = useRef(true);
  const pendingPromiseRef = useRef<Promise<void> | null>(null);

  const clearStream = useCallback((s: MediaStream | null) => {
    if (!s) return;
    for (const track of s.getTracks()) track.stop();
  }, []);

  const stop = useCallback(() => {
    
    if (stream) {
      clearStream(stream);
      setStream(null);
    }
    setError(null);
    setRequesting(false);
  }, [stream, clearStream]);

  const start = useCallback(async () => {
    
    if (requesting) return;

    setRequesting(true);
    setError(null);

    
    if (!navigator?.mediaDevices?.getUserMedia) {
      const err = new Error("getUserMedia not supported in this browser");
      setError(err);
      setRequesting(false);
      return;
    }

    const p = (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia(constraints);
        if (!mountedRef.current) {
          
          clearStream(s);
          return;
        }
        setStream(s);
      } catch (err: unknown) {
        
        let e: Error;
        if (err instanceof Error) e = err;
        else e = new Error(String(err));

        
        
        if ((e as any).name === "NotAllowedError" || (e as any).name === "PermissionDeniedError") {
          setError(new Error("Microphone access was denied. Please enable it in your browser settings."));
        } else if ((e as any).name === "NotFoundError") {
          setError(new Error("No microphone found on this device."));
        } else {
          setError(e);
        }
      } finally {
        if (mountedRef.current) setRequesting(false);
      }
    })();

    pendingPromiseRef.current = p;
    await p;
    pendingPromiseRef.current = null;
  }, [constraints, requesting, clearStream]);

  
  useEffect(() => {
    mountedRef.current = true;
    if (autoStart) start().catch(() => {
      
    });

    return () => {
      mountedRef.current = false;
      
      if (pendingPromiseRef.current) {
        
      }
      stop();
    };
    
  }, []);

  return { stream, error, requesting, start, stop };
}

export default useMicrophone;
