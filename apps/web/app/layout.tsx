import type { Metadata, Viewport } from "next";
import { ThemeProvider } from "next-themes";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import { Toaster } from "@smartreach/ui";
import "./globals.css";
import { startAudienceTopUp } from "@/lib/autopilot-topup";

const sans = Geist({ subsets: ["latin"], variable: "--font-geist-sans", display: "swap" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });
const display = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-instrument-serif",
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f6f3" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0b0c" },
  ],
};

export const metadata: Metadata = {
  title: { default: "AutoGTM · Autonomous Go-To-Market", template: "%s · AutoGTM" },
  description:
    "Paste your website. AutoGTM researches your market, finds verified buyers, runs cold email from a managed mailbox pool, answers replies, and books meetings on your calendar.",
  icons: {
    icon: [
      { url: "/icon.svg?v=20261106", type: "image/svg+xml" },
      { url: "/favicon.png?v=20261106", type: "image/png" },
      { url: "/favicon.ico?v=20261106" },
    ],
    shortcut: "/favicon.ico?v=20261106",
    apple: "/apple-touch-icon.png?v=20261106",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Keeps Autopilot audiences supplied (once per server process; no-op after).
  startAudienceTopUp();
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${sans.variable} ${mono.variable} ${display.variable} font-sans antialiased bg-background text-foreground`}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
