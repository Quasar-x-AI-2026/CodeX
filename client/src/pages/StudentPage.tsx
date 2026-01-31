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

  }, []);

  // Fix: Attach the audio element to the hook
  const { attachAudioElement, handleSignalingMessage } = studentAudio;

  useEffect(() => {
    if (audioElRef.current) {
      attachAudioElement(audioElRef.current);
    }
  }, [attachAudioElement]);

  // Fix: Handle incoming signaling messages
  useEffect(() => {
    const offSdp = addHandler("sdp", (msg) => handleSignalingMessage(msg as any));
    const offIce = addHandler("ice", (msg) => handleSignalingMessage(msg as any));
    return () => {
      offSdp();
      offIce();
    };
  }, [handleSignalingMessage]);

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
            </div>

            {/* Audio element (hidden) */}
            <div className="mt-4">
              <audio ref={audioElRef} autoPlay playsInline controls style={{ position: 'absolute', opacity: 0.01, pointerEvents: 'none', height: '1px', width: '1px', overflow: 'hidden' }}></audio>
              <div className="flex items-center gap-2 text-xs text-gray-400 mt-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                </span>
                Audio connected automatically
              </div>
            </div>
          </aside>
        </main>

        <footer className="mt-6 text-xs text-gray-400">You're viewing the teacher's board and avatar. Use {"Leave"} to exit.</footer>
      </div>
    </div>
  );
}

