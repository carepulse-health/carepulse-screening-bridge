import { useEffect, useRef, useState, type ReactNode } from "react";
import { useCarePulseAuth } from "@/lib/carepulse-auth-context";
import { CarePulseSessionContext, type ScreeningThread } from "@/lib/carepulse-session-context";

export function CarePulseSession({ children }: { children: ReactNode }) {
  const [threads, setThreads] = useState<ScreeningThread[]>([]);
  const { user } = useCarePulseAuth();
  const previousUser = useRef<string | null | undefined>(undefined);
  const owner = user?.id ?? null;
  const latestOwner = useRef(owner);
  latestOwner.current = owner;
  useEffect(() => {
    if (previousUser.current !== undefined && previousUser.current !== owner) setThreads([]);
    previousUser.current = owner;
  }, [user?.id]);
  function updateThread(thread: ScreeningThread) {
    if (owner !== latestOwner.current) return;
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
