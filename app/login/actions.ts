"use server";
import { headers } from "next/headers";
import { createClient } from "@supabase/supabase-js";

// Ask for the sign-in email from the server, without the same-browser lock (PKCE) that the
// browser library always applies. The link then signs in whichever browser opens it
// (Safari, the Mail app's browser, the home-screen app), and the email still carries the code.
export async function requestSignIn(email: string): Promise<{ ok: true } | { ok: false; status?: number; code?: string; message: string }> {
  const h = await headers();
  const origin = h.get("origin") ?? `https://${h.get("host")}`;
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { flowType: "implicit", persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { error } = await sb.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: `${origin}/auth/callback` } });
  if (error) return { ok: false, status: error.status, code: (error as { code?: string }).code, message: error.message };
  return { ok: true };
}
