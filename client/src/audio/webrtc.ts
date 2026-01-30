import {
  Answer,
  IceCandidateMessage,
  Offer,
  SignalingMessage,
} from "./webrtctypes";

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

    const stream = await this.ensureLocalStream();
    const { pc, addIceCandidate, flushQueue } = createPC(
      this.options,
      targetSocketId
    );

    stream.getAudioTracks().forEach((t) => pc.addTrack(t, stream));

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
    if (ent) await ent.addIceCandidate(candidate);
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
      setTimeout(
        () => this.attemptRestart(targetSocketId),
        ent.restartAttempts * 1000
      );
    }
  }
}

/* =======================
   STUDENT AUDIO MANAGER
   ======================= */

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
    this.pcEntry?.pc.close();

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

    pc.addTransceiver("audio", { direction: "recvonly" });

    await pc.setRemoteDescription(offer);
    await flushQueue();

    const answer = await pc.createAnswer();
    await pc.setLocalDescription({
      type: answer.type,
      sdp: preferOpus(answer.sdp ?? ""),
    });

    safeSend(this.options, {
      type: "sdp",
      sdpType: "answer",
      sdp: pc.localDescription!,
      recipient: "teacher",
      targetSocketId: fromSocketId,
    });

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

    if (ent.restartAttempts++ >= 3) {
      ent.pc.close();
      this.pcEntry = undefined;
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
        recipient: "teacher",
        targetSocketId: teacherSocketId,
      });
    } catch {
      setTimeout(
        () => this.attemptRestart(teacherSocketId),
        ent.restartAttempts * 1000
      );
    }
  }
}

export default { TeacherAudioManager, StudentAudioManager };
