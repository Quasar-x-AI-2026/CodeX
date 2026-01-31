
import React, { useCallback, useState, useEffect, useRef } from "react";
import BordROISelector, { NormalizedROI } from "../board/BordROISelector";
import AvatarCanvas from "../avatar/AvatarCanvas";
import useTeacherAudio from "../audio/webRtcTeacher";
import { sendMessage, addHandler } from "../ws/socket";
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  MonitorUp,
  PhoneOff,
  Copy,
  Settings,
  Users
} from "lucide-react";
import { WorkspaceLayout } from "../components/layout/WorkspaceLayout";
import { FloatingControlBar, ControlBarZone } from "../components/layout/FloatingControlBar";

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
  onJoin?: (sessionId: string) => void;
};

export default function TeacherPage({ isRunning = false, onStart, onStop, onROIChange, initialROI = null, secondaryROI, avatarPreviewRef, boardPreviewRef, sessionId = null }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localRunning, setLocalRunning] = useState(isRunning);

  // Local Media State
  const [micMuted, setMicMuted] = useState(false);
  const [videoMuted, setVideoMuted] = useState(false);

  // UI State
  const [showSettings, setShowSettings] = useState(false);

  // Peers
  const peersRef = useRef<Set<string>>(new Set());
  const [peerCount, setPeerCount] = useState(0);

  useEffect(() => {
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

  const startAudio = async () => {
    try {
      await teacherAudio.start();
      for (const peerId of peersRef.current) {
        teacherAudio.addStudent(peerId).catch(e => console.warn("retry addStudent failed", e));
      }
    } catch (e) {
      console.warn("start audio failed", e);
    }
  };

  const stopAudio = () => {
    try { teacherAudio.stop(); } catch (e) { console.warn("stop audio failed", e); }
  };

  useEffect(() => {
    if (localRunning) startAudio().catch(console.warn);
    else stopAudio();
  }, [localRunning]);

  useEffect(() => {
    const offSdp = addHandler("sdp", (msg: any) => teacherAudio.handleSignalingMessage(msg));
    const offIce = addHandler("ice", (msg: any) => teacherAudio.handleSignalingMessage(msg));

    const offPeerJoined = addHandler("peer-joined", (msg: any) => {
      const from = msg?.from as string | undefined;
      if (from) {
        peersRef.current.add(from);
        setPeerCount(prev => prev + 1);
        teacherAudio.addStudent(from).catch((e) => console.warn("addStudent failed", e));
      }
    });

    const offPeerLeft = addHandler("peer-left", (msg: any) => {
      const from = msg?.from as string | undefined;
      if (from) {
        peersRef.current.delete(from);
        setPeerCount(prev => Math.max(0, prev - 1));
        teacherAudio.removeStudent(from).catch(console.warn);
      }
    });

    return () => {
      try { offSdp(); offIce(); offPeerJoined(); offPeerLeft(); } catch { };
    };
  }, [sessionId]);

  // Handle Mute Toggles (Simulated)
  useEffect(() => {
    console.log("Mic Muted:", micMuted, "Video Muted:", videoMuted);
  }, [micMuted, videoMuted]);

  const copySession = () => {
    if (sessionId) {
      navigator.clipboard.writeText(sessionId);
    }
  }

  // --- Layout & Actions ---

  // Header overlay
  const HeaderOverlay = (
    <div className="flex items-center justify-between pointer-events-none">
      <div className="pointer-events-auto flex items-center gap-3 bg-background/80 backdrop-blur-md px-4 py-2 rounded-full shadow-sm border border-border/50">
        <div className="w-6 h-6 bg-primary rounded flex items-center justify-center font-bold text-primary-foreground text-xs">C</div>
        <span className="font-semibold text-sm tracking-tight text-foreground">CodeX</span>
        {sessionId && (
          <>
            <div className="w-px h-4 bg-border mx-1" />
            <button onClick={copySession} className="flex items-center gap-2 group">
              <span className="text-xs text-muted-foreground uppercase tracking-wider font-medium group-hover:text-foreground">Code</span>
              <code className="text-primary font-mono text-xs font-bold tracking-widest bg-primary/10 px-1.5 py-0.5 rounded transition-colors group-hover:bg-primary/20">{sessionId}</code>
            </button>
          </>
        )}
      </div>

      <div className="pointer-events-auto flex items-center gap-4">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-background/80 backdrop-blur-md rounded-full shadow-sm border border-border/50 text-xs font-medium text-foreground">
          <Users className="w-3.5 h-3.5 text-muted-foreground" />
          <span>{peerCount}</span>
        </div>
        {localRunning && (
          <span className="flex items-center gap-1.5 px-3 py-1.5 bg-destructive/10 text-destructive rounded-full text-[10px] font-bold border border-destructive/20 animate-pulse tracking-wider uppercase">
            Live
          </span>
        )}
      </div>
    </div>
  );

  // Control Bar Actions
  const actions = !localRunning ? [
    {
      label: "Start Class",
      icon: <MonitorUp />, // Or a "Play" icon
      onClick: handleStart,
      variant: 'primary' as const,
      isActive: true
    }
  ] : [
    {
      label: micMuted ? "Unmute" : "Mute",
      icon: micMuted ? <MicOff /> : <Mic />,
      onClick: () => setMicMuted(!micMuted),
      isActive: !micMuted
    },
    {
      label: videoMuted ? "Start Video" : "Stop Video",
      icon: videoMuted ? <VideoOff /> : <Video />,
      onClick: () => setVideoMuted(!videoMuted),
      isActive: !videoMuted
    },
    {
      label: "Share Screen",
      icon: <MonitorUp />,
      onClick: () => { },
      isActive: false
    },
    {
      label: "Settings",
      icon: <Settings />,
      onClick: () => setShowSettings(!showSettings),
      isActive: showSettings
    },
    {
      label: "End Class",
      icon: <PhoneOff />,
      onClick: handleStop,
      variant: 'destructive' as const,
      isActive: true
    }
  ];

  return (
    <WorkspaceLayout
      header={HeaderOverlay}
      overlay={
        <ControlBarZone>
          <FloatingControlBar actions={actions} />
        </ControlBarZone>
      }
    >
      {/* Full Screen Board Area */}
      <div className="absolute inset-0 bg-secondary/20">
        <BordROISelector value={initialROI} secondaryROI={secondaryROI} onChange={handleROIChange}>
          <div className="w-full h-full flex items-center justify-center p-8 text-center" ref={boardPreviewRef}>
            {!localRunning && (
              <div className="max-w-md space-y-4">
                <h2 className="text-2xl font-semibold tracking-tight text-foreground">Ready to start?</h2>
                <p className="text-muted-foreground">Adjust the capture area above, then click Start Class.</p>
              </div>
            )}
          </div>
        </BordROISelector>
      </div>

      {/* PIP Avatar (Self View) */}
      <div className="absolute top-20 right-4 w-48 aspect-[4/3] bg-black rounded-lg overflow-hidden shadow-lg border border-border ring-1 ring-black/5 z-20 group">
        {/* Draggable handle concept or just fixed for now */}
        <div className="w-full h-full relative">
          <div className="absolute inset-0 flex items-center justify-center bg-muted/50" ref={avatarPreviewRef}>
            <AvatarCanvas width={192} height={144} />
          </div>
          {/* Overlay label */}
          <div className="absolute bottom-2 left-2 px-2 py-0.5 bg-black/50 backdrop-blur rounded text-[10px] text-white font-medium opacity-0 group-hover:opacity-100 transition-opacity">
            You
          </div>
        </div>
      </div>

      {/* Board Capture Label (Floating top left, maybe redundant with header but useful context) */}
      <div className="absolute top-20 left-4 pointer-events-none">
        <div className="px-2 py-1 bg-background/50 backdrop-blur text-[10px] font-medium text-muted-foreground rounded border border-border/20">
          Board Capture Area
        </div>
      </div>

    </WorkspaceLayout>
  );
}

function ControlBtn({ active, onClick, icon: Icon, label }: { active: boolean, onClick: () => void, icon: any, label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-1.5 p-3 rounded-xl transition-all min-w-[70px] group
          ${active ? 'text-white hover:bg-white/10' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
    >
      <div className={`p-2 rounded-full ${active ? 'bg-white/10' : 'bg-transparent border border-white/10'}`}>
        <Icon className={`w-5 h-5 ${!active && 'text-slate-400'}`} />
      </div>
      <span className="text-[10px] font-medium tracking-wide opacity-80 group-hover:opacity-100">{label}</span>
    </button>
  )
}
