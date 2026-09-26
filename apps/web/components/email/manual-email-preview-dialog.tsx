"use client";

import { useEffect, useState, useTransition } from "react";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  cn,
} from "@smartreach/ui";
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  Loader2,
  Mail,
  Send,
  Briefcase,
  Building,
  Globe,
} from "lucide-react";
import { toast } from "sonner";
import {
  getManualPreviewDataAction,
  sendManualTestEmailAction,
  type ManualPreviewLead,
  type ManualPreviewSender,
} from "@/lib/actions";

interface ManualEmailPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  campaignId?: string;
  leadListId?: string;
}

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
  const [selectedLeadIdx, setSelectedLeadIdx] = useState(0);
  const [selectedSenderId, setSelectedSenderId] = useState<string>("");
  const [testEmailTo, setTestEmailTo] = useState("");
  const [loadingData, setLoadingData] = useState(false);
  const [sendingTest, startSendingTest] = useTransition();

  // Load preview leads and workspace senders
  useEffect(() => {
    if (!open) return;

    let mounted = true;
    setLoadingData(true);

    getManualPreviewDataAction({ campaignId, leadListId })
      .then((res) => {
        if (!mounted) return;
        if (res.ok && res.data) {
          setLeads(res.data.leads);
          setSenders(res.data.senders);
          if (res.data.defaultSenderId) {
            setSelectedSenderId(res.data.defaultSenderId);
          } else if (res.data.senders.length > 0) {
            setSelectedSenderId(res.data.senders[0].id);
          }
        }
      })
      .catch((err) => {
        console.error("Failed to load preview data", err);
      })
      .finally(() => {
        if (mounted) setLoadingData(false);
      });

    return () => {
      mounted = false;
    };
  }, [open, campaignId, leadListId]);

  const activeLead = leads[selectedLeadIdx] || {
    id: "sample-fallback",
    email: "alex.rivera@northwindtech.io",
    firstName: "Alex",
    lastName: "Rivera",
    company: "Northwind Technologies",
    jobTitle: "VP of Operations",
    industry: "Enterprise Cloud & Software",
    website: "northwindtech.io",
    location: "San Francisco, CA",
  };

  const activeSender =
    senders.find((s) => s.id === selectedSenderId) ||
    senders[0] || {
      id: "sender-default",
      email: "hey@krishshah.cloud",
      fromName: "Alex at SmartReach",
      isRecommended: true,
    };

  // Interpolate placeholders
  const interpolate = (text: string): string => {
    if (!text) return "";
    let res = text;

    // Spin syntax {Hi|Hello|Hey} -> choose first option for deterministic preview
    res = res.replace(/\{([^{}]+)\}/g, (_, choices) => {
      const parts = choices.split("|");
      return parts[0] || "";
    });

    const vars: Record<string, string> = {
      first_name: activeLead.firstName,
      firstname: activeLead.firstName,
      last_name: activeLead.lastName,
      lastname: activeLead.lastName,
      name: [activeLead.firstName, activeLead.lastName].filter(Boolean).join(" ") || activeLead.firstName,
      company: activeLead.company,
      company_name: activeLead.company,
      job_title: activeLead.jobTitle,
      title: activeLead.jobTitle,
      industry: activeLead.industry,
      website: activeLead.website,
      location: activeLead.location,
      city: activeLead.location.split(",")[0]?.trim() || activeLead.location,
      email: activeLead.email,
      sender_name: activeSender.fromName || "You",
      from_name: activeSender.fromName || "You",
    };

    for (const [k, v] of Object.entries(vars)) {
      const reg = new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`, "gi");
      res = res.replace(reg, v || "");
    }

    return res;
  };

  const renderedSubject = interpolate(subject || "(No subject provided)");
  const rawBodyToRender = bodyHtml && bodyHtml.trim() ? bodyHtml : bodyText;
  const renderedBodyHtml = interpolate(
    rawBodyToRender
      ? rawBodyToRender.startsWith("<p>") || rawBodyToRender.includes("<br")
        ? rawBodyToRender
        : `<p>${rawBodyToRender.replace(/\n\n/g, "</p><p>").replace(/\n/g, "<br>")}</p>`
      : "<p><em>(Empty email body)</em></p>"
  );
  const renderedBodyText = interpolate(bodyText || "");

  // Handle Send Test Mail
  const handleSendTestMail = () => {
    const dest = testEmailTo.trim();
    if (!dest || !dest.includes("@")) {
      toast.error("Please enter a valid recipient email address for the test mail.");
      return;
    }

    startSendingTest(async () => {
      try {
        const res = await sendManualTestEmailAction({
          senderId: selectedSenderId || undefined,
          toEmail: dest,
          subject: `[TEST] ${renderedSubject}`,
          bodyHtml: renderedBodyHtml,
          bodyText: renderedBodyText,
        });

        if (!res.ok) {
          toast.error(res.error || "Failed to deliver test email");
        } else {
          toast.success(
            `Test email sent successfully to ${dest} via ${res.data?.senderEmail || activeSender.email}!`
          );
        }
      } catch (err: any) {
        toast.error(err?.message || "An unexpected error occurred while sending test email");
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[96vw] max-w-3xl p-0 overflow-hidden border border-border/80 bg-background shadow-2xl flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/70 bg-primary/5 px-4 sm:px-6 py-3.5 sm:py-4 shrink-0">
          <div className="space-y-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
                <Eye className="size-4" />
              </span>
              <DialogTitle className="text-sm sm:text-base font-semibold truncate">
                Manual Email Preview & Test Dispatch
              </DialogTitle>
              <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary text-[10px] sm:text-[11px] shrink-0">
                Live Lead Interpolation
              </Badge>
            </div>
            <DialogDescription className="text-xs text-muted-foreground">
              All variables like <code>&#123;&#123;first_name&#125;&#125;</code> and <code>&#123;&#123;company&#125;&#125;</code> are filled with top lead attributes so you can verify how prospects will read this outreach.
            </DialogDescription>
          </div>

          {leads.length > 1 && (
            <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setSelectedLeadIdx((prev) => Math.max(0, prev - 1))}
                disabled={selectedLeadIdx === 0}
              >
                <ChevronLeft className="size-3.5" />
              </Button>
              <span className="text-[11px] text-muted-foreground font-mono font-medium px-1">
                {selectedLeadIdx + 1} / {leads.length}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setSelectedLeadIdx((prev) => Math.min(leads.length - 1, prev + 1))}
                disabled={selectedLeadIdx >= leads.length - 1}
              >
                <ChevronRight className="size-3.5" />
              </Button>
            </div>
          )}
        </div>

        {/* Lead Switcher Pills Bar */}
        {leads.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto border-b border-border/50 bg-muted/25 px-4 sm:px-6 py-2 shrink-0">
            <span className="text-[11px] font-semibold text-foreground shrink-0">Preview with:</span>
            {leads.slice(0, 6).map((lead, idx) => {
              const isSelected = idx === selectedLeadIdx;
              return (
                <button
                  key={lead.id || idx}
                  type="button"
                  onClick={() => setSelectedLeadIdx(idx)}
                  className={cn(
                    "rounded-full px-2.5 py-0.5 text-[11px] font-medium shrink-0 transition-colors border",
                    isSelected
                      ? "bg-primary text-primary-foreground border-primary font-semibold shadow-2xs"
                      : "bg-background border-border/80 text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  {lead.firstName} ({lead.company})
                </button>
              );
            })}
          </div>
        )}

        {/* Main Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {/* Active Prospect & Sender Card */}
          <div className="rounded-xl border border-border/70 bg-card/60 p-3.5 sm:p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              {/* Prospect info */}
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-xs">
                  {activeLead.firstName[0]?.toUpperCase() || "P"}
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-semibold text-foreground">
                      {[activeLead.firstName, activeLead.lastName].filter(Boolean).join(" ")}
                    </span>
                    <span className="text-muted-foreground text-[11px] truncate max-w-[200px] sm:max-w-none">
                      &lt;{activeLead.email}&gt;
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] text-muted-foreground mt-0.5">
                    {activeLead.jobTitle && (
                      <span className="flex items-center gap-1">
                        <Briefcase className="size-3 text-muted-foreground" />
                        {activeLead.jobTitle}
                      </span>
                    )}
                    {activeLead.company && (
                      <span className="flex items-center gap-1 font-medium text-foreground/80">
                        <Building className="size-3 text-muted-foreground" />
                        {activeLead.company}
                      </span>
                    )}
                    {activeLead.industry && (
                      <span className="flex items-center gap-1">
                        <Globe className="size-3 text-muted-foreground" />
                        {activeLead.industry}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Sender mailbox selector */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 shrink-0 border-t sm:border-t-0 pt-2 sm:pt-0">
                <Label className="text-[11px] text-muted-foreground shrink-0">Send via mailbox:</Label>
                <Select value={selectedSenderId} onValueChange={setSelectedSenderId}>
                  <SelectTrigger className="h-7 w-full sm:w-56 text-xs bg-background">
                    <SelectValue placeholder="Select sender mailbox" />
                  </SelectTrigger>
                  <SelectContent>
                    {senders.map((s) => (
                      <SelectItem key={s.id} value={s.id} className="text-xs">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium truncate">{s.email}</span>
                          {s.isRecommended && (
                            <span className="text-[9px] font-semibold uppercase text-primary bg-primary/10 px-1 rounded">
                              Recommended
                            </span>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                    {senders.length === 0 && (
                      <SelectItem value="default" className="text-xs">
                        hey@krishshah.cloud (Default)
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Email Preview Card */}
          <div className="rounded-xl border border-border/80 bg-background shadow-xs overflow-hidden">
            {/* Email Header Fields */}
            <div className="border-b border-border/60 bg-muted/20 px-4 py-3 space-y-1.5 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground font-medium w-14 shrink-0">From:</span>
                <span className="text-foreground font-medium truncate">
                  {activeSender.fromName ? `"${activeSender.fromName}" ` : ""}
                  &lt;{activeSender.email}&gt;
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground font-medium w-14 shrink-0">To:</span>
                <span className="text-foreground font-medium truncate">
                  "{[activeLead.firstName, activeLead.lastName].filter(Boolean).join(" ")}" &lt;{activeLead.email}&gt;
                </span>
              </div>
              <div className="flex items-start gap-2 pt-1 border-t border-border/40">
                <span className="text-muted-foreground font-semibold w-14 shrink-0 mt-0.5">Subject:</span>
                <span className="text-foreground font-semibold text-sm select-all">
                  {renderedSubject}
                </span>
              </div>
            </div>

            {/* Email Body Content */}
            <div className="p-4 sm:p-5 min-h-[160px] text-xs sm:text-sm text-foreground/90 leading-relaxed font-sans select-all overflow-x-auto">
              <div
                className="space-y-3 prose prose-xs dark:prose-invert max-w-none"
                dangerouslySetInnerHTML={{ __html: renderedBodyHtml }}
              />
            </div>
          </div>

          {/* Send Test Email Section */}
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className="flex size-6 items-center justify-center rounded-md bg-primary/10 text-primary shrink-0">
                <Send className="size-3.5" />
              </span>
              <span className="text-xs font-semibold text-foreground">
                Send Live Test Email
              </span>
              <span className="text-[11px] text-muted-foreground">
                (Delivered via {activeSender.email})
              </span>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <div className="relative flex-1">
                <Input
                  type="email"
                  placeholder="Enter destination email (e.g. you@yourcompany.com)"
                  value={testEmailTo}
                  onChange={(e) => setTestEmailTo(e.target.value)}
                  className="h-8 text-xs bg-background pr-8"
                  disabled={sendingTest}
                />
                <Mail className="absolute right-2.5 top-2 size-4 text-muted-foreground" />
              </div>

              <Button
                type="button"
                onClick={handleSendTestMail}
                disabled={sendingTest || !testEmailTo.trim()}
                className="h-8 text-xs font-semibold gap-1.5 shrink-0"
              >
                {sendingTest ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Send className="size-3.5" />
                )}
                <span>{sendingTest ? "Sending Test Mail…" : "Send Test Mail"}</span>
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Sends the exact rendered email with all variables filled in to your destination mailbox so you can inspect deliverability and inbox appearance.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border/70 bg-muted/20 px-4 sm:px-6 py-3 shrink-0">
          <p className="text-xs text-muted-foreground">
            Previewing lead <strong>{selectedLeadIdx + 1} of {Math.max(1, leads.length)}</strong>.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="h-8 text-xs"
          >
            Close Preview
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
