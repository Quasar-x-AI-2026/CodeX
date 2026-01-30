import React, { useEffect, useState } from "react";
import { onPatch, PatchPayload } from "../ws/board";

export default function BoardViewer() {
    const [latest, setLatest] = useState<PatchPayload | null>(null);

    useEffect(() => {
        const off = onPatch((p) => setLatest(p));
        return () => { off(); };
    }, []);


    if (!latest) return <div className="text-sm text-gray-400">Waiting for board updates...</div>;

    const src = latest.image && typeof latest.image === "string"
        ? (latest.image.startsWith("data:") ? latest.image : `data:image/png;base64,${latest.image}`)
        : undefined;

    return (
        <div className="w-full h-full flex items-center justify-center">
            {src ? (
                <img src={src} alt="board patch" style={{ maxWidth: "100%", maxHeight: "100%" }} />
            ) : (
                <div className="text-sm text-gray-400">Invalid image data</div>
            )}
        </div>
    );
}
