import type { Metadata, Viewport } from "next";
import "./globals.css";
import { APP_NAME } from "@/lib/brand";

export const metadata: Metadata = { title: APP_NAME, description: "Contracts in, checklist out." };
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#1f6f68" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-dvh font-sans antialiased">{children}</body>
    </html>
  );
}
