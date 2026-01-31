
import React, { useEffect, useRef, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import AvatarCanvas from "../avatar/AvatarCanvas";
import { sendMessage, addHandler } from "../ws/socket";
import useSession from "../state/session";
import useStudentAudio from "../audio/webRtcStudent";
import {
  LogOut,
  Mic,
  MicOff,
  Video,
  VideoOff,
  Layout,
  MonitorOff,
  Users
} from "lucide-react";

type Props = {
  onLeave: () => void;
  boardView?: React.ReactNode;
};

export default function StudentPage({ onLeave, boardView }: Props) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const startSession = useSession((s) => s.startSession);

  const [isMuted, setIsMuted] = useState(false);
  const [showAvatar, setShowAvatar] = useState(true);
  const [showBoard, setShowBoard] = useState(true);

  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const studentAudio = useStudentAudio(sendMessage, undefined, (msg, ...args) => console.debug("student-audio", msg, ...args));

  const sessionId = searchParams.get("sessionId");

  useEffect(() => {
    if (!sessionId) {
      navigate("/student/join");
      return;
    }

    try {
      sendMessage({ type: "join", sessionId: sessionId, role: "student" });
    } catch (e) {
      console.warn("failed to send join", e);
    }

    startSession(sessionId);
  }, [sessionId, navigate, startSession]);

  useEffect(() => {
    if (audioElRef.current) {
      studentAudio.attachAudioElement(audioElRef.current);
    }
  }, [studentAudio]);

  useEffect(() => {
    if (audioElRef.current) {
      audioElRef.current.muted = isMuted;
    }
  }, [isMuted]);

  useEffect(() => {
    const offSdp = addHandler("sdp", (msg) => studentAudio.handleSignalingMessage(msg as any));
    const offIce = addHandler("ice", (msg) => studentAudio.handleSignalingMessage(msg as any));
    return () => {
      offSdp();
      offIce();
    };
  }, [studentAudio]);

  return (
    <div className="h-screen w-screen bg-slate-900 flex flex-col overflow-hidden text-white relative">

      {/* Top Bar - Session Info */}
      <div className="absolute top-4 left-4 z-20 flex items-center gap-2 bg-black/40 backdrop-blur-md px-4 py-2 rounded-full border border-white/10">
        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
        <span className="text-sm font-medium tracking-wide">Live Class</span>
        <span className="text-xs text-slate-400 border-l border-white/10 pl-2 ml-2">ID: {sessionId}</span>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 relative flex items-center justify-center p-4">

        {/* Board View (Main Stage) */}
        {showBoard ? (
          <div className="w-full h-full rounded-2xl overflow-hidden shadow-2xl bg-slate-800 relative ring-1 ring-white/10">
            <div className="absolute inset-0 flex items-center justify-center">
              {boardView ?? <div className="text-slate-500 animate-pulse">Waiting for whiteboard...</div>}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center text-slate-500">
            <MonitorOff className="w-16 h-16 mb-4 opacity-50" />
            <p>Board hidden</p>
          </div>
        )}

        {/* Avatar View (Floating PIP) */}
        {showAvatar && (
          <div className="absolute top-8 right-8 w-64 h-64 bg-slate-800 rounded-2xl overflow-hidden shadow-2xl border border-white/20 transition-all hover:scale-105 hover:shadow-indigo-500/20 z-10 group">
            <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/60 z-10 pointer-events-none" />
            <div className="w-full h-full flex items-center justify-center bg-slate-900">
              <AvatarCanvas width={300} height={300} meshScale={3.5} />
            </div>
            <div className="absolute bottom-3 left-4 z-20 text-xs font-medium text-white/90 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full" />
              Teacher
            </div>
          </div>
        )}
      </div>

      {/* Bottom Control Bar */}
      <div className="h-20 bg-slate-950/80 backdrop-blur-lg border-t border-white/10 flex items-center justify-center gap-4 px-8 z-30">

        <ControlBtn
          active={!isMuted}
          onClick={() => setIsMuted(!isMuted)}
          icon={!isMuted ? Mic : MicOff}
          label={!isMuted ? "Mute Teacher" : "Unmute Teacher"}
        />

        <div className="h-8 w-px bg-white/10 mx-2" />

        <ControlBtn
          active={showBoard}
          onClick={() => setShowBoard(!showBoard)}
          icon={Layout}
          label={showBoard ? "Hide Board" : "Show Board"}
        />

        <ControlBtn
          active={showAvatar}
          onClick={() => setShowAvatar(!showAvatar)}
          icon={showAvatar ? Video : VideoOff}
          label={showAvatar ? "Hide Teacher" : "Show Teacher"}
        />

        <div className="h-8 w-px bg-white/10 mx-2" />

        <button
          onClick={onLeave}
          className="bg-red-600 hover:bg-red-700 text-white px-6 py-2.5 rounded-xl font-medium transition-colors flex items-center gap-2 text-sm ml-4"
        >
          <LogOut className="w-4 h-4" />
          Leave Class
        </button>

      </div>

      <audio ref={audioElRef} autoPlay playsInline controls style={{ display: 'none' }} />
    </div>
  );
}

function ControlBtn({ active, onClick, icon: Icon, label }: { active: boolean, onClick: () => void, icon: any, label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-1.5 p-3 rounded-xl transition-all min-w-[80px] group
        ${active ? 'text-white hover:bg-white/10' : 'text-slate-400 hover:text-white hover:bg-white/5 bg-white/5'}`}
    >
      <Icon className={`w-6 h-6 ${active ? '' : 'text-red-400'}`} />
      <span className="text-[10px] font-medium tracking-wide opacity-80 group-hover:opacity-100">{label}</span>
    </button>
  )
}
