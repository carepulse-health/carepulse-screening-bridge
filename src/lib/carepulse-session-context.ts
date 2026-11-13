import { createContext, useContext } from "react";
import type { UIMessage } from "ai";

export type ScreeningThread = {
  id: string;
  title: string;
  messages: UIMessage[];
  answers: string[];
  outcome: "Emergency" | "Needs review" | null;
};

type Session = {
  threads: ScreeningThread[];
  updateThread: (thread: ScreeningThread) => void;
};

// Keep context identity outside the refreshable provider component module.
// Otherwise a hot update can give mounted providers and consumers different contexts.
export const CarePulseSessionContext = createContext<Session | null>(null);

export function useCarePulseSession() {
  const session = useContext(CarePulseSessionContext);
  if (!session) throw new Error("CarePulse session is unavailable");
  return session;
}
