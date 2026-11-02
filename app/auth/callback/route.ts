import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

// Sign-in links still work when opened in the same browser that asked for them.
// Anywhere else (a different browser, or Safari instead of the home-screen app) the link can't
// finish, so send the person back to sign in with a code instead of failing silently.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  if (code) {
    const supabase = await supabaseServer();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL("/", url.origin));
    console.warn("[auth] link sign-in failed", error.message);
  }
  return NextResponse.redirect(new URL("/login?error=link", url.origin));
}
