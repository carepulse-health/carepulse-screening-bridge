import { createMiddleware } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getHandoffTicket, isEmbeddedAuth } from "./carepulse-handoff-protocol";

export const attachCarePulseAuth = createMiddleware({ type: "function" }).client(async ({ next }) => {
  if (isEmbeddedAuth()) {
    const ticket = getHandoffTicket();
    // Never fall back to another account's standalone session inside a patient app.
    return next({ headers: ticket ? { "X-CarePulse-Handoff": ticket } : {} });
  }
  const { data } = await supabase.auth.getSession();
  return next({ headers: data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {} });
});