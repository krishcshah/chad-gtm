"use client";

import { useEffect, useId, useMemo, useState, useTransition } from "react";
import { ChevronLeft, ChevronRight, Send } from "lucide-react";
import {
  Alert,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
} from "@smartreach/ui";
import { toast } from "sonner";
import {
  getManualPreviewDataAction,
  sendManualTestEmailAction,
  type ManualPreviewLead,
  type ManualPreviewSender,
} from "@/lib/actions";
import { sanitizeEmailHtml } from "@/lib/email-html";

interface ManualEmailPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  campaignId?: string;
  leadListId?: string;
}

/** Shown only if lead data could not be loaded, and labelled as a sample. */
const SAMPLE_LEAD: ManualPreviewLead = {
  id: "sample",
  email: "jordan@northwind.example",
  firstName: "Jordan",
  lastName: "Lee",
  company: "Northwind",
  jobTitle: "Head of Growth",
  industry: "Software",
  website: "northwind.example",
  location: "Austin, TX",
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fullName(lead: ManualPreviewLead) {
  return [lead.firstName, lead.lastName].filter(Boolean).join(" ") || lead.email;
}

/** Fill {{merge_fields}} for one lead, then pick the first option of any {a|b} spin text. */
function fillTemplate(
  text: string,
  lead: ManualPreviewLead,
  sender: ManualPreviewSender | undefined,
  escape: (v: string) => string,
) {
  if (!text) return "";
  const vars: Record<string, string> = {
    first_name: lead.firstName,
    firstname: lead.firstName,
    last_name: lead.lastName,
    lastname: lead.lastName,
    name: [lead.firstName, lead.lastName].filter(Boolean).join(" ") || lead.firstName,
    company: lead.company,
    company_name: lead.company,
    job_title: lead.jobTitle,
    title: lead.jobTitle,
    industry: lead.industry,
    website: lead.website,
    location: lead.location,
    city: lead.location.split(",")[0]?.trim() || lead.location,
    email: lead.email,
    sender_name: sender?.fromName || "You",
    from_name: sender?.fromName || "You",
  };
  // Same fallback syntax the sender uses: {{first_name | "there"}}, quoted or bare.
  let out = text.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*(?:\|([^}]*))?\}\}/g, (match, key: string, fb?: string) => {
    const v = vars[key.toLowerCase()];
    if (v === undefined) return match;
    if (v.trim()) return escape(v);
    const fallback = (fb ?? "").trim().replace(/^(["'])(.*)\1$/, "$2");
    return escape(fallback);
  });
  out = out.replace(/\{([^{}]*\|[^{}]*)\}/g, (_, choices: string) => choices.split("|")[0] || "");
  return out;
}

/**
 * Preview an email filled in with real leads from the list, and send a test
 * copy to yourself from one of your mailboxes.
 */
export function ManualEmailPreviewDialog({
  open,
  onOpenChange,
  subject,
  bodyText,
  bodyHtml,
  campaignId,
  leadListId,
}: ManualEmailPreviewDialogProps) {
  const [leads, setLeads] = useState<ManualPreviewLead[]>([]);
  const [senders, setSenders] = useState<ManualPreviewSender[]>([]);
  const [leadIndex, setLeadIndex] = useState(0);
  const [senderId, setSenderId] = useState("");
  const [testTo, setTestTo] = useState("");
  const [testError, setTestError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [sending, startSending] = useTransition();
  const ids = useId();

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    setLoadError(null);
    getManualPreviewDataAction({ campaignId, leadListId })
      .then((res) => {
        if (!alive) return;
        if (res.ok && res.data) {
          setLeads(res.data.leads);
          setSenders(res.data.senders);
          setLeadIndex(0);
          setSenderId(res.data.defaultSenderId ?? res.data.senders[0]?.id ?? "");
        } else {
          setLoadError(!res.ok ? res.error : "Could not load leads for the preview.");
        }
      })
      .catch((err) => {
        console.error("Failed to load preview data", err);
        if (alive) setLoadError("Could not load leads for the preview.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [open, campaignId, leadListId, reloadKey]);

  const usingSample = leads.length === 0;
  const lead = leads[leadIndex] ?? SAMPLE_LEAD;
  const sender = senders.find((s) => s.id === senderId) ?? senders[0];

  const renderedSubject = fillTemplate(subject, lead, sender, (v) => v);
  const sourceBody = bodyHtml && bodyHtml.trim() ? bodyHtml : bodyText;
  const htmlSource = sourceBody
    ? sourceBody.startsWith("<p>") || sourceBody.includes("<br")
      ? sourceBody
      : `<p>${escapeHtml(sourceBody).replace(/\n\n/g, "</p><p>").replace(/\n/g, "<br>")}</p>`
    : "";
  const renderedBodyHtml = fillTemplate(htmlSource, lead, sender, escapeHtml);
  // The body can come from AI suggestions or shared templates; strip scripts and handlers before showing it.
  const previewHtml = useMemo(() => {
    if (!open || !renderedBodyHtml) return "";
    const clean = sanitizeEmailHtml(renderedBodyHtml);
    return clean.quoted ? `${clean.main}${clean.quoted}` : clean.main;
  }, [open, renderedBodyHtml]);
  const renderedBodyText = fillTemplate(bodyText || "", lead, sender, (v) => v);

  const sendTest = () => {
    const to = testTo.trim();
    if (!to || !to.includes("@")) {
      setTestError("Enter an email address to send the test to.");
      return;
    }
    if (!subject.trim()) {
      setTestError("Add a subject before sending a test.");
      return;
    }
    setTestError(null);
    startSending(async () => {
      try {
        const res = await sendManualTestEmailAction({
          senderId: senderId || undefined,
          toEmail: to,
          subject: `[TEST] ${renderedSubject}`,
          bodyHtml: renderedBodyHtml,
          bodyText: renderedBodyText,
        });
        if (!res.ok) {
          toast.error(res.error || "The test email was not sent");
        } else {
          toast.success(`Test sent to ${to}`, {
            description: `From ${res.data?.senderEmail || sender?.email || "your mailbox"}`,
          });
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "The test email was not sent");
      }
    });
  };

  const senderSelectId = `${ids}-sender`;
  const testToId = `${ids}-to`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Email preview</DialogTitle>
          <DialogDescription>
            Merge fields such as {"{{first_name}}"} are filled in with a lead from your list, the way they will be when
            sent.
          </DialogDescription>
        </DialogHeader>

        {loadError ? (
          <Alert
            variant="warning"
            action={
              <Button type="button" variant="outline" size="xs" onClick={() => setReloadKey((k) => k + 1)}>
                Try again
              </Button>
            }
          >
            {loadError} Showing a sample lead instead.
          </Alert>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            {loading ? (
              <div className="flex flex-col gap-1.5">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-56" />
              </div>
            ) : (
              <>
                <p className="truncate text-sm font-medium text-foreground">
                  {fullName(lead)}
                  {usingSample ? <span className="font-normal text-muted-foreground"> (sample lead)</span> : null}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {[lead.jobTitle, lead.company].filter(Boolean).join(" at ") || lead.email}
                </p>
              </>
            )}
          </div>
          {leads.length > 1 && (
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label="Previous lead"
                disabled={leadIndex === 0}
                onClick={() => setLeadIndex((i) => Math.max(0, i - 1))}
              >
                <ChevronLeft />
              </Button>
              <span className="tabular px-1.5 text-[13px] text-muted-foreground" aria-live="polite">
                {leadIndex + 1} of {leads.length}
              </span>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label="Next lead"
                disabled={leadIndex >= leads.length - 1}
                onClick={() => setLeadIndex((i) => Math.min(leads.length - 1, i + 1))}
              >
                <ChevronRight />
              </Button>
            </div>
          )}
        </div>

        <div className="overflow-hidden rounded-lg border border-border">
          <dl className="divide-y divide-border border-b border-border bg-muted/40 text-[13px]">
            <div className="flex gap-3 px-4 py-2">
              <dt className="w-16 shrink-0 text-muted-foreground">From</dt>
              <dd className="min-w-0 truncate text-foreground">
                {sender
                  ? sender.fromName?.trim()
                    ? `${sender.fromName} <${sender.email}>`
                    : sender.email
                  : "No mailbox connected"}
              </dd>
            </div>
            <div className="flex gap-3 px-4 py-2">
              <dt className="w-16 shrink-0 text-muted-foreground">To</dt>
              <dd className="min-w-0 truncate text-foreground">
                {fullName(lead)} &lt;{lead.email}&gt;
              </dd>
            </div>
            <div className="flex gap-3 px-4 py-2">
              <dt className="w-16 shrink-0 text-muted-foreground">Subject</dt>
              <dd className="min-w-0 font-medium text-foreground">
                {renderedSubject || <span className="font-normal italic text-subtle-foreground">No subject</span>}
              </dd>
            </div>
          </dl>
          <div className="max-h-[40dvh] min-h-[10rem] overflow-y-auto px-4 py-4">
            {previewHtml ? (
              <div
                className="text-sm leading-relaxed text-foreground [&_a]:underline [&_p+p]:mt-3"
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            ) : (
              <p className="text-sm italic text-subtle-foreground">This email has no body yet.</p>
            )}
          </div>
        </div>

        <section aria-labelledby={`${ids}-test`} className="flex flex-col gap-3 border-t border-border pt-5">
          <div>
            <h3 id={`${ids}-test`} className="text-sm font-semibold text-foreground">
              Send a test
            </h3>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              Sends this exact email, filled in for the lead above, so you can check how it lands in an inbox.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
            <div className="flex min-w-0 flex-col gap-2">
              <label htmlFor={senderSelectId} className="text-[13px] font-medium leading-none text-foreground">
                From mailbox
              </label>
              <Select value={senderId} onValueChange={setSenderId} disabled={senders.length === 0}>
                <SelectTrigger id={senderSelectId}>
                  <SelectValue placeholder={senders.length === 0 ? "No mailbox connected" : "Choose a mailbox"} />
                </SelectTrigger>
                <SelectContent>
                  {senders.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex min-w-0 flex-col gap-2">
              <label htmlFor={testToId} className="text-[13px] font-medium leading-none text-foreground">
                Send to
              </label>
              <Input
                id={testToId}
                type="email"
                autoComplete="email"
                placeholder="you@company.com"
                value={testTo}
                aria-invalid={testError ? true : undefined}
                aria-describedby={testError ? `${testToId}-error` : undefined}
                onChange={(e) => {
                  setTestTo(e.target.value);
                  setTestError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    sendTest();
                  }
                }}
                disabled={sending}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={sendTest}
              loading={sending}
              disabled={!testTo.trim() || senders.length === 0}
            >
              {!sending && <Send aria-hidden />}
              Send test
            </Button>
          </div>
          {testError ? (
            <p id={`${testToId}-error`} className="text-xs text-destructive-text">
              {testError}
            </p>
          ) : !loading && !loadError && senders.length === 0 ? (
            <p className="text-xs text-muted-foreground">No mailbox is assigned yet. Contact support to send a test.</p>
          ) : null}
        </section>

        <DialogFooter>
          <Button type="button" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
