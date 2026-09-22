import { requireUser } from "@/lib/session";
import { listSenders } from "@/lib/queries";
import { SendersClient } from "./senders-client";

export const dynamic = "force-dynamic";

export default async function SendersPage() {
  const user = await requireUser();
  const senders = await listSenders(user.id);

  return <SendersClient senders={senders} />;
}
