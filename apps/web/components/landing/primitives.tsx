import { cn } from "@smartreach/ui";

/** Page-width container shared by every landing section and the header. */
export function Container({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("mx-auto w-full max-w-[1200px] px-4 sm:px-6 lg:px-8", className)}>{children}</div>;
}

/** A landing section with consistent rhythm and anchor offset for the sticky header. */
export function Section({
  id,
  labelledBy,
  className,
  children,
}: {
  id?: string;
  labelledBy?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={labelledBy} className={cn("relative scroll-mt-20 py-20 sm:py-28", className)}>
      <Container>{children}</Container>
    </section>
  );
}

/** Small pill label above a section heading. */
export function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-border-strong bg-card/60 px-3 py-1 text-[12px] font-medium tracking-wide text-muted-foreground backdrop-blur",
        className,
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-brand" />
      {children}
    </span>
  );
}

/** Section heading block: eyebrow, large title, one-paragraph lead. */
export function SectionHeading({
  id,
  eyebrow,
  title,
  lead,
  align = "center",
  className,
}: {
  id: string;
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  lead?: React.ReactNode;
  align?: "center" | "start";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-5",
        align === "center" ? "mx-auto max-w-3xl items-center text-center" : "max-w-2xl items-start",
        className,
      )}
    >
      {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
      <h2
        id={id}
        className="lp-text-fade text-balance text-[34px] font-semibold leading-[1.05] tracking-[-0.04em] sm:text-5xl lg:text-[56px]"
      >
        {title}
      </h2>
      {lead ? (
        <p className="max-w-2xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">{lead}</p>
      ) : null}
    </div>
  );
}

/** Serif italic accent used once per headline. */
export function Accent({ children, brand = false }: { children: React.ReactNode; brand?: boolean }) {
  return (
    <span
      className={cn(
        "font-display font-normal italic tracking-[-0.02em]",
        brand && "lp-text-brand pr-[0.06em]",
      )}
    >
      {children}
    </span>
  );
}
