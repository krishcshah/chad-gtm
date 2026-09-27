import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { GermanFlag } from "@/components/german-flag";
import { Logo } from "@/components/logo";

export const metadata = {
  title: "Impressum (Legal Notice) · SmartReach",
  description: "Angaben gemäß § 5 DDG (Digitale-Dienste-Gesetz) für SmartReach.",
};

export default function ImpressumPage() {
  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-primary/20">
      {/* Header */}
      <header className="border-b border-border/40 bg-card/40 backdrop-blur-xl sticky top-0 z-20">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 py-4 flex items-center justify-between">
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
      <main className="mx-auto max-w-4xl px-4 sm:px-6 py-12 space-y-10">
        <div className="space-y-2 border-b border-border/40 pb-6">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-medium text-amber-300 mb-2">
            <GermanFlag className="h-2.5 w-3.5 shrink-0" /> Rechtliche Angaben nach deutschem Recht
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl text-foreground">
            Impressum
          </h1>
          <p className="text-sm text-muted-foreground">
            Angaben gemäß § 5 DDG (Digitale-Dienste-Gesetz, ehemals TMG)
          </p>
        </div>

        {/* Section 1: Betreiber / Verantwortlich */}
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-foreground">1. Betreiber & Verantwortliche Person</h2>
          <div className="rounded-xl border border-border/60 bg-card/50 p-5 text-sm space-y-1.5 text-muted-foreground">
            <p className="font-semibold text-foreground">Krish Shah</p>
            <p>SmartReach Open Community Project</p>
            <p>Deutschland / Germany</p>
            <p className="pt-2">
              <strong className="text-foreground">E-Mail:</strong>{" "}
              <a href="mailto:de.krish.shah@gmail.com" className="text-primary hover:underline">
                de.krish.shah@gmail.com
              </a>
            </p>
            <p>
              <strong className="text-foreground">Projekt-Typ:</strong> Nicht-kommerzielles, quelloffenes Community-Projekt (Free & Open Source Outreach Software).
            </p>
          </div>
        </section>

        {/* Section 2: Hosting & Rechenzentrum */}
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-foreground">2. Server-Hosting & Rechenzentrum</h2>
          <div className="rounded-xl border border-border/60 bg-card/50 p-5 text-sm space-y-2 text-muted-foreground">
            <p>
              Diese Webanwendung wird auf dedizierter Cloud-Infrastruktur im Rechenzentrum in <strong>Frankfurt am Main, Deutschland</strong> gehostet:
            </p>
            <ul className="list-disc list-inside space-y-1 text-xs text-foreground/80 pl-2">
              <li><strong>Hosting-Provider:</strong> Oracle Cloud Infrastructure (OCI)</li>
              <li><strong>Region:</strong> EU Frankfurt 1 (Frankfurt am Main, Germany)</li>
              <li><strong>Server-Standort:</strong> Bundesrepublik Deutschland</li>
            </ul>
          </div>
        </section>

        {/* Section 3: Haftungsausschluss */}
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-foreground">3. Haftung für Inhalte</h2>
          <div className="rounded-xl border border-border/60 bg-card/50 p-5 text-xs sm:text-sm leading-relaxed text-muted-foreground space-y-3">
            <p>
              Als Diensteanbieter sind wir gemäß § 7 Abs. 1 DDG für eigene Inhalte auf diesen Seiten nach den allgemeinen Gesetzen verantwortlich. Nach §§ 8 bis 10 DDG sind wir als Diensteanbieter jedoch nicht verpflichtet, übermittelte oder gespeicherte fremde Informationen zu überwachen oder nach Umständen zu forschen, die auf eine rechtswidrige Tätigkeit hinweisen.
            </p>
            <p>
              Verpflichtungen zur Entfernung oder Sperrung der Nutzung von Informationen nach den allgemeinen Gesetzen bleiben hiervon unberührt. Eine diesbezügliche Haftung ist jedoch erst ab dem Zeitpunkt der Kenntnis einer konkreten Rechtsverletzung möglich. Bei Bekanntwerden von entsprechenden Rechtsverletzungen werden wir diese Inhalte umgehend entfernen.
            </p>
          </div>
        </section>

        {/* Section 4: Haftung für Links */}
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-foreground">4. Haftung für Links</h2>
          <div className="rounded-xl border border-border/60 bg-card/50 p-5 text-xs sm:text-sm leading-relaxed text-muted-foreground space-y-2">
            <p>
              Unser Angebot enthält Links zu externen Websites Dritter, auf deren Inhalte wir keinen Einfluss haben. Deshalb können wir für diese fremden Inhalte auch keine Gewähr übernehmen. Für die Inhalte der verlinkten Seiten ist stets der jeweilige Anbieter oder Betreiber der Seiten verantwortlich.
            </p>
          </div>
        </section>

        {/* Section 5: Urheberrecht */}
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-foreground">5. Urheberrecht</h2>
          <div className="rounded-xl border border-border/60 bg-card/50 p-5 text-xs sm:text-sm leading-relaxed text-muted-foreground space-y-2">
            <p>
              Die durch die Seitenbetreiber erstellten Inhalte und Werke auf diesen Seiten unterliegen dem deutschen Urheberrecht. Beiträge Dritter sind als solche gekennzeichnet. Vervielfältigungen, Bearbeitungen und jede Art der Verwertung außerhalb der Grenzen des Urheberrechtes bedürfen der schriftlichen Zustimmung des jeweiligen Autors bzw. Erstellers.
            </p>
          </div>
        </section>

        {/* Footer info */}
        <div className="border-t border-border/40 pt-6 text-xs text-muted-foreground flex flex-col sm:flex-row justify-between gap-4">
          <p>Stand: September 2026</p>
          <div className="flex gap-4">
            <Link href="/privacy" className="text-primary hover:underline">
              Datenschutzerklärung (Privacy Policy)
            </Link>
            <Link href="/remove-my-info" className="text-primary hover:underline">
              Remove My Info
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
