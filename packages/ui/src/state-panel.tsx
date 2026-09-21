import { AlertCircle, Lock, type LucideIcon } from "lucide-react";
import * as React from "react";
import { cn } from "./utils";
import { Button } from "./button";

type StateKind = "error" | "permission" | "offline";

const defaults: Record<
  StateKind,
  { icon: LucideIcon; title: string; description: string }
> = {
  error: {
    icon: AlertCircle,
    title: "Something went wrong",
    description: "We could not load this page. Try again, or come back in a moment.",
  },
  permission: {
    icon: Lock,
    title: "Access denied",
    description: "You do not have permission to view this page. Sign in with an allowed account.",
  },
  offline: {
    icon: AlertCircle,
    title: "Connection problem",
    description: "Check your network connection and try again.",
  },
};

/** Shared error / permission-denied / offline panel for app screens. */
export function StatePanel({
  kind = "error",
  title,
  description,
  action,
  className,
  icon: IconProp,
}: {
  kind?: StateKind;
  title?: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  icon?: LucideIcon;
}) {
  const d = defaults[kind];
  const Icon = IconProp ?? d.icon;
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed border-border/80 bg-card/40 py-16 px-6 text-center",
        className,
      )}
    >
      <div
        className={cn(
          "mb-4 flex size-12 items-center justify-center rounded-xl border",
          kind === "permission"
            ? "border-warning/30 bg-warning/10 text-warning-foreground"
            : "border-destructive/30 bg-destructive/10 text-destructive",
        )}
      >
        <Icon className="size-5" aria-hidden />
      </div>
      <h3 className="text-sm font-semibold">{title ?? d.title}</h3>
      <p className="mt-1 max-w-sm text-[13px] text-muted-foreground">
        {description ?? d.description}
      </p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function PermissionDenied({
  action,
  className,
}: {
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <StatePanel
      kind="permission"
      className={className}
      action={
        action ?? (
          <Button variant="outline" size="sm" asChild>
            <a href="/login">Sign in</a>
          </Button>
        )
      }
    />
  );
}

export function ErrorState({
  title,
  description,
  onRetry,
  className,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <StatePanel
      kind="error"
      title={title}
      description={description}
      className={className}
      action={
        onRetry ? (
          <Button variant="outline" size="sm" type="button" onClick={onRetry}>
            Try again
          </Button>
        ) : undefined
      }
    />
  );
}
