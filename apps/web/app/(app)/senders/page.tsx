import { requireWorkspace } from "@/lib/session";
import { listSenders } from "@/lib/queries";
import { SendersClient } from "./senders-client";
import type { SenderRow, SmtpSecurity } from "./sender-types";

export const dynamic = "force-dynamic";

export const metadata = { title: "Mailboxes" };

export default async function SendersPage() {
  const { user, workspace } = await requireWorkspace();
  const rows = await listSenders(user.id, workspace.id);

  // Only what the UI shows; encrypted passwords are never selected.
  const senders: SenderRow[] = rows.map((r) => ({
    id: r.id,
    senderName: r.senderName,
    email: r.email,
    status: r.status,
    health: Number(r.health ?? 0),
    smtpStatus: r.smtpStatus,
    imapStatus: r.imapStatus,
    dailyLimit: Number(r.dailyLimit ?? 0),
    hourlyLimit: Number(r.hourlyLimit ?? 0),
    usedToday: Number(r.usedToday ?? 0),
    repliedCount: Number(r.repliedCount ?? 0),
    lastSyncAt: r.lastSyncAt ?? null,
    signature: r.signature ?? "",
    fromName: r.fromName ?? "",
    replyTo: r.replyTo ?? "",
    timezone: r.timezone ?? "UTC",
    smtpHost: r.smtpHost ?? "",
    smtpPort: Number(r.smtpPort ?? 587),
    smtpUsername: r.smtpUsername ?? "",
    smtpSecurity: (r.smtpSecurity as SmtpSecurity) ?? "tls",
    imapHost: r.imapHost ?? "",
    imapPort: Number(r.imapPort ?? 993),
    imapUsername: r.imapUsername ?? "",
  }));

  return <SendersClient senders={senders} />;
}
