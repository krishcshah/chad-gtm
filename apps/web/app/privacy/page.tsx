import Link from "next/link";
import { ArrowLeft, ShieldCheck, Lock, UserX, FileText } from "lucide-react";
import { Logo } from "@/components/logo";
import { GermanFlag } from "@/components/german-flag";

export const metadata = {
  title: "Privacy Policy (Datenschutzerklärung) · SmartReach",
  description: "Datenschutzerklärung und Hinweise zur Verarbeitung personenbezogener Daten nach DSGVO.",
};

export default function PrivacyPage() {
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
          <div className="inline-flex items-center gap-1.5 rounded-full border border-sky-500/20 bg-sky-500/10 px-2.5 py-0.5 text-[11px] font-medium text-sky-400 mb-2">
            <ShieldCheck className="size-3.5" /> Datenschutz nach EU-DSGVO / GDPR
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl text-foreground">
            Privacy Policy & Datenschutzerklärung
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Informationen über die Erhebung, Verarbeitung und Nutzung personenbezogener Daten bei der Nutzung von SmartReach gemäß Art. 13 und 14 der Datenschutz-Grundverordnung (DSGVO).
          </p>
        </div>

        {/* 1. Verantwortlicher */}
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-foreground">1. Verantwortlicher (Data Controller)</h2>
          <div className="rounded-xl border border-border/60 bg-card/50 p-5 text-sm space-y-1 text-muted-foreground">
            <p className="font-semibold text-foreground">Krish Shah</p>
            <p>SmartReach Open Community Project</p>
            <p>Deutschland / Germany</p>
            <p className="pt-2">
              <strong className="text-foreground">E-Mail für Datenschutzanfragen:</strong>{" "}
              <a href="mailto:de.krish.shah@gmail.com" className="text-primary hover:underline">
                de.krish.shah@gmail.com
              </a>
            </p>
          </div>
        </section>

        {/* 2. Hosting & Server-Standort */}
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-foreground">2. Server-Hosting in Deutschland (EU-Rechenzentrum)</h2>
          <div className="rounded-xl border border-border/60 bg-card/50 p-5 text-xs sm:text-sm leading-relaxed text-muted-foreground space-y-2">
            <p>
              Die gesamte Anwendung, einschließlich der Benutzerdatenbanken, Kampagnenkonfigurationen und Postfach-Verbindungsdaten, wird ausschließlich in der Europäischen Union auf Enterprise-Cloud-Servern in <strong>Frankfurt am Main, Deutschland</strong> (Oracle Cloud Infrastructure, Region Frankfurt) betrieben.
            </p>
            <p>
              Rechtsgrundlage für das Hosting ist Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse an der sicheren und effizienten Bereitstellung unseres Online-Dienstes).
            </p>
          </div>
        </section>

        {/* 3. Benutzerkonto & Registrierung */}
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-foreground">3. Registrierung & Benutzerkonten</h2>
          <div className="rounded-xl border border-border/60 bg-card/50 p-5 text-xs sm:text-sm leading-relaxed text-muted-foreground space-y-2">
            <p>
              Bei der Erstellung eines Nutzerkontos erfassen wir Ihre E-Mail-Adresse und Ihren Namen. Passwörter werden vor der Speicherung kryptografisch mit modernen Hashing-Algorithmen gehasht und können von uns nicht im Klartext eingesehen werden.
            </p>
            <p>
              Verbundene SMTP- und IMAP-Zugangsdaten werden in unserer Datenbank mit <strong>AES-256-GCM</strong> verschlüsselt gespeichert. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung bzw. vorvertragliche Maßnahmen).
            </p>
          </div>
        </section>

        {/* 4. Kampagnen-Versand & Rollenverteilung */}
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-foreground">4. E-Mail-Kampagnen & Verantwortung</h2>
          <div className="rounded-xl border border-border/60 bg-card/50 p-5 text-xs sm:text-sm leading-relaxed text-muted-foreground space-y-2">
            <p>
              Wenn Nutzer über SmartReach E-Mail-Kampagnen an Geschäftskontakte (B2B) versenden, agiert der jeweilige <strong>Nutzer als verantwortliche Stelle (Data Controller)</strong> im Sinne des Art. 4 Nr. 7 DSGVO bezüglich der Empfängerdaten. SmartReach stellt hierbei als technischer Dienstleister die Software zur Verfügung.
            </p>
            <p>
              Jeder Nutzer ist selbst dafür verantwortlich sicherzustellen, dass für den Versand von E-Mails an Empfänger die erforderliche Rechtsgrundlage (z. B. Einwilligung oder berechtigtes Interesse unter Berücksichtigung nationaler Vorschriften wie § 7 UWG) vorliegt.
            </p>
          </div>
        </section>

        {/* 5. Datenentfernung & "Remove My Info" */}
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            <UserX className="size-4 text-rose-400" />
            5. Datenentfernungs-Anfragen (Right to Erasure / Remove My Info)
          </h2>
          <div className="rounded-xl border border-border/60 bg-card/50 p-5 text-xs sm:text-sm leading-relaxed text-muted-foreground space-y-3">
            <p>
              Wenn Sie möchten, dass Ihre Kontaktdaten aus unserem System bzw. unserer B2B-Datenbank entfernt werden, können Sie jederzeit einen formlosen Antrag über unser öffentliches Entfernungsformular einreichen:
            </p>
            <div>
              <Link
                href="/remove-my-info"
                className="inline-flex items-center gap-2 rounded-xl bg-primary/10 border border-primary/30 px-4 py-2 text-xs font-semibold text-primary hover:bg-primary/20 transition-all"
              >
                Zum Formular "Remove My Info" →
              </Link>
            </div>
            <p>
              Eingegangene Löschanfragen werden von unserem Team überprüft und die entsprechenden Datensätze werden dauerhaft gesperrt bzw. gelöscht (Art. 17 DSGVO).
            </p>
          </div>
        </section>

        {/* 6. Spenden via Stripe */}
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-foreground">6. Freiwillige Spenden & Zahlungsabwicklung via Stripe</h2>
          <div className="rounded-xl border border-border/60 bg-card/50 p-5 text-xs sm:text-sm leading-relaxed text-muted-foreground space-y-2">
            <p>
              Wenn Sie sich entscheiden, das SmartReach-Projekt freiwillig mit einer Spende zu unterstützen, erfolgt die Zahlungsabwicklung über den zertifizierten Zahlungsdienstleister Stripe Payments Europe, Ltd., 1 Grand Canal Street Lower, Grand Canal Dock, Dublin, D02 H210, Irland.
            </p>
            <p>
              Wir selbst speichern zu keinem Zeitpunkt Kreditkartendaten oder sensible Bankverbindungen.
            </p>
          </div>
        </section>

        {/* 7. Rechte der Betroffenen */}
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-foreground">7. Ihre Rechte als betroffene Person</h2>
          <div className="rounded-xl border border-border/60 bg-card/50 p-5 text-xs sm:text-sm leading-relaxed text-muted-foreground space-y-2">
            <p>Sie haben nach der DSGVO folgende Rechte:</p>
            <ul className="list-disc list-inside space-y-1 text-xs text-foreground/80 pl-2">
              <li><strong>Recht auf Auskunft (Art. 15 DSGVO):</strong> Sie können Auskunft über Ihre von uns verarbeiteten personenbezogenen Daten verlangen.</li>
              <li><strong>Recht auf Berichtigung (Art. 16 DSGVO):</strong> Sie können die Berichtigung unrichtiger Daten verlangen.</li>
              <li><strong>Recht auf Löschung (Art. 17 DSGVO):</strong> Sie können die unverzügliche Löschung Ihrer Daten verlangen.</li>
              <li><strong>Recht auf Einschränkung (Art. 18 DSGVO):</strong> Sie können die Einschränkung der Verarbeitung verlangen.</li>
              <li><strong>Recht auf Widerspruch (Art. 21 DSGVO):</strong> Sie können aus Gründen, die sich aus Ihrer besonderen Situation ergeben, der Verarbeitung widersprechen.</li>
              <li><strong>Beschwerderecht (Art. 77 DSGVO):</strong> Sie haben das Recht, sich bei einer Datenschutz-Aufsichtsbehörde zu beschweren.</li>
            </ul>
          </div>
        </section>

        {/* Footer info */}
        <div className="border-t border-border/40 pt-6 text-xs text-muted-foreground flex flex-col sm:flex-row justify-between gap-4">
          <p>Stand: September 2026</p>
          <div className="flex gap-4">
            <Link href="/impressum" className="text-primary hover:underline">
              Impressum (Legal Notice)
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
