import { and, count, eq } from "drizzle-orm";
import { schema } from "@smartreach/database";
import {
  Avatar,
  AvatarFallback,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  PageHeader,
} from "@smartreach/ui";
import { requireWorkspace } from "@/lib/session";
import { ensureAiColumns, getDb } from "@/lib/db";
import { listUserWorkspaces } from "@/lib/workspaces";
import { listSuppressions, wsCondition } from "@/lib/queries";
import { Page } from "@/components/layout/page";
import { ThemeToggle } from "@/components/theme-toggle";
import { AiSettingsCard } from "@/components/ai/ai-settings-card";
import type { BlocklistItem } from "../blocklist/blocklist-dialogs";
import { SettingsBlocklistCard } from "./blocklist-card";
import { ComplianceForms } from "./compliance-forms";
import { DangerZoneCard } from "./danger-zone-card";
import { DpaCard } from "./dpa-card";
import { RemoveMyInfoCard } from "./remove-my-info-card";
import { SettingsNav, type SettingsSection } from "./settings-nav";
import { WorkspaceSettingsCard } from "./workspace-settings-card";

export const dynamic = "force-dynamic";

export const metadata = { title: "Settings" };

/** Section ids double as URL anchors: #workspaces (workspace switcher), #postalAddress (inside compliance), #blocklist. */
const SECTIONS: SettingsSection[] = [
  { id: "account", label: "Account" },
  { id: "appearance", label: "Appearance" },
  { id: "workspaces", label: "Workspaces" },
  { id: "compliance", label: "Compliance" },
  { id: "ai", label: "AI" },
  { id: "dpa", label: "Data processing" },
  { id: "blocklist", label: "Blocklist" },
  { id: "data-removal", label: "Data removal" },
  { id: "delete-account", label: "Delete account" },
];

type WorkspaceSettingsRow = typeof schema.workspaceSettings.$inferSelect;

async function loadBlocklistSummary(userId: string, workspaceId: string, isDefault: boolean) {
  const db = getDb();
  const conds = [eq(schema.suppressions.userId, userId)];
  const ws = wsCondition(schema.suppressions.workspaceId, workspaceId, isDefault);
  if (ws) conds.push(ws);
  const [recentPage, kindCounts] = await Promise.all([
    listSuppressions(userId, { limit: 5, workspaceId, isDefault }),
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
  }));
  const countOf = (kind: string) => Number(kindCounts.find((r) => r.kind === kind)?.n ?? 0);
  return { recent, emailCount: countOf("email"), domainCount: countOf("domain") };
}

export default async function SettingsPage() {
  const { user, workspace } = await requireWorkspace();
  const db = getDb();
  await ensureAiColumns(db);

  const [workspaces, settings, blocklist] = await Promise.all([
    listUserWorkspaces(user.id),
    db
      .select()
      .from(schema.workspaceSettings)
      .where(eq(schema.workspaceSettings.userId, user.id))
      .limit(1)
      .then((rows): WorkspaceSettingsRow | null => rows[0] ?? null)
      .catch((err: unknown) => {
        console.error("[settings] query error:", err);
        return null;
      }),
    loadBlocklistSummary(user.id, workspace.id, workspace.isDefault).catch((err: unknown) => {
      console.error("[settings] blocklist query error:", err);
      return { recent: [] as BlocklistItem[], emailCount: 0, domainCount: 0 };
    }),
  ]);

  const displayName = user.name?.trim() || user.email;
  const initial = (user.name || user.email || "U").trim().slice(0, 1).toUpperCase();

  return (
    <Page>
      <PageHeader title="Settings" description="Your account, workspaces, compliance details and data." />

      <div className="grid gap-10 lg:grid-cols-[176px_minmax(0,1fr)]">
        <SettingsNav sections={SECTIONS} />

        <div className="flex min-w-0 max-w-3xl flex-col gap-6">
          <Section id="account">
            <Card>
              <CardHeader>
                <CardTitle>Account</CardTitle>
                <CardDescription>The account you sign in with.</CardDescription>
              </CardHeader>
              <CardContent className="flex items-center gap-4">
                <Avatar className="size-11">
                  <AvatarFallback className="bg-muted text-base font-medium text-muted-foreground">
                    {initial}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{displayName}</p>
                  {user.name?.trim() ? (
                    <p className="truncate text-[13px] text-muted-foreground">{user.email}</p>
                  ) : null}
                </div>
              </CardContent>
            </Card>
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

          <Section id="compliance">
            <ComplianceForms
              initialSettings={{
                companyName: settings?.companyName ?? "",
                postalAddress: settings?.postalAddress ?? "",
                unsubscribeBaseUrl: settings?.unsubscribeBaseUrl ?? "",
              }}
            />
          </Section>

          <Section id="ai">
            <AiSettingsCard
              initialProvider={settings?.aiProvider ?? "google"}
              initialModel={settings?.aiModel ?? "gemini-3.8-flash"}
              hasApiKey={Boolean(settings?.aiApiKeyEnc)}
            />
          </Section>

          <Section id="dpa">
            <DpaCard />
          </Section>

          <Section id="blocklist">
            <SettingsBlocklistCard
              recent={blocklist.recent}
              emailCount={blocklist.emailCount}
              domainCount={blocklist.domainCount}
            />
          </Section>

          <Section id="data-removal">
            <RemoveMyInfoCard userEmail={user.email} />
          </Section>

          <Section id="delete-account">
            <DangerZoneCard userEmail={user.email} />
          </Section>
        </div>
      </div>
    </Page>
  );
}

function Section({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 lg:scroll-mt-10">
      {children}
    </section>
  );
}
