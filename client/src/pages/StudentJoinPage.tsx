
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Video, Keyboard } from 'lucide-react';

export default function StudentJoinPage() {
    const [sessionId, setSessionId] = useState('');
    const navigate = useNavigate();

    const handleJoin = (e: React.FormEvent) => {
        e.preventDefault();
        if (sessionId.trim()) {
            navigate(`/student?sessionId=${sessionId.trim()}`);
        }
    };

    return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
            <div className="w-full max-w-md">
                {/* Clean Card */}
                <div className="bg-card border border-border rounded-xl shadow-lg p-8 relative overflow-hidden">

                    <div className="relative z-10">
                        <div className="text-center mb-8">
                            <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mx-auto mb-4">
                                <Video className="w-6 h-6 text-primary" />
                            </div>
                            <h1 className="text-2xl font-bold text-foreground mb-2">Join Session</h1>
                            <p className="text-muted-foreground">Enter the teacher's code to join the class.</p>
                        </div>

                        <form onSubmit={handleJoin} className="space-y-6">
                            <div className="space-y-2">
                                <label htmlFor="sessionId" className="text-sm font-medium text-foreground ml-1 flex items-center gap-2">
                                    <Keyboard className="w-4 h-4 text-muted-foreground" />
                                    Session Code
                                </label>
                                <div className="relative group">
                                    <input
                                        type="text"
                                        id="sessionId"
                                        required
                                        value={sessionId}
                                        onChange={(e) => setSessionId(e.target.value)}
                                        placeholder="e.g. x7k9p2"
                                        className="w-full bg-input/50 border border-input text-foreground rounded-lg px-4 py-3 placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-lg tracking-wide text-center"
                                    />
                                </div>
                            </div>

                            <button
                                type="submit"
                                className="w-full bg-primary hover:bg-primary-hover text-primary-foreground font-semibold py-3 rounded-lg shadow-sm flex items-center justify-center gap-2 transition-all"
                            >
                                Join Now
                                <ArrowRight className="w-4 h-4" />
                            </button>
                        </form>

                        <div className="mt-8 text-center text-xs text-muted-foreground">
                            <p>Secure, real-time classroom environment</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
