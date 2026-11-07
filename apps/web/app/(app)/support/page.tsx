import { requireWorkspace } from "@/lib/session";
import { listUserTickets } from "@/lib/support";
import { TICKET_CATEGORIES, type TicketCategory } from "@/lib/support-types";
import { isAdmin } from "@/lib/admin";
import { SupportHubView } from "@/components/support/support-hub-view";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Support",
  description: "Report a problem, ask a question or suggest an improvement.",
};

function categoryParam(value: string | string[] | undefined): TicketCategory | null {
  const v = Array.isArray(value) ? value[0] : value;
  return TICKET_CATEGORIES.some((c) => c.id === v) ? (v as TicketCategory) : null;
}

export default async function SupportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { user } = await requireWorkspace();
  const params = await searchParams;
  const userIsAdmin = isAdmin(user);

  // Support is everyone's own tickets, admins included. Triage happens in Admin › Support.
  const tickets = await listUserTickets(user.id);

  return (
    <SupportHubView
      tickets={tickets}
      isAdminUser={userIsAdmin}
      userEmail={user.email || ""}
      initialCreateCategory={categoryParam(params.new)}
    />
  );
}
