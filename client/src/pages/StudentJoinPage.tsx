
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
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
            <div className="w-full max-w-md">
                {/* Glassmorphism Card */}
                <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-2xl shadow-2xl p-8 relative overflow-hidden">
                    {/* Decorative gradients */}
                    <div className="absolute -top-24 -left-24 w-48 h-48 bg-indigo-500/30 rounded-full blur-3xl pointer-events-none" />
                    <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-purple-500/30 rounded-full blur-3xl pointer-events-none" />

                    <div className="relative z-10">
                        <div className="text-center mb-8">
                            <div className="w-16 h-16 bg-indigo-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-indigo-500/30">
                                <Video className="w-8 h-8 text-indigo-400" />
                            </div>
                            <h1 className="text-2xl font-bold text-white mb-2">Join Session</h1>
                            <p className="text-slate-400">Enter the teacher's code to join the class.</p>
                        </div>

                        <form onSubmit={handleJoin} className="space-y-6">
                            <div className="space-y-2">
                                <label htmlFor="sessionId" className="text-sm font-medium text-slate-300 ml-1 flex items-center gap-2">
                                    <Keyboard className="w-4 h-4" />
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
                                        className="w-full bg-slate-950/50 border border-white/10 text-white rounded-xl px-4 py-3 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all text-lg tracking-wide text-center"
                                    />
                                    <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-indigo-500/20 to-purple-500/20 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none border border-transparent" />
                                </div>
                            </div>

                            <button
                                type="submit"
                                className="w-full bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-semibold py-3.5 rounded-xl shadow-lg shadow-indigo-500/25 flex items-center justify-center gap-2 transition-all transform hover:scale-[1.02] active:scale-[0.98]"
                            >
                                Join Now
                                <ArrowRight className="w-5 h-5" />
                            </button>
                        </form>

                        <div className="mt-8 text-center text-xs text-slate-500">
                            <p>Secure, real-time classroom environment</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
