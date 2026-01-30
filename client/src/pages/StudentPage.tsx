import React from "react";
import AvatarCanvas from "../avatar/AvatarCanvas";
import { useEffect, useRef } from "react";
import { sendMessage, addHandler } from "../ws/socket";
import useSession from "../state/session";
import AvatarDebug from "@/avatar/AvatarDebug";
import useStudentAudio from "../audio/webRtcStudent";

type Props = {
  onLeave: () => void;
  boardView?: React.ReactNode; 
};

export default function StudentPage({ onLeave, boardView }: Props) {
  const startSession = useSession((s) => s.startSession);

  const audioElRef = useRef<HTMLAudioElement | null>(null);

  const studentAudio = useStudentAudio(sendMessage, undefined, (msg, ...args) => console.debug("student-audio", msg, ...args));

  useEffect(() => {
    const sid = window.prompt("Enter session ID to join");
    if (!sid) {
      onLeave();
      return;
    }

    try {
      sendMessage({ type: "join", sessionId: sid, role: "student" });
    } catch (e) {
      console.warn("failed to send join", e);
    }

    startSession(sid);

    // Attach signaling handlers for incoming SDP/ICE
    const offSdp = addHandler("sdp", (msg: any) => {
      studentAudio.handleSignalingMessage(msg).catch((e) => console.warn('student handle sdp failed', e));
    });
    const offIce = addHandler("ice", (msg: any) => {
      studentAudio.handleSignalingMessage(msg).catch((e) => console.warn('student handle ice failed', e));
    });

    return () => {
      try { offSdp(); } catch {};
      try { offIce(); } catch {};
    };

  }, []);

  // Attach audio element to the hook
  useEffect(() => {
    const el = audioElRef.current;
    studentAudio.attachAudioElement(el);
    return () => {
      studentAudio.attachAudioElement(null);
    };
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        <header className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold">Student View</h2>
          <button
            onClick={onLeave}
            className="inline-flex items-center gap-2 bg-white border border-gray-200 text-gray-700 px-3 py-1 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            Leave
          </button>
        </header>

        <main className="grid grid-cols-3 gap-6">
          <section className="col-span-2 bg-white border rounded-lg p-4">
            <h3 className="font-medium mb-3">Board</h3>
            <div className="h-96 bg-gray-100 border rounded flex items-center justify-center">
              {boardView ?? <div className="text-sm text-gray-400">Waiting for board updates...</div>}
            </div>
          </section>

          <aside className="bg-white border rounded-lg p-4 relative">
            <h3 className="font-medium mb-3">Teacher Avatar</h3>
            <div className="h-96 flex items-center justify-center relative">
              <AvatarCanvas width={260} height={260} meshScale={3.5} />
              <AvatarDebug />
            </div>

            {/* Audio element (hidden) + simple status UI */}
            <div className="mt-4">
              <audio ref={audioElRef} style={{ display: 'none' }}></audio>
              <div className="text-sm text-gray-500 mt-2">Live audio from teacher will play automatically when available. If autoplay is blocked, click Play below.</div>
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() => {
                    const el = audioElRef.current;
                    if (!el) return;
                    const p = el.play();
                    if (p && typeof (p as Promise<void>).then === 'function') {
                      (p as Promise<void>).catch((err) => console.warn('play failed', err));
                    }
                  }}
                  className="inline-flex items-center gap-2 bg-indigo-600 text-white px-3 py-1 rounded-md hover:bg-indigo-700"
                >
                  Play
                </button>
                <button
                  onClick={() => {
                    const el = audioElRef.current;
                    if (!el) return;
                    try { el.pause(); } catch {}
                  }}
                  className="inline-flex items-center gap-2 bg-gray-200 text-gray-700 px-3 py-1 rounded-md hover:bg-gray-300"
                >
                  Pause
                </button>
              </div>
            </div>
          </aside>
        </main>

        <footer className="mt-6 text-xs text-gray-400">You're viewing the teacher's board and avatar. Use {"Leave"} to exit.</footer>
      </div>
    </div>
  );
}

