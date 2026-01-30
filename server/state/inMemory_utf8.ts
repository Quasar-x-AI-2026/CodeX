

export type Role = "teacher" | "student";

export type SessionData = {
  sessionId: string;
  teacher: string | null;
  students: string[];
};


type InternalSession = {
  teacher: string | null;
  students: Set<string>;
};

const sessions: Map<string, InternalSession> = new Map();


export function createSession(
  sessionId: string,
  teacherSocketId?: string,
): SessionData {
  let s = sessions.get(sessionId);
  if (!s) {
    s = { teacher: null, students: new Set() };
    sessions.set(sessionId, s);
  }

  if (teacherSocketId) {
    s.teacher = teacherSocketId;
    
    s.students.delete(teacherSocketId);
  }

  return toPublic(sessionId, s);
}


export function joinSession(
  sessionId: string,
  socketId: string,
  role: Role = "student",
): SessionData {
  const s =
    sessions.get(sessionId) ??
    (() => {
      const ns: InternalSession = { teacher: null, students: new Set() };
      sessions.set(sessionId, ns);
      return ns;
    })();

  if (role === "teacher") {
    s.teacher = socketId;
    s.students.delete(socketId);
  } else {
    
    
    if (s.teacher !== socketId) s.students.add(socketId);
  }

  return toPublic(sessionId, s);
}


export function removeSocket(socketId: string): {
  removedSessions: string[];
  updatedSessions: string[];
} {
  const removedSessions: string[] = [];
  const updatedSessions: string[] = [];

  for (const [id, s] of sessions.entries()) {
    let changed = false;

    if (s.teacher === socketId) {
      s.teacher = null;
      changed = true;
    }

    if (s.students.delete(socketId)) {
      changed = true;
    }

    if (changed) {
      if (!s.teacher && s.students.size === 0) {
        sessions.delete(id);
        removedSessions.push(id);
      } else {
        updatedSessions.push(id);
      }
    }
  }

  return { removedSessions, updatedSessions };
}


export function getSession(sessionId: string): SessionData | undefined {
  const s = sessions.get(sessionId);
  if (!s) return undefined;
  return toPublic(sessionId, s);
}


function toPublic(sessionId: string, s: InternalSession): SessionData {
  return {
    sessionId,
    teacher: s.teacher,
    students: Array.from(s.students),
  };
}


export function _clearAll() {
  sessions.clear();
}
