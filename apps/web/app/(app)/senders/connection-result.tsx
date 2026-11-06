import { CheckCircle2, MinusCircle, XCircle } from "lucide-react";
import { Alert, AlertTitle, cn } from "@smartreach/ui";
import type { ConnectionCheck } from "./sender-types";

/** Outcome of a live SMTP + IMAP test, one line per protocol with the server's message. */
export function ConnectionResult({
  result,
  imapConfigured,
  className,
}: {
  result: ConnectionCheck;
  imapConfigured: boolean;
  className?: string;
}) {
  const smtpOk = result.smtp.ok;
  const imapOk = result.imap.ok;
  const variant = !smtpOk ? "destructive" : imapOk || !imapConfigured ? "success" : "warning";
  const title = !smtpOk
    ? "Sending failed"
    : imapOk
      ? "Sending and reply detection work"
      : imapConfigured
        ? "Sending works, reply detection failed"
        : "Sending works";

  return (
    <Alert variant={variant} className={className} aria-live="polite">
      <AlertTitle>{title}</AlertTitle>
      <ul className="mt-2 flex flex-col gap-1.5 text-[13px]">
        <ProtocolLine name="Sending (SMTP)" state={smtpOk ? "ok" : "failed"} {...result.smtp} />
        <ProtocolLine
          name="Reply detection (IMAP)"
          state={!imapConfigured ? "off" : imapOk ? "ok" : "failed"}
          {...result.imap}
          message={imapConfigured ? result.imap.message : "No IMAP server set, so replies are not detected."}
        />
      </ul>
    </Alert>
  );
}

function ProtocolLine({
  name,
  state,
  message,
  latencyMs,
}: {
  name: string;
  state: "ok" | "failed" | "off";
  message: string;
  latencyMs?: number;
}) {
  const Icon = state === "ok" ? CheckCircle2 : state === "failed" ? XCircle : MinusCircle;
  return (
    <li className="flex gap-2">
      <Icon
        className={cn(
          "mt-0.5 size-4 shrink-0",
          state === "ok" && "text-success-text",
          state === "failed" && "text-destructive-text",
          state === "off" && "text-subtle-foreground",
        )}
        aria-hidden
      />
      <span className="min-w-0">
        <span className="font-medium">{name}: </span>
        <span>{state === "ok" ? "working" : state === "failed" ? "failed" : "not set up"}</span>
        {state === "ok" && latencyMs != null ? (
          <span className="tabular text-muted-foreground"> in {latencyMs.toLocaleString()} ms</span>
        ) : null}
        {message && state !== "ok" ? (
          <span className="block break-words text-muted-foreground">{message}</span>
        ) : null}
      </span>
    </li>
  );
}
