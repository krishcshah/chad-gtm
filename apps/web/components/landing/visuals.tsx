import { ArrowUpRight, CalendarCheck, Check, CornerDownRight, Search, Sparkles, Upload } from "lucide-react";
import { cn } from "@smartreach/ui";

/*
 * Small illustrative mock-ups used inside the landing page's feature tiles.
 * They are static (server components) and purely decorative: each tile's
 * heading and text carry the meaning, so these are hidden from assistive tech.
 */

function Bubble({
  who,
  role,
  children,
  className,
}: {
  who: string;
  role: "lead" | "agent";
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1", role === "agent" ? "items-end" : "items-start", className)}>
      <span className="px-1 text-[10.5px] font-medium uppercase tracking-[0.08em] text-subtle-foreground">{who}</span>
      <div
        className={cn(
          "max-w-[88%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed",
          role === "agent"
            ? "rounded-tr-md border border-brand/30 bg-brand-soft text-foreground"
            : "rounded-tl-md border border-border bg-muted text-foreground",
        )}
      >
        {children}
      </div>
    </div>
  );
}

/** A lead asks a question; the agent answers from the knowledge base and shares the booking link. */
export function ConversationVisual() {
  return (
    <div aria-hidden className="flex flex-col gap-3">
      <Bubble who="Dana · Fleetwise" role="lead">
        Interesting. Do you work with companies our size? And what does it cost?
      </Bubble>
      <Bubble who="Agent · answered from your notes" role="agent">
        Yes, most of our customers run 20 to 80 trucks. Pricing starts at $400 a month. Here&apos;s a deck with
        two case studies, and a link to grab 20 minutes with Sam:{" "}
        <span className="font-medium text-brand-text underline decoration-brand/40 underline-offset-2">cal.com/sam/intro</span>
      </Bubble>
      <div className="flex items-center gap-2 self-start rounded-full border border-success/30 bg-success-soft px-3 py-1.5 text-[12px] font-medium text-success-text">
        <CalendarCheck className="size-3.5" /> Dana picked Tue 10:00 on your calendar
      </div>
    </div>
  );
}

/** Search box + filter chips + live count against the database. */
export function DatabaseVisual() {
  const chips = ["Head of Operations", "Logistics", "United States", "Work emails only"];
  return (
    <div aria-hidden className="flex flex-col gap-3">
      <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/60 px-3 py-2.5 text-[13px] text-muted-foreground">
        <Search className="size-4 text-subtle-foreground" />
        <span className="text-foreground">Ops leaders at mid-size logistics firms</span>
        <span className="lp-caret ml-[-4px] h-4 w-px bg-foreground" />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {chips.map((c) => (
          <span key={c} className="rounded-full border border-border bg-card px-2.5 py-1 text-[11.5px] text-muted-foreground">
            {c}
          </span>
        ))}
      </div>
      <div className="mt-1 flex items-end justify-between rounded-xl border border-border bg-card px-4 py-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.08em] text-subtle-foreground">Matches</p>
          <p className="tabular text-2xl font-semibold tracking-tight text-foreground">18,240</p>
        </div>
        <p className="tabular text-right text-[12px] text-muted-foreground">
          searched
          <br />
          <span className="font-medium text-foreground">100M+</span> contacts
        </p>
      </div>
    </div>
  );
}

/** An email with the personalised opening line highlighted. */
export function EmailVisual() {
  return (
    <div aria-hidden className="rounded-xl border border-border bg-card p-4 text-[13px] leading-relaxed">
      <div className="mb-3 flex flex-col gap-1 border-b border-border pb-3 text-[12px] text-muted-foreground">
        <p>
          <span className="text-subtle-foreground">To</span> <span className="text-foreground">marco@haulio.com</span>
        </p>
        <p>
          <span className="text-subtle-foreground">Subject</span> <span className="text-foreground">Dispatch at Haulio</span>
        </p>
      </div>
      <p className="text-foreground">Hi Marco,</p>
      <p className="mt-2">
        <span className="rounded bg-brand-soft px-1 py-0.5 text-foreground ring-1 ring-brand/25">
          Running ops for a fleet Haulio&apos;s size usually means dispatch lives in spreadsheets.
        </span>{" "}
        <span className="text-muted-foreground">
          Northwind replaces that with one board your drivers already know how to use…
        </span>
      </p>
      <div className="mt-3 flex items-center gap-1.5 text-[11.5px] text-brand-text">
        <Sparkles className="size-3.5" /> Written for Marco, not a template
      </div>
    </div>
  );
}

/** The agent asks the owner something it cannot answer, once. */
export function NeedsYouVisual() {
  return (
    <div aria-hidden className="flex flex-col gap-3">
      <div className="rounded-xl border border-warning/30 bg-card p-4">
        <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.08em] text-warning-text">
          <span className="size-1.5 rounded-full bg-warning" /> Needs you
        </div>
        <p className="mt-2 text-[13.5px] font-medium text-foreground">Priya asked for your SOC 2 report.</p>
        <p className="mt-1 text-[12.5px] text-muted-foreground">I don&apos;t have one on file, so I haven&apos;t replied yet.</p>
        <div className="mt-3 flex gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-[12px] font-medium text-primary-foreground">
            <Upload className="size-3.5" /> Add the report
          </span>
          <span className="inline-flex items-center rounded-md border border-border px-2.5 py-1.5 text-[12px] text-muted-foreground">
            Reply myself
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2 pl-2 text-[12px] text-muted-foreground">
        <CornerDownRight className="size-3.5 text-subtle-foreground" />
        Saved. Next time someone asks, the agent sends it.
      </div>
    </div>
  );
}

/** A short list of booked calls. */
export function CalendarVisual() {
  const rows = [
    { day: "Tue", time: "10:00", who: "Dana Reyes", co: "Fleetwise" },
    { day: "Wed", time: "14:30", who: "Marco Tan", co: "Haulio" },
    { day: "Thu", time: "11:00", who: "Priya Shah", co: "Cargolane" },
  ];
  return (
    <ul aria-hidden className="flex flex-col gap-2">
      {rows.map((r) => (
        <li key={r.who} className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5">
          <div className="flex w-10 shrink-0 flex-col items-center rounded-md bg-muted py-1">
            <span className="text-[10px] uppercase text-subtle-foreground">{r.day}</span>
            <span className="tabular text-[12px] font-medium text-foreground">{r.time}</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium text-foreground">Intro call · {r.who}</p>
            <p className="truncate text-[12px] text-muted-foreground">{r.co} · booked via your link</p>
          </div>
          <Check className="size-4 text-success-text" />
        </li>
      ))}
    </ul>
  );
}

/** Mailbox pool: per-mailbox daily caps, with new mailboxes ramping up slowly. */
export function MailboxVisual() {
  const boxes = [
    { name: "Mailbox 01", sent: 28, cap: 30, isNew: false },
    { name: "Mailbox 02", sent: 17, cap: 30, isNew: false },
    { name: "Mailbox 03", sent: 9, cap: 15, isNew: true },
  ];
  return (
    <ul aria-hidden className="flex flex-col gap-2.5">
      {boxes.map((b) => (
        <li key={b.name} className="rounded-xl border border-border bg-card px-3 py-2.5">
          <div className="flex items-center justify-between text-[12px]">
            <span className="truncate text-foreground">{b.name}</span>
            <span className={cn("shrink-0 text-[11px]", b.isNew ? "text-warning-text" : "text-success-text")}>
              {b.isNew ? "New · ramping up" : "Healthy"}
            </span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-brand" style={{ width: `${(b.sent / b.cap) * 100}%` }} />
          </div>
          <p className="tabular mt-1 text-[11px] text-subtle-foreground">
            {b.sent} of {b.cap} today
          </p>
        </li>
      ))}
    </ul>
  );
}

/** Link-style arrow used in tile footers. */
export function TileLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className="inline-flex items-center gap-1 text-[13px] font-medium text-foreground transition-colors hover:text-brand-text"
    >
      {children}
      <ArrowUpRight className="size-3.5" />
    </a>
  );
}
