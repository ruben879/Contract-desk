import type { Metadata, Viewport } from "next";
import "./globals.css";
import { APP_NAME, ICONS } from "@/lib/brand";
import { ColdStart } from "@/components/ColdStart";

export const metadata: Metadata = {
  title: APP_NAME, description: "Contracts in, checklist out.",
  manifest: "/manifest.webmanifest", appleWebApp: { capable: true, title: APP_NAME, statusBarStyle: "default" },
  icons: {
    icon: [
      { url: ICONS.favicon, sizes: "32x32", type: "image/png" },
      { url: ICONS.faviconLarge, sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: ICONS.appleTouch, sizes: "180x180", type: "image/png" }],
  },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#f4f6fa" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Lexend:wght@400;500;600&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-dvh font-sans antialiased"><ColdStart />{children}</body>
    </html>
  );
}
