"use client";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { Button, inputCls } from "./ui";

/** Optional: a password lets the phone's password manager (Face ID) sign in with one tap. */
export function SetPassword({ email }: { email: string }) {
  const [pw, setPw] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [msg, setMsg] = useState("");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (pw.length < 8) { setState("error"); setMsg("Use at least 8 characters."); return; }
    setState("saving");
    const { error } = await supabaseBrowser().auth.updateUser({ password: pw });
    if (error) { setState("error"); setMsg(/reauth|recent/i.test(error.message) ? "For safety, sign out and back in with a code, then set it." : "That didn't save. Try a longer or less common password."); return; }
    setState("saved"); setPw("");
  }

  return (
    <form onSubmit={save} className="space-y-3">
      {/* Hidden username field so the phone saves the password with the right email. */}
      <input type="email" autoComplete="username" value={email} readOnly hidden />
      <label className="block text-sm font-medium" htmlFor="new-pw">New password</label>
      <input id="new-pw" className={inputCls} type="password" autoComplete="new-password" value={pw} onChange={(e) => { setPw(e.target.value); setState("idle"); }} />
      <Button disabled={state === "saving"}>{state === "saving" ? "Saving..." : "Save password"}</Button>
      {state === "saved" && <p className="text-sm text-good">Saved. Next time, choose "Use my password instead" and let your phone fill it in.</p>}
      {state === "error" && <p className="text-sm text-bad">{msg}</p>}
    </form>
  );
}
