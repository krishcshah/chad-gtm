"use client";

import { useState } from "react";
import { FileText } from "lucide-react";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  DataList,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@smartreach/ui";
import { GermanFlag } from "@/components/german-flag";

const DPA_CONTACT = "hence-body-eskimo@duck.com";

/** Data processing addendum (GDPR Art. 28): key terms inline, full text in a dialog. */
export function DpaCard() {
  const [open, setOpen] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Data processing addendum</CardTitle>
        <CardDescription>
          The GDPR Article 28 terms for how AutoGTM processes personal data on your behalf. They already apply to your
          account; there is nothing to sign.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-3">
        <DataList
          items={[
            {
              label: "Data location",
              value: (
                <span className="inline-flex items-center gap-2">
                  <GermanFlag />
                  Frankfurt, Germany (Oracle Cloud)
                </span>
              ),
            },
            { label: "Encryption", value: "Mailbox passwords and API credentials are encrypted at rest (AES-256-GCM)" },
            { label: "Sub-processors", value: "Oracle Cloud Infrastructure (hosting), Stripe (payments)" },
            { label: "Your role", value: "You are the controller of your lead and campaign data" },
          ]}
        />
      </CardContent>
      <CardFooter className="flex-wrap justify-between gap-y-3">
        <span className="min-w-0 break-words text-xs text-muted-foreground">
          Questions:{" "}
          <a
            href={`mailto:${DPA_CONTACT}`}
            className="text-foreground underline decoration-border-strong underline-offset-4 hover:decoration-foreground"
          >
            {DPA_CONTACT}
          </a>
        </span>
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          <FileText /> Read the full DPA
        </Button>
      </CardFooter>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Data processing addendum</DialogTitle>
            <DialogDescription>
              Agreement on commissioned data processing under Art. 28 GDPR (Vereinbarung zur Auftragsverarbeitung).
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col divide-y divide-border text-sm leading-relaxed text-muted-foreground">
            <DpaSection title="1. Parties and scope">
              <p>
                This Data Processing Addendum (&quot;DPA&quot;) supplements the AutoGTM terms between the workspace
                owner (&quot;Controller&quot;) and AutoGTM (&quot;Processor&quot;). It governs the processing of personal
                data uploaded by the Controller or collected during campaign delivery.
              </p>
            </DpaSection>
            <DpaSection title="2. Subject matter and duration">
              <p>
                <strong className="font-medium text-foreground">Subject matter:</strong> software for sending cold
                email, scheduling sequences, managing lead lists, tracking opens and replies, and rotating mailboxes.
              </p>
              <p>
                <strong className="font-medium text-foreground">Duration:</strong> for as long as the Controller&apos;s
                account is active, or until the data is deleted.
              </p>
            </DpaSection>
            <DpaSection title="3. Technical and organisational measures">
              <p>Under Art. 32 GDPR, the Processor applies these measures:</p>
              <ul className="list-disc space-y-1 pl-5">
                <li>
                  <strong className="font-medium text-foreground">Encryption:</strong> authenticated symmetric
                  encryption (AES-256-GCM) for stored mailbox passwords and OAuth credentials.
                </li>
                <li>
                  <strong className="font-medium text-foreground">Data residency:</strong> servers and databases are
                  in the European Union (Frankfurt am Main, Germany).
                </li>
                <li>
                  <strong className="font-medium text-foreground">Access control:</strong> database and server access
                  is protected by public-key authentication and least-privilege firewalls.
                </li>
              </ul>
            </DpaSection>
            <DpaSection title="4. Sub-processors">
              <ul className="list-disc space-y-1 pl-5">
                <li>
                  <strong className="font-medium text-foreground">Oracle Cloud Infrastructure:</strong> hosting,
                  compute and the PostgreSQL database. Location: Frankfurt am Main, Germany.
                </li>
                <li>
                  <strong className="font-medium text-foreground">Stripe, Inc.:</strong> processing of voluntary
                  supporter payments.
                </li>
              </ul>
            </DpaSection>
            <DpaSection title="5. Rights of data subjects">
              <p>The Processor provides in-app tools that help the Controller meet Chapter III GDPR obligations:</p>
              <ul className="list-disc space-y-1 pl-5">
                <li>
                  <strong className="font-medium text-foreground">Right to erasure (Art. 17):</strong> deleting
                  prospect records, and data removal requests.
                </li>
                <li>
                  <strong className="font-medium text-foreground">Right to object (Art. 21):</strong> the blocklist,
                  which stops all future sends to an address or domain.
                </li>
              </ul>
            </DpaSection>
            <DpaSection title="6. Contact">
              <p>
                For a signed copy or data protection questions, email{" "}
                <a
                  href={`mailto:${DPA_CONTACT}`}
                  className="text-foreground underline decoration-border-strong underline-offset-4 hover:decoration-foreground"
                >
                  {DPA_CONTACT}
                </a>
                .
              </p>
            </DpaSection>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function DpaSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2 py-4 first:pt-0 last:pb-0">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {children}
    </section>
  );
}
