import { Bug, HelpCircle, Lightbulb, Mail, Scale, Sparkles, type LucideIcon } from "lucide-react";
import { Badge } from "@smartreach/ui";
import type { TicketCategory } from "@/lib/support-types";

/** Sentence-case names and short explanations for each ticket category. */
export const TICKET_CATEGORY_META: Record<
  TicketCategory,
  { label: string; description: string; icon: LucideIcon }
> = {
  bug_report: {
    label: "Bug",
    description: "Something is broken, shows the wrong thing or throws an error.",
    icon: Bug,
  },
  feature_request: {
    label: "Feature request",
    description: "Something you would like AutoGTM to do.",
    icon: Sparkles,
  },
  suggestion: {
    label: "Suggestion",
    description: "An idea to improve copy, delivery or the interface.",
    icon: Lightbulb,
  },
  contact: {
    label: "Contact us",
    description: "Talk to the team about your account or a custom setup.",
    icon: Mail,
  },
  miscellaneous: {
    label: "Other",
    description: "Questions and anything else.",
    icon: HelpCircle,
  },
  legal: {
    label: "Legal / DPA",
    description: "Data processing, privacy and legal questions.",
    icon: Scale,
  },
};

export function ticketCategoryLabel(category: TicketCategory): string {
  return (TICKET_CATEGORY_META[category] ?? TICKET_CATEGORY_META.miscellaneous).label;
}

export function TicketCategoryBadge({ category, className }: { category: TicketCategory; className?: string }) {
  const meta = TICKET_CATEGORY_META[category] ?? TICKET_CATEGORY_META.miscellaneous;
  return (
    <Badge variant="outline" className={className}>
      {meta.label}
    </Badge>
  );
}
