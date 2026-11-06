import Link from "next/link";
import { LegalDocument } from "../public-shell";

export const metadata = {
  title: "Privacy Policy",
  description: "Privacy policy and GDPR data processing notice for AutoGTM.",
};

export default function PrivacyPage() {
  return (
    <LegalDocument
      title="Privacy Policy"
      description="Information regarding data collection and processing on the AutoGTM platform."
      updated="Stand: September 2026"
    >
      <h2>1. Data Controller</h2>
      <p>
        <strong>AutoGTM Platform</strong>
      </p>
      <p>
        <strong>Email for Privacy Requests:</strong>{" "}
        <a href="mailto:de.krish.shah@gmail.com">de.krish.shah@gmail.com</a>
      </p>

      <h2>2. Server-Hosting in Deutschland (EU-Rechenzentrum)</h2>
      <p>
        Die gesamte Anwendung, einschließlich der Benutzerdatenbanken, Kampagnenkonfigurationen und
        Postfach-Verbindungsdaten, wird ausschließlich in der Europäischen Union auf Enterprise-Cloud-Servern in{" "}
        <strong>Frankfurt am Main, Deutschland</strong> (Oracle Cloud Infrastructure, Region Frankfurt) betrieben.
      </p>
      <p>
        Rechtsgrundlage für das Hosting ist Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse an der sicheren und
        effizienten Bereitstellung unseres Online-Dienstes).
      </p>

      <h2>3. Registrierung & Benutzerkonten</h2>
      <p>
        Bei der Erstellung eines Nutzerkontos erfassen wir Ihre E-Mail-Adresse und Ihren Namen. Passwörter werden vor
        der Speicherung kryptografisch mit modernen Hashing-Algorithmen gehasht und können von uns nicht im Klartext
        eingesehen werden.
      </p>
      <p>
        Verbundene SMTP- und IMAP-Zugangsdaten werden in unserer Datenbank mit <strong>AES-256-GCM</strong>{" "}
        verschlüsselt gespeichert. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung bzw.
        vorvertragliche Maßnahmen).
      </p>

      <h2>4. E-Mail-Kampagnen & Verantwortung</h2>
      <p>
        Wenn Nutzer über SmartReach E-Mail-Kampagnen an Geschäftskontakte (B2B) versenden, agiert der jeweilige{" "}
        <strong>Nutzer als verantwortliche Stelle (Data Controller)</strong> im Sinne des Art. 4 Nr. 7 DSGVO bezüglich
        der Empfängerdaten. SmartReach stellt hierbei als technischer Dienstleister die Software zur Verfügung.
      </p>
      <p>
        Jeder Nutzer ist selbst dafür verantwortlich sicherzustellen, dass für den Versand von E-Mails an Empfänger die
        erforderliche Rechtsgrundlage (z. B. Einwilligung oder berechtigtes Interesse unter Berücksichtigung nationaler
        Vorschriften wie § 7 UWG) vorliegt.
      </p>

      <h2>5. Datenentfernungs-Anfragen (Right to Erasure / Remove My Info)</h2>
      <p>
        Wenn Sie möchten, dass Ihre Kontaktdaten aus unserem System bzw. unserer B2B-Datenbank entfernt werden, können
        Sie jederzeit einen formlosen Antrag über unser öffentliches Entfernungsformular einreichen:
      </p>
      <p>
        <Link href="/remove-my-info">Zum Formular &quot;Remove My Info&quot; →</Link>
      </p>
      <p>
        Eingegangene Löschanfragen werden von unserem Team überprüft und die entsprechenden Datensätze werden dauerhaft
        gesperrt bzw. gelöscht (Art. 17 DSGVO).
      </p>

      <h2>6. Freiwillige Spenden & Zahlungsabwicklung via Stripe</h2>
      <p>
        Wenn Sie sich entscheiden, das SmartReach-Projekt freiwillig mit einer Spende zu unterstützen, erfolgt die
        Zahlungsabwicklung über den zertifizierten Zahlungsdienstleister Stripe Payments Europe, Ltd., 1 Grand Canal
        Street Lower, Grand Canal Dock, Dublin, D02 H210, Irland.
      </p>
      <p>Wir selbst speichern zu keinem Zeitpunkt Kreditkartendaten oder sensible Bankverbindungen.</p>

      <h2>7. Ihre Rechte als betroffene Person</h2>
      <p>Sie haben nach der DSGVO folgende Rechte:</p>
      <ul>
        <li>
          <strong>Recht auf Auskunft (Art. 15 DSGVO):</strong> Sie können Auskunft über Ihre von uns verarbeiteten
          personenbezogenen Daten verlangen.
        </li>
        <li>
          <strong>Recht auf Berichtigung (Art. 16 DSGVO):</strong> Sie können die Berichtigung unrichtiger Daten
          verlangen.
        </li>
        <li>
          <strong>Recht auf Löschung (Art. 17 DSGVO):</strong> Sie können die unverzügliche Löschung Ihrer Daten
          verlangen.
        </li>
        <li>
          <strong>Recht auf Einschränkung (Art. 18 DSGVO):</strong> Sie können die Einschränkung der Verarbeitung
          verlangen.
        </li>
        <li>
          <strong>Recht auf Widerspruch (Art. 21 DSGVO):</strong> Sie können aus Gründen, die sich aus Ihrer besonderen
          Situation ergeben, der Verarbeitung widersprechen.
        </li>
        <li>
          <strong>Beschwerderecht (Art. 77 DSGVO):</strong> Sie haben das Recht, sich bei einer
          Datenschutz-Aufsichtsbehörde zu beschweren.
        </li>
      </ul>
    </LegalDocument>
  );
}
