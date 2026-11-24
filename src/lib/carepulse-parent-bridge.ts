import { z } from "zod";
import { challengeSchema } from "./carepulse-handoff-protocol";

// Import this adapter in the Patient Mobile App. It intentionally takes only an
// access-token getter; no Supabase session object or refresh token crosses the bridge.
export function connectPatientChatbot(options: {
  iframe: HTMLIFrameElement;
  chatbotOrigin: string;
  getAccessToken: () => Promise<string | null>;
  onError?: (message: string) => void;
}) {
  const origin = new URL(options.chatbotOrigin).origin;
  if (origin !== options.chatbotOrigin || !origin.startsWith("https://")) throw new Error("Use an exact HTTPS chatbot origin.");
  let alive = true;
  let generation = 0;
  let pending: AbortController | undefined;
  const onMessage = (event: MessageEvent<unknown>) => {
    if (event.origin !== origin || event.source !== options.iframe.contentWindow) return;
    const parsed = z.object({ type: z.literal("carepulse:ready"), challenge: challengeSchema }).strict().safeParse(event.data);
    if (!parsed.success) return;
    const current = ++generation;
    pending?.abort();
    pending = new AbortController();
    const signal = pending.signal;
    void (async () => {
      const token = await options.getAccessToken();
      if (!alive || current !== generation) return;
      if (!token) { options.iframe.contentWindow?.postMessage({ type: "carepulse:logout" }, origin); return; }
      const response = await fetch(`${origin}/api/public/auth-handoff`, {
        method: "POST", credentials: "omit", cache: "no-store", signal,
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ challenge: parsed.data.challenge }),
      });
      if (!response.ok) throw new Error("Patient connection could not be verified.");
      const result = z.object({ ticket: z.string().min(40).max(20000), expiresAt: z.number() }).strict().parse(await response.json());
      if (!alive || current !== generation || result.expiresAt <= Date.now()) return;
      options.iframe.contentWindow?.postMessage({ type: "carepulse:handoff", challenge: parsed.data.challenge, ticket: result.ticket }, origin);
    })().catch(() => { if (alive && current === generation) options.onError?.("Could not connect your clinic patient account. Please try again."); });
  };
  window.addEventListener("message", onMessage);
  return {
    // Call before parent sign-out or account switching, then remount the iframe for the next account.
    disconnect() {
      generation++; pending?.abort();
      options.iframe.contentWindow?.postMessage({ type: "carepulse:logout" }, origin);
    },
    dispose() { alive = false; generation++; pending?.abort(); window.removeEventListener("message", onMessage); },
  };
}