import { create } from "zustand";

export type Role = "teacher" | "student";

export interface RoleState {
    role: Role;
    setRole: (role: Role) => void;
}

const useRole = create<RoleState>((set) => ({
    role: "student",
    setRole: (role: Role) => set({ role }),
}));