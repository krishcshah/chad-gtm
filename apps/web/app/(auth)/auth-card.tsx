import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Card, cn } from "@smartreach/ui";

/** Inline text link used inside auth copy and footers. */
export const authLinkClass =
  "font-medium text-foreground underline decoration-border-strong underline-offset-4 transition-colors hover:decoration-foreground";

const toneClasses = {
  neutral: "bg-muted text-muted-foreground",
  success: "bg-success-soft text-success-text",
  warning: "bg-warning-soft text-warning-text",
  destructive: "bg-destructive-soft text-destructive-text",
} as const;

/**
 * Frame for every auth screen: one card with a title, optional description
 * and status icon, and a line of links underneath (switch flow, go back).
 */
export function AuthCard({
  title,
  description,
  icon: Icon,
  tone = "neutral",
  children,
  footer,
}: {
  title: string;
  description?: ReactNode;
  /** Shown above the title on status screens (check inbox, link expired). */
  icon?: LucideIcon;
  tone?: keyof typeof toneClasses;
  children?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-6">
      <Card className="p-6 sm:p-8">
        {Icon ? (
          <div className={cn("mb-5 flex size-10 items-center justify-center rounded-lg", toneClasses[tone])}>
            <Icon className="size-5" aria-hidden />
          </div>
        ) : null}
        <h1 className="text-balance text-xl font-semibold tracking-[-0.02em] text-foreground">{title}</h1>
        {description ? (
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{description}</p>
        ) : null}
        {children ? <div className="mt-6">{children}</div> : null}
      </Card>
      {footer ? <div className="text-center text-sm text-muted-foreground">{footer}</div> : null}
    </div>
  );
}
