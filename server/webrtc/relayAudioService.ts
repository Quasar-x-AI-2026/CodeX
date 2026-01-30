/**
 * relayAudioService.ts
 * 
 * This module runs on the backend (Relay Server).
 * It handles:
 * 1. Accumulating text transcripts.
 * 2. Using the Gemini API (Text-based) to summarize the transcripts.
 */

interface AudioSession {
    sessionId: string;
    transcript: string;
    summary: string;
    locale: string;
}

export class RelayAudioService {
    private sessions = new Map<string, AudioSession>();
    private geminiApiKey: string;

    constructor(apiKey: string) {
        this.geminiApiKey = apiKey;
    }

    /**
     * Initializes a new audio session for a lecture.
     */
    startSession(sessionId: string, locale: string = 'en-US') {
        this.sessions.set(sessionId, {
            sessionId,
            transcript: '',
            summary: '',
            locale
        });
        console.log(`[AudioRelay] Session started: ${sessionId} (${locale})`);
    }

    /**
     * Processes the transcript using Gemini API to get a summary.
     */
    async finalizeSession(sessionId: string, externalTranscript?: string) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            console.warn(`[AudioRelay] Session object not found for: ${sessionId}.`);
            return;
        }

        const transcriptToUse = externalTranscript || session.transcript;

        if (!transcriptToUse) {
            console.warn(`[AudioRelay] No transcript available for session: ${sessionId}`);
            return;
        }

        console.log(`[AudioRelay] Finalizing session: ${sessionId} using provided transcript.`);
        

        try {
            if (!this.geminiApiKey || this.geminiApiKey === "YOUR_GEMINI_API_KEY" || this.geminiApiKey === "YOUR_GEMINI_API_KEY_HERE") {
                throw new Error("Gemini API Key is still set to placeholder. Please update .env with a valid key from Google AI Studio.");
            }

            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite-preview-02-05:generateContent?key=${this.geminiApiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        parts: [
                            {
                                text: `Please provide a concise and professional summary of the following lecture transcript in ${session.locale}:\n\n${transcriptToUse}`
                            }
                        ]
                    }]
                })
            });

            const data: any = await response.json();

            if (data.error) {
                console.error("[AudioRelay] Gemini API Error:", data.error);
                throw new Error(`Gemini API Error: ${data.error.message}`);
            }

            const summary = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!summary) {
                console.error("[AudioRelay] Unexpected Gemini Response Format:", JSON.stringify(data));
                throw new Error("Failed to get a valid summary from Gemini.");
            }

            session.transcript = transcriptToUse;
            session.summary = summary.trim();

            console.log(`[AudioRelay] Session ${sessionId} summarized successfully.`);

            return {
                transcript: session.transcript,
                summary: session.summary
            };

        } catch (error: any) {
            console.error(`[AudioRelay] Error summarizing session ${sessionId}:`, error.message);
            return {
                transcript: transcriptToUse,
                summary: `Could not generate summary: ${error.message}`
            };
        }
    }

    getSession(sessionId: string) {
        return this.sessions.get(sessionId);
    }
}
