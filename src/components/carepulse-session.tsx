import { useState, type ReactNode } from "react";
import { CarePulseSessionContext, type ScreeningThread } from "@/lib/carepulse-session-context";

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
    <CarePulseSessionContext.Provider value={{ threads, updateThread }}>
      {children}
    </CarePulseSessionContext.Provider>
  );
}
