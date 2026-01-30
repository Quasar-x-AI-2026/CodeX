import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import TeacherPage from './pages/TeacherPage';
import StudentPage from './pages/StudentPage';
import React, { useRef, useState } from 'react';
import useRole from './state/role';
import useSession from './state/session';
import { startBoardCapture } from './board/BoardCapture';
import { startTracking, stopTracking } from './avatar/FaceTracker';
import { sendPatch } from './ws/board';
import { sendAvatar } from './ws/avatar';
import type { NormalizedROI } from './board/BordROISelector';

function RouterChildren() {
  const setRole = useRole(state => state.setRole);
  const startSession = useSession(state => state.startSession);
  const endSession = useSession(state => state.endSession);
  const started = useSession(state => state.started);
  const navigate = useNavigate();

  const [roi, setRoi] = useState<NormalizedROI | null>(null);
  const boardCtrlRef = useRef<{ stop: () => void; setROI: (r: NormalizedROI | null) => void; isRunning: () => boolean } | null>(null);
  const avatarPreviewRef = useRef<HTMLDivElement | null>(null);
  const boardPreviewRef = useRef<HTMLDivElement | null>(null);

  async function handleTeacherStart() {
    // Start board capture (will throw if camera access fails)
    const ctrl = await startBoardCapture({
      roi: roi ?? undefined,
      onPatch: (p) => sendPatch(p),
      onError: (e) => console.warn('board capture error', e),
      previewContainer: boardPreviewRef.current ?? null,
      previewFit: 'cover',
    });

    boardCtrlRef.current = ctrl;
    // ensure controller uses the latest ROI
    try { boardCtrlRef.current.setROI(roi ?? null); } catch (e) { /* ignore */ }

    // Start face tracking (will throw on failure) and mount preview into teacher page
    try {
      await startTracking((payload) => sendAvatar(payload), { previewContainer: avatarPreviewRef.current });
    } catch (e) {
      // cleanup board capture if tracking fails
      try { if (boardCtrlRef.current) boardCtrlRef.current.stop(); } catch (ex) { /* ignore */ }
      boardCtrlRef.current = null;
      throw e; // bubble up so UI can show an error
    }

    // Only mark session started after subsystems are running
    startSession();
  }

  async function handleTeacherStop() {
    // stop board capture
    try {
      if (boardCtrlRef.current) {
        try { boardCtrlRef.current.stop(); } catch (e) { console.warn('stop board controller failed', e); }
        boardCtrlRef.current = null;
      }
    } catch (e) {
      console.warn('stop board controller failed', e);
    }

    // stop face tracking
    try { stopTracking(); } catch (e) { console.warn('stopTracking failed', e); }
    endSession();
    navigate('/');
  }

  function handleStudentLeave() {
    endSession();
    navigate('/');
  }

  React.useEffect(() => {
    if (boardCtrlRef.current) {
      try {
        boardCtrlRef.current.setROI(roi ?? null);
      } catch (e) {
        // ignore
      }
    }
  }, [roi]);

  return (
    <Routes>
      <Route path="/" element={<LandingPage onSelectRole={setRole} />} />
      <Route path="/teacher" element={<TeacherPage avatarPreviewRef={avatarPreviewRef} boardPreviewRef={boardPreviewRef} isRunning={started} onStart={handleTeacherStart} onStop={handleTeacherStop} onROIChange={setRoi} initialROI={roi} />} />
      <Route path="/student" element={<StudentPage onLeave={handleStudentLeave} />} />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <RouterChildren />
    </BrowserRouter>
  );
}

export default App;