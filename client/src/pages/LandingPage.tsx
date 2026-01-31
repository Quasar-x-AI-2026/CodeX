import React from "react";
import { useNavigate } from "react-router-dom";
import {
  Video,
  Shield,
  Zap,
  Wifi,
  Users,
  ArrowRight,
  Cpu,
  Layers
} from "lucide-react";

type Props = {
  onSelectRole: (role: "teacher" | "student") => void;
};

export default function LandingPage({ onSelectRole }: Props) {
  const nav = useNavigate();

  const handleTeacherClick = () => {
    onSelectRole("teacher");
    nav("/teacher");
  }

  const handleStudentClick = () => {
    onSelectRole("student");
    nav("/student");
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Navbar */}
      <nav className="border-b border-border/40 backdrop-blur-md bg-background/80 sticky top-0 z-50">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-primary-foreground font-bold text-lg">C</div>
            <span className="font-semibold text-lg tracking-tight">CodeX</span>
          </div>
          <div className="flex items-center gap-4 text-sm font-medium text-muted-foreground">
            <a href="#features" className="hover:text-foreground transition-colors">Features</a>
            <a href="https://github.com/Quasar-x-AI-2026/CodeX" target="_blank" rel="noreferrer" className="hover:text-foreground transition-colors">GitHub</a>
          </div>
        </div>
      </nav>

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative pt-24 pb-32 overflow-hidden">
          <div className="container mx-auto px-6 relative z-10 text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-secondary/50 text-secondary-foreground text-xs font-medium mb-8 border border-border">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
              </span>
              v2.0 Now Available
            </div>

            <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6 bg-gradient-to-b from-foreground to-muted-foreground bg-clip-text text-transparent">
              Reimagining Video <br className="hidden md:block" />
              Conferencing for the Next Billion.
            </h1>

            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">
              Experience ultra-low bandwidth calls (&lt;50kbps), AI-driven avatars, and high-fidelity screen sharing.
              Built for performance, privacy, and accessibility.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <button
                onClick={handleTeacherClick}
                className="h-12 px-8 rounded-full bg-primary text-primary-foreground font-medium hover:bg-primary-hover transition-all flex items-center gap-2 shadow-lg shadow-primary/20 hover:scale-105 active:scale-95"
              >
                Start as Teacher
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                onClick={handleStudentClick}
                className="h-12 px-8 rounded-full bg-background border border-border text-foreground font-medium hover:bg-secondary/50 transition-all flex items-center gap-2 shadow-sm hover:scale-105 active:scale-95"
              >
                Join as Student
              </button>
            </div>
          </div>

          {/* subtle background glow */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary/5 rounded-full blur-3xl -z-10" />
        </section>

        {/* Features Grid */}
        <section id="features" className="py-24 bg-secondary/20 border-y border-border/50">
          <div className="container mx-auto px-6">
            <div className="text-center mb-16">
              <h2 className="text-3xl font-bold mb-4">Engineered for Efficiency</h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                Traditional video calls consume hundreds of megabytes. CodeX uses AI to reconstruct presence from sparse data, revolutionizing connectivity.
              </p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
              <FeatureCard
                icon={Wifi}
                title="Bandwidth Optimized"
                description="Operates smoothly on 2G/3G networks, consuming <100MB/hour compared to 1GB+ for standard Zoom calls."
              />
              <FeatureCard
                icon={Zap}
                title="Hybrid Compression"
                description="Novel approach using vector-based transmission for board updates and selective bitmap rendering."
              />
              <FeatureCard
                icon={Users}
                title="AI-Driven Avatars"
                description="Deep learning models reconstruct real-time facial expressions from sparse landmarks, requiring minimal data."
              />
              <FeatureCard
                icon={Cpu}
                title="Adaptive FPS"
                description="Intelligent frame rate adjustment based on content type (static text vs. dynamic video) to save resources."
              />
              <FeatureCard
                icon={Shield}
                title="Privacy First"
                description="No raw video stream is ever sent. Only mathematical facial landmarks are transmitted, ensuring total privacy."
              />
              <FeatureCard
                icon={Layers}
                title="Instant Collaboration"
                description="Real-time ROI-based board sharing allows teachers to broadcast specific screen areas instantly."
              />
            </div>
          </div>
        </section>
      </main>

      <footer className="py-8 border-t border-border">
        <div className="container mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <p>&copy; 2026 CodeX Platform. All rights reserved.</p>
          <div className="flex items-center gap-6">
            <a href="#" className="hover:text-foreground">Privacy Policy</a>
            <a href="#" className="hover:text-foreground">Terms of Service</a>
            <a href="#" className="hover:text-foreground">Status</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({ icon: Icon, title, description }: { icon: any, title: string, description: string }) {
  return (
    <div className="bg-card p-6 rounded-2xl border border-border shadow-sm hover:shadow-md transition-shadow group">
      <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center text-primary mb-4 group-hover:scale-110 transition-transform">
        <Icon className="w-6 h-6" />
      </div>
      <h3 className="text-xl font-semibold mb-2">{title}</h3>
      <p className="text-muted-foreground leading-relaxed">
        {description}
      </p>
    </div>
  )
}
