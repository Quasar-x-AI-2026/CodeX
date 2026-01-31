
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

  // Handle Mute Toggles (Simulated for this context as actual track mute depends on internal implementation of audio/video hooks)
  useEffect(() => {
    // TODO: Propagate these changes to the actual WebRTC tracks if exposed by useTeacherAudio or FaceTracker
    // For now, these are UI states that would trigger the underlying logic.
    console.log("Mic Muted:", micMuted, "Video Muted:", videoMuted);
  }, [micMuted, videoMuted]);

  const copySession = () => {
    if (sessionId) {
      navigator.clipboard.writeText(sessionId);
      // Could add toast here
    }
  }

  return (
    <div className="h-screen w-screen bg-slate-950 flex flex-col text-white overflow-hidden">
      {/* Navbar */}
      <header className="h-16 border-b border-white/10 bg-slate-900/50 backdrop-blur-md flex items-center justify-between px-6 z-20">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center font-bold">C</div>
            <span className="font-semibold tracking-wide">CodeX Classroom</span>
          </div>
          {sessionId && (
            <div className="flex items-center gap-3 ml-8 bg-white/5 rounded-full px-4 py-1.5 border border-white/10">
              <span className="text-xs text-slate-400 uppercase tracking-wider font-medium">Join Code</span>
              <code className="text-indigo-400 font-mono text-sm font-bold tracking-widest">{sessionId}</code>
              <button onClick={copySession} className="text-slate-400 hover:text-white transition-colors">
                <Copy className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-4">
          <div className="bg-white/5 px-3 py-1.5 rounded-md flex items-center gap-2 text-sm text-slate-300">
            <Users className="w-4 h-4" />
            <span>{peerCount} Students</span>
          </div>
          {localRunning && (
            <span className="flex items-center gap-2 px-3 py-1 bg-red-500/10 text-red-500 rounded-full text-xs font-bold border border-red-500/20 animate-pulse">
              LIVE
            </span>
          )}
        </div>
      </header>

      {/* Main Workspace */}
      <main className="flex-1 p-6 grid grid-cols-12 gap-6 overflow-hidden">
        {/* Board Area */}
        <div className="col-span-8 bg-slate-900 rounded-2xl border border-white/10 overflow-hidden relative shadow-2xl flex flex-col">
          <div className="absolute top-4 left-4 z-10 bg-black/60 backdrop-blur px-3 py-1 rounded-md text-xs font-medium text-white/80">
            Board Capture
          </div>

          <div className="flex-1 relative bg-black/40">
            <BordROISelector value={initialROI} secondaryROI={secondaryROI} onChange={handleROIChange}>
              <div className="w-full h-full flex items-center justify-center p-8" ref={boardPreviewRef}>
                {!localRunning && <div className="text-slate-500">Preview will appear here when session starts...</div>}
              </div>
            </BordROISelector>
          </div>
        </div>

        {/* Avatar & Chat/Settings Area */}
        <div className="col-span-4 flex flex-col gap-6">
          <div className="h-[360px] bg-slate-900 rounded-2xl border border-white/10 overflow-hidden relative shadow-lg">
            <div className="absolute top-4 left-4 z-10 bg-black/60 backdrop-blur px-3 py-1 rounded-md text-xs font-medium text-white/80">
              Instructor Face
            </div>
            {/* Placeholder for Face Tracker Preview */}
            <div className="w-full h-full flex items-center justify-center bg-black/20" ref={avatarPreviewRef}>
              <div className="relative w-48 h-48 rounded-full overflow-hidden border-4 border-indigo-500/30">
                <AvatarCanvas width={192} height={192} />
              </div>
            </div>
          </div>

          <div className="flex-1 bg-slate-900 rounded-2xl border border-white/10 p-6">
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">Session Settings</h3>
            {/* Add more settings here if needed */}
            <div className="text-xs text-slate-500">
              Adjust capture settings and manage student permissions here.
            </div>
          </div>
        </div>
      </main>

      {/* Bottom Control Bar */}
      <footer className="h-20 bg-slate-950/80 backdrop-blur border-t border-white/10 flex items-center justify-center gap-6 z-20">
        {!localRunning ? (
          <button
            onClick={handleStart}
            className="bg-indigo-600 hover:bg-indigo-500 text-white px-8 py-3 rounded-full font-semibold shadow-lg shadow-indigo-500/25 transition-all transform hover:scale-105"
          >
            Start Class
          </button>
        ) : (
          <>
            <ControlBtn
              active={!micMuted}
              onClick={() => setMicMuted(!micMuted)}
              icon={!micMuted ? Mic : MicOff}
              label={!micMuted ? "Mute" : "Unmute"}
            />

            <ControlBtn
              active={!videoMuted}
              onClick={() => setVideoMuted(!videoMuted)}
              icon={!videoMuted ? Video : VideoOff}
              label={!videoMuted ? "Stop Video" : "Start Video"}
            />

            <ControlBtn
              active={false}
              onClick={() => { }}
              icon={MonitorUp}
              label="Share Screen"
            />

            <ControlBtn
              active={false}
              onClick={() => { }}
              icon={Settings}
              label="Settings"
            />

            <div className="w-px h-10 bg-white/10 mx-2" />

            <button
              onClick={handleStop}
              className="bg-red-500 hover:bg-red-600 text-white px-8 py-3 rounded-full font-semibold shadow-lg shadow-red-500/25 transition-all transform hover:scale-105 flex items-center gap-2"
            >
              <PhoneOff className="w-5 h-5" />
              End Class
            </button>
          </>
        )}
      </footer>
    </div>
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
