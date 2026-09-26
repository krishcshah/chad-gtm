"use client";

import React from "react";
import {
  Badge,
  Button,
  Separator,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@smartreach/ui";
import {
  Briefcase,
  Building2,
  CheckCircle2,
  ExternalLink,
  Globe,
  Linkedin,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  Sparkles,
  Users,
  Copy,
  DollarSign,
} from "lucide-react";
import type { DirectoryLead } from "@/lib/leads-directory";
import { toast } from "sonner";

interface LeadDetailsSheetProps {
  lead: DirectoryLead | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddToList?: (leadId: number) => void;
}

export function LeadDetailsSheet({
  lead,
  open,
  onOpenChange,
  onAddToList,
}: LeadDetailsSheetProps) {
  if (!lead) return null;

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`Copied ${label} to clipboard`);
  };

  // Collect all additional emails from rawAttributes
  const additionalEmails: string[] = [];
  for (let i = 2; i <= 14; i++) {
    const emailKey = `email_${i}`;
    if (lead.rawAttributes[emailKey]) {
      additionalEmails.push(lead.rawAttributes[emailKey]);
    }
  }

  // Collect all additional phones from rawAttributes
  const additionalPhones: string[] = [];
  for (let i = 2; i <= 12; i++) {
    const phoneKey = `phone_${i}`;
    if (lead.rawAttributes[phoneKey]) {
      additionalPhones.push(lead.rawAttributes[phoneKey]);
    }
  }

  // Filter out core standard keys to display true custom/extra fields
  const standardKeys = new Set([
    "lead_id", "first_name", "last_name", "full_name", "job_title",
    "company_name", "company_website", "linkedin_url", "location",
    "industry", "team_size", "revenue_range", "email_1", "phone_1",
    "email_count", "phone_count", "source_file"
  ]);

  const customFieldEntries = Object.entries(lead.rawAttributes).filter(
    ([k]) => !standardKeys.has(k) && !k.startsWith("email_") && !k.startsWith("phone_")
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto p-0">
        {/* Header Hero */}
        <div className="border-b border-border/60 bg-muted/20 p-6 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 via-primary/10 to-info/20 text-xl font-bold text-primary border border-primary/20 shadow-sm">
                {(lead.firstName || lead.fullName || "L").slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0">
                <SheetTitle className="text-xl font-bold tracking-tight text-foreground truncate">
                  {lead.fullName || `${lead.firstName} ${lead.lastName}`.trim() || "Verified Contact"}
                </SheetTitle>
                <p className="text-sm font-medium text-muted-foreground mt-0.5 flex items-center gap-1.5">
                  <Briefcase className="size-3.5 text-primary shrink-0" />
                  <span className="truncate">{lead.jobTitle || "Executive"}</span>
                </p>
              </div>
            </div>
            <Badge
              variant="outline"
              className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-xs font-semibold px-2 py-0.5 shrink-0"
            >
              <ShieldCheck className="size-3 mr-1" />
              {lead.emailStatus || "VERIFIED"}
            </Badge>
          </div>

          {/* Company & Social Quick Bar */}
          <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
            {lead.companyName && (
              <span className="flex items-center gap-1 rounded-lg border border-border/60 bg-card/60 px-2.5 py-1 text-foreground font-semibold">
                <Building2 className="size-3.5 text-muted-foreground" />
                {lead.companyName}
              </span>
            )}
            {lead.location && (
              <span className="flex items-center gap-1 rounded-lg border border-border/60 bg-card/60 px-2.5 py-1 text-muted-foreground">
                <MapPin className="size-3.5 text-muted-foreground" />
                {lead.location}
              </span>
            )}
            {lead.linkedinUrl && (
              <a
                href={lead.linkedinUrl.startsWith("http") ? lead.linkedinUrl : `https://${lead.linkedinUrl}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 rounded-lg border border-primary/20 bg-primary/10 px-2.5 py-1 text-primary hover:bg-primary/20 transition-colors font-medium"
              >
                <Linkedin className="size-3.5" />
                LinkedIn
                <ExternalLink className="size-2.5 ml-0.5" />
              </a>
            )}
            {lead.companyWebsite && (
              <a
                href={lead.companyWebsite.startsWith("http") ? lead.companyWebsite : `https://${lead.companyWebsite}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 rounded-lg border border-border/60 bg-card/60 px-2.5 py-1 text-muted-foreground hover:text-foreground transition-colors"
              >
                <Globe className="size-3.5" />
                Website
                <ExternalLink className="size-2.5 ml-0.5" />
              </a>
            )}
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-6">
          {/* Email Contacts Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Mail className="size-3.5 text-primary" />
                Verified Email Addresses ({1 + additionalEmails.length})
              </h4>
            </div>

            {lead.email ? (
              <div className="rounded-xl border border-primary/30 bg-primary/[0.03] p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground font-mono select-all truncate">
                      {lead.email}
                    </span>
                    <Badge variant="default" className="text-[10px] py-0 px-1.5 bg-primary">
                      Primary
                    </Badge>
                    {lead.workEmail === lead.email && (
                      <Badge variant="outline" className="text-[10px] py-0 px-1.5 border-primary/30 text-primary">
                        Work
                      </Badge>
                    )}
                    {lead.personalEmail === lead.email && (
                      <Badge variant="outline" className="text-[10px] py-0 px-1.5 border-sky-500/30 text-sky-400">
                        Personal
                      </Badge>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {lead.workEmail === lead.email ? "Corporate domain email" : "Personal / direct email"} · Verified with 98%+ deliverability guarantee
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => copyToClipboard(lead.email, "email")}
                  className="h-8 gap-1.5 shrink-0"
                >
                  <Copy className="size-3.5" /> Copy
                </Button>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">No primary email on record.</p>
            )}

            {/* Distinct Work Email if not primary */}
            {lead.workEmail && lead.workEmail !== lead.email && (
              <div className="rounded-xl border border-border/60 bg-card/60 p-2.5 flex items-center justify-between gap-3 text-xs">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-foreground truncate select-all">{lead.workEmail}</span>
                    <Badge variant="outline" className="text-[9px] py-0 px-1 border-primary/30 text-primary font-medium">
                      Work Email
                    </Badge>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => copyToClipboard(lead.workEmail!, "Work email")}
                  className="h-7 px-2 text-xs"
                >
                  <Copy className="size-3 mr-1" /> Copy
                </Button>
              </div>
            )}

            {/* Distinct Personal Email if not primary */}
            {lead.personalEmail && lead.personalEmail !== lead.email && (
              <div className="rounded-xl border border-border/60 bg-card/60 p-2.5 flex items-center justify-between gap-3 text-xs">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-foreground truncate select-all">{lead.personalEmail}</span>
                    <Badge variant="outline" className="text-[9px] py-0 px-1 border-sky-500/30 text-sky-400 font-medium">
                      Personal Email
                    </Badge>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => copyToClipboard(lead.personalEmail!, "Personal email")}
                  className="h-7 px-2 text-xs"
                >
                  <Copy className="size-3 mr-1" /> Copy
                </Button>
              </div>
            )}

            {/* Additional Secondary Emails */}
            {additionalEmails.map((em, idx) => (
              <div
                key={idx}
                className="rounded-xl border border-border/60 bg-card/60 p-2.5 flex items-center justify-between gap-3 text-xs"
              >
                <span className="font-mono text-muted-foreground truncate select-all">{em}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => copyToClipboard(em, `Secondary email ${idx + 2}`)}
                  className="h-7 px-2 text-xs"
                >
                  <Copy className="size-3 mr-1" /> Copy
                </Button>
              </div>
            ))}
          </div>

          <Separator />

          {/* Phone Numbers Section */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Phone className="size-3.5 text-emerald-400" />
              Phone Numbers ({lead.phone ? 1 + additionalPhones.length : 0})
            </h4>

            {lead.phone ? (
              <div className="rounded-xl border border-border/60 bg-card/60 p-3 flex items-center justify-between gap-3">
                <div>
                  <span className="text-sm font-semibold text-foreground font-mono select-all">
                    {lead.phone}
                  </span>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Direct or company verified phone</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => copyToClipboard(lead.phone, "phone")}
                  className="h-8 gap-1.5 shrink-0"
                >
                  <Copy className="size-3.5" /> Copy
                </Button>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">No direct phone on record.</p>
            )}

            {additionalPhones.map((ph, idx) => (
              <div
                key={idx}
                className="rounded-xl border border-border/60 bg-card/60 p-2.5 flex items-center justify-between gap-3 text-xs"
              >
                <span className="font-mono text-muted-foreground truncate select-all">{ph}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => copyToClipboard(ph, `Secondary phone ${idx + 2}`)}
                  className="h-7 px-2 text-xs"
                >
                  <Copy className="size-3 mr-1" /> Copy
                </Button>
              </div>
            ))}
          </div>

          <Separator />

          {/* Firmographics & Intelligence */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Building2 className="size-3.5 text-violet-400" />
              Company Intelligence & Firmographics
            </h4>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-xl border border-border/50 bg-card/40 p-3">
                <span className="text-[11px] text-muted-foreground">Industry</span>
                <p className="font-semibold text-foreground mt-1">{lead.industry || "—"}</p>
              </div>
              <div className="rounded-xl border border-border/50 bg-card/40 p-3">
                <span className="text-[11px] text-muted-foreground">Company Size</span>
                <p className="font-semibold text-foreground mt-1 flex items-center gap-1">
                  <Users className="size-3.5 text-muted-foreground" />
                  {lead.teamSize ? `${Number(lead.teamSize).toLocaleString()} employees` : "—"}
                </p>
              </div>
              <div className="rounded-xl border border-border/50 bg-card/40 p-3">
                <span className="text-[11px] text-muted-foreground">Revenue Range</span>
                <p className="font-semibold text-foreground mt-1 flex items-center gap-1">
                  <DollarSign className="size-3.5 text-muted-foreground" />
                  {lead.revenueRange || "—"}
                </p>
              </div>
              <div className="rounded-xl border border-border/50 bg-card/40 p-3">
                <span className="text-[11px] text-muted-foreground">Location</span>
                <p className="font-semibold text-foreground mt-1">{lead.location || "—"}</p>
              </div>
            </div>
          </div>

          {/* Custom & Unmapped Fields (Future CSV Compatibility) */}
          {customFieldEntries.length > 0 && (
            <>
              <Separator />
              <div className="space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Sparkles className="size-3.5 text-amber-400" />
                  Additional Metadata ({customFieldEntries.length})
                </h4>
                <div className="rounded-xl border border-border/60 bg-muted/10 p-3 divide-y divide-border/40 text-xs">
                  {customFieldEntries.map(([k, v]) => (
                    <div key={k} className="py-2 flex items-start justify-between gap-4 first:pt-0 last:pb-0">
                      <span className="font-mono text-muted-foreground lowercase">{k}</span>
                      <span className="font-medium text-foreground text-right select-all">{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Action Bar */}
          <div className="pt-2 flex items-center gap-3">
            {onAddToList && (
              <Button
                className="flex-1 gap-2 shadow-xs"
                onClick={() => {
                  onAddToList(lead.id);
                  onOpenChange(false);
                }}
              >
                <CheckCircle2 className="size-4" /> Add to Campaign List
              </Button>
            )}
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
