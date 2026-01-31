import type { WebSocket } from "ws";
import {
  getSession,
  getPatches,
  getLastAvatar,
  getLastPhoto,
  getLastLandmarks,
} from "../state/inMemory";
import { getSessionForSocket } from "../sessions/join";
import * as registry from "./registry";
import { join as joinSession } from "../sessions/join";
import type { Role } from "../state/inMemory";

export function handle(ws: WebSocket, payload: unknown) {
  try {
    const from = (ws as any).id as string | undefined;
    if (!from) {
      console.warn("signaling: missing socket id on connection");
      return;
    }

    if (!payload || typeof payload !== "object") {
      console.warn("signaling: invalid payload");
      return;
    }

    const p: any = payload;

    if (p.type === "join") {
      handleJoin(ws, from, p);
      return;
    }

    if (p.type === "request-state") {
      handleRequestState(ws, from, p);
      return;
    }

    const sessionId = getSessionForSocket(from);
    if (!sessionId) {
      console.warn("signaling: socket not associated with a session", from);
      return;
    }

    const session = getSession(sessionId);
    if (!session) {
      console.warn("signaling: session missing", sessionId);
      return;
    }

    const out = {
      channel: "/signal",
      payload: { ...p, from },
    };

    if (typeof p.targetSocketId === "string") {
      registry.sendTo(p.targetSocketId, out);
      return;
    }

    if (p.recipient === "teacher") {
      if (session.teacher) registry.sendTo(session.teacher, out);
      return;
    }

    if (p.recipient === "students") {
      registry.sendMany(session.students, out);
      return;
    }

    if (session.teacher === from) {
      registry.sendMany(session.students, out);
    } else {
      if (session.teacher) registry.sendTo(session.teacher, out);
    }
  } catch (err) {
    console.warn("signaling.handle error", err);
  }
}

function handleJoin(ws: WebSocket, socketId: string, payload: any) {
  try {
    const { sessionId, role } = payload;

    if (!sessionId || typeof sessionId !== "string") {
      console.warn("signaling.join: invalid or missing sessionId");
      return;
    }

    if (!role || (role !== "teacher" && role !== "student")) {
      console.warn("signaling.join: invalid role");
      return;
    }

    const session = joinSession(sessionId, socketId, role as Role);
    console.log(`signaling.join: ${role} joined session ${sessionId}`, {
      teacher: session.teacher,
      students: session.students.length,
    });

    const joinNotify = {
      channel: "/signal",
      payload: {
        type: "peer-joined",
        from: socketId,
        role: role,
      },
    };

    if (role === "teacher") {
      registry.sendMany(session.students, joinNotify);
    } else {
      if (session.teacher) registry.sendTo(session.teacher, joinNotify);

      try {
        const patches = getPatches(sessionId);
        if (patches && patches.length > 0) {
          for (const p of patches) {
            try {
              registry.sendTo(socketId, {
                channel: "/board",
                payload: p,
                from: session.teacher,
              });
            } catch (e) {
              console.warn("signaling.join: failed to send stored patch", e);
            }
          }
        }
      } catch (e) {
        console.warn("signaling.join: failed to send stored patches", e);
      }

      try {
        const lastAvatar = getLastAvatar(sessionId);
        if (lastAvatar) {
          try {
            registry.sendTo(socketId, {
              channel: "/avatar",
              payload: lastAvatar,
              from: session.teacher,
            });
            console.debug &&
              console.debug(
                "signaling.join: sent lastAvatar to",
                socketId,
                lastAvatar,
              );
          } catch (e) {
            console.warn("signaling.join: failed to send last avatar", e);
          }
        }
      } catch (e) {
        console.warn("signaling.join: failed to retrieve last avatar", e);
      }

      try {
        const lastPhoto = getLastPhoto(sessionId);
        if (lastPhoto) {
          try {
            registry.sendTo(socketId, {
              channel: "/avatar",
              payload: {
                photo: lastPhoto.photo,
                w: lastPhoto.w,
                h: lastPhoto.h,
              },
              from: session.teacher,
            });
            console.debug &&
              console.debug("signaling.join: sent lastPhoto to", socketId);
          } catch (e) {
            console.warn("signaling.join: failed to send last photo", e);
          }
        }
      } catch (e) {
        console.warn("signaling.join: failed to retrieve last photo", e);
      }

      try {
        const lastLandmarks = getLastLandmarks(sessionId);
        if (lastLandmarks) {
          try {
            registry.sendTo(socketId, {
              channel: "/avatar",
              payload: { landmarks: lastLandmarks },
              from: session.teacher,
            });
            console.debug &&
              console.debug("signaling.join: sent lastLandmarks to", socketId);
          } catch (e) {
            console.warn("signaling.join: failed to send last landmarks", e);
          }
        }
      } catch (e) {
        console.warn("signaling.join: failed to retrieve last landmarks", e);
      }
    }
  } catch (err) {
    console.warn("signaling.join error", err);
  }
}

function handleRequestState(ws: WebSocket, socketId: string, payload: any) {
  try {
    const sid =
      payload && typeof payload.sessionId === "string"
        ? payload.sessionId
        : getSessionForSocket(socketId);
    if (!sid) {
      console.warn("signaling.request-state: missing sessionId");
      return;
    }

    try {
      const patches = getPatches(sid);
      if (patches && patches.length > 0) {
        for (const p of patches) {
          try {
            registry.sendTo(socketId, {
              channel: "/board",
              payload: p,
              from: null,
            });
          } catch (e) {
            console.warn("signaling.request-state: failed to send patch", e);
          }
        }
      }
    } catch (e) {
      console.warn("signaling.request-state: failed to retrieve patches", e);
    }

    try {
      const lastAvatar = getLastAvatar(sid);
      if (lastAvatar) {
        try {
          registry.sendTo(socketId, {
            channel: "/avatar",
            payload: lastAvatar,
            from: null,
          });
        } catch (e) {
          console.warn(
            "signaling.request-state: failed to send last avatar",
            e,
          );
        }
      }
    } catch (e) {
      console.warn(
        "signaling.request-state: failed to retrieve last avatar",
        e,
      );
    }

    try {
      const lastPhoto = getLastPhoto(sid);
      if (lastPhoto) {
        try {
          registry.sendTo(socketId, {
            channel: "/avatar",
            payload: { photo: lastPhoto.photo, w: lastPhoto.w, h: lastPhoto.h },
            from: null,
          });
          console.debug &&
            console.debug(
              "signaling.request-state: sent lastPhoto to",
              socketId,
            );
        } catch (e) {
          console.warn("signaling.request-state: failed to send last photo", e);
        }
      }
    } catch (e) {
      console.warn("signaling.request-state: failed to retrieve last photo", e);
    }

    try {
      const lastLandmarks = getLastLandmarks(sid);
      if (lastLandmarks) {
        try {
          registry.sendTo(socketId, {
            channel: "/avatar",
            payload: { landmarks: lastLandmarks },
            from: null,
          });
          console.debug &&
            console.debug(
              "signaling.request-state: sent lastLandmarks to",
              socketId,
            );
        } catch (e) {
          console.warn(
            "signaling.request-state: failed to send last landmarks",
            e,
          );
        }
      }
    } catch (e) {
      console.warn(
        "signaling.request-state: failed to retrieve last landmarks",
        e,
      );
    }
  } catch (err) {
    console.warn("signaling.request-state error", err);
  }
}
