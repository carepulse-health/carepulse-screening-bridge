import { createContext, useContext } from "react";
import type { User } from "@supabase/supabase-js";
import type { VerifiedPatient } from "./carepulse-handoff-protocol";

export type CarePulseAuth = {
  user: User | null;
  ready: boolean;
  patient?: VerifiedPatient | null;
  embedded?: boolean;
  canSubmit?: boolean;
  message?: string;
  disconnect?: () => void;
};
export const CarePulseAuthContext = createContext<CarePulseAuth>(
  { user: null, ready: false },
);
export function useCarePulseAuth() {
  return useContext(CarePulseAuthContext);
}