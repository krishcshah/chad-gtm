import type { Metadata } from "next";
import Link from "next/link";
import { and, eq, isNull, sql } from "drizzle-orm";
import { schema } from "@smartreach/database";
import { Card, Stat } from "@smartreach/ui";
import { getSession } from "@/lib/session";
import { getDb } from "@/lib/db";
import { getDirectoryFacets, getDirectoryStats } from "@/lib/leads-directory";
import { LandingHeader } from "@/components/chad-gtm/landing/landing-header";
import { WebsiteUrlForm } from "@/components/chad-gtm/landing/website-url-form";
import { HowItWorks } from "@/components/chad-gtm/landing/how-it-works";
import { ReplyAgentSection } from "@/components/chad-gtm/landing/reply-agent-section";
import { DirectorySection, type IndustryCount } from "@/components/chad-gtm/landing/directory-section";
import { SafeguardsSection } from "@/components/chad-gtm/landing/safeguards-section";
import { PricingSection } from "@/components/chad-gtm/landing/pricing-section";
import { FaqSection } from "@/components/chad-gtm/landing/faq-section";
import { LandingFooter } from "@/components/chad-gtm/landing/landing-footer";
import { Accent, Container } from "@/components/chad-gtm/landing/section";

export const dynamic = "force-dynamic";

const TITLE = "AutoGTM · Outbound from your website to your calendar";
const DESCRIPTION =
  "Paste your website. AutoGTM researches your business, picks buyers from a built-in B2B contact directory, writes and sends the emails from managed mailboxes, and answers replies. $0 a month, 5¢ per delivered email.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: "https://autogtm.tech" },
  openGraph: {
    type: "website",
    url: "https://autogtm.tech",
    siteName: "AutoGTM",
    title: TITLE,
    description: DESCRIPTION,
  },
  twitter: { card: "summary", title: TITLE, description: DESCRIPTION },
};

/** Last known directory size, shown if the directory cannot be read. */
const FALLBACK_TOTAL_LEADS = 10_227_232;

/** The facet table stores free-text locations, so large counts are not countries. */
function locationStat(count: number) {
  return count > 0 && count <= 250
    ? { label: "Countries", hint: "Filter by location" }
    : { label: "Locations", hint: "Filter by country, region or city" };
}

export default async function LandingPage() {
  const session = await getSession();
  const isLoggedIn = Boolean(session?.user);
  const primaryHref = isLoggedIn ? "/chad-gtm" : "/signup";

  let totalLeads = FALLBACK_TOTAL_LEADS;
  let distinctIndustries = 200;
  let distinctCountries = 716;
  let topIndustries: IndustryCount[] = [];
  let activeMailboxes: number | null = null;

  try {
    const facets = getDirectoryFacets();
    const stats = getDirectoryStats();
    totalLeads = facets.totalLeads || stats.totalLeads || FALLBACK_TOTAL_LEADS;
    distinctIndustries = stats.distinctIndustries || distinctIndustries;
    distinctCountries = stats.distinctCountries || distinctCountries;
    topIndustries = facets.industries.slice(0, 12);
  } catch {
    // The landing page must render even if the directory is temporarily locked.
  }

  try {
    const db = getDb();
    const [row] = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.senderAccounts)
      .where(
        and(
          eq(schema.senderAccounts.isSystemPool, true),
          eq(schema.senderAccounts.status, "active"),
          isNull(schema.senderAccounts.deletedAt),
        ),
      );
    const count = Number(row?.count ?? 0);
    activeMailboxes = Number.isFinite(count) && count > 0 ? count : null;
  } catch {
    // Display only: without a count the copy simply leaves the number out.
  }

  const totalLabel = totalLeads.toLocaleString("en-US");
  const location = locationStat(distinctCountries);

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2 focus:text-sm focus:shadow-md"
      >
        Skip to content
      </a>
      <LandingHeader isLoggedIn={isLoggedIn} />

      <main id="main">
        {/* Hero */}
        <section aria-labelledby="hero-title" className="relative overflow-hidden">
          <div aria-hidden className="bg-dot-grid mask-fade-b pointer-events-none absolute inset-0 opacity-60" />
          <Container className="relative flex flex-col items-center pb-16 pt-16 text-center sm:pb-20 sm:pt-24 lg:pt-28">
            <h1
              id="hero-title"
              className="max-w-4xl text-balance text-[40px] font-semibold leading-[1.04] tracking-[-0.04em] sm:text-6xl lg:text-[76px]"
            >
              Paste your website. <Accent>We run your outbound.</Accent>
            </h1>
            <p className="mt-6 max-w-2xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
              AutoGTM researches your business, picks buyers from {totalLabel} B2B contacts, writes the emails and
              sends them. A reply agent answers the responses and sends interested leads to your calendar.
            </p>
            <WebsiteUrlForm isLoggedIn={isLoggedIn} className="mt-10" />
          </Container>

          <Container className="relative pb-20 sm:pb-24">
            <Card className="mx-auto grid max-w-5xl grid-cols-2 gap-px overflow-hidden bg-border lg:grid-cols-4 [&>*]:bg-card">
              <Stat bare label="B2B contacts" value={totalLabel} hint="In the built-in directory" />
              <Stat
                bare
                label="Industries"
                value={distinctIndustries.toLocaleString("en-US")}
                hint="Searchable by industry"
              />
              <Stat
                bare
                label={location.label}
                value={distinctCountries.toLocaleString("en-US")}
                hint={location.hint}
              />
              <Stat bare label="Per delivered email" value="5¢" hint="$0 a month platform fee" />
            </Card>
          </Container>
        </section>

        <HowItWorks totalContacts={totalLabel} />
        <ReplyAgentSection />
        <DirectorySection totalLeads={totalLeads} topIndustries={topIndustries} />
        <SafeguardsSection activeMailboxes={activeMailboxes} />
        <PricingSection primaryHref={primaryHref} isLoggedIn={isLoggedIn} />
        <FaqSection totalLeads={totalLeads} distinctIndustries={distinctIndustries} />

        {/* Closing call to action */}
        <section aria-labelledby="cta-title" className="relative overflow-hidden border-t border-border">
          <div aria-hidden className="bg-dot-grid mask-fade-b pointer-events-none absolute inset-0 opacity-50" />
          <Container className="relative flex flex-col items-center py-20 text-center sm:py-28">
            <h2
              id="cta-title"
              className="max-w-3xl text-balance text-4xl font-semibold leading-[1.06] tracking-[-0.035em] sm:text-5xl"
            >
              See what AutoGTM builds from <Accent>your website.</Accent>
            </h2>
            <p className="mt-5 max-w-xl text-pretty text-base leading-relaxed text-muted-foreground">
              Start with your URL. AutoGTM handles the research, the sending and the replies, and asks you only when
              it needs to.
            </p>
            <WebsiteUrlForm isLoggedIn={isLoggedIn} className="mt-10" />
            {!isLoggedIn && (
              <p className="mt-4 text-[13px] text-muted-foreground">
                Already have an account?{" "}
                <Link
                  href="/login"
                  className="font-medium text-foreground underline decoration-border-strong underline-offset-4 hover:decoration-foreground"
                >
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
