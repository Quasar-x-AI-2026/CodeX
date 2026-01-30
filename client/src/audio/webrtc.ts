import { Answer, IceCandidateMessage, Offer, SignalingMessage,  } from "./webRtcTypes";


const DEFAULT_STUN = [{ urls: "stun:stun.l.google.com:19302" }];

function preferOpus(sdp: string): string {
  const lines = sdp.split("\r\n");
  const mLineIndex = lines.findIndex((l) => l.startsWith("m=audio"));
  if (mLineIndex === -1) return sdp;

  
  const opusLine = lines.find((l) => l.match(/^a=rtpmap:(\d+) opus\/48000/));
  if (!opusLine) return sdp;
  const opusPayload = opusLine.split(" ")[0].split(":")[1];

  const mLineParts = lines[mLineIndex].split(" ");
  
  const header = mLineParts.slice(0, 3);
  const payloads = mLineParts.slice(3).filter((p) => p !== opusPayload);
  const newMLine = [...header, opusPayload, ...payloads].join(" ");
  lines[mLineIndex] = newMLine;
  return lines.join("\r\n");
}

type SendSignal = (msg: SignalingMessage) => void;

type RemoteTrackCallback = (stream: MediaStream, fromSocketId?: string) => void;

type PeerOptions = {
  send: SendSignal;
  sessionId: string;
  onRemoteTrack?: RemoteTrackCallback;
  iceServers?: RTCIceServer[];
  debug?: (msg: string, ...args: unknown[]) => void;
};

function createPC(options: PeerOptions, targetSocketId?: string) {
  const pc = new RTCPeerConnection({ iceServers: options.iceServers ?? DEFAULT_STUN });
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
    options.send(msg);
  };

  pc.ontrack = (ev) => {
    const stream = ev.streams && ev.streams[0];
    if (stream && options.onRemoteTrack) options.onRemoteTrack(stream, targetSocketId);
  };

  async function addIceCandidate(candidate: RTCIceCandidateInit) {
    if (!remoteDescSet) {
      queuedIce.push(candidate);
      return;
    }
    try {
      await pc.addIceCandidate(candidate as RTCIceCandidateInit);
    } catch (e) {
      if (options.debug) options.debug("addIceCandidate error", e);
    }
  }

  async function flushQueue() {
    remoteDescSet = true;
    while (queuedIce.length > 0) {
      const c = queuedIce.shift()!;
      try {
        await pc.addIceCandidate(c as RTCIceCandidateInit);
      } catch (e) {
        if (options.debug) options.debug("queued addIceCandidate error", e);
      }
    }
  }

  return { pc, addIceCandidate, flushQueue };
}


export class TeacherAudioManager {
  private options: PeerOptions;
  private pcs: Map<string, { pc: RTCPeerConnection; addIceCandidate: (c: RTCIceCandidateInit) => Promise<void>; flushQueue: () => Promise<void>; restartAttempts: number }> = new Map();
  private localStream: MediaStream | null = null;
  private getLocalStream: () => Promise<MediaStream>;

  constructor(opts: PeerOptions & { getLocalStream: () => Promise<MediaStream> }) {
    this.options = opts;
    this.getLocalStream = opts.getLocalStream;
  }

  private log(...args: unknown[]) {
    if (this.options.debug) this.options.debug("TeacherAudioManager:", ...args);
  }

  async ensureLocalStream() {
    if (this.localStream) return this.localStream;
    this.localStream = await this.getLocalStream();
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
            
            if (typeof (tr).setCodecPreferences === "function") (tr).setCodecPreferences(opusCodecs);
          }
        } catch (e) {
          this.log("setCodecPreferences failed", e);
        }
      }
    }

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      this.log("connection state", targetSocketId, state);
      if (state === "failed" || state === "disconnected") {
        this.attemptRestart(targetSocketId);
      }
    };

    this.pcs.set(targetSocketId, { pc, addIceCandidate, flushQueue, restartAttempts: 0 });

    
    const offer = await pc.createOffer();
    const sdpStr = preferOpus(offer.sdp ?? "");
    await pc.setLocalDescription({ type: offer.type, sdp: sdpStr });

    const msg: Offer = {
      type: "sdp",
      sdpType: "offer",
      sdp: pc.localDescription as RTCSessionDescriptionInit,
      recipient: "students",
      targetSocketId,
    };

    this.options.send(msg);

    await flushQueue();
  }

  async handleAnswer(fromSocketId: string, answer: RTCSessionDescriptionInit) {
    const ent = this.pcs.get(fromSocketId);
    if (!ent) return;
    try {
      await ent.pc.setRemoteDescription(answer);
    } catch (e) {
      this.log("setRemoteDescription(answer) error", e);
    }
  }

  async handleIce(fromSocketId: string, candidate: RTCIceCandidateInit) {
    const ent = this.pcs.get(fromSocketId);
    if (!ent) return;
    await ent.addIceCandidate(candidate);
  }

  async removeStudent(targetSocketId: string) {
    const ent = this.pcs.get(targetSocketId);
    if (!ent) return;
    try { ent.pc.close(); } catch {
      console.warn("error closing peer connection");
    };
    this.pcs.delete(targetSocketId);
  }

  async attemptRestart(targetSocketId: string) {
    const ent = this.pcs.get(targetSocketId);
    if (!ent) return;
    if (ent.restartAttempts >= 3) {
      
      this.log("recreate pc after repeated failures", targetSocketId);
      await this.removeStudent(targetSocketId);
      
      setTimeout(() => this.addStudent(targetSocketId), 1000 + Math.random() * 1000);
      return;
    }

    ent.restartAttempts++;
    try {
      
      const offer = await ent.pc.createOffer({ iceRestart: true });
      const sdpStr = preferOpus(offer.sdp ?? "");
      await ent.pc.setLocalDescription({ type: offer.type, sdp: sdpStr });
      const msg: Offer = {
        type: "sdp",
        sdpType: "offer",
        sdp: ent.pc.localDescription as RTCSessionDescriptionInit,
        recipient: "students",
        targetSocketId,
      };
      this.options.send(msg);
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
      try { v.pc.close(); } catch {
        console.warn("error closing peer connection");
      }
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
  private pcEntry?: { pc: RTCPeerConnection; addIceCandidate: (c: RTCIceCandidateInit) => Promise<void>; flushQueue: () => Promise<void>; restartAttempts: number };

  constructor(opts: PeerOptions) {
    this.options = opts;
  }

  private log(...args: unknown[]) {
    if (this.options.debug) this.options.debug("StudentAudioManager:", ...args);
  }

  async handleOffer(fromSocketId: string, offer: RTCSessionDescriptionInit) {
    
    if (this.pcEntry) {
      try { this.pcEntry.pc.close(); } catch {
        console.warn("error closing peer connection");
      }
      this.pcEntry = undefined;
    }

    const { pc, addIceCandidate, flushQueue } = createPC(this.options, fromSocketId);

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      this.log("connection state", state);
      if (state === "failed" || state === "disconnected") {
        this.attemptRestart(fromSocketId);
      }
    };

    
    const caps = RTCRtpSender.getCapabilities?.("audio");
    if (caps && caps.codecs) {
      const opusCodecs = caps.codecs.filter((c) => c.mimeType.toLowerCase().includes("opus"));
      if (opusCodecs.length > 0) {
        try {
          const transceiver = pc.addTransceiver("audio", { direction: "recvonly" });
          if (typeof (transceiver).setCodecPreferences === "function") (transceiver).setCodecPreferences(opusCodecs);
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

    this.pcEntry = { pc, addIceCandidate, flushQueue, restartAttempts: 0 };
  }

  async handleIce(fromSocketId: string, candidate: RTCIceCandidateInit) {
    if (!this.pcEntry) return;
    await this.pcEntry.addIceCandidate(candidate);
  }

  async attemptRestart(teacherSocketId: string) {
    if (!this.pcEntry) return;
    const ent = this.pcEntry;
    if (ent.restartAttempts >= 3) {
      this.log("recreate pc after repeated failures");
      try { ent.pc.close(); } catch {
        console.warn("error closing peer connection");
      }
      this.pcEntry = undefined;
      
      return;
    }

    ent.restartAttempts++;
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
    try { this.pcEntry.pc.close(); } catch {
      this.log("error closing peer connection");
    }
    this.pcEntry = undefined;
  }
}

type OnIceCandidate = (candidate: RTCIceCandidateInit) => void;

/**
 * createPeerConnection - lightweight helper for creating/configuring an RTCPeerConnection
 *
 * Responsibilities:
 * - create RTCPeerConnection with sane defaults
 * - expose helpers: createOffer, createAnswer, applyRemoteDescription
 * - allow attaching a local MediaStream via addLocalStream()
 * - emit ICE candidates via onIceCandidate callback
 * - queue ICE until remote description is set
 *
 * Does NOT perform any role-specific logic, signaling, or UI work.
 */
export function createPeerConnection(onIceCandidate?: OnIceCandidate, iceServers: RTCIceServer[] = DEFAULT_STUN) {
  const pc = new RTCPeerConnection({ iceServers });
  const queuedIce: RTCIceCandidateInit[] = [];
  let remoteDescSet = false;

  pc.onicecandidate = (ev) => {
    if (!ev.candidate) return;
    try {
      const payload = ev.candidate.toJSON();
      if (onIceCandidate) onIceCandidate(payload);
    } catch (e) {
      // swallow - ICE emission should not throw
      // degrade silently on ICE errors
      // eslint-disable-next-line no-console
      console.warn("onicecandidate callback failed", e);
    }
  };

  // leave ontrack handling to consumer via pc.ontrack

  async function addIceCandidate(candidate: RTCIceCandidateInit) {
    if (!remoteDescSet) {
      queuedIce.push(candidate);
      return;
    }
    try {
      await pc.addIceCandidate(candidate);
    } catch (e) {
      // ICE failures should degrade silently
      // eslint-disable-next-line no-console
      console.warn("addIceCandidate failed", e);
    }
  }

  async function flushQueue() {
    remoteDescSet = true;
    while (queuedIce.length > 0) {
      const c = queuedIce.shift()!;
      try {
        await pc.addIceCandidate(c);
      } catch (e) {
        // continue on error
        // eslint-disable-next-line no-console
        console.warn("queued addIceCandidate error", e);
      }
    }
  }

  function addLocalStream(stream: MediaStream) {
    for (const t of stream.getTracks()) pc.addTrack(t, stream);
  }

  async function createOffer(options?: RTCOfferOptions) {
    const offer = await pc.createOffer(options);
    const sdpStr = preferOpus(offer.sdp ?? "");
    await pc.setLocalDescription({ type: offer.type, sdp: sdpStr });
    return pc.localDescription as RTCSessionDescriptionInit;
  }

  async function createAnswer() {
    const answer = await pc.createAnswer();
    const sdpStr = preferOpus(answer.sdp ?? "");
    await pc.setLocalDescription({ type: answer.type, sdp: sdpStr });
    return pc.localDescription as RTCSessionDescriptionInit;
  }

  async function applyRemoteDescription(desc: RTCSessionDescriptionInit) {
    await pc.setRemoteDescription(desc);
    await flushQueue();
  }

  function close() {
    try { pc.close(); } catch {
      // ignore
    }
  }

  return { pc, addLocalStream, createOffer, createAnswer, applyRemoteDescription, addIceCandidate, close };
}

export default { TeacherAudioManager, StudentAudioManager };
