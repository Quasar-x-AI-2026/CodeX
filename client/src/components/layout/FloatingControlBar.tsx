import React, { useState } from 'react';
import { cn } from '../../lib/utils'; // Assuming utils exists for class merging
// If icons are needed, we can pass them as props or import specific ones.
// For a specific "Control Bar" we might want it to accept generic actions or explicit children.
// The redesign calls for "Floating control bar at the bottom (auto-hide when inactive)".

interface ControlAction {
    label: string;
    icon: React.ReactNode;
    onClick: () => void;
    isActive?: boolean;
    variant?: 'default' | 'destructive' | 'primary';
}

interface FloatingControlBarProps {
    actions: ControlAction[];
    className?: string;
}

export function FloatingControlBar({ actions, className }: FloatingControlBarProps) {
    return (
        <div
            className={cn(
                "flex items-center gap-2 p-1.5 bg-background/80 backdrop-blur-md border border-border shadow-sm rounded-full transition-all",
                className
            )}
        >
            {actions.map((action, index) => (
                <button
                    key={index}
                    onClick={action.onClick}
                    className={cn(
                        "relative group flex items-center justify-center w-10 h-10 rounded-full transition-all duration-200",
                        action.isActive
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground",
                        action.variant === 'destructive' && action.isActive && "bg-destructive text-destructive-foreground",
                        action.variant === 'destructive' && !action.isActive && "hover:bg-destructive/10 hover:text-destructive"
                    )}
                    title={action.label} // Native tooltip fallback
                >
                    {/* Icon */}
                    <span className="[&>svg]:w-5 [&>svg]:h-5">
                        {action.icon}
                    </span>

                    {/* Tooltip Label */}
                    <span className="absolute -top-10 left-1/2 -translate-x-1/2 px-2 py-1 bg-popover text-popover-foreground text-xs font-medium rounded shadow-sm border border-border opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                        {action.label}
                    </span>
                </button>
            ))}
        </div>
    );
}

// Wrapper to detect hover at bottom of screen
export function ControlBarZone({ children, className }: { children: React.ReactNode, className?: string }) {
    return (
        <div className={cn("fixed bottom-0 left-0 w-full h-24 z-40 flex flex-col justify-end items-center pb-8 pointer-events-auto", className)}>
            <div className="transition-all duration-300">
                {children}
            </div>
        </div>
    )
}
