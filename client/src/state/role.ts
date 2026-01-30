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
    
    const session = useSession.getState();
    if (session.started) {
      
      
      console.warn("Attempted to change role after session start - ignored");
      return;
    }
    set({ role });
  },
}));

export default useRole;