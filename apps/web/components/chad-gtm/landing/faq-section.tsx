import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { Card } from "@smartreach/ui";
import { Section, SectionIntro } from "./section";

const linkClass =
  "font-medium text-foreground underline decoration-border-strong underline-offset-4 hover:decoration-foreground";

export function FaqSection({
  totalLeads,
  distinctIndustries,
}: {
  totalLeads: number;
  distinctIndustries: number;
}) {
  const items: { q: string; a: React.ReactNode }[] = [
    {
      q: "Is it really $0 a month?",
      a: "Yes. Research, the directory, sequences, the reply agent and the inbox cost nothing. You pay 5¢ for each delivered email, with no seats, minimums or contract.",
    },
    {
      q: "Do I need my own domains or mailboxes?",
      a: "No. AutoGTM sends from a pool of managed mailboxes, so there are no domains to buy, no DNS records to add and no warm-up to wait for. Your own domain is never used for cold email.",
    },
    {
      q: "Where do the contacts come from?",
      a: `From the built-in B2B directory, which currently holds ${totalLeads.toLocaleString("en-US")} contacts across ${distinctIndustries.toLocaleString("en-US")} industries. AutoGTM only emails work addresses.`,
    },
    {
      q: "Can I review everything before it sends?",
      a: "Yes. Autopilot goes from your URL to a running campaign on its own, but you can choose guided setup instead and review the strategy, audience and emails first. Every run also keeps a step-by-step record of what the agent did.",
    },
    {
      q: "How do meetings get booked?",
      a: "You give AutoGTM your booking link, or it finds the one on your site. When a lead is interested, the reply agent sends it, and the meeting is booked on your own calendar.",
    },
    {
      q: "What happens when the reply agent does not know an answer?",
      a: "It does not guess. The question goes to Needs you; you answer it, the agent drafts the reply, and you check it before it is sent. You can also save answers and files to its knowledge base for next time.",
    },
    {
      q: "Is my data kept separate from other customers?",
      a: "Yes. Leads, campaigns, replies and run history belong to your workspace. The shared mailbox pool is run by AutoGTM and does not share data between customers.",
    },
    {
      q: "I received an email. How do I get removed?",
      a: (
        <>
          Use the unsubscribe link in the email, or ask us to delete your details on the{" "}
          <Link href="/remove-my-info" className={linkClass}>
            remove my info
          </Link>{" "}
          page.
        </>
      ),
    },
  ];

  return (
    <Section id="faq" tone="raised" labelledBy="faq-title">
      <div className="mx-auto max-w-3xl">
        <SectionIntro id="faq-title" align="center" title="Questions" />
        <Card className="mt-10 divide-y divide-border overflow-hidden">
          {items.map((item) => (
            <details key={item.q} className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-[15px] font-medium outline-none transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                {item.q}
                <ChevronDown
                  aria-hidden
                  className="size-4 shrink-0 text-subtle-foreground transition-transform group-open:rotate-180"
                />
              </summary>
              <div className="px-5 pb-5 text-sm leading-relaxed text-muted-foreground">{item.a}</div>
            </details>
          ))}
        </Card>
      </div>
    </Section>
  );
}
