import { PublicPageHeader, PublicShell } from "../public-shell";
import { PublicRemoveMyInfoForm } from "./public-remove-form";

export const metadata = {
  title: "Remove my info",
  description: "Request the removal of your personal or business email from the AutoGTM database under GDPR Art. 17.",
};

const steps = [
  "Tell us which email address to remove and what data you mean.",
  "We log the request in our compliance queue and process it within 72 hours.",
  "Your address is removed from lead search and added to our suppression list, so it is not imported again.",
];

export default function RemoveMyInfoPage() {
  return (
    <PublicShell>
      <div className="flex flex-col gap-10">
        <PublicPageHeader
          title="Remove my info"
          description="If your work email or contact details are in the AutoGTM lead directory, or you want your data deleted from our systems, send a request below. This is your right to erasure under GDPR Article 17."
        />

        <section aria-labelledby="how-it-works" className="flex flex-col gap-4">
          <h2 id="how-it-works" className="text-[15px] font-semibold tracking-[-0.01em] text-foreground">
            What happens next
          </h2>
          <ol className="flex flex-col gap-3">
            {steps.map((step, i) => (
              <li key={step} className="flex gap-3 text-sm leading-relaxed text-muted-foreground">
                <span
                  aria-hidden
                  className="tabular flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-foreground"
                >
                  {i + 1}
                </span>
                <span className="pt-0.5">{step}</span>
              </li>
            ))}
          </ol>
        </section>

        <PublicRemoveMyInfoForm />

        <div className="flex flex-col gap-1 text-[13px] leading-relaxed text-muted-foreground">
          <p>
            Prefer email? Send your request to{" "}
            <a
              href="mailto:hence-body-eskimo@duck.com"
              className="font-medium text-foreground underline decoration-border-strong underline-offset-4 hover:decoration-foreground"
            >
              hence-body-eskimo@duck.com
            </a>
            .
          </p>
          <p className="text-xs text-subtle-foreground">Operated by Krish Shah · Frankfurt am Main, Germany</p>
        </div>
      </div>
    </PublicShell>
  );
}
