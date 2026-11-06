import { LegalDocument } from "../public-shell";

export const metadata = {
  title: "Impressum (Legal Notice)",
  description: "Angaben gemäß § 5 DDG (Digitale-Dienste-Gesetz) für AutoGTM.",
};

export default function ImpressumPage() {
  return (
    <LegalDocument
      title="Impressum"
      description="Angaben gemäß § 5 DDG (Digitale-Dienste-Gesetz)"
      updated="Stand: September 2026"
      lang="de"
    >
      <h2>1. Betreiber & Verantwortliche Person</h2>
      <p>
        <strong>AutoGTM</strong>
        <br />
        Autonomous Go-To-Market Platform
      </p>
      <p>
        <strong>E-Mail:</strong> <a href="mailto:de.krish.shah@gmail.com">de.krish.shah@gmail.com</a>
      </p>

      <h2>2. Server-Hosting & Rechenzentrum</h2>
      <p>
        Diese Webanwendung wird auf dedizierter Cloud-Infrastruktur im Rechenzentrum in{" "}
        <strong>Frankfurt am Main, Deutschland</strong> gehostet:
      </p>
      <ul>
        <li>
          <strong>Hosting-Provider:</strong> Oracle Cloud Infrastructure (OCI)
        </li>
        <li>
          <strong>Region:</strong> EU Frankfurt 1 (Frankfurt am Main, Germany)
        </li>
        <li>
          <strong>Server-Standort:</strong> Bundesrepublik Deutschland
        </li>
      </ul>

      <h2>3. Haftung für Inhalte</h2>
      <p>
        Als Diensteanbieter sind wir gemäß § 7 Abs. 1 DDG für eigene Inhalte auf diesen Seiten nach den allgemeinen
        Gesetzen verantwortlich. Nach §§ 8 bis 10 DDG sind wir als Diensteanbieter jedoch nicht verpflichtet,
        übermittelte oder gespeicherte fremde Informationen zu überwachen oder nach Umständen zu forschen, die auf eine
        rechtswidrige Tätigkeit hinweisen.
      </p>
      <p>
        Verpflichtungen zur Entfernung oder Sperrung der Nutzung von Informationen nach den allgemeinen Gesetzen bleiben
        hiervon unberührt. Eine diesbezügliche Haftung ist jedoch erst ab dem Zeitpunkt der Kenntnis einer konkreten
        Rechtsverletzung möglich. Bei Bekanntwerden von entsprechenden Rechtsverletzungen werden wir diese Inhalte
        umgehend entfernen.
      </p>

      <h2>4. Haftung für Links</h2>
      <p>
        Unser Angebot enthält Links zu externen Websites Dritter, auf deren Inhalte wir keinen Einfluss haben. Deshalb
        können wir für diese fremden Inhalte auch keine Gewähr übernehmen. Für die Inhalte der verlinkten Seiten ist
        stets der jeweilige Anbieter oder Betreiber der Seiten verantwortlich.
      </p>

      <h2>5. Urheberrecht</h2>
      <p>
        Die durch die Seitenbetreiber erstellten Inhalte und Werke auf diesen Seiten unterliegen dem deutschen
        Urheberrecht. Beiträge Dritter sind als solche gekennzeichnet. Vervielfältigungen, Bearbeitungen und jede Art
        der Verwertung außerhalb der Grenzen des Urheberrechtes bedürfen der schriftlichen Zustimmung des jeweiligen
        Autors bzw. Erstellers.
      </p>
    </LegalDocument>
  );
}
