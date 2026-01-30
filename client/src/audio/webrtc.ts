import { Answer, IceCandidateMessage, Offer, SignalingMessage,  } from "./webRtcTypes";


const DEFAULT_STUN = [{ urls: "stun:stun.l.google.com:19302" }];

function preferOpus(sdp: string): string {
  const lines = sdp.split("\r\n");
  const mLineIndex = lines.findIndex((l) => l.startsWith("m=audio"));
  if (mLineIndex === -1) return sdp;

  const opusLine = lines.find((l) =>
    l.match(/^a=rtpmap:(\d+) opus\/48000/)
  );
  if (!opusLine) return sdp;

  const opusPayload = opusLine.split(" ")[0].split(":")[1];
  const mLineParts = lines[mLineIndex].split(" ");
  const header = mLineParts.slice(0, 3);
  const payloads = mLineParts.slice(3).filter((p) => p !== opusPayload);
  lines[mLineIndex] = [...header, opusPayload, ...payloads].join(" ");

  return lines.join("\r\n");
}

type SendSignal = (msg: SignalingMessage) => void;

type RemoteTrackCallback = (
  stream: MediaStream,
  fromSocketId?: string
) => void;

type PeerOptions = {
  send: SendSignal;
  sessionId: string;
  onRemoteTrack?: RemoteTrackCallback;
  iceServers?: RTCIceServer[];
  debug?: (msg: string, ...args: unknown[]) => void;
};

/* =======================
   ✅ SAFE SEND GUARD
   ======================= */
function safeSend(options: PeerOptions, msg: SignalingMessage) {
  try {
    options.send(msg);
  } catch (e) {
    if (options.debug) {
      options.debug("WS not ready, skipping signaling send", e);
    }
  }
}

function createPC(options: PeerOptions, targetSocketId?: string) {
  const pc = new RTCPeerConnection({
    iceServers: options.iceServers ?? DEFAULT_STUN,
  });

  const queuedIce: RTCIceCandidateInit[] = [];
  let remoteDescSet = false;

  pc.onicecandidate = (ev) => {
    if (!ev.candidate) return;
    const msg: IceCandidateMessage = {
      type: "ice",
      candidate: ev.candidate.toJSON(),
      recipient: targetSocketId ? "students" : undefined,
      targetSocketId,
    };
    safeSend(options, msg);
  };

  pc.ontrack = (ev) => {
    const stream = ev.streams?.[0];
    if (stream && options.onRemoteTrack) {
      options.onRemoteTrack(stream, targetSocketId);
    }
  };

  async function addIceCandidate(candidate: RTCIceCandidateInit) {
    if (!remoteDescSet) {
      queuedIce.push(candidate);
      return;
    }
    try {
      await pc.addIceCandidate(candidate);
    } catch (e) {
      options.debug?.("addIceCandidate error", e);
    }
  }

  async function flushQueue() {
    remoteDescSet = true;
    while (queuedIce.length) {
      const c = queuedIce.shift()!;
      try {
        await pc.addIceCandidate(c);
      } catch (e) {
        options.debug?.("queued addIceCandidate error", e);
      }
    }
  }

  return { pc, addIceCandidate, flushQueue };
}

/* =======================
   TEACHER AUDIO MANAGER
   ======================= */

export class TeacherAudioManager {
  private options: PeerOptions;
  private pcs = new Map<
    string,
    {
      pc: RTCPeerConnection;
      addIceCandidate: (c: RTCIceCandidateInit) => Promise<void>;
      flushQueue: () => Promise<void>;
      restartAttempts: number;
    }
  >();
  private localStream: MediaStream | null = null;
  private getLocalStream: () => Promise<MediaStream>;

  constructor(opts: PeerOptions & { getLocalStream: () => Promise<MediaStream> }) {
    this.options = opts;
    this.getLocalStream = opts.getLocalStream;
  }

  private log(...args: unknown[]) {
    this.options.debug?.("TeacherAudioManager:", ...args);
  }

  async ensureLocalStream() {
    if (!this.localStream) {
      this.localStream = await this.getLocalStream();
    }
    return this.localStream;
  }

  async addStudent(targetSocketId: string) {
    if (this.pcs.has(targetSocketId)) return;

    await this.ensureLocalStream();

    const { pc, addIceCandidate, flushQueue } = createPC(this.options, targetSocketId);

    
    if (this.localStream) {
      for (const t of this.localStream.getAudioTracks()) pc.addTrack(t, this.localStream);
    }

    
    const caps = RTCRtpSender.getCapabilities?.("audio");
    if (caps && caps.codecs) {
      const opusCodecs = caps.codecs.filter((c) => c.mimeType.toLowerCase().includes("opus"));
      if (opusCodecs.length > 0) {
        try {
          const transceivers = pc.getTransceivers();
          for (const tr of transceivers) {
            if (tr.receiver && tr.receiver.track && tr.receiver.track.kind === "audio") continue;
            
            if (typeof (tr as any).setCodecPreferences === "function") (tr as any).setCodecPreferences(opusCodecs);
          }
        } catch (e) {
          this.log("setCodecPreferences failed", e);
        }
      }
    }

    pc.onconnectionstatechange = () => {
      if (
        pc.connectionState === "failed" ||
        pc.connectionState === "disconnected"
      ) {
        this.attemptRestart(targetSocketId);
      }
    };

    this.pcs.set(targetSocketId, {
      pc,
      addIceCandidate,
      flushQueue,
      restartAttempts: 0,
    });

    const offer = await pc.createOffer();
    await pc.setLocalDescription({
      type: offer.type,
      sdp: preferOpus(offer.sdp ?? ""),
    });

    safeSend(this.options, {
      type: "sdp",
      sdpType: "offer",
      sdp: pc.localDescription!,
      recipient: "students",
      targetSocketId,
    });

    await flushQueue();
  }

  async handleAnswer(fromSocketId: string, answer: RTCSessionDescriptionInit) {
    const ent = this.pcs.get(fromSocketId);
    if (!ent) return;
    await ent.pc.setRemoteDescription(answer);
  }

  async handleIce(fromSocketId: string, candidate: RTCIceCandidateInit) {
    const ent = this.pcs.get(fromSocketId);
    if (!ent) return;
    await ent.addIceCandidate(candidate);
  }

  async removeStudent(targetSocketId: string) {
    const ent = this.pcs.get(targetSocketId);
    if (!ent) return;
    try { ent.pc.close(); } catch {};
    this.pcs.delete(targetSocketId);
  }

  async attemptRestart(targetSocketId: string) {
    const ent = this.pcs.get(targetSocketId);
    if (!ent) return;

    if (ent.restartAttempts++ >= 3) {
      this.log("recreating pc", targetSocketId);
      this.pcs.delete(targetSocketId);
      setTimeout(() => this.addStudent(targetSocketId), 1500);
      return;
    }

    try {
      const offer = await ent.pc.createOffer({ iceRestart: true });
      await ent.pc.setLocalDescription({
        type: offer.type,
        sdp: preferOpus(offer.sdp ?? ""),
      });

      safeSend(this.options, {
        type: "sdp",
        sdpType: "offer",
        sdp: ent.pc.localDescription!,
        recipient: "students",
        targetSocketId,
      });
    } catch (e) {
      this.log("ice restart failed", e);
      
      setTimeout(() => this.attemptRestart(targetSocketId), 1000 * ent.restartAttempts);
    }
  }

  async handleWorkerOffer(fromSocketId: string, offer: RTCSessionDescriptionInit) {
    
    const ent = this.pcs.get(fromSocketId);
    if (!ent) {
      
      await this.addStudent(fromSocketId);
    }
    const e = this.pcs.get(fromSocketId);
    if (!e) return;
    try {
      await e.pc.setRemoteDescription(offer);
      const answer = await e.pc.createAnswer();
      const sdpStr = preferOpus(answer.sdp ?? "");
      await e.pc.setLocalDescription({ type: answer.type, sdp: sdpStr });
      const msg: Answer = { type: "sdp", sdpType: "answer", sdp: e.pc.localDescription as RTCSessionDescriptionInit, recipient: "students", targetSocketId: fromSocketId };
      this.options.send(msg);
    } catch (ex) {
      this.log("handleWorkerOffer error", ex);
    }
  }

  async close() {
    for (const [k, v] of this.pcs.entries()) {
      try { v.pc.close(); } catch {}
      this.pcs.delete(k);
    }
    if (this.localStream) {
      for (const t of this.localStream.getTracks()) t.stop();
      this.localStream = null;
    }
  }
}


export class StudentAudioManager {
  private options: PeerOptions;
  private pcEntry?: {
    pc: RTCPeerConnection;
    addIceCandidate: (c: RTCIceCandidateInit) => Promise<void>;
    flushQueue: () => Promise<void>;
    restartAttempts: number;
  };

  constructor(opts: PeerOptions) {
    this.options = opts;
  }

  async handleOffer(fromSocketId: string, offer: RTCSessionDescriptionInit) {
    
    if (this.pcEntry) {
      try { this.pcEntry.pc.close(); } catch {}
      this.pcEntry = undefined;
    }

    const { pc, addIceCandidate, flushQueue } = createPC(
      this.options,
      fromSocketId
    );

    pc.onconnectionstatechange = () => {
      if (
        pc.connectionState === "failed" ||
        pc.connectionState === "disconnected"
      ) {
        this.attemptRestart(fromSocketId);
      }
    };

    
    const caps = RTCRtpSender.getCapabilities?.("audio");
    if (caps && caps.codecs) {
      const opusCodecs = caps.codecs.filter((c) => c.mimeType.toLowerCase().includes("opus"));
      if (opusCodecs.length > 0) {
        try {
          const transceiver = pc.addTransceiver("audio", { direction: "recvonly" });
          if (typeof (transceiver as any).setCodecPreferences === "function") (transceiver as any).setCodecPreferences(opusCodecs);
        } catch (e) {
          this.log("setCodecPreferences failed on recv", e);
        }
      } else {
        pc.addTransceiver("audio", { direction: "recvonly" });
      }
    } else {
      pc.addTransceiver("audio", { direction: "recvonly" });
    }

    

    try {
      await pc.setRemoteDescription(offer);
      await flushQueue();
      const answer = await pc.createAnswer();
      const sdpStr = preferOpus(answer.sdp ?? "");
      await pc.setLocalDescription({ type: answer.type, sdp: sdpStr });
      const msg: Answer = { type: "sdp", sdpType: "answer", sdp: pc.localDescription as RTCSessionDescriptionInit, recipient: "teacher", targetSocketId: fromSocketId };
      this.options.send(msg);
    } catch (e) {
      this.log("handleOffer error", e);
    }

    this.pcEntry = {
      pc,
      addIceCandidate,
      flushQueue,
      restartAttempts: 0,
    };
  }

  async handleIce(_: string, candidate: RTCIceCandidateInit) {
    if (this.pcEntry) await this.pcEntry.addIceCandidate(candidate);
  }

  async attemptRestart(teacherSocketId: string) {
    if (!this.pcEntry) return;
    const ent = this.pcEntry;
    if (ent.restartAttempts >= 3) {
      this.log("recreate pc after repeated failures");
      try { ent.pc.close(); } catch {}
      this.pcEntry = undefined;
      return;
    }

    try {
      const offer = await ent.pc.createOffer({ iceRestart: true });
      const sdpStr = preferOpus(offer.sdp ?? "");
      await ent.pc.setLocalDescription({ type: offer.type, sdp: sdpStr });
      const msg: Offer = { type: "sdp", sdpType: "offer", sdp: ent.pc.localDescription as RTCSessionDescriptionInit, recipient: "teacher", targetSocketId: teacherSocketId };
      this.options.send(msg);
    } catch (e) {
      this.log("attemptRestart failed", e);
      setTimeout(() => this.attemptRestart(teacherSocketId), 1000 * ent.restartAttempts);
    }
  }

  async close() {
    if (!this.pcEntry) return;
    try { this.pcEntry.pc.close(); } catch {}
    this.pcEntry = undefined;
  }
}

let peerConnection: RTCPeerConnection | null = null;
let microphoneStream: MediaStream | null = null;
const sessionId: string | null = null;
const role: 'teacher' | 'student' | null = null;
let negotiationAttempts = 0;
const maxNegotiationAttempts = 3;
const retryDelay = 1000; 

function createPeerConnection() {
    if (peerConnection) {
        peerConnection.close(); 
    }
    peerConnection = new RTCPeerConnection({ iceServers: DEFAULT_STUN });

    peerConnection.onicecandidate = (event) => {
        if (event.candidate) { /* empty */ }
    };

    peerConnection.ontrack = (event) => {
        
    };
}

function reconnectWebSocket() {
    
    createPeerConnection();
    if (role === 'teacher' && !microphoneStream) {
        navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
            microphoneStream = stream;
            if (microphoneStream) {
                microphoneStream.getTracks().forEach(track => peerConnection?.addTrack(track, microphoneStream!));
            }
        });
    }
    
    if (peerConnection) {
        peerConnection.createOffer().then(offer => {
        if (peerConnection) {
            return peerConnection.setLocalDescription(offer);
        }
    }).then(() => {
        
        }).catch(handleNegotiationFailure);
    }
}

function handleNegotiationFailure() {
    if (negotiationAttempts < maxNegotiationAttempts) {
        negotiationAttempts++;
        setTimeout(() => reconnectWebSocket(), retryDelay);
    } else {
        console.error('Max negotiation attempts reached.');
    }
}


createPeerConnection();

export default { TeacherAudioManager, StudentAudioManager };
