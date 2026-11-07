import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { LANDING } from "./content";
import { PricingEstimator } from "./pricing-estimator";
import { Reveal } from "./reveal";
import { Section, SectionHeading } from "./primitives";

/** One plan, shown as a single glowing card, with an optional cost estimator. */
export function PricingSection({ isLoggedIn }: { isLoggedIn: boolean }) {
  const p = LANDING.pricing;
  return (
    <Section id="pricing" labelledBy="pricing-title">
      <Reveal>
        <SectionHeading id="pricing-title" eyebrow={p.eyebrow} title={p.title} lead={p.lead} />
      </Reveal>
      <Reveal delay={100} className="mx-auto mt-16 max-w-4xl">
        <div className="lp-beam rounded-3xl">
          <div className="lp-panel grid gap-10 rounded-3xl p-6 sm:p-10 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="flex flex-col">
              <p className="text-[13px] font-medium text-brand-text">{p.planName}</p>
              <p className="mt-4 flex items-baseline gap-2">
                <span className="lp-text-fade text-6xl font-semibold tracking-[-0.05em]">{p.price}</span>
                <span className="text-[15px] text-muted-foreground">{p.priceUnit}</span>
              </p>
              <p className="mt-3 text-[14.5px] leading-relaxed text-muted-foreground">{p.priceNote}</p>
              <Link
                href={isLoggedIn ? "/chad-gtm" : "/signup"}
                className="group mt-8 inline-flex h-12 items-center justify-center gap-2 rounded-full bg-brand px-6 text-[15px] font-medium text-brand-foreground shadow-[0_8px_30px_-8px_var(--brand)] transition-transform hover:-translate-y-px"
              >
                {isLoggedIn ? "Open your agent" : p.cta}
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              {p.centsPerEmail ? (
                <div className="mt-6">
                  <PricingEstimator centsPerEmail={p.centsPerEmail} />
                </div>
              ) : null}
            </div>
            <ul className="flex flex-col gap-3.5 md:border-l md:border-border md:pl-10">
              {p.included.map((item) => (
                <li key={item} className="flex gap-3 text-[14.5px] leading-snug text-foreground">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand-text">
                    <Check className="size-3" />
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
        {p.footnote ? <p className="mt-5 text-center text-[13px] text-subtle-foreground">{p.footnote}</p> : null}
      </Reveal>
    </Section>
  );
}
