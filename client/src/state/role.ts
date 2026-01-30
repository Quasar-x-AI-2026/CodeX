import { create } from "zustand";
import useSession from "./session";

export type Role = "teacher" | "student";

export interface RoleState {
  role: Role;
  setRole: (role: Role) => void;
}

const useRole = create<RoleState>((set) => ({
  role: "student",
  setRole: (role: Role) => {
    // Prevent changing role after a session has started - immutable requirement
    const session = useSession.getState();
    if (session.started) {
      // keep previous role; do not throw
      // eslint-disable-next-line no-console
      console.warn("Attempted to change role after session start - ignored");
      return;
    }
    set({ role });
  },
}));

export default useRole;