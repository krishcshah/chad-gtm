import Link from "next/link";
import { ArrowLeft, UserX, ShieldCheck, Mail } from "lucide-react";
import { Logo } from "@/components/logo";
import { GermanFlag } from "@/components/german-flag";
import { PublicRemoveMyInfoForm } from "./public-remove-form";

export const metadata = {
  title: "Remove My Info · GDPR Data Erasure Request · SmartReach",
  description: "Request the removal of your personal or business email from the SmartReach database under GDPR Art. 17.",
};

export default function RemoveMyInfoPage() {
  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-primary/20">
      {/* Header */}
      <header className="border-b border-border/40 bg-card/40 backdrop-blur-xl sticky top-0 z-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Logo compact />
            <span className="font-semibold text-sm tracking-tight text-foreground">SmartReach</span>
          </div>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="size-3.5" /> Back to Home
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-3xl px-4 sm:px-6 py-12 space-y-8">
        <div className="space-y-2 border-b border-border/40 pb-6">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-rose-500/20 bg-rose-500/10 px-2.5 py-0.5 text-[11px] font-medium text-rose-400 mb-2">
            <ShieldCheck className="size-3.5" /> GDPR Art. 17 Recht auf Löschung
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl text-foreground">
            Remove My Info
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            If your professional email or contact details are listed in the SmartReach outreach database or if you wish to permanently purge your data from our systems, please submit your request below.
          </p>
        </div>

        {/* Informative Box */}
        <div className="rounded-xl border border-border/60 bg-card/50 p-5 text-xs text-muted-foreground space-y-2 leading-relaxed">
          <div className="flex items-center gap-2 font-semibold text-foreground text-sm">
            <UserX className="size-4 text-rose-400" />
            <span>Our Privacy Commitment</span>
          </div>
          <p>
            We strictly respect your right to privacy and data autonomy. All requests submitted through this form are logged in our compliance queue and processed within 72 hours.
          </p>
          <p>
            Once processed, your email address is removed from prospect search indexes and automatically added to our suppression list to prevent future re-imports.
          </p>
        </div>

        {/* Public Submission Form */}
        <div className="rounded-2xl border border-border/80 bg-card p-6 sm:p-8 shadow-sm">
          <PublicRemoveMyInfoForm />
        </div>

        {/* Manual Contact Option */}
        <div className="text-center text-xs text-muted-foreground space-y-1 pt-4">
          <p>
            You can also submit erasure requests directly via email to:{" "}
            <a href="mailto:de.krish.shah@gmail.com" className="text-primary hover:underline font-medium">
              de.krish.shah@gmail.com
            </a>
          </p>
          <p>Operated by Krish Shah · Frankfurt am Main, Germany</p>
        </div>
      </main>
    </div>
  );
}
