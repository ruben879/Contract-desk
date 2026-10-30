"use client";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { Button, Card, inputCls } from "@/components/ui";
import { APP_NAME } from "@/lib/brand";

export default function Login() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    const { error } = await supabaseBrowser().auth.signInWithOtp({
      email, options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setState(error ? "error" : "sent");
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4">
      <h1 className="mb-1 text-2xl font-bold text-brand">{APP_NAME}</h1>
      <p className="mb-6 text-muted">Contracts in. Checklist out.</p>
      <Card>
        {state === "sent" ? (
          <p>Check <b>{email}</b> for your sign-in link.</p>
        ) : (
          <form onSubmit={send} className="space-y-3">
            <label className="block text-sm font-medium">Work email</label>
            <input className={inputCls} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            <Button size="lg" disabled={state === "sending"}>{state === "sending" ? "Sending..." : "Email me a sign-in link"}</Button>
            {state === "error" && <p className="text-sm text-bad">That didn't send. Try again in a moment.</p>}
          </form>
        )}
      </Card>
    </main>
  );
}
