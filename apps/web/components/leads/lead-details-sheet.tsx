"use client";

import * as React from "react";
import { ExternalLink, ListPlus } from "lucide-react";
import {
  Avatar,
  AvatarFallback,
  Badge,
  Button,
  DataList,
  Sheet,
  SheetBody,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@smartreach/ui";
import type { DirectoryLead } from "@/lib/leads-directory";
import { CopyButton } from "./copy-button";
import { displayDomain, externalUrl, formatTeamSize, leadLocation, leadName } from "./directory-utils";

interface LeadDetailsSheetProps {
  lead: DirectoryLead | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddToList?: (leadId: number) => void;
}

/** Keys shown elsewhere in the sheet, so they are left out of "Other fields". */
const STANDARD_KEYS = new Set([
  "lead_id",
  "first_name",
  "last_name",
  "full_name",
  "job_title",
  "company_name",
  "company_website",
  "linkedin_url",
  "location",
  "industry",
  "team_size",
  "revenue_range",
  "email_1",
  "phone_1",
  "email_count",
  "phone_count",
  "source_file",
]);

function contactRows(lead: DirectoryLead) {
  const emails: { label: string; value: string }[] = [];
  const seen = new Set<string>();
  const addEmail = (label: string, value?: string) => {
    const v = value?.trim();
    if (!v || seen.has(v.toLowerCase())) return;
    seen.add(v.toLowerCase());
    emails.push({ label, value: v });
  };
  const primaryLabel =
    lead.workEmail && lead.workEmail === lead.email
      ? "Work email"
      : lead.personalEmail && lead.personalEmail === lead.email
        ? "Personal email"
        : "Email";
  addEmail(primaryLabel, lead.email);
  addEmail("Work email", lead.workEmail);
  addEmail("Personal email", lead.personalEmail);
  for (let i = 2; i <= 14; i++) addEmail("Other email", lead.rawAttributes?.[`email_${i}`]);

  const phones: { label: string; value: string }[] = [];
  if (lead.phone) phones.push({ label: "Phone", value: lead.phone });
  for (let i = 2; i <= 12; i++) {
    const v = lead.rawAttributes?.[`phone_${i}`];
    if (v && !phones.some((p) => p.value === v)) phones.push({ label: "Other phone", value: v });
  }
  return { emails, phones };
}

function initials(name: string) {
  const parts = name.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

/** Full record for one directory contact. */
export function LeadDetailsSheet({ lead, open, onOpenChange, onAddToList }: LeadDetailsSheetProps) {
  return (
    <Sheet open={open && !!lead} onOpenChange={onOpenChange}>
      <SheetContent>
        {lead ? <LeadDetails lead={lead} onAddToList={onAddToList} onClose={() => onOpenChange(false)} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function LeadDetails({
  lead,
  onAddToList,
  onClose,
}: {
  lead: DirectoryLead;
  onAddToList?: (leadId: number) => void;
  onClose: () => void;
}) {
  const name = leadName(lead);
  const { emails, phones } = contactRows(lead);
  const location = leadLocation(lead);
  const subtitle = [lead.jobTitle, lead.companyName].filter(Boolean).join(" at ");

  const otherFields = Object.entries(lead.rawAttributes || {}).filter(
    ([k, v]) => v && !STANDARD_KEYS.has(k) && !k.startsWith("email_") && !k.startsWith("phone_"),
  );

  const company = [
    { label: "Company", value: lead.companyName || "–" },
    {
      label: "Website",
      value: lead.companyWebsite ? (
        <ExternalAnchor href={externalUrl(lead.companyWebsite)}>{displayDomain(lead.companyWebsite)}</ExternalAnchor>
      ) : (
        "–"
      ),
    },
    { label: "Industry", value: lead.industry || "–" },
    { label: "Company size", value: lead.teamSize ? formatTeamSize(lead.teamSize) : "–" },
    { label: "Annual revenue", value: lead.revenueRange || "–" },
    { label: "Location", value: location || "–" },
    {
      label: "LinkedIn",
      value: lead.linkedinUrl ? <ExternalAnchor href={externalUrl(lead.linkedinUrl)}>View profile</ExternalAnchor> : "–",
    },
  ];

  return (
    <>
      <SheetHeader>
        <div className="flex items-start gap-3">
          <Avatar className="size-10">
            <AvatarFallback className="text-[13px]">{initials(name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <SheetTitle className="truncate">{name}</SheetTitle>
            <SheetDescription className="mt-0.5">{subtitle || "No title or company on record"}</SheetDescription>
            {lead.emailStatus ? (
              <div className="mt-2">
                <Badge variant={emailStatusVariant(lead.emailStatus)} dot className="capitalize">
                  Email {lead.emailStatus.toLowerCase()}
                </Badge>
              </div>
            ) : null}
          </div>
        </div>
      </SheetHeader>

      <SheetBody className="flex flex-col gap-7">
        <section aria-labelledby="lead-contact">
          <h3 id="lead-contact" className="text-[13px] font-semibold text-foreground">
            Contact details
          </h3>
          {emails.length === 0 && phones.length === 0 ? (
            <p className="mt-2 text-[13px] text-muted-foreground">No email or phone number on record.</p>
          ) : (
            <ul className="mt-1 divide-y divide-border">
              {[...emails, ...phones].map((row) => (
                <li key={`${row.label}-${row.value}`} className="flex items-center gap-3 py-2.5">
                  <span className="w-28 shrink-0 text-[13px] text-muted-foreground">{row.label}</span>
                  <span className="min-w-0 flex-1 break-all text-[13px] text-foreground">{row.value}</span>
                  <CopyButton value={row.value} label={row.label.toLowerCase()} size="icon-sm" />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="lead-company">
          <h3 id="lead-company" className="text-[13px] font-semibold text-foreground">
            Company
          </h3>
          <DataList className="mt-1" items={company} />
        </section>

        {otherFields.length > 0 ? (
          <section aria-labelledby="lead-other">
            <h3 id="lead-other" className="text-[13px] font-semibold text-foreground">
              Other fields
            </h3>
            <DataList
              className="mt-1"
              items={otherFields.map(([k, v]) => ({ label: humanizeKey(k), value: String(v) }))}
            />
          </section>
        ) : null}
      </SheetBody>

      <SheetFooter>
        <SheetClose asChild>
          <Button variant="outline">Close</Button>
        </SheetClose>
        {onAddToList ? (
          <Button
            onClick={() => {
              onAddToList(lead.id);
              onClose();
            }}
          >
            <ListPlus />
            Add to list
          </Button>
        ) : null}
      </SheetFooter>
    </>
  );
}

function ExternalAnchor({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-foreground underline decoration-border-strong underline-offset-4 hover:decoration-foreground"
    >
      {children}
      <ExternalLink className="size-3.5 text-subtle-foreground" aria-hidden />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}

function humanizeKey(key: string) {
  const s = key.replace(/[_-]+/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function emailStatusVariant(status: string) {
  const s = status.toLowerCase();
  if (s === "verified" || s === "valid" || s === "deliverable") return "success" as const;
  if (s === "invalid" || s === "bounced" || s === "undeliverable") return "destructive" as const;
  if (s === "risky" || s === "catch-all" || s === "catch_all" || s === "unknown") return "warning" as const;
  return "neutral" as const;
}
