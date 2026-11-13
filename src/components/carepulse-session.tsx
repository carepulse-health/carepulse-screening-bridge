import { createContext, useContext, useState, type ReactNode } from "react";
import type { UIMessage } from "ai";

export type ScreeningThread = {
  id: string;
  title: string;
  messages: UIMessage[];
  answers: string[];
  outcome: "Emergency" | "Needs review" | null;
};
type Session = { threads: ScreeningThread[]; updateThread: (thread: ScreeningThread) => void };
const SessionContext = createContext<Session | null>(null);

export function CarePulseSession({ children }: { children: ReactNode }) {
  const [threads, setThreads] = useState<ScreeningThread[]>([]);
  function updateThread(thread: ScreeningThread) {
    setThreads((previous) =>
      previous.some((item) => item.id === thread.id)
        ? previous.map((item) => (item.id === thread.id ? thread : item))
        : [...previous, thread],
    );
  }
  return (
    <SessionContext.Provider value={{ threads, updateThread }}>{children}</SessionContext.Provider>
  );
}

export function useCarePulseSession() {
  const session = useContext(SessionContext);
  if (!session) throw new Error("CarePulse session is unavailable");
  return session;
}
