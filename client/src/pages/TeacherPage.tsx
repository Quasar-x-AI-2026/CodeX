import React, { useCallback, useState, useEffect } from "react";
import BordROISelector, { NormalizedROI } from "../board/BordROISelector";
import AvatarCanvas from "../avatar/AvatarCanvas";
import useTeacherAudio from "../audio/webRtcTeacher";
import { sendMessage, addHandler } from "../ws/socket";

type Props = {
  isRunning?: boolean;
  onStart: () => Promise<void> | void;
  onStop: () => Promise<void> | void;
  onROIChange?: (roi: NormalizedROI | null) => void;
  initialROI?: NormalizedROI | null;
  secondaryROI?: NormalizedROI | null;

  avatarPreviewRef?: React.RefObject<HTMLDivElement | null>;

  boardPreviewRef?: React.RefObject<HTMLDivElement | null>;

  sessionId?: string | null;
};

export default function TeacherPage({ isRunning = false, onStart, onStop, onROIChange, initialROI = null, secondaryROI, avatarPreviewRef, boardPreviewRef, sessionId = null }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localRunning, setLocalRunning] = useState(isRunning);

  React.useEffect(() => {
    setLocalRunning(isRunning);
  }, [isRunning]);

  const handleStart = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      await onStart();
      setLocalRunning(true);
    } catch (e) {
      setError((e as Error)?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, [onStart]);

  const handleStop = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      await onStop();
      setLocalRunning(false);
    } catch (e) {
      setError((e as Error)?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, [onStop]);

  const handleROIChange = useCallback((r: NormalizedROI | null) => {
    if (onROIChange) onROIChange(r);
  }, [onROIChange]);


  const teacherAudio = useTeacherAudio(sendMessage, sessionId ?? undefined, (msg, ...args) => console.debug("teacher-audio", msg, ...args));

  // Audio controls
  const startAudio = async () => {
    try {
      await teacherAudio.start();
    } catch (e) {
      console.warn("start audio failed", e);
    }
  };

  const stopAudio = () => {
    try {
      teacherAudio.stop();
    } catch (e) {
      console.warn("stop audio failed", e);
    }
  };

  useEffect(() => {

    const offSdp = addHandler("sdp", (msg: any) => {
      teacherAudio.handleSignalingMessage(msg);
    });

    const offIce = addHandler("ice", (msg: any) => {
      teacherAudio.handleSignalingMessage(msg);
    });


    const offPeerJoined = addHandler("peer-joined", (msg: any) => {
      try {
        const from = msg?.from as string | undefined;
        if (from) {
          teacherAudio.addStudent(from).catch((e) => console.warn("addStudent failed", e));
        }
      } catch (e) {
        console.warn(e);
      }
    });

    return () => {
      try { offSdp(); } catch { };
      try { offIce(); } catch { };
      try { offPeerJoined(); } catch { };
    };

  }, [sessionId]);

  return (
    <div className="p-6">
      <div className="max-w-5xl mx-auto">
        <header className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold">Teacher Controls</h2>
            {sessionId && localRunning && (
              <div className="text-sm text-gray-500 mt-1">Session ID: <code className="bg-gray-100 px-2 py-1 rounded">{sessionId}</code> <button className="ml-2 text-xs text-indigo-600 underline" onClick={() => navigator.clipboard?.writeText(sessionId)}>Copy</button></div>
            )}
          </div>

          <div className="flex items-center gap-3">
            {loading && <div className="animate-spin h-5 w-5 border-2 border-gray-300 border-t-indigo-600 rounded-full" aria-hidden />}

            {/* Audio share button */}
            <button
              onClick={() => startAudio()}
              className="inline-flex items-center gap-2 bg-green-600 text-white px-3 py-1 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500"
              title="Share microphone with students"
            >
              Share Audio
            </button>

            <button
              onClick={() => stopAudio()}
              className="inline-flex items-center gap-2 bg-gray-200 text-gray-700 px-3 py-1 rounded-md hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-200"
              title="Stop sharing microphone"
            >
              Stop Audio
            </button>

            {localRunning ? (
              <button
                onClick={handleStop}
                className="inline-flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500"
              >
                End Session
              </button>
            ) : (
              <button
                onClick={handleStart}
                className="inline-flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                Start Session
              </button>
            )}
          </div>
        </header>

        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-700 border border-red-100 rounded">Error: {error}</div>
        )}

        <main className="grid grid-cols-2 gap-6">
          <section className="bg-white border rounded-lg p-4">
            <h3 className="font-medium mb-3">Board Preview</h3>
            <div style={{ height: 360 }} className="relative bg-gray-50 border rounded">
              { }
              <BordROISelector value={initialROI} secondaryROI={secondaryROI} onChange={handleROIChange}>
                <div style={{ width: "100%", height: "360px", display: "flex", alignItems: "center", justifyContent: "center", position: 'relative' }} ref={boardPreviewRef}>
                  <div className="text-sm text-gray-400">Board area preview (select ROI)</div>
                </div>
              </BordROISelector>
            </div>
          </section>

          <section className="bg-white border rounded-lg p-4">
            <h3 className="font-medium mb-3">Avatar Preview</h3>
            <div style={{ height: 360 }} className="relative bg-gray-50 border rounded flex items-center justify-center">
              <div style={{ width: 280, height: 280, position: 'relative' }} ref={avatarPreviewRef}>
                { }
                <div style={{ position: 'absolute', right: 8, bottom: 8, width: 96, height: 96, borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(0,0,0,0.06)', boxShadow: '0 2px 6px rgba(0,0,0,0.06)' }}>
                  <AvatarCanvas width={96} height={96} />
                </div>
              </div>
            </div>
          </section>
        </main>

        <footer className="mt-6 text-sm text-gray-500">Start your session to begin sharing board patches and audio to students.</footer>
      </div>
    </div>
  );
}
