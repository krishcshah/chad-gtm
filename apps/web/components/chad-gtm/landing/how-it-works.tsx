import { Check } from "lucide-react";
import { cn } from "@smartreach/ui";
import { Section, SectionIntro } from "./section";
import { BuyersVignette, IcpVignette, ResearchVignette, SequenceVignette, VignetteStage } from "./vignettes";

interface Step {
  title: string;
  body: string;
  points: string[];
  picture: React.ReactNode;
}

export function HowItWorks({ totalContacts }: { totalContacts: string }) {
  const steps: Step[] = [
    {
      title: "It researches your business",
      body: "AutoGTM reads your homepage, pricing, product and customer pages to learn what you sell, who it is for and what proof you have.",
      points: [
        "Works on sites that render in the browser, not only static pages",
        "Finds your booking link if your site has one",
      ],
      picture: <ResearchVignette />,
    },
    {
      title: "It builds your ideal customer profile",
      body: "From that research it decides which roles, industries, company sizes and locations to go after.",
      points: [
        "Targets only industries and titles that exist in the directory",
        "Prefer to check first? Guided setup lets you review the strategy before launch",
      ],
      picture: <IcpVignette />,
    },
    {
      title: "It picks buyers from the directory",
      body: `Matching people come from the built-in directory of ${totalContacts} B2B contacts. There is no list to buy and nothing to import.`,
      points: ["Work email addresses only; personal inboxes are skipped", "Opt-outs and your blocklist are respected"],
      picture: <BuyersVignette />,
    },
    {
      title: "It writes and sends the sequence",
      body: "Each lead gets an opener and two follow-ups in one thread, written for their role and sent from managed mailboxes.",
      points: ["No domains to buy and no DNS to set up", "Up to 30 emails a day per mailbox, spaced 45–120 seconds apart"],
      picture: <SequenceVignette />,
    },
  ];

  return (
    <Section id="how-it-works" labelledBy="how-it-works-title">
      <SectionIntro
        id="how-it-works-title"
        title="How it works"
        description="You paste a URL. AutoGTM does the research, targeting, writing and sending, and brings you in when a lead needs an answer only you can give."
      />

      <ol className="mt-16 flex flex-col gap-20 sm:gap-24">
        {steps.map((step, i) => (
          <li key={step.title} className="grid grid-cols-1 items-center gap-8 lg:grid-cols-2 lg:gap-16">
            <div className={cn("flex min-w-0 flex-col gap-4", i % 2 === 1 && "lg:order-2")}>
              <span className="flex size-8 items-center justify-center rounded-full bg-brand-soft text-sm font-semibold text-brand-text">
                <span className="sr-only">Step </span>
                {i + 1}
              </span>
              <h3 className="text-2xl font-semibold tracking-[-0.025em]">{step.title}</h3>
              <p className="max-w-lg text-base leading-relaxed text-muted-foreground">{step.body}</p>
              <ul className="mt-1 flex flex-col gap-2.5">
                {step.points.map((point) => (
                  <li key={point} className="flex items-start gap-2.5 text-sm text-foreground">
                    <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                    {point}
                  </li>
                ))}
              </ul>
            </div>
            <VignetteStage className={cn(i % 2 === 1 && "lg:order-1")}>{step.picture}</VignetteStage>
          </li>
        ))}
      </ol>

      <p className="mt-16 text-center text-xs text-subtle-foreground">
        The screens above show an example company. Your run uses your own website and real directory contacts.
      </p>
    </Section>
  );
}
