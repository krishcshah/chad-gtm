import { requireWorkspace } from "@/lib/session";
import { listSenders } from "@/lib/queries";
import { SendersClient } from "./senders-client";

export const dynamic = "force-dynamic";

export default async function SendersPage() {
  const { user, workspace } = await requireWorkspace();
  const senders = await listSenders(user.id, workspace.id);

  return <SendersClient senders={senders} />;
}
