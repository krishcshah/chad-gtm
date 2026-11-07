import { and, count, eq, isNull } from "drizzle-orm";
import { schema } from "@smartreach/database";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  PageHeader,
  cn,
} from "@smartreach/ui";
import { latestRunBookingUrl, loadOwnedWorkspace } from "@/lib/workspace-booking";
import { requireWorkspace } from "@/lib/session";
import { getDb } from "@/lib/db";
import { getWorkspaceProfile } from "@/lib/workspace-profile";
import { listUserWorkspaces } from "@/lib/workspaces";
import { countPoolMailboxesOwnedBy } from "@/lib/pool-ownership";
import { listSuppressions, wsCondition } from "@/lib/queries";
import { Page } from "@/components/layout/page";
import { ThemeToggle } from "@/components/theme-toggle";
import { AiSettingsCard } from "@/components/ai/ai-settings-card";
import type { BlocklistItem } from "../blocklist/blocklist-dialogs";
import { AccountCard } from "./account-card";
import { SettingsBlocklistCard } from "./blocklist-card";
import { ComplianceForms } from "./compliance-forms";
import { DangerZoneCard } from "./danger-zone-card";
import { DpaCard } from "./dpa-card";
import { LeadConversationsCard } from "./lead-conversations-card";
import { getLeadConversationSettingsAction } from "@/lib/lead-conversation-actions";
import { getNotificationSettingsAction } from "@/lib/workspace-profile-actions";
import { isSystemMailerConfigured } from "@smartreach/email-engine/system-mailer";
import { RemoveMyInfoCard } from "./remove-my-info-card";
import { SettingsNav, type SettingsSection } from "./settings-nav";
import { WorkspaceSettingsCard } from "./workspace-settings-card";

export const dynamic = "force-dynamic";

export const metadata = { title: "Settings" };

/**
 * Section ids double as URL anchors: #workspaces (workspace switcher), #postalAddress (inside compliance), #blocklist.
 * Two groups: what belongs to the account, and what belongs to the active workspace.
 */
const ACCOUNT_GROUP = "Account";
const ACCOUNT_SECTIONS: SettingsSection[] = [
  { id: "account", label: "Account" },
  { id: "appearance", label: "Appearance" },
  { id: "workspaces", label: "Workspaces" },
  { id: "ai", label: "AI" },
  // The blocklist applies in every workspace (blocklist-card copy, listSuppressions), so it is an account setting.
  { id: "blocklist", label: "Blocklist" },
  { id: "dpa", label: "Data processing" },
  { id: "data-removal", label: "Data removal" },
  { id: "delete-account", label: "Delete account" },
];
const WORKSPACE_SECTIONS: SettingsSection[] = [
  { id: "compliance", label: "Compliance" },
  { id: "lead-conversations", label: "Lead conversations" },
];

function workspaceGroupLabel(name: string): string {
  return `This workspace: ${name || "Primary Workspace"}`;
}

async function loadBlocklistSummary(userId: string) {
  const db = getDb();
  // The blocklist is account-wide: count and list every workspace's entries.
  const conds = [eq(schema.suppressions.userId, userId)];
  const [recentPage, kindCounts] = await Promise.all([
    listSuppressions(userId, { limit: 5 }),
    db
      .select({ kind: schema.suppressions.kind, n: count() })
      .from(schema.suppressions)
      .where(and(...conds))
      .groupBy(schema.suppressions.kind),
  ]);
  const recent: BlocklistItem[] = recentPage.items.map((s) => ({
    id: s.id,
    value: s.value,
    kind: s.kind,
    reason: s.reason ?? "",
    source: s.source,
    createdAt: String(s.createdAt),
    workspaceName: s.workspaceName ?? null,
  }));
  const countOf = (kind: string) => Number(kindCounts.find((r) => r.kind === kind)?.n ?? 0);
  return { recent, emailCount: countOf("email"), domainCount: countOf("domain") };
}

export default async function SettingsPage() {
  const { user, workspace } = await requireWorkspace();
  const db = getDb();

  const [workspaces, senderProfile, blocklist, leadConversations] = await Promise.all([
    listUserWorkspaces(user.id),
    // Compliance: the active workspace's sender identity (#72).
    getWorkspaceProfile(user.id, workspace.id).catch((err: unknown) => {
      console.error("[settings] sender details query error:", err);
      return { workspaceName: workspace.name, companyName: "", postalAddress: "" };
    }),
    loadBlocklistSummary(user.id).catch((err: unknown) => {
      console.error("[settings] blocklist query error:", err);
      return { recent: [] as BlocklistItem[], emailCount: 0, domainCount: 0 };
    }),
    getLeadConversationSettingsAction()
      .then((res) => (res.ok ? (res.data ?? null) : null))
      .catch((err: unknown) => {
        console.error("[settings] lead conversations query error:", err);
        return null;
      }),
  ]);
  // Shared pool mailboxes this account owns (the delete is refused server-side too).
  const poolMailboxCount = await countPoolMailboxesOwnedBy(db, user.id).catch((err: unknown) => {
    console.error("[settings] pool ownership query error:", err);
    return 0;
  });
  // Dedicated (non-pool, not deleted) mailboxes assigned to this account (#67).
  const dedicatedMailboxCount = await db
    .select({ n: count() })
    .from(schema.senderAccounts)
    .where(
      and(
        eq(schema.senderAccounts.userId, user.id),
        eq(schema.senderAccounts.isSystemPool, false),
        isNull(schema.senderAccounts.deletedAt),
      ),
    )
    .then((rows) => Number(rows[0]?.n ?? 0))
    .catch((err: unknown) => {
      console.error("[settings] mailbox count query error:", err);
      return 1; // When unsure, the delete dialog still mentions mailboxes.
    });
  // Lead conversations › Notifications. Without a system mailer nothing is emailed (never from a pool mailbox).
  const notificationSettings = leadConversations
    ? await getNotificationSettingsAction(leadConversations.settings.workspaceId)
        .then((res) => (res.ok ? (res.data ?? null) : null))
        .catch((err: unknown) => {
          console.error("[settings] notification settings query error:", err);
          return null;
        })
    : null;
  const notifications = notificationSettings
    ? { settings: notificationSettings, loginEmail: user.email, mailerConfigured: isSystemMailerConfigured() }
    : undefined;

  // Lead conversations › Booking link: "Use <host> from your latest Autopilot run", and the knowledge base size.
  const ownedWorkspace = await loadOwnedWorkspace(db, user.id, workspace.id).catch(() => null);
  const [latestRunBooking, knowledgeCount] = await Promise.all([
    ownedWorkspace ? latestRunBookingUrl(db, user.id, ownedWorkspace).catch(() => null) : Promise.resolve(null),
    db
      .select({ n: count() })
      .from(schema.agentKnowledge)
      .where(
        and(
          eq(schema.agentKnowledge.userId, user.id),
          wsCondition(schema.agentKnowledge.workspaceId, workspace.id, workspace.isDefault),
        ),
      )
      .then((rows) => Number(rows[0]?.n ?? 0))
      .catch(() => 0),
  ]);
  const workspaceGroup = workspaceGroupLabel(workspace.name);
  const sections: SettingsSection[] = [
    ...ACCOUNT_SECTIONS.map((s) => ({ ...s, group: ACCOUNT_GROUP })),
    ...WORKSPACE_SECTIONS.map((s) => ({ ...s, group: workspaceGroup })),
  ];

  return (
    <Page>
      <PageHeader title="Settings" description="Your account, workspaces, who answers your leads, compliance details and data." />

      <div className="grid gap-10 lg:grid-cols-[176px_minmax(0,1fr)]">
        <SettingsNav sections={sections} />

        <div className="flex min-w-0 max-w-3xl flex-col gap-6">
          <GroupHeading>{ACCOUNT_GROUP}</GroupHeading>
          <Section id="account">
            <AccountCard name={user.name ?? ""} email={user.email} />
          </Section>

          <Section id="appearance">
            <Card>
              <CardHeader>
                <CardTitle>Appearance</CardTitle>
                <CardDescription>System follows your device&apos;s light or dark setting.</CardDescription>
              </CardHeader>
              <CardContent>
                <ThemeToggle />
              </CardContent>
            </Card>
          </Section>

          <Section id="workspaces">
            <WorkspaceSettingsCard workspaces={workspaces} activeWorkspaceId={workspace.id} />
          </Section>

          <Section id="ai">
            <AiSettingsCard />
          </Section>

          <Section id="blocklist">
            <SettingsBlocklistCard
              recent={blocklist.recent}
              emailCount={blocklist.emailCount}
              domainCount={blocklist.domainCount}
            />
          </Section>

          <Section id="dpa">
            <DpaCard />
          </Section>

          <Section id="data-removal">
            <RemoveMyInfoCard userEmail={user.email} />
          </Section>

          <Section id="delete-account">
            <DangerZoneCard
              userEmail={user.email}
              poolMailboxCount={poolMailboxCount}
              dedicatedMailboxCount={dedicatedMailboxCount}
            />
          </Section>

          <GroupHeading className="pt-4">{workspaceGroup}</GroupHeading>
          <Section id="compliance">
            <ComplianceForms
              workspaceId={workspace.id}
              workspaceName={senderProfile.workspaceName || workspace.name}
              initialSettings={{
                companyName: senderProfile.companyName,
                postalAddress: senderProfile.postalAddress,
              }}
            />
          </Section>

          <Section id="lead-conversations">
            {leadConversations ? (
              <LeadConversationsCard
                initial={leadConversations}
                notifications={notifications}
                latestRunBookingUrl={latestRunBooking}
                knowledgeCount={knowledgeCount}
              />
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle>Lead conversations</CardTitle>
                  <CardDescription>These settings couldn&apos;t be loaded. Refresh the page to try again.</CardDescription>
                </CardHeader>
              </Card>
            )}
          </Section>
        </div>
      </div>
    </Page>
  );
}

function GroupHeading({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <h2 className={cn("truncate text-sm font-semibold tracking-[-0.01em] text-foreground", className)}>{children}</h2>
  );
}

function Section({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 lg:scroll-mt-10">
      {children}
    </section>
  );
}
