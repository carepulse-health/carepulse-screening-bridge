import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { LogIn, LogOut, Link2, UserPlus, KeyRound, MailCheck } from "lucide-react";
import { PasswordInput } from "@/components/password-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCarePulseAuth } from "@/lib/carepulse-auth-context";
import { supabase } from "@/integrations/supabase/client";
import { linkPatientAccount } from "@/lib/screening.functions";
import { MIN_PASSWORD_LENGTH, checkRegistrationInput, registrationOutcome, isValidEmail, resetRequestMessage, signInErrorMessage, authRedirectBase } from "@/lib/patient-registration";

type Mode = "sign_in" | "register" | "forgot";

// Clinic staff accounts have a clinic membership and no patient record; they are never linked.
async function isClinicStaff(userId: string) {
  const { data, error } = await supabase.from("clinic_members").select("id").eq("user_id", userId).limit(1);
  return !error && (data?.length ?? 0) > 0;
}

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
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [linkStatus, setLinkStatus] = useState<{ state: "idle" | "checking" | "linked" | "unlinked" | "staff"; message: string }>({ state: "idle", message: "" });
  const linkedFor = useRef<string | null>(null);

  // After any patient sign-in (password, email confirmation link or reset link), connect the
  // account to the clinic-registered patient record through the existing secure linking function.
  const linkRef = useRef(linkAccount);
  linkRef.current = linkAccount;
  const userId = user?.id ?? null;
  useEffect(() => {
    if (!userId) { linkedFor.current = null; setLinkStatus({ state: "idle", message: "" }); return; }
    if (linkedFor.current === userId) return;
    linkedFor.current = userId;
    let alive = true;
    void (async () => {
      setLinkStatus({ state: "checking", message: "Connecting your clinic patient record…" });
      try {
        if (await isClinicStaff(userId)) { if (alive) setLinkStatus({ state: "staff", message: "" }); return; }
        const result = await linkRef.current();
        if (alive) setLinkStatus({ state: result.linked ? "linked" : "unlinked", message: result.message });
      } catch {
        if (alive) setLinkStatus({ state: "unlinked", message: "We couldn't connect your clinic patient record. Choose “Link patient account” to try again, or contact your clinic." });
      }
    })();
    return () => { alive = false; if (linkedFor.current === userId) linkedFor.current = null; };
  }, [userId]);

  function say(text: string, kind: "info" | "error" | "success" = "info") { setMessage(text); setTone(kind); }
  function switchMode(next: Mode) { setMode(next); setPassword(""); setConfirm(""); setUnconfirmed(false); say(""); }

  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); say(""); setUnconfirmed(false);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) { const problem = signInErrorMessage(error); setUnconfirmed(problem.unconfirmed); say(problem.message, "error"); return; }
      const verified = await supabase.auth.getUser();
      if (verified.error || !verified.data.user) { say("Sign-in could not be verified. Please try again.", "error"); return; }
      setPassword("");
      // Clinic staff sign-in is unchanged: close straight away. Patients see their record-linking result.
      if (await isClinicStaff(verified.data.user.id)) setOpen(false);
      else say("You're signed in.", "success");
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
        options: { emailRedirectTo: authRedirectBase(window.location.origin) },
      });
      const outcome = registrationOutcome({
        error, hasSession: Boolean(data?.session),
        identityCount: data?.user?.identities ? data.user.identities.length : null,
      });
      setPassword(""); setConfirm("");
      if (outcome.kind === "existing") { setMode("sign_in"); say(outcome.message, "error"); return; }
      if (outcome.kind === "error") { say(outcome.message, "error"); return; }
      if (outcome.kind === "confirm_email") { setMode("sign_in"); say(outcome.message, "success"); return; }
      // Signed in immediately: the sign-in effect links the clinic-registered patient record (no new record is created).
      say("Account created and you're signed in.", "success");
    } catch { say("Unable to create your account. Please try again.", "error"); }
    finally { setBusy(false); }
  }

  async function requestReset(event: React.FormEvent) {
    event.preventDefault();
    if (!isValidEmail(email)) { say("Enter a valid email address.", "error"); return; }
    setBusy(true); say("");
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${authRedirectBase(window.location.origin)}/reset-password` });
      const r = resetRequestMessage(error); say(r.message, r.ok ? "success" : "error");
    } catch { say("We couldn't send the reset email. Please try again.", "error"); }
    finally { setBusy(false); }
  }

  async function resendConfirmation() {
    if (!isValidEmail(email)) { say("Enter a valid email address.", "error"); return; }
    setBusy(true);
    try {
      const { error } = await supabase.auth.resend({ type: "signup", email: email.trim(), options: { emailRedirectTo: authRedirectBase(window.location.origin) } });
      if (error) say(error.status === 429 ? "Too many attempts. Please wait a few minutes and try again." : "We couldn't resend the confirmation email. Please try again.", "error");
      else { setUnconfirmed(false); say("Confirmation email sent. Open the link in it, then sign in here.", "success"); }
    } catch { say("We couldn't resend the confirmation email. Please try again.", "error"); }
    finally { setBusy(false); }
  }

  async function link() {
    setBusy(true); say("");
    try {
      const result = await linkAccount(); say("");
      setLinkStatus({ state: result.linked ? "linked" : "unlinked", message: result.message });
    }
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

  const title = user ? "Your account" : mode === "register" ? "Create Patient Account" : mode === "forgot" ? "Reset your password" : "Sign in to CarePulse";

  return <>
    <Button variant="ghost" size="sm" disabled={!ready || busy} onClick={() => { say(""); setOpen(!open); }}>
      <LogIn size={16} /> {user ? "Account" : "Sign in"}
    </Button>
    {open && <div className="modal-backdrop" onClick={() => setOpen(false)}>
      <section className="safety-dialog" role="dialog" aria-modal="true" aria-labelledby="account-title" onClick={e => e.stopPropagation()}>
        <div className="dialog-heading"><h2 id="account-title">{title}</h2><Button variant="ghost" onClick={() => setOpen(false)}>Close</Button></div>
        {user ? <>
          <p>{user.email}</p>
          {linkStatus.state !== "idle" && linkStatus.state !== "staff" && <p role={linkStatus.state === "unlinked" ? "alert" : "status"} style={linkStatus.state === "unlinked" ? { color: "var(--destructive)" } : linkStatus.state === "linked" ? { color: "var(--primary)" } : undefined}>{linkStatus.message}</p>}
          <div className="review-actions">
            {linkStatus.state !== "staff" && linkStatus.state !== "linked" && <Button disabled={busy || linkStatus.state === "checking"} onClick={link}><Link2 /> Link patient account</Button>}
            <Button variant="outline" disabled={busy} onClick={signOut}><LogOut /> Sign out</Button>
          </div>
        </> : mode === "sign_in" ? <form onSubmit={signIn} className="grid gap-4">
          <label className="grid gap-2">Email<Input type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} /></label>
          <label className="grid gap-2">Password<PasswordInput label="Password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} /></label>
          <button type="button" className="justify-self-start text-sm font-medium text-primary underline-offset-4 hover:underline" onClick={() => switchMode("forgot")}>Forgot Password?</button>
          <p>Use your existing clinic-registered account. Contact your clinic if you do not have one.</p>
          <Button type="submit" disabled={busy}><LogIn /> {busy ? "Signing in…" : "Sign in"}</Button>
          {unconfirmed && <Button type="button" variant="outline" disabled={busy} onClick={resendConfirmation}><MailCheck /> Resend confirmation email</Button>}
          <Button type="button" variant="outline" disabled={busy} onClick={() => switchMode("register")}><UserPlus /> Create Patient Account</Button>
        </form> : mode === "forgot" ? <form onSubmit={requestReset} className="grid gap-4">
          <label className="grid gap-2">Email<Input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} /></label>
          <p>Enter your account email and we'll send you a link to choose a new password.</p>
          <Button type="submit" disabled={busy}><KeyRound /> {busy ? "Sending…" : "Send reset link"}</Button>
          <Button type="button" variant="ghost" disabled={busy} onClick={() => switchMode("sign_in")}>Back to sign in</Button>
        </form> : <form onSubmit={register} className="grid gap-4">
          <label className="grid gap-2">Email<Input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} /></label>
          <label className="grid gap-2">Password<PasswordInput label="Password" autoComplete="new-password" required minLength={MIN_PASSWORD_LENGTH} value={password} onChange={e => setPassword(e.target.value)} /></label>
          <label className="grid gap-2">Confirm password<PasswordInput label="Confirm password" autoComplete="new-password" required minLength={MIN_PASSWORD_LENGTH} value={confirm} onChange={e => setConfirm(e.target.value)} /></label>
          <p>Use the same email your clinic registered for you, so your account connects to your existing patient record.</p>
          <Button type="submit" disabled={busy}><UserPlus /> {busy ? "Creating account…" : "Create Patient Account"}</Button>
          <Button type="button" variant="ghost" disabled={busy} onClick={() => switchMode("sign_in")}>Already have an account? Sign in</Button>
        </form>}
        {message && <p role={tone === "error" ? "alert" : "status"} style={tone === "error" ? { color: "var(--destructive)" } : tone === "success" ? { color: "var(--primary)" } : undefined}>{message}</p>}
      </section>
    </div>}
  </>;
}
