"use client";
import { useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { Button, Card, inputCls } from "@/components/ui";
import { APP_NAME } from "@/lib/brand";

// Sign in without leaving the app: an emailed code typed right here, or a password.
// (Links open in Safari, not in the home-screen app, so they sign in the wrong place on iPhone.)

type Step = "email" | "code" | "password";
const EMAIL_KEY = "cd:last-email";

export default function Login() {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const codeInput = useRef<HTMLInputElement>(null);
  const sb = supabaseBrowser();

  useEffect(() => {
    try { const e = localStorage.getItem(EMAIL_KEY); if (e) setEmail(e); } catch { /* private mode */ }
    if (new URLSearchParams(window.location.search).get("error") === "link")
      setError("That link didn't work here. Enter your email and use a code instead.");
  }, []);
  useEffect(() => { if (step === "code") codeInput.current?.focus(); }, [step]);

  const remember = () => { try { localStorage.setItem(EMAIL_KEY, email.trim()); } catch { /* ignore */ } };
  const done = () => { remember(); window.location.replace("/"); };

  async function sendCode(e?: React.FormEvent) {
    e?.preventDefault();
    setBusy(true); setError(null);
    const { error } = await sb.auth.signInWithOtp({
      email: email.trim(), options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setBusy(false);
    if (error) setError(error.status === 429 ? "Too many tries. Wait a minute, then send a new code." : "That didn't send. Check the email and try again.");
    else { remember(); setCode(""); setStep("code"); }
  }

  async function verify(token: string) {
    setBusy(true); setError(null);
    const { error } = await sb.auth.verifyOtp({ email: email.trim(), token, type: "email" });
    if (error) { setBusy(false); setError("That code didn't work. Check it, or send a new one."); return; }
    done();
  }

  async function withPassword(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
    if (error) { setBusy(false); setError("Email or password didn't match. You can always sign in with a code instead."); return; }
    done();
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4">
      <h1 className="mb-1 text-2xl font-bold text-brand">{APP_NAME}</h1>
      <p className="mb-6 text-muted">Contracts in. Checklist out.</p>
      <Card>
        {step === "email" && (
          <form onSubmit={sendCode} className="space-y-3">
            <label className="block text-sm font-medium" htmlFor="email">Work email</label>
            <input id="email" className={inputCls} type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
            <Button size="lg" disabled={busy}>{busy ? "Sending..." : "Email me a sign-in code"}</Button>
            <button type="button" onClick={() => { setError(null); setStep("password"); }} className="w-full text-center text-sm font-medium text-brand">
              Use my password instead
            </button>
          </form>
        )}

        {step === "code" && (
          <form onSubmit={(e) => { e.preventDefault(); verify(code); }} className="space-y-3">
            <p className="text-sm">We emailed a code to <b>{email}</b>. Type it here; you don't need to tap the link.</p>
            <input ref={codeInput} className={`${inputCls} text-center text-2xl tracking-[0.4em]`} inputMode="numeric" autoComplete="one-time-code"
              placeholder="000000" maxLength={10} value={code} aria-label="Sign-in code"
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, "");
                setCode(v);
                // Filled all at once (pasted, or iPhone's "From Mail" suggestion): sign in right away.
                if (v.length >= 6 && v.length - code.length > 1 && !busy) verify(v);
              }} />
            <Button size="lg" disabled={busy || code.length < 6}>{busy ? "Signing in..." : "Sign in"}</Button>
            <div className="flex justify-between text-sm">
              <button type="button" disabled={busy} onClick={() => sendCode()} className="font-medium text-brand">Send a new code</button>
              <button type="button" onClick={() => { setError(null); setStep("email"); }} className="text-muted">Different email</button>
            </div>
          </form>
        )}

        {step === "password" && (
          <form onSubmit={withPassword} className="space-y-3">
            <label className="block text-sm font-medium" htmlFor="email2">Work email</label>
            <input id="email2" className={inputCls} type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
            <label className="block text-sm font-medium" htmlFor="pw">Password</label>
            <input id="pw" className={inputCls} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            <Button size="lg" disabled={busy}>{busy ? "Signing in..." : "Sign in"}</Button>
            <button type="button" onClick={() => { setError(null); setStep("email"); }} className="w-full text-center text-sm font-medium text-brand">
              Email me a code instead
            </button>
            <p className="text-center text-xs text-muted">No password yet? Sign in with a code, then set one on your profile.</p>
          </form>
        )}

        {error && <p className="mt-3 text-sm text-bad">{error}</p>}
      </Card>
    </main>
  );
}
