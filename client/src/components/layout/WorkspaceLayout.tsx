import React from 'react';
import { cn } from '../../lib/utils';

interface WorkspaceLayoutProps {
    children: React.ReactNode;
    className?: string;
    // Slots for specific areas if needed, but "Single primary workspace" implies simple children
    header?: React.ReactNode;
    overlay?: React.ReactNode;
}

export function WorkspaceLayout({ children, className, header, overlay }: WorkspaceLayoutProps) {
    return (
        <div className="relative h-screen w-full bg-background text-foreground overflow-hidden flex flex-col">
            {/* Background pattern or subtle texture could go here */}

            {header && (
                <header className="absolute top-0 left-0 w-full z-30 p-4 pointer-events-none">
                    <div className="pointer-events-auto">
                        {header}
                    </div>
                </header>
            )}

            {/* Main Content Area - Maximized */}
            <main className={cn("flex-1 relative z-0", className)}>
                {children}
            </main>

            {/* Overlay Elements (like Floating Control Bar) */}
            {overlay && (
                <div className="absolute inset-0 z-40 pointer-events-none">
                    {overlay}
                </div>
            )}
        </div>
    );
}
