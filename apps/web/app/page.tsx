import type { Metadata } from "next";
import Link from "next/link";
import {
  Bot,
  Check,
  CircleSlash,
  Hand,
  MailCheck,
  MailX,
  ShieldCheck,
  Timer,
  UserCheck,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@smartreach/ui";
import { getSession } from "@/lib/session";
import { LANDING } from "@/components/landing/content";
import { LandingHeader } from "@/components/landing/header";
import { HeroDemo } from "@/components/landing/hero-demo";
import { UrlForm } from "@/components/landing/url-form";
import { Reveal } from "@/components/landing/reveal";
import { Accent, Container, Eyebrow, Section, SectionHeading } from "@/components/landing/primitives";
import {
  CalendarVisual,
  ConversationVisual,
  DatabaseVisual,
  EmailVisual,
  MailboxVisual,
  NeedsYouVisual,
} from "@/components/landing/visuals";
import { PricingSection } from "@/components/landing/pricing";
import { FaqList } from "@/components/landing/faq";
import { LandingFooter } from "@/components/landing/footer";

export const dynamic = "force-dynamic";

const { meta, hero, schedulers, specs, split, how, agent, control, safety, faq, cta } = LANDING;

export const metadata: Metadata = {
  title: { absolute: meta.title },
  description: meta.description,
  alternates: { canonical: "https://autogtm.tech" },
  openGraph: {
    type: "website",
    url: "https://autogtm.tech",
    siteName: "AutoGTM",
    title: meta.title,
    description: meta.description,
  },
  twitter: { card: "summary_large_image", title: meta.title, description: meta.description },
};

const TILE_VISUALS = [ConversationVisual, NeedsYouVisual, DatabaseVisual, EmailVisual, CalendarVisual];
const MODE_ICONS: LucideIcon[] = [Bot, UserCheck, Hand];
const SAFETY_ICONS: LucideIcon[] = [MailCheck, Timer, MailX, CircleSlash, ShieldCheck, UserCheck];

export default async function LandingPage() {
  const session = await getSession();
  const isLoggedIn = Boolean(session?.user);

  return (
    // The marketing site is always dark: `.dark` swaps every token below.
    <div className="dark lp-root min-h-dvh text-foreground">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-[60] focus:rounded-md focus:bg-card focus:px-3 focus:py-2 focus:text-sm focus:shadow-md"
      >
        Skip to content
      </a>

      {/* Hero backdrop sits behind the header too. */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[900px] overflow-hidden">
        <div className="lp-grid absolute inset-0" />
        <div className="lp-glow absolute left-1/2 top-[-260px] h-[760px] w-[1400px] -translate-x-1/2" />
      </div>

      <LandingHeader isLoggedIn={isLoggedIn} />

      <main id="main" className="relative">
        {/* ── Hero ─────────────────────────────────────────────────── */}
        <section aria-labelledby="hero-title" className="relative">
          <Container className="flex flex-col items-center pb-16 pt-14 text-center sm:pt-24 lg:pt-28">
            <Eyebrow>{hero.eyebrow}</Eyebrow>
            <h1
              id="hero-title"
              className="mt-7 max-w-5xl text-balance text-[44px] font-semibold leading-[0.98] tracking-[-0.05em] sm:text-7xl lg:text-[92px]"
            >
              <span className="lp-text-fade">{hero.title}</span>
              <br />
              <Accent brand>{hero.titleAccent}</Accent>
            </h1>
            <p
              className="mt-7 max-w-2xl text-pretty text-[17px] leading-relaxed text-muted-foreground sm:text-xl"
            >
              {hero.lead}
            </p>
            <div className="mt-10 flex w-full justify-center">
              <UrlForm isLoggedIn={isLoggedIn} cta={hero.cta} hint={hero.hint} />
            </div>
          </Container>

          <Container className="pb-8">
            <div className="lp-rise relative mx-auto max-w-5xl" style={{ ["--rise-delay" as string]: "150ms" }}>
              <div aria-hidden className="absolute -inset-x-10 -top-10 bottom-10 rounded-[40px] bg-brand/10 blur-3xl" />
              <div className="relative">
                <HeroDemo />
              </div>
            </div>
          </Container>
        </section>

        {/* ── Schedulers marquee ───────────────────────────────────── */}
        <section aria-labelledby="schedulers-title" className="relative pt-12">
          <Container>
            <h2 id="schedulers-title" className="text-center text-[13px] text-muted-foreground">
              {schedulers.caption}
            </h2>
            <div className="mask-fade-x mt-6 overflow-hidden">
              <ul className="lp-marquee flex w-max gap-12 pr-12">
                {[...schedulers.names, ...schedulers.names].map((name, i) => (
                  <li
                    key={`${name}-${i}`}
                    aria-hidden={i >= schedulers.names.length || undefined}
                    className="whitespace-nowrap text-lg font-semibold tracking-tight text-subtle-foreground"
                  >
                    {name}
                  </li>
                ))}
              </ul>
            </div>
          </Container>
        </section>

        {/* ── Specs ────────────────────────────────────────────────── */}
        <section aria-labelledby="specs-title" className="relative py-16 sm:py-20">
          <Container>
            <h2 id="specs-title" className="text-center text-[12px] font-medium uppercase tracking-[0.14em] text-subtle-foreground">
              {specs.caption}
            </h2>
            <dl className="mt-8 grid grid-cols-2 gap-y-10 border-y border-border py-10 lg:grid-cols-4 lg:divide-x lg:divide-border">
              {specs.items.map((p, i) => (
                <Reveal key={p.label} delay={i * 80} className="flex flex-col items-center gap-2 px-4 text-center">
                  <dt className="order-2 text-[13px] text-muted-foreground">{p.label}</dt>
                  <dd className="lp-text-fade tabular order-1 text-[28px] font-semibold tracking-[-0.04em] sm:text-5xl">
                    {p.value}
                  </dd>
                </Reveal>
              ))}
            </dl>
          </Container>
        </section>

        {/* ── Who does what ────────────────────────────────────────── */}
        <Section id="split" labelledBy="split-title">
          <Reveal>
            <SectionHeading id="split-title" eyebrow={split.eyebrow} title={split.title} lead={split.lead} />
          </Reveal>
          <div className="mx-auto mt-16 grid max-w-5xl gap-4 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <Reveal className="lp-card lp-sheen rounded-3xl p-6 sm:p-8">
              <p className="text-[12px] font-medium uppercase tracking-[0.12em] text-subtle-foreground">You</p>
              <ol className="mt-6 flex flex-col gap-6">
                {split.you.map((item, i) => (
                  <li key={item.title} className="flex gap-4">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border-strong font-display text-[17px] italic text-foreground">
                      {i + 1}
                    </span>
                    <div>
                      <h3 className="text-[15.5px] font-semibold tracking-tight text-foreground">{item.title}</h3>
                      <p className="mt-1 text-[14px] leading-relaxed text-muted-foreground">{item.text}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </Reveal>
            <Reveal delay={100} className="lp-beam rounded-3xl">
              <div className="lp-panel h-full rounded-3xl p-6 sm:p-8">
                <div className="flex items-center justify-between">
                  <p className="text-[12px] font-medium uppercase tracking-[0.12em] text-brand-text">The agent</p>
                  <span className="text-[12px] text-subtle-foreground">Everything else</span>
                </div>
                <ul className="mt-6 grid gap-x-6 gap-y-3.5 sm:grid-cols-2">
                  {split.agent.map((task) => (
                    <li key={task} className="flex items-start gap-3 text-[14.5px] leading-snug text-foreground">
                      <span className="mt-px flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand-text">
                        <Check className="size-3" />
                      </span>
                      {task}
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          </div>
        </Section>

        {/* ── How it works ─────────────────────────────────────────── */}
        <Section id="how-it-works" labelledBy="how-title">
          <Reveal>
            <SectionHeading id="how-title" eyebrow={how.eyebrow} title={how.title} lead={how.lead} />
          </Reveal>
          <ol className="mt-16 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {how.steps.map((step, i) => (
              <Reveal as="li" key={step.title} delay={(i % 3) * 90} className="lp-card lp-card-hover lp-sheen relative rounded-2xl p-6 sm:p-7">
                <div className="flex items-center gap-3">
                  <span className="flex size-9 items-center justify-center rounded-full border border-brand/40 bg-background font-display text-lg italic text-brand-text">
                    {i + 1}
                  </span>
                  <span aria-hidden className="h-px flex-1 bg-gradient-to-r from-border-strong to-transparent" />
                </div>
                <h3 className="mt-5 text-lg font-semibold tracking-tight text-foreground">{step.title}</h3>
                <p className="mt-2 text-[14.5px] leading-relaxed text-muted-foreground">{step.text}</p>
              </Reveal>
            ))}
          </ol>
        </Section>

        {/* ── The agent (bento) ────────────────────────────────────── */}
        <Section id="agent" labelledBy="agent-title">
          <Reveal>
            <SectionHeading id="agent-title" eyebrow={agent.eyebrow} title={agent.title} lead={agent.lead} />
          </Reveal>
          <div className="mt-16 grid gap-4 lg:grid-cols-6">
            {agent.tiles.map((tile, i) => {
              const Visual = TILE_VISUALS[i] ?? CalendarVisual;
              const wide = i < 2;
              return (
                <Reveal
                  key={tile.title}
                  delay={(i % 3) * 90}
                  className={cn(
                    "lp-card lp-card-hover lp-sheen flex flex-col overflow-hidden rounded-3xl",
                    wide ? "lg:col-span-3" : "lg:col-span-2",
                  )}
                >
                  <div className="p-6 pb-0 sm:p-8 sm:pb-0">
                    <h3 className="text-lg font-semibold tracking-tight text-foreground">{tile.title}</h3>
                    <p className="mt-2 max-w-md text-[14.5px] leading-relaxed text-muted-foreground">{tile.text}</p>
                  </div>
                  <div className="relative mt-8 flex-1 px-6 pb-6 sm:px-8 sm:pb-8">
                    <div aria-hidden className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-brand/5 to-transparent" />
                    <div className="relative">
                      <Visual />
                    </div>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </Section>

        {/* ── Control ──────────────────────────────────────────────── */}
        <Section id="control" labelledBy="control-title">
          <Reveal>
            <SectionHeading id="control-title" eyebrow={control.eyebrow} title={control.title} lead={control.lead} />
          </Reveal>
          <div className="mt-16 grid gap-4 md:grid-cols-3">
            {control.modes.map((mode, i) => {
              const Icon = MODE_ICONS[i] ?? Bot;
              const isDefault = i === 0;
              return (
                <Reveal
                  key={mode.title}
                  delay={i * 90}
                  className={cn(
                    "relative flex flex-col rounded-2xl p-6",
                    isDefault ? "lp-beam lp-card" : "lp-card lp-card-hover",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={cn(
                        "flex size-10 items-center justify-center rounded-xl border",
                        isDefault ? "border-brand/40 bg-brand-soft text-brand-text" : "border-border bg-muted text-muted-foreground",
                      )}
                    >
                      <Icon className="size-5" />
                    </span>
                    {isDefault && (
                      <span className="rounded-full bg-brand-soft px-2.5 py-1 text-[11px] font-medium text-brand-text">
                        Default
                      </span>
                    )}
                  </div>
                  <h3 className="mt-6 text-lg font-semibold tracking-tight text-foreground">{mode.title}</h3>
                  <p className="mt-2 text-[14.5px] leading-relaxed text-muted-foreground">{mode.text}</p>
                </Reveal>
              );
            })}
          </div>
        </Section>

        {/* ── Safety ───────────────────────────────────────────────── */}
        <Section id="safety" labelledBy="safety-title">
          <div className="grid items-start gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)] lg:gap-16">
            <div>
              <Reveal>
                <SectionHeading
                  id="safety-title"
                  align="start"
                  eyebrow={safety.eyebrow}
                  title={safety.title}
                  lead={safety.lead}
                />
              </Reveal>
              <ul className="mt-12 grid gap-x-8 gap-y-8 sm:grid-cols-2">
                {safety.items.map((item, i) => {
                  const Icon = SAFETY_ICONS[i] ?? ShieldCheck;
                  return (
                    <Reveal as="li" key={item.title} delay={(i % 2) * 80} className="flex gap-4">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-foreground">
                        <Icon className="size-4" />
                      </span>
                      <div>
                        <h3 className="text-[15px] font-semibold tracking-tight text-foreground">{item.title}</h3>
                        <p className="mt-1 text-[14px] leading-relaxed text-muted-foreground">{item.text}</p>
                      </div>
                    </Reveal>
                  );
                })}
              </ul>
            </div>
            <Reveal delay={120} className="lp-panel rounded-3xl p-6 sm:p-8 lg:sticky lg:top-24">
              <div className="mb-5 flex items-center justify-between">
                <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-subtle-foreground">Sending today</p>
                <span className="inline-flex items-center gap-1.5 text-[12px] text-success-text">
                  <span className="size-1.5 rounded-full bg-success" /> All within limits
                </span>
              </div>
              <MailboxVisual />
            </Reveal>
          </div>
        </Section>

        {/* ── Pricing ──────────────────────────────────────────────── */}
        <PricingSection isLoggedIn={isLoggedIn} />

        {/* ── FAQ ──────────────────────────────────────────────────── */}
        <Section id="faq" labelledBy="faq-title">
          <div className="grid gap-12 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16">
            <Reveal>
              <SectionHeading id="faq-title" align="start" eyebrow={faq.eyebrow} title={faq.title} lead={faq.lead} />
            </Reveal>
            <Reveal delay={100}>
              <FaqList items={faq.items} />
            </Reveal>
          </div>
        </Section>

        {/* ── Closing CTA ──────────────────────────────────────────── */}
        <section aria-labelledby="cta-title" className="relative overflow-hidden">
          <div aria-hidden className="lp-glow-bottom pointer-events-none absolute inset-0" />
          <div aria-hidden className="lp-grid pointer-events-none absolute inset-0 rotate-180" />
          <Container className="relative flex flex-col items-center py-28 text-center sm:py-40">
            <Reveal>
              <h2
                id="cta-title"
                className="max-w-4xl text-balance text-[40px] font-semibold leading-[1] tracking-[-0.05em] sm:text-6xl lg:text-[80px]"
              >
                <span className="lp-text-fade">{cta.title}</span>
                <br />
                <Accent brand>{cta.titleAccent}</Accent>
              </h2>
            </Reveal>
            <Reveal delay={100}>
              <p className="mt-6 max-w-xl text-pretty text-[17px] leading-relaxed text-muted-foreground">{cta.lead}</p>
            </Reveal>
            <Reveal delay={180} className="mt-10 flex w-full justify-center">
              <UrlForm isLoggedIn={isLoggedIn} cta={hero.cta} hint={hero.hint} />
            </Reveal>
            {!isLoggedIn && (
              <p className="mt-6 text-[13px] text-muted-foreground">
                Already have an account?{" "}
                <Link href="/login" className="font-medium text-foreground underline decoration-border-strong underline-offset-4 hover:decoration-foreground">
                  Sign in
                </Link>
              </p>
            )}
          </Container>
        </section>
      </main>

      <LandingFooter isLoggedIn={isLoggedIn} />
    </div>
  );
}
