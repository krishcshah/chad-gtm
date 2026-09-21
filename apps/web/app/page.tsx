import { ArrowRight, Layers, Mail, Timer, Users } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/logo";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function Landing() {
  const session = await getSession();
  if (session?.user) redirect("/dashboard");

  return (
    <div className="app-shell min-h-dvh flex flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5">
        <Logo />
        <div className="flex items-center gap-2">
          <Link href="/login" className="h-9 rounded-lg px-4 text-sm font-medium inline-flex items-center hover:bg-accent transition-colors">
            Sign in
          </Link>
          <Link href="/signup" className="h-9 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground inline-flex items-center gap-1.5 hover:bg-primary/90 transition-colors">
            Get started <ArrowRight className="size-3.5" />
          </Link>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col items-center justify-center px-6 text-center">
        <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/60 px-3.5 py-1.5 text-xs text-muted-foreground backdrop-blur">
          <span className="size-1.5 rounded-full bg-success animate-pulse" />
          Lightweight cold email, done right
        </p>
        <h1 className="max-w-3xl text-balance text-5xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
          Cold email that takes
          <span className="bg-gradient-to-r from-primary to-info bg-clip-text text-transparent"> five minutes</span>, not five tabs
        </h1>
        <p className="mt-5 max-w-xl text-pretty text-base text-muted-foreground sm:text-lg">
          Upload leads, add senders, pick a template, click Start. SmartReach handles rotation, throttling and reply detection — everything you need, nothing you don't.
        </p>
        <div className="mt-8 flex items-center gap-3">
          <Link href="/signup" className="h-11 rounded-xl bg-primary px-6 text-sm font-medium text-primary-foreground inline-flex items-center gap-2 shadow-lg shadow-primary/25 hover:bg-primary/90 transition-all hover:-translate-y-px">
            Start sending free <ArrowRight className="size-4" />
          </Link>
          <Link href="/login" className="h-11 rounded-xl border border-border bg-card/60 px-6 text-sm font-medium inline-flex items-center backdrop-blur hover:bg-accent transition-colors">
            Live demo
          </Link>
        </div>

        <div className="mt-16 grid w-full max-w-4xl grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { icon: Users, label: "CSV import", sub: "Custom merge fields" },
            { icon: Mail, label: "Sender rotation", sub: "1,000s of inboxes" },
            { icon: Timer, label: "Human pacing", sub: "Randomized delays" },
            { icon: Layers, label: "Reply detection", sub: "Auto-stop on reply" },
          ].map((f) => (
            <div key={f.label} className="rounded-xl border border-border/70 bg-card/60 p-4 text-left backdrop-blur">
              <f.icon className="mb-3 size-4 text-primary" />
              <p className="text-sm font-medium">{f.label}</p>
              <p className="text-xs text-muted-foreground">{f.sub}</p>
            </div>
          ))}
        </div>
      </main>

      <footer className="mx-auto w-full max-w-6xl px-6 py-8 text-center text-xs text-muted-foreground/60">
        SmartReach · Everything you need. Nothing you don't.
      </footer>
    </div>
  );
}
