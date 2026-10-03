import { requireWorkspace } from "@/lib/session";
import { listUserTickets, listAllTicketsForAdmin } from "@/lib/support";
import { isAdmin } from "@/lib/admin";
import { SupportHubView } from "@/components/support/support-hub-view";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Support & Feedback Center · ChadGTM",
  description: "Report bugs, request features, share suggestions, or contact the core engineering team.",
};

export default async function SupportPage() {
  const { user } = await requireWorkspace();
  const userIsAdmin = isAdmin(user);

  // If user is admin, fetch all tickets universally; otherwise fetch user's tickets
  const tickets = userIsAdmin
    ? await listAllTicketsForAdmin(user)
    : await listUserTickets(user.id);

  return (
    <div className="page-stack">
      <SupportHubView
        tickets={tickets}
        isAdminUser={userIsAdmin}
        userEmail={user.email || ""}
      />
    </div>
  );
}
