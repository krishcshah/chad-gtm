import { BookOpen, CalendarCheck, CircleHelp, SlidersHorizontal } from "lucide-react";
import { Section, SectionIntro } from "./section";
import { ReplyAgentVignette, VignetteStage } from "./vignettes";

const POINTS = [
  {
    icon: BookOpen,
    title: "Answers from what you have said",
    body: "Replies draw on your website and a knowledge base of answers and resources you control.",
  },
  {
    icon: CalendarCheck,
    title: "Sends interested leads your booking link",
    body: "Calendly, Cal.com, HubSpot and most other schedulers work, so meetings land on your own calendar.",
  },
  {
    icon: CircleHelp,
    title: "Asks you when it does not know",
    body: "Questions it cannot answer go to Needs you. Reply in a sentence and it drafts the email for you to check.",
  },
  {
    icon: SlidersHorizontal,
    title: "Works the way you want",
    body: "Let it reply on its own, have it ask before every reply, or switch it off and answer from the inbox.",
  },
];

export function ReplyAgentSection() {
  return (
    <Section id="reply-agent" tone="raised" labelledBy="reply-agent-title">
      <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2 lg:gap-16">
        <div className="flex min-w-0 flex-col gap-10">
          <SectionIntro
            id="reply-agent-title"
            title="A reply agent that knows when to ask you"
            description="AutoGTM reads every reply, stops the sequence for that lead and answers. It only interrupts you for the things it cannot answer."
          />
          <ul className="grid gap-6 sm:grid-cols-2">
            {POINTS.map((p) => (
              <li key={p.title} className="flex flex-col gap-2">
                <span className="flex size-9 items-center justify-center rounded-lg bg-muted text-foreground ring-1 ring-inset ring-border">
                  <p.icon className="size-4" aria-hidden />
                </span>
                <h3 className="text-[15px] font-semibold tracking-[-0.01em]">{p.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{p.body}</p>
              </li>
            ))}
          </ul>
        </div>
        <VignetteStage>
          <ReplyAgentVignette />
        </VignetteStage>
      </div>
    </Section>
  );
}
