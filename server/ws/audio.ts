import type { WebSocket } from "ws";
import { getSessionForSocket } from "../sessions/join";
import { RelayAudioService } from "../webrtc/relayAudioService";


const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "YOUR_GEMINI_API_KEY";
const relayService = new RelayAudioService(GEMINI_API_KEY);

export function handle(ws: WebSocket, payload: unknown) {
    try {
        const socketId = (ws as any).id as string;
        const sessionId = getSessionForSocket(socketId);

        if (!sessionId) {
            console.warn("audio.handle: socket not in a session", socketId);
            return;
        }

        if (!payload || typeof payload !== "object") return;
        const p = payload as any;

        switch (p.type) {
            case "start":
                console.log(`[Audio] Starting text-session ${sessionId} for socket ${socketId}`);
                relayService.startSession(sessionId, p.locale || "en-US");
                break;

            case "stop":
                console.log(`[Audio] Stop requested. Finalizing summary for session: ${sessionId}`);
                const transcript = p.transcript || "";

                
                console.log(`\n--- RECEIVED TRANSCRIPT for ${sessionId} ---\n${transcript}\n----------------------------------\n`);

                relayService.finalizeSession(sessionId, transcript).then((result) => {
                    if (result) {
                        console.log(`[Audio] Gemini summary generated for ${sessionId}`);
                        
                        ws.send(JSON.stringify({
                            channel: "/audio",
                            payload: { type: "summary", ...result }
                        }));
                    }
                }).catch(err => {
                    console.error(`[Audio] Error summarizing session ${sessionId}:`, err);
                });
                break;

            case "chunk":
                
                
                break;

            default:
                console.warn("audio.handle: unknown message type", p.type);
        }
    } catch (err) {
        console.warn("audio.handle error", err);
    }
}
