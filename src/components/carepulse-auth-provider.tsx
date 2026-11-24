import { useEffect, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { CarePulseAuthContext, type CarePulseAuth } from "@/lib/carepulse-auth-context";
import { getHandoffOrigins, verifyPatientIdentity } from "@/lib/carepulse-handoff.functions";
import { acceptsParentMessage, canSubmitPatient, forgetHandoff, rememberHandoff, setEmbeddedAuth, ticketMessageSchema } from "@/lib/carepulse-handoff-protocol";

export function CarePulseAuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const verify = useServerFn(verifyPatientIdentity);
  const loadOrigins = useServerFn(getHandoffOrigins);
  const [auth, setAuth] = useState<CarePulseAuth>({ user: null, ready: false });
  useEffect(() => {
    let alive = true;
    let generation = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let retryTimer: ReturnType<typeof setInterval> | undefined;
    let cleanup = () => {};
    const clearPrivateData = () => {
      void queryClient.cancelQueries().then(() => queryClient.clear());
      void router.invalidate();
    };
    async function standalone() {
      setEmbeddedAuth(false);
      async function validate() {
        const current = ++generation;
        const { data, error } = await supabase.auth.getUser();
        if (!alive || current !== generation) return;
        if (error || !data.user) { setAuth({ user: null, ready: true, canSubmit: false }); return; }
        setAuth({ user: data.user, ready: false, canSubmit: false });
        try {
          const identity = await verify();
          if (alive && current === generation) setAuth({ ...identity, ready: true, canSubmit: canSubmitPatient(true, identity.user.id, identity.patient) });
        } catch {
          if (alive && current === generation) setAuth({ user: data.user, ready: true, canSubmit: false, message: "Your clinic patient record could not be verified. Link your account or contact your clinic." });
        }
      }
      const { data: { subscription } } = supabase.auth.onAuthStateChange(event => {
        if (!["SIGNED_IN", "SIGNED_OUT", "USER_UPDATED"].includes(event)) return;
        if (event === "SIGNED_OUT") { generation++; setAuth({ user: null, ready: true, canSubmit: false }); }
        else setTimeout(() => { if (alive) void validate().catch(() => setAuth({ user: null, ready: true, canSubmit: false })); }, 0);
        clearPrivateData();
      });
      cleanup = () => subscription.unsubscribe();
      await validate();
    }
    async function start() {
      let parentOrigin = "";
      try { parentOrigin = window.location.ancestorOrigins?.[0] ?? (document.referrer ? new URL(document.referrer).origin : ""); } catch { /* No trusted referrer. */ }
      const editor = /^https:\/\/([a-z0-9-]+\.)*(lovable\.dev|gptengineer\.app)$/.test(parentOrigin);
      if (window.parent === window || editor) { await standalone(); return; }
      // A production embed never borrows this origin's separately persisted account.
      setEmbeddedAuth(true);
      forgetHandoff();
      setAuth({ user: null, ready: false, embedded: true, canSubmit: false, message: "Connecting your patient account…" });
      const origins = await loadOrigins();
      if (!alive) return;
      if (!origins.includes(parentOrigin)) {
        setAuth({ user: null, ready: true, embedded: true, canSubmit: false, message: "This patient app is not authorised to connect yet." });
        return;
      }
      let challenge = crypto.randomUUID();
      let accepting = true;
      const request = () => window.parent.postMessage({ type: "carepulse:ready", challenge }, parentOrigin);
      const disconnect = () => {
        generation++; accepting = false; forgetHandoff(); clearTimeout(timer); clearInterval(retryTimer);
        setAuth({ user: null, ready: true, embedded: true, canSubmit: false, message: "Patient app disconnected. Reopen the chatbot to connect again." });
        clearPrivateData();
      };
      const onMessage = (event: MessageEvent<unknown>) => {
        if (!acceptsParentMessage(event, window.parent, origins)) return;
        if (typeof event.data === "object" && event.data !== null && "type" in event.data && event.data.type === "carepulse:logout") { disconnect(); return; }
        const parsed = ticketMessageSchema.safeParse(event.data);
        if (!accepting || !parsed.success || parsed.data.challenge !== challenge) return;
        accepting = false;
        clearInterval(retryTimer);
        const current = ++generation;
        // Temporary ticket is only used for the verification request; it cannot enable UI submission.
        rememberHandoff(parsed.data.ticket, Date.now() + 120000);
        void verify().then(identity => {
          if (!alive || current !== generation) return;
          if (!identity.patient || identity.handoff?.challenge !== challenge || identity.handoff.expiresAt <= Date.now()) throw new Error("A linked patient and current handoff are required.");
          rememberHandoff(parsed.data.ticket, identity.handoff.expiresAt);
          clearPrivateData();
          setAuth({ ...identity, ready: true, embedded: true, canSubmit: true, disconnect });
          // The server enforces the real ticket expiry. Renew early; never refresh in the iframe.
          timer = setTimeout(() => {
            forgetHandoff();
            setAuth(previous => ({ ...previous, ready: false, canSubmit: false, message: "Reconnecting your patient account…" }));
            challenge = crypto.randomUUID(); accepting = true; request();
            retryTimer = setInterval(request, 5000);
          }, Math.max(0, identity.handoff.expiresAt - Date.now() - 30000));
        }).catch(() => {
          if (!alive || current !== generation) return;
          forgetHandoff();
          setAuth({ user: null, ready: true, embedded: true, canSubmit: false, message: "Your patient account could not be verified. Reconnect from the patient app." });
          challenge = crypto.randomUUID(); accepting = true;
          retryTimer = setInterval(request, 5000);
          clearPrivateData();
        });
      };
      window.addEventListener("message", onMessage);
      cleanup = () => window.removeEventListener("message", onMessage);
      request();
      retryTimer = setInterval(request, 5000);
    }
    void start().catch(() => {
      if (alive) setAuth({ user: null, ready: true, canSubmit: false, message: "Your patient connection could not be verified. Please try again." });
    });
    return () => { alive = false; generation++; clearTimeout(timer); clearInterval(retryTimer); cleanup(); forgetHandoff(); setEmbeddedAuth(false); };
  }, [queryClient, router, verify, loadOrigins]);
  return <CarePulseAuthContext.Provider value={auth}>{children}</CarePulseAuthContext.Provider>;
}