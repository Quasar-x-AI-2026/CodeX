
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
import { WorkspaceLayout } from "../components/layout/WorkspaceLayout";
import { FloatingControlBar, ControlBarZone } from "../components/layout/FloatingControlBar";

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

  // Header Overlay
  const HeaderOverlay = (
    <div className="flex items-center gap-3 p-4 pointer-events-none">
      <div className="pointer-events-auto flex items-center gap-2 bg-background/80 backdrop-blur-md px-3 py-1.5 rounded-full border border-border shadow-sm">
        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
        <span className="text-sm font-medium text-foreground tracking-wide">Live Class</span>
        <div className="w-px h-3 bg-border mx-1" />
        <span className="text-xs text-muted-foreground font-mono">{sessionId}</span>
      </div>
    </div>
  );

  const actions = [
    {
      label: isMuted ? "Unmute Teacher" : "Mute Teacher",
      icon: isMuted ? <MicOff /> : <Mic />,
      onClick: () => setIsMuted(!isMuted),
      isActive: !isMuted
    },
    {
      label: showBoard ? "Hide Board" : "Show Board",
      icon: showBoard ? <Layout /> : <MonitorOff />,
      onClick: () => setShowBoard(!showBoard),
      isActive: showBoard
    },
    {
      label: showAvatar ? "Hide Teacher" : "Show Teacher",
      icon: showAvatar ? <Video /> : <VideoOff />,
      onClick: () => setShowAvatar(!showAvatar),
      isActive: showAvatar
    },
    {
      label: "Leave Class",
      icon: <LogOut />,
      onClick: onLeave,
      variant: 'destructive' as const,
      isActive: true
    }
  ];

  return (
    <WorkspaceLayout
      header={HeaderOverlay}
      overlay={
        <ControlBarZone className="pb-8">
          <FloatingControlBar actions={actions} />
        </ControlBarZone>
      }
    >
      <div className="w-full h-full relative bg-secondary/10 flex items-center justify-center p-4">

        {/* Main Board View */}
        {showBoard ? (
          <div className="w-full h-full bg-card rounded-xl overflow-hidden shadow-sm border border-border relative">
            {boardView ?? (
              <div className="absolute inset-0 flex items-center justify-center text-muted-foreground animate-pulse">
                Connecting to whiteboard...
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center text-muted-foreground">
            <MonitorOff className="w-12 h-12 mb-4 opacity-20" />
            <p>Whiteboard hidden</p>
          </div>
        )}

        {/* PIP Teacher Avatar */}
        {showAvatar && (
          <div className="absolute top-4 right-4 w-64 aspect-[4/3] bg-background rounded-lg overflow-hidden shadow-lg border border-border z-20 group">
            <div className="w-full h-full relative">
              <div className="absolute inset-0 bg-muted/20 flex items-center justify-center">
                <AvatarCanvas width={256} height={192} meshScale={3.5} />
              </div>
              <div className="absolute bottom-2 left-2 px-2 py-0.5 bg-black/60 backdrop-blur rounded text-[10px] text-white font-medium">
                Instructor
              </div>
            </div>
          </div>
        )}

        <audio ref={audioElRef} autoPlay playsInline controls style={{ display: 'none' }} />
      </div>
    </WorkspaceLayout>
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
