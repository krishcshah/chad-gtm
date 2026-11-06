import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/session";
import { getTicketDetails } from "@/lib/support";
import { TicketThreadView } from "@/components/support/ticket-thread-view";

export const dynamic = "force-dynamic";

export const metadata = { title: "Support ticket" };

export default async function SupportTicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await requireWorkspace();
  const { id } = await params;

  // Returns null for unknown tickets and for tickets the user may not see.
  const data = await getTicketDetails(id, user);
  if (!data) notFound();

  return (
    <TicketThreadView
      ticket={data.ticket}
      messages={data.messages}
      isAdminUser={data.isAdminUser}
      currentUserId={user.id}
    />
  );
}
