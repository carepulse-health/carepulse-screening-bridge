import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { KeyRound } from "lucide-react";
import { CarePulseShell } from "@/components/carepulse-shell";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/password-input";
import { supabase } from "@/integrations/supabase/client";
import { checkRegistrationInput, MIN_PASSWORD_LENGTH } from "@/lib/patient-registration";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Reset password | CarePulse" },
      { name: "description", content: "Choose a new password for your CarePulse patient account." },
      { property: "og:title", content: "Reset password | CarePulse" },
      { property: "og:description", content: "Securely set a new CarePulse account password." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPassword,
});

function ResetPassword() {
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) setReady(true);
    });
    supabase.auth.getSession().then(({ data: d }) => { if (d.session) setReady(true); });
    return () => data.subscription.unsubscribe();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const check = checkRegistrationInput("reset@carepulse.local", password, confirm);
    if (!check.ok) { setMsg({ text: check.message, error: true }); return; }
    setBusy(true); setMsg(null);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) { setMsg({ text: "Your password could not be updated. The link may have expired — request a new one.", error: true }); return; }
    setPassword(""); setConfirm(""); setDone(true);
    setMsg({ text: "Your password has been updated. You can now use it to sign in.", error: false });
  }

  return <CarePulseShell>
    <section className="safety-dialog" style={{ margin: "40px auto" }}>
      <div className="dialog-heading"><h1 id="reset-title">Reset your password</h1></div>
      {!ready && !done ? <p role="status">Open this page from the reset link in your email. If the link has expired, request a new one from Sign in → Forgot Password?.</p>
      : done ? null : <form onSubmit={submit} className="grid gap-4">
        <label className="grid gap-2">New password<PasswordInput label="New password" autoComplete="new-password" required minLength={MIN_PASSWORD_LENGTH} value={password} onChange={e => setPassword(e.target.value)} /></label>
        <label className="grid gap-2">Confirm new password<PasswordInput label="Confirm new password" autoComplete="new-password" required minLength={MIN_PASSWORD_LENGTH} value={confirm} onChange={e => setConfirm(e.target.value)} /></label>
        <Button type="submit" disabled={busy}><KeyRound /> {busy ? "Saving…" : "Save new password"}</Button>
      </form>}
      {msg && <p role={msg.error ? "alert" : "status"} style={{ color: msg.error ? "var(--destructive)" : "var(--primary)" }}>{msg.text}</p>}
      <Link to="/">Back to CarePulse</Link>
    </section>
  </CarePulseShell>;
}
