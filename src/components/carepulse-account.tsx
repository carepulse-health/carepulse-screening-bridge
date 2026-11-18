import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { LogIn, LogOut, Link2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCarePulseAuth } from "@/lib/carepulse-auth-context";
import { supabase } from "@/integrations/supabase/client";
import { linkPatientAccount } from "@/lib/screening.functions";
import { MIN_PASSWORD_LENGTH, checkRegistrationInput, registrationOutcome } from "@/lib/patient-registration";

type Mode = "sign_in" | "register";

export function CarePulseAccount() {
  const { user, ready } = useCarePulseAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const linkAccount = useServerFn(linkPatientAccount);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("sign_in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState("");
  const [tone, setTone] = useState<"info" | "error" | "success">("info");
  const [busy, setBusy] = useState(false);

  function say(text: string, kind: "info" | "error" | "success" = "info") { setMessage(text); setTone(kind); }
  function switchMode(next: Mode) { setMode(next); setPassword(""); setConfirm(""); say(""); }

  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); say("");
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) { say("Sign-in failed. Check your email and password, and confirm your email if required.", "error"); return; }
      const verified = await supabase.auth.getUser();
      if (verified.error || !verified.data.user) { say("Sign-in could not be verified. Please try again.", "error"); return; }
      setPassword(""); setOpen(false);
    } catch { say("Unable to sign in. Please try again.", "error"); }
    finally { setBusy(false); }
  }

  async function register(event: React.FormEvent) {
    event.preventDefault();
    const check = checkRegistrationInput(email, password, confirm);
    if (!check.ok) { say(check.message, "error"); return; }
    setBusy(true); say("");
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(), password,
        options: { emailRedirectTo: window.location.origin },
      });
      const outcome = registrationOutcome({
        error, hasSession: Boolean(data?.session),
        identityCount: data?.user?.identities ? data.user.identities.length : null,
      });
      setPassword(""); setConfirm("");
      if (outcome.kind === "existing") { setMode("sign_in"); say(outcome.message, "info"); return; }
      if (outcome.kind === "error") { say(outcome.message, "error"); return; }
      if (outcome.kind === "confirm_email") { setMode("sign_in"); say(outcome.message, "success"); return; }
      // Signed in immediately: link to the clinic-registered patient record (no new record is created).
      try {
        const result = await linkAccount();
        say(result.linked ? "Account created and linked to your clinic patient record." : `Account created. ${result.message}`, result.linked ? "success" : "info");
      } catch {
        say("Account created, but linking to your clinic record failed. Choose “Link patient account” to try again, or contact your clinic.", "error");
      }
    } catch { say("Unable to create your account. Please try again.", "error"); }
    finally { setBusy(false); }
  }

  async function link() {
    setBusy(true); say("");
    try { const result = await linkAccount(); say(result.message, result.linked ? "success" : "error"); }
    catch { say("Unable to link your patient account. Please try again or contact your clinic.", "error"); }
    finally { setBusy(false); }
  }

  async function signOut() {
    setBusy(true);
    await queryClient.cancelQueries(); queryClient.clear();
    const { error } = await supabase.auth.signOut();
    setBusy(false);
    if (error) { say("Sign-out failed. Please try again.", "error"); return; }
    say(""); setOpen(false);
    await navigate({ to: "/", replace: true });
  }

  const title = user ? "Your account" : mode === "register" ? "Create Patient Account" : "Sign in to CarePulse";

  return <>
    <Button variant="ghost" size="sm" disabled={!ready || busy} onClick={() => { say(""); setOpen(!open); }}>
      <LogIn size={16} /> {user ? "Account" : "Sign in"}
    </Button>
    {open && <div className="modal-backdrop" onClick={() => setOpen(false)}>
      <section className="safety-dialog" role="dialog" aria-modal="true" aria-labelledby="account-title" onClick={e => e.stopPropagation()}>
        <div className="dialog-heading"><h2 id="account-title">{title}</h2><Button variant="ghost" onClick={() => setOpen(false)}>Close</Button></div>
        {user ? <>
          <p>{user.email}</p>
          <div className="review-actions">
            <Button disabled={busy} onClick={link}><Link2 /> Link patient account</Button>
            <Button variant="outline" disabled={busy} onClick={signOut}><LogOut /> Sign out</Button>
          </div>
        </> : mode === "sign_in" ? <form onSubmit={signIn} className="grid gap-4">
          <label className="grid gap-2">Email<Input type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} /></label>
          <label className="grid gap-2">Password<Input type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} /></label>
          <p>Use your existing clinic-registered account. Contact your clinic if you do not have one.</p>
          <Button type="submit" disabled={busy}><LogIn /> {busy ? "Signing in…" : "Sign in"}</Button>
          <Button type="button" variant="outline" disabled={busy} onClick={() => switchMode("register")}><UserPlus /> Create Patient Account</Button>
        </form> : <form onSubmit={register} className="grid gap-4">
          <label className="grid gap-2">Email<Input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} /></label>
          <label className="grid gap-2">Password<Input type="password" autoComplete="new-password" required minLength={MIN_PASSWORD_LENGTH} value={password} onChange={e => setPassword(e.target.value)} /></label>
          <label className="grid gap-2">Confirm password<Input type="password" autoComplete="new-password" required minLength={MIN_PASSWORD_LENGTH} value={confirm} onChange={e => setConfirm(e.target.value)} /></label>
          <p>Use the same email your clinic registered for you, so your account connects to your existing patient record.</p>
          <Button type="submit" disabled={busy}><UserPlus /> {busy ? "Creating account…" : "Create Patient Account"}</Button>
          <Button type="button" variant="ghost" disabled={busy} onClick={() => switchMode("sign_in")}>Already have an account? Sign in</Button>
        </form>}
        {message && <p role={tone === "error" ? "alert" : "status"} style={tone === "error" ? { color: "var(--destructive)" } : tone === "success" ? { color: "var(--primary)" } : undefined}>{message}</p>}
      </section>
    </div>}
  </>;
}
