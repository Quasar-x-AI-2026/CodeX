/**
 * AudioBroadcastClient.ts
 * 
 * This module runs on the frontend.
 * It handles:
 * 1. Capturing teacher microphone.
 * 2. Broadcasting audio to students via WebRTC (P2P).
 * 3. Streaming audio chunks to the Relay Server via WebSocket for processing/storage.
 */

export type SignalingChannel = {
    send: (target: string, message: any) => void;
    onMessage: (callback: (from: string, message: any) => void) => void;
    sendBinary?: (data: Blob | ArrayBuffer) => void; 
};

const ICE_SERVERS: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];

export class TeacherBroadcastClient {
    private peerConnection: RTCPeerConnection | null = null;
    private localStream: MediaStream | null = null;
    private mediaRecorder: MediaRecorder | null = null;
    private signaling: SignalingChannel;
    private sessionId: string;

    constructor(signaling: SignalingChannel, sessionId: string) {
        this.signaling = signaling;
        this.sessionId = sessionId;
    }

    async start(studentId: string) {
        try {
            
            this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });

            
            this.peerConnection = new RTCPeerConnection({ iceServers: ICE_SERVERS });
            this.localStream.getTracks().forEach(t => this.peerConnection?.addTrack(t, this.localStream!));

            this.peerConnection.onicecandidate = (e) => {
                if (e.candidate) this.signaling.send(studentId, { type: "ice-candidate", candidate: e.candidate });
            };

            const offer = await this.peerConnection.createOffer();
            await this.peerConnection.setLocalDescription(offer);
            this.signaling.send(studentId, { type: "offer", sdp: offer });

            
            this.setupBackendStreaming();

        } catch (err) {
            console.error("Broadcast failed:", err);
        }
    }

    private setupBackendStreaming() {
        if (!this.localStream) return;

        
        this.signaling.send("server", { channel: "/audio", payload: { type: "start", locale: "en-US" } });

        this.mediaRecorder = new MediaRecorder(this.localStream, { mimeType: 'audio/webm;codecs=opus' });

        this.mediaRecorder.ondataavailable = async (event) => {
            if (event.data.size > 0) {
                
                const reader = new FileReader();
                reader.onloadend = () => {
                    const base64data = (reader.result as string).split(',')[1];
                    this.signaling.send("server", {
                        channel: "/audio",
                        payload: { type: "chunk", data: base64data }
                    });
                };
                reader.readAsDataURL(event.data);
            }
        };

        
        this.mediaRecorder.start(1000);
        console.log("Streaming to backend started...");
    }

    async handleSignaling(message: any) {
        if (!this.peerConnection) return;
        if (message.type === "answer") {
            await this.peerConnection.setRemoteDescription(new RTCSessionDescription(message.sdp));
        } else if (message.type === "ice-candidate") {
            await this.peerConnection.addIceCandidate(new RTCIceCandidate(message.candidate));
        }
    }

    stop() {
        
        this.signaling.send("server", { channel: "/audio", payload: { type: "stop" } });

        this.mediaRecorder?.stop();
        this.localStream?.getTracks().forEach(t => t.stop());
        this.peerConnection?.close();
    }
}

