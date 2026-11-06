import { CalendarCheck, CornerDownRight, Globe, Mail } from "lucide-react";
import { Badge, Card, cn } from "@smartreach/ui";

/*
 * Small, static pictures of real AutoGTM screens, built from the design
 * system. The company and people are a made-up example ("Northwind"), and
 * none of them show results or performance numbers.
 */

/** Tinted stage that frames one vignette. */
export function VignetteStage({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <figure
      className={cn(
        "relative flex min-w-0 items-center justify-center rounded-2xl bg-muted/70 p-4 ring-1 ring-inset ring-border sm:p-8",
        className,
      )}
    >
      <div aria-hidden className="bg-dot-grid mask-fade-b pointer-events-none absolute inset-0 rounded-2xl opacity-70" />
      <div className="relative w-full max-w-md">{children}</div>
    </figure>
  );
}

function Initials({ name }: { name: string }) {
  const letters = name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2);
  return (
    <span
      aria-hidden
      className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground ring-1 ring-inset ring-border"
    >
      {letters}
    </span>
  );
}

function Chips({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="flex flex-col gap-2 px-4 py-3.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item) => (
          <Badge key={item} variant="neutral">
            {item}
          </Badge>
        ))}
      </div>
    </div>
  );
}

/** Step 1: what the research pass pulls from a website. */
export function ResearchVignette() {
  const rows = [
    { label: "What they sell", value: "Demand forecasting for independent retailers" },
    { label: "Who buys it", value: "Shops with a few locations and no data team" },
    { label: "Proof on the site", value: "Customer stories, public pricing" },
    { label: "Booking link", value: <span className="break-all font-mono text-xs">cal.com/northwind/intro</span> },
  ];
  return (
    <Card className="overflow-hidden text-[13px]">
      <div className="flex items-center gap-2.5 border-b border-border px-4 py-3">
        <Globe className="size-4 text-subtle-foreground" aria-hidden />
        <span className="truncate font-medium">northwind.io</span>
        <Badge variant="success" dot className="ml-auto">
          Researched
        </Badge>
      </div>
      <dl className="divide-y divide-border">
        {rows.map((row) => (
          <div key={row.label} className="grid grid-cols-[6.5rem_minmax(0,1fr)] sm:grid-cols-[7.5rem_minmax(0,1fr)] gap-3 px-4 py-2.5">
            <dt className="text-muted-foreground">{row.label}</dt>
            <dd className="min-w-0 text-foreground">{row.value}</dd>
          </div>
        ))}
      </dl>
      <div className="border-t border-border bg-muted/40 px-4 py-2.5 text-xs text-subtle-foreground">
        Read: home, pricing, customers, about
      </div>
    </Card>
  );
}

/** Step 2: the ideal customer profile the research turns into. */
export function IcpVignette() {
  return (
    <Card className="overflow-hidden text-[13px]">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <span className="font-medium">Ideal customer profile</span>
        <span className="text-xs text-subtle-foreground">Editable</span>
      </div>
      <div className="divide-y divide-border">
        <Chips label="Roles" items={["Head of operations", "Founder", "Inventory manager"]} />
        <Chips label="Industries" items={["Retail", "Consumer goods", "Wholesale"]} />
        <Chips label="Company size" items={["11–50", "51–200"]} />
        <Chips label="Locations" items={["United States", "Canada"]} />
      </div>
    </Card>
  );
}

/** Step 3: buyers picked from the directory. */
export function BuyersVignette() {
  const people = [
    { name: "Dana Whitfield", role: "Head of operations", company: "Corner Market Co." },
    { name: "Luis Romero", role: "Founder", company: "Romero Home Goods" },
    { name: "Priya Nair", role: "Inventory manager", company: "Brightside Outfitters" },
    { name: "Sam Okafor", role: "Head of operations", company: "Harbor Supply" },
  ];
  return (
    <Card className="overflow-hidden text-[13px]">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <span className="font-medium">Matched buyers</span>
        <span className="text-xs text-subtle-foreground">From the directory</span>
      </div>
      <ul className="divide-y divide-border">
        {people.map((p) => (
          <li key={p.name} className="flex items-center gap-3 px-4 py-2.5">
            <Initials name={p.name} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{p.name}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {p.role} · {p.company}
              </span>
            </span>
            <Badge variant="success" className="hidden sm:inline-flex">
              Work email
            </Badge>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** Step 4: the three-email sequence and how it is sent. */
export function SequenceVignette() {
  const steps = [
    { day: "Day 0", name: "Opener", subject: "Forecasting before the holiday rush" },
    { day: "Day 3", name: "Follow-up", subject: "Re: Forecasting before the holiday rush" },
    { day: "Day 7", name: "Last note", subject: "Re: Forecasting before the holiday rush" },
  ];
  return (
    <Card className="overflow-hidden text-[13px]">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <span className="font-medium">Sequence</span>
        <span className="text-xs text-subtle-foreground">3 emails</span>
      </div>
      <ol className="divide-y divide-border">
        {steps.map((s, i) => (
          <li key={s.day} className="flex gap-3 px-4 py-3">
            <span
              aria-hidden
              className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground ring-1 ring-inset ring-border"
            >
              {i + 1}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="font-medium">{s.name}</span>
                <span className="text-xs text-subtle-foreground">{s.day}</span>
              </span>
              <span className="mt-0.5 block truncate text-muted-foreground">{s.subject}</span>
              {i === 0 && (
                <span className="mt-2 block rounded-md bg-muted/60 px-3 py-2 leading-relaxed text-muted-foreground">
                  Hi Dana, busy season usually means ordering on gut feel. Northwind forecasts demand per store so
                  you reorder the right stock. Worth a short look?
                </span>
              )}
            </span>
          </li>
        ))}
      </ol>
      <div className="flex items-center gap-2 border-t border-border bg-muted/40 px-4 py-2.5 text-xs text-subtle-foreground">
        <Mail className="size-3.5 shrink-0" aria-hidden />
        Sent from managed mailboxes, 45–120 seconds apart
      </div>
    </Card>
  );
}

/** Reply agent: one reply, what the agent did, and what it asked the founder. */
export function ReplyAgentVignette() {
  return (
    <Card className="overflow-hidden text-[13px]">
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <Initials name="Dana Whitfield" />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">Dana Whitfield</span>
          <span className="block truncate text-xs text-muted-foreground">
            Re: Forecasting before the holiday rush
          </span>
        </span>
        <Badge variant="info" dot>
          Interested
        </Badge>
      </div>
      <p className="px-4 py-3.5 leading-relaxed text-foreground">
        This could help. Does it work with Shopify POS? And what would it cost for three stores?
      </p>
      <ul className="divide-y divide-border border-t border-border">
        <li className="flex gap-3 px-4 py-3">
          <CornerDownRight className="mt-0.5 size-4 shrink-0 text-subtle-foreground" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-medium">Pricing question</span>
              <Badge variant="success" dot>
                Answered
              </Badge>
            </span>
            <span className="mt-0.5 block text-muted-foreground">
              Answered from your pricing page, with your booking link.
            </span>
          </span>
        </li>
        <li className="flex gap-3 px-4 py-3">
          <CornerDownRight className="mt-0.5 size-4 shrink-0 text-subtle-foreground" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-medium">Shopify POS</span>
              <Badge variant="warning" dot>
                Needs you
              </Badge>
            </span>
            <span className="mt-0.5 block text-muted-foreground">
              Not covered on your site. Answer once and the agent drafts the reply for you to check.
            </span>
          </span>
        </li>
      </ul>
      <div className="flex items-center gap-2 border-t border-border bg-muted/40 px-4 py-2.5 text-xs text-subtle-foreground">
        <CalendarCheck className="size-3.5 shrink-0" aria-hidden />
        Sequence stopped for this lead when they replied
      </div>
    </Card>
  );
}
