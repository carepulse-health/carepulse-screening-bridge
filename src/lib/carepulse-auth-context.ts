import { createContext, useContext } from "react";
import type { User } from "@supabase/supabase-js";

export const CarePulseAuthContext = createContext<{ user: User | null; ready: boolean }>(
  { user: null, ready: false },
);
export function useCarePulseAuth() {
  return useContext(CarePulseAuthContext);
}