import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import TeacherPage from './pages/TeacherPage';
import StudentPage from './pages/StudentPage';
import StudentJoinPage from './pages/StudentJoinPage';
import React, { useRef, useState } from 'react';
import BoardCanvas from './board/BoardCanvas';
import useRole from './state/role';
import useSession from './state/session';
import { startBoardCapture } from './board/utils/BoardCapture';
import { startTracking, stopTracking } from './avatar/FaceTracker';
import controllers from './avatar/utils/controllers';
import { sendPatch } from './ws/board';
import { sendAvatar } from './ws/avatar';
import { sendMessage } from './ws/socket';
import type { NormalizedROI } from './board/BordROISelector';

function RouterChildren() {
  const setRole = useRole(state => state.setRole);
  const startSession = useSession(state => state.startSession);
  const endSession = useSession(state => state.endSession);
  const started = useSession(state => state.started);
  const navigate = useNavigate();

  const [roi, setRoi] = useState<NormalizedROI | null>(null);
  const [personRoi, setPersonRoi] = useState<NormalizedROI | null>(null);
  const isNextUpdateAutoRef = useRef(false);
  const boardCtrlRef = useRef<{ stop: () => void; setROI: (r: NormalizedROI | null, fromUser?: boolean) => void; isRunning: () => boolean } | null>(null);
  const avatarPreviewRef = useRef<HTMLDivElement | null>(null);
  const boardPreviewRef = useRef<HTMLDivElement | null>(null);

  async function handleTeacherStart() {

    const generateSessionId = () => Math.random().toString(36).slice(2, 8);
    const sid = generateSessionId();


    // Notify server of session join early so subsequent avatar/patch messages are associated with session
    try {
      const { sendMessage } = await import('./ws/socket');
      sendMessage({ type: 'join', sessionId: sid, role: 'teacher' });
    } catch (e) {
      console.warn('failed to send join message', e);
    }

    const ctrl = await startBoardCapture({
      roi: roi ?? undefined,
      onPatch: (p) => sendPatch(p),
      onROIChange: (r) => {
        isNextUpdateAutoRef.current = true;
        setRoi(r);
      },
      onROIsChange: (rois) => {
        if (rois.person) setPersonRoi(rois.person);
        else setPersonRoi(null);
      },
      onError: (e) => console.warn('board capture error', e),
      previewContainer: boardPreviewRef.current ?? null,
      previewFit: 'cover',
    });


    // boardCtrlRef.current = ctrl; (This is line 51, keep it but remove the try/catch block below)
    boardCtrlRef.current = ctrl;

    // Remove the redundant setROI here because startBoardCapture already initializes it.



    try {
      await startTracking((payload) => { sendAvatar(payload); try { try { console.debug && console.debug("FaceTracker: local payload", payload); } catch (e) { } controllers.updateControls(payload); } catch (e) { /* ignore */ } }, {
        previewContainer: avatarPreviewRef.current,
        onLandmarks: (lm) => { try { sendMessage({ type: 'avatar', payload: { landmarks: lm } }); } catch (e) { console.warn('failed sending landmarks', e); } },
        onPhoto: (dataUrl, w, h, lm) => { try { sendMessage({ type: 'avatar', payload: { photo: dataUrl, w, h, photoLandmarks: lm } }); } catch (e) { console.warn('failed sending photo', e); } }
      });
    } catch (e) {

      try { if (boardCtrlRef.current) boardCtrlRef.current.stop(); } catch (ex) {
        console.warn('stop board controller failed', ex);
      }
      boardCtrlRef.current = null;
      throw e;
    }


    startSession(sid);
  }

  async function handleTeacherStop() {

    try {
      if (boardCtrlRef.current) {
        try { boardCtrlRef.current.stop(); } catch (e) { console.warn('stop board controller failed', e); }
        boardCtrlRef.current = null;
      }
    } catch (e) {
      console.warn('stop board controller failed', e);
    }


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
        const isAuto = isNextUpdateAutoRef.current;
        isNextUpdateAutoRef.current = false;
        // if isAuto is true, then fromUser is false.
        boardCtrlRef.current.setROI(roi ?? null, !isAuto);
      } catch (e) {
        console.warn('setROI failed', e);
      }
    }
  }, [roi]);

  return (
    <Routes>
      <Route path="/" element={<LandingPage onSelectRole={setRole} />} />
      <Route path="/teacher" element={<TeacherPage avatarPreviewRef={avatarPreviewRef} boardPreviewRef={boardPreviewRef} isRunning={started} onStart={handleTeacherStart} onStop={handleTeacherStop} onROIChange={setRoi} initialROI={roi} secondaryROI={personRoi} sessionId={useSession(state => state.sessionId)} />} />
      <Route path="/student/join" element={<StudentJoinPage />} />
      <Route path="/student" element={<StudentPage onLeave={handleStudentLeave} boardView={<BoardCanvas />} />} />
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