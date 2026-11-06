import { BadgeCheck, Gauge, Hand, MailX, Briefcase, Timer } from "lucide-react";
import { Section, SectionIntro } from "./section";

const SAFEGUARDS = [
  {
    icon: Gauge,
    title: "30 emails a day per mailbox",
    body: "New mailboxes start lower and ramp up. The cap is checked at send time, so a backlog cannot push past it.",
  },
  {
    icon: Timer,
    title: "45–120 seconds between sends",
    body: "Sends are spaced at random intervals instead of going out in bursts.",
  },
  {
    icon: Hand,
    title: "Stops when someone replies",
    body: "A reply ends that lead's sequence right away, so nobody gets a follow-up after answering.",
  },
  {
    icon: MailX,
    title: "One-click unsubscribe",
    body: "Every email has an unsubscribe header, and opt-outs are checked again just before each send.",
  },
  {
    icon: Briefcase,
    title: "Work addresses only",
    body: "Personal inboxes such as Gmail or Outlook.com are left out of every audience.",
  },
  {
    icon: BadgeCheck,
    title: "Your identity on every email",
    body: "Your company name and postal address are required before launch, as anti-spam law expects.",
  },
];

export function SafeguardsSection({ activeMailboxes }: { activeMailboxes: number | null }) {
  const pool =
    activeMailboxes && activeMailboxes > 0
      ? ` The pool has ${activeMailboxes.toLocaleString("en-US")} active mailboxes right now.`
      : "";
  return (
    <Section id="deliverability" tone="raised" labelledBy="deliverability-title">
      <SectionIntro
        id="deliverability-title"
        title="Careful sending, on by default"
        description={`AutoGTM sends from a pool of managed mailboxes, so your own domain is never used for cold email and there is nothing to set up.${pool}`}
      />
      <ul className="mt-12 grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
        {SAFEGUARDS.map((s) => (
          <li key={s.title} className="flex flex-col gap-2 border-t border-border pt-5">
            <s.icon className="size-5 text-brand" aria-hidden />
            <h3 className="mt-1 text-[15px] font-semibold tracking-[-0.01em]">{s.title}</h3>
            <p className="text-sm leading-relaxed text-muted-foreground">{s.body}</p>
          </li>
        ))}
      </ul>
    </Section>
  );
}
