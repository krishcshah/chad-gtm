import { cn } from "@smartreach/ui";

/** Page-width container for marketing sections (matches the header). */
export function Container({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8", className)}>{children}</div>;
}

/** A full-width band with consistent vertical rhythm and anchor offset. */
export function Section({
  id,
  tone = "plain",
  className,
  children,
  labelledBy,
}: {
  id?: string;
  tone?: "plain" | "raised";
  className?: string;
  children: React.ReactNode;
  labelledBy?: string;
}) {
  return (
    <section
      id={id}
      aria-labelledby={labelledBy}
      className={cn(
        "scroll-mt-16 border-t border-border py-20 sm:py-28",
        tone === "raised" ? "bg-card" : "bg-background",
        className,
      )}
    >
      <Container>{children}</Container>
    </section>
  );
}

/** Section heading: title, one or two sentences, optional action. */
export function SectionIntro({
  id,
  title,
  description,
  action,
  align = "start",
  className,
}: {
  id: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  align?: "start" | "center";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-6",
        align === "center" ? "items-center text-center" : "lg:flex-row lg:items-end lg:justify-between",
        className,
      )}
    >
      <div className={cn("flex max-w-2xl flex-col gap-4", align === "center" && "items-center")}>
        <h2
          id={id}
          className="text-balance text-3xl font-semibold leading-[1.1] tracking-[-0.03em] text-foreground sm:text-[40px]"
        >
          {title}
        </h2>
        {description ? (
          <p className="text-pretty text-base leading-relaxed text-muted-foreground sm:text-[17px]">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/** Instrument Serif accent inside a headline. */
export function Accent({ children }: { children: React.ReactNode }) {
  return <span className="font-display text-[1.08em] font-normal italic tracking-[-0.01em]">{children}</span>;
}
