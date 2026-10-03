import { Bug, Sparkles, Lightbulb, Mail, HelpCircle } from "lucide-react";
import type { TicketCategory } from "@/lib/support-types";

const categoryConfig: Record<TicketCategory, { label: string; icon: any; className: string }> = {
  bug_report: {
    label: "Bug Report",
    icon: Bug,
    className: "border-red-900/60 bg-red-950/30 text-red-400",
  },
  feature_request: {
    label: "Feature Request",
    icon: Sparkles,
    className: "border-zinc-700 bg-zinc-900 text-white",
  },
  suggestion: {
    label: "Suggestion",
    icon: Lightbulb,
    className: "border-zinc-800 bg-zinc-950 text-zinc-300",
  },
  contact: {
    label: "Direct Contact",
    icon: Mail,
    className: "border-zinc-700 bg-black text-white",
  },
  miscellaneous: {
    label: "Miscellaneous",
    icon: HelpCircle,
    className: "border-zinc-800 bg-black text-zinc-400",
  },
};

export function TicketCategoryBadge({ category }: { category: TicketCategory }) {
  const conf = categoryConfig[category] || categoryConfig.miscellaneous;
  const Icon = conf.icon;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-none border px-2 py-0.5 text-[9px] font-mono uppercase tracking-wider font-semibold ${conf.className}`}
    >
      <Icon className="size-3" />
      <span>{conf.label}</span>
    </span>
  );
}
