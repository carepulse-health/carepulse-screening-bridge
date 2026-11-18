import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { LogIn, LogOut, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCarePulseAuth } from "@/lib/carepulse-auth-context";
import { supabase } from "@/integrations/supabase/client";
import { linkPatientAccount } from "@/lib/screening.functions";

export function CarePulseAccount() {
  const { user, ready } = useCarePulseAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const linkAccount = useServerFn(linkPatientAccount);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setMessage("");
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) { setMessage("Sign-in failed. Check your email and password, and confirm your email if required."); return; }
      const verified = await supabase.auth.getUser();
      if (verified.error || !verified.data.user) { setMessage("Sign-in could not be verified. Please try again."); return; }
      setPassword(""); setOpen(false);
    } catch { setMessage("Unable to sign in. Please try again."); }
    finally { setBusy(false); }
  }

  async function link() {
    setBusy(true); setMessage("");
    try { setMessage((await linkAccount()).message); }
    catch { setMessage("Unable to link your patient account. Please try again or contact your clinic."); }
    finally { setBusy(false); }
  }

  async function signOut() {
    setBusy(true);
    await queryClient.cancelQueries(); queryClient.clear();
    const { error } = await supabase.auth.signOut();
    setBusy(false);
    if (error) { setMessage("Sign-out failed. Please try again."); return; }
    setMessage(""); setOpen(false);
    await navigate({ to: "/", replace: true });
  }

  return <>
    <Button variant="ghost" size="sm" disabled={!ready || busy} onClick={() => { setMessage(""); setOpen(!open); }}>
      <LogIn size={16} /> {user ? "Account" : "Sign in"}
    </Button>
    {open && <div className="modal-backdrop" onClick={() => setOpen(false)}>
      <section className="safety-dialog" role="dialog" aria-modal="true" aria-labelledby="account-title" onClick={e => e.stopPropagation()}>
        <div className="dialog-heading"><h2 id="account-title">{user ? "Your account" : "Sign in to CarePulse"}</h2><Button variant="ghost" onClick={() => setOpen(false)}>Close</Button></div>
        {user ? <>
          <p>{user.email}</p>
          <div className="review-actions">
            <Button disabled={busy} onClick={link}><Link2 /> Link patient account</Button>
            <Button variant="outline" disabled={busy} onClick={signOut}><LogOut /> Sign out</Button>
          </div>
        </> : <form onSubmit={signIn} className="grid gap-4">
          <label className="grid gap-2">Email<Input type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} /></label>
          <label className="grid gap-2">Password<Input type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} /></label>
          <p>Use your existing clinic-registered account. Contact your clinic if you do not have one.</p>
          <Button type="submit" disabled={busy}><LogIn /> {busy ? "Signing in…" : "Sign in"}</Button>
        </form>}
        {message && <p role="status">{message}</p>}
      </section>
    </div>}
  </>;
}