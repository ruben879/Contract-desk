"use client";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

// The app always opens on Today. The installed app's start page is "/" (manifest), and if a phone
// restores the installed app on another screen, the first screen of a fresh launch goes to Today.
// Only in the installed app: a link someone taps in a browser still opens what it points to.
const SKIP = ["/", "/login", "/auth", "/onboarding"];

export function ColdStart() {
  const path = usePathname() ?? "/";
  const router = useRouter();
  useEffect(() => {
    try {
      const installed = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
      if (!installed || sessionStorage.getItem("cd-launched")) return;
      sessionStorage.setItem("cd-launched", "1");
      if (!SKIP.some((p) => p === "/" ? path === "/" : path.startsWith(p))) router.replace("/");
    } catch { /* storage blocked: nothing to do */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
