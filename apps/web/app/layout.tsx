import type { Metadata, Viewport } from "next";
import { ThemeProvider } from "next-themes";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@smartreach/ui";
import "./globals.css";

const sans = Geist({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata: Metadata = {
  title: { default: "AutoGTM · Autonomous Go-To-Market", template: "%s · AutoGTM" },
  description:
    "Paste your website. AutoGTM researches your market, finds verified buyers, runs cold email from a managed mailbox pool, answers replies, and books meetings on your calendar.",
  icons: {
    icon: [
      { url: "/icon.svg?v=20261019", type: "image/svg+xml" },
      { url: "/favicon.png?v=20261019", type: "image/png" },
      { url: "/favicon.ico?v=20261019" },
    ],
    shortcut: "/favicon.ico?v=20261019",
    apple: "/apple-touch-icon.png?v=20261019",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className={`${sans.variable} ${mono.variable} font-sans antialiased bg-background text-zinc-100`}>
        <ThemeProvider attribute="class" defaultTheme="dark" forcedTheme="dark" disableTransitionOnChange>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
