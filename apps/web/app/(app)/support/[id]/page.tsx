import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/session";
import { getTicketDetails } from "@/lib/support";
import { TicketThreadView } from "@/components/support/ticket-thread-view";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return {
    title: `Ticket #${id.slice(0, 8)} · Support & Feedback · ChadGTM`,
  };
}

export default async function SupportTicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { user } = await requireWorkspace();
  const { id } = await params;

  const data = await getTicketDetails(id, user);
  if (!data) notFound();

  return (
    <div className="page-stack">
      <TicketThreadView
        ticket={data.ticket}
        messages={data.messages}
        isAdminUser={data.isAdminUser}
        currentUserId={user.id}
      />
    </div>
  );
}
