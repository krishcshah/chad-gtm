"use client";

import { useState } from "react";
import { Card, CardContent, Button, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@smartreach/ui";
import { FileText, ShieldCheck, Check, Globe2, Lock, Server } from "lucide-react";
import { GermanFlag } from "@/components/german-flag";

export function DpaCard() {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <Card className="border-border/70 shadow-sm">
      <CardContent className="p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <FileText className="size-4 text-sky-400" />
              <h2 className="font-semibold text-base text-foreground">Data Processing Addendum (DPA)</h2>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              GDPR Article 28 terms governing the processing of personal data on behalf of your workspace. Fully binding under EU regulation.
            </p>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/10 border border-sky-500/20 px-2 py-0.5 text-[10px] font-semibold text-sky-400 shrink-0">
            <ShieldCheck className="size-3" /> GDPR Art. 28
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="rounded-lg border border-border/60 bg-card/60 p-3 space-y-1">
            <div className="flex items-center gap-1.5 font-medium text-foreground">
              <Server className="size-3.5 text-emerald-400" />
              <span>EU Data Residency</span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Frankfurt, Germany (Oracle Cloud Infrastructure). No US cloud storage transfers.
            </p>
          </div>

          <div className="rounded-lg border border-border/60 bg-card/60 p-3 space-y-1">
            <div className="flex items-center gap-1.5 font-medium text-foreground">
              <Lock className="size-3.5 text-amber-400" />
              <span>AES-256-GCM</span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              SMTP/IMAP passwords and API credentials are authenticated and encrypted at rest.
            </p>
          </div>

          <div className="rounded-lg border border-border/60 bg-card/60 p-3 space-y-1">
            <div className="flex items-center gap-1.5 font-medium text-foreground">
              <Globe2 className="size-3.5 text-sky-400" />
              <span>Data Sovereignty</span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Workspace data is strictly isolated. You retain full controller ownership.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-1.5 text-[11px] text-emerald-400">
            <Check className="size-3.5" />
            <span>Active & incorporated into your workspace terms</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="text-xs"
            onClick={() => setModalOpen(true)}
          >
            <FileText className="mr-1.5 size-3.5" />
            Review Full DPA Agreement
          </Button>
        </div>

        {/* Full DPA Dialog */}
        <Dialog open={modalOpen} onOpenChange={setModalOpen}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <div className="flex items-center gap-2 mb-1">
                <GermanFlag className="h-2.5 w-3.5" />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  European Union Data Protection
                </span>
              </div>
              <DialogTitle className="text-lg font-bold">
                Data Processing Addendum (Art. 28 DSGVO / GDPR)
              </DialogTitle>
              <DialogDescription className="text-xs">
                Agreement on Commissioned Data Processing (Vereinbarung zur Auftragsverarbeitung)
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 text-xs text-muted-foreground leading-relaxed pt-2">
              <section className="space-y-1.5 border-b border-border/40 pb-3">
                <h4 className="font-semibold text-foreground text-sm">1. Parties & Scope</h4>
                <p>
                  This Data Processing Addendum (&quot;DPA&quot;) supplements the SmartReach terms between the workspace owner (&quot;Controller&quot;) and SmartReach / Krish Shah (&quot;Processor&quot;). It governs the processing of personal data uploaded by Controller or collected during campaign delivery.
                </p>
              </section>

              <section className="space-y-1.5 border-b border-border/40 pb-3">
                <h4 className="font-semibold text-foreground text-sm">2. Subject Matter & Duration</h4>
                <p>
                  <strong>Subject Matter:</strong> The provision of cold email dispatching, sequence scheduling, lead list management, open/reply tracking, and inbox rotation software.
                </p>
                <p>
                  <strong>Duration:</strong> The processing shall continue for the duration of the Controller&apos;s active account or until data is deleted.
                </p>
              </section>

              <section className="space-y-1.5 border-b border-border/40 pb-3">
                <h4 className="font-semibold text-foreground text-sm">3. Technical & Organizational Measures (TOMs)</h4>
                <p>
                  Pursuant to Art. 32 GDPR, Processor implements state-of-the-art technical measures:
                </p>
                <ul className="list-disc pl-4 space-y-1">
                  <li><strong>Encryption:</strong> Symmetric authenticated encryption (AES-256-GCM) for all stored mailbox passwords and OAuth credentials.</li>
                  <li><strong>Data Residency:</strong> Servers and relational databases reside within the European Union (Frankfurt am Main, Germany).</li>
                  <li><strong>Access Controls:</strong> Database credentials and server access are protected by strict public-key cryptography and least-privilege firewalls.</li>
                </ul>
              </section>

              <section className="space-y-1.5 border-b border-border/40 pb-3">
                <h4 className="font-semibold text-foreground text-sm">4. Sub-processors (Unterauftragsverarbeiter)</h4>
                <p>
                  Processor engages the following sub-processors for technical execution:
                </p>
                <ul className="list-disc pl-4 space-y-1">
                  <li><strong>Oracle Cloud Infrastructure (OCI):</strong> Hosting, compute instances, PostgreSQL database. Location: Frankfurt am Main, Germany (EU-Frankfurt).</li>
                  <li><strong>Stripe, Inc.:</strong> Processing of voluntary supporter payments and donations.</li>
                </ul>
              </section>

              <section className="space-y-1.5 border-b border-border/40 pb-3">
                <h4 className="font-semibold text-foreground text-sm">5. Rights of Data Subjects</h4>
                <p>
                  Processor provides automated in-app controls to assist Controller in fulfilling obligations under Chapter III of the GDPR:
                </p>
                <ul className="list-disc pl-4 space-y-1">
                  <li><strong>Right to Erasure (Art. 17):</strong> One-click prospect record deletion and the &quot;Remove My Info&quot; request queue.</li>
                  <li><strong>Right to Object (Art. 21):</strong> Global suppression and blocklist system preventing future dispatches.</li>
                </ul>
              </section>

              <section className="space-y-1.5">
                <h4 className="font-semibold text-foreground text-sm">6. Contact for DPA Inquiries</h4>
                <p>
                  For formal executed copies or data protection queries: <a href="mailto:de.krish.shah@gmail.com" className="text-primary hover:underline">de.krish.shah@gmail.com</a>
                </p>
              </section>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
