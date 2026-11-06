import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { Button, Card, CardContent } from "@smartreach/ui";
import { CostEstimator } from "./cost-estimator";
import { Accent, Section, SectionIntro } from "./section";

export function PricingSection({ primaryHref, isLoggedIn }: { primaryHref: string; isLoggedIn: boolean }) {
  const included = [
    "Website research and ideal customer profile",
    "Access to the B2B contact directory",
    "Email sequences written for each campaign",
    "Managed sending mailboxes, no setup",
    "Reply agent, inbox and Needs you",
    "Unsubscribe handling and suppression",
  ];

  return (
    <Section id="pricing" labelledBy="pricing-title">
      <SectionIntro
        id="pricing-title"
        align="center"
        title={
          <>
            $0 a month. <Accent>5¢ per delivered email.</Accent>
          </>
        }
        description="No seats, no minimums and no contract. Send 1,000 emails and you pay $50. Send nothing and you pay nothing."
      />

      <div className="mx-auto mt-12 grid max-w-5xl grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="flex flex-col">
          <CardContent className="flex flex-1 flex-col gap-6">
            <div className="flex flex-col gap-1">
              <h3 className="text-[15px] font-semibold tracking-[-0.01em]">Everything included</h3>
              <p className="text-[13px] text-muted-foreground">One plan for everyone.</p>
            </div>
            <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2 border-y border-border py-5">
              <div className="flex items-baseline gap-1.5">
                <span className="tabular text-4xl font-semibold tracking-[-0.035em]">$0</span>
                <span className="text-sm text-muted-foreground">per month</span>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="tabular text-4xl font-semibold tracking-[-0.035em]">5¢</span>
                <span className="text-sm text-muted-foreground">per delivered email</span>
              </div>
            </div>
            <ul className="flex flex-col gap-3">
              {included.map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-sm">
                  <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                  {item}
                </li>
              ))}
            </ul>
            <Button asChild variant="brand" size="lg" className="mt-auto w-full">
              <Link href={primaryHref}>
                {isLoggedIn ? "Open app" : "Get started free"} <ArrowRight />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <CostEstimator />
      </div>
    </Section>
  );
}
