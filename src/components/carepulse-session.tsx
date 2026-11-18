import { useEffect, useRef, useState, type ReactNode } from "react";
import { useCarePulseAuth } from "@/lib/carepulse-auth-context";
import { CarePulseSessionContext, type ScreeningThread } from "@/lib/carepulse-session-context";

export function CarePulseSession({ children }: { children: ReactNode }) {
  const [threads, setThreads] = useState<ScreeningThread[]>([]);
  const { user } = useCarePulseAuth();
  const previousUser = useRef<string | null>(null);
  useEffect(() => {
    if (previousUser.current && previousUser.current !== user?.id) setThreads([]);
    previousUser.current = user?.id ?? null;
  }, [user?.id]);
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
