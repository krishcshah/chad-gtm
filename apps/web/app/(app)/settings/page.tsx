import { requireWorkspace } from "@/lib/session";
import { getDb, ensureAiColumns } from "@/lib/db";
import { listUserWorkspaces } from "@/lib/workspaces";
import { schema } from "@smartreach/database";
import { APP_NAME } from "@smartreach/shared";
import { Avatar, AvatarFallback, Card, CardContent, Separator } from "@smartreach/ui";
import { ThemeToggle } from "@/components/theme-toggle";
import { eq, desc } from "drizzle-orm";
import { ComplianceForms } from "./compliance-forms";
import { SettingsBlocklistCard } from "./blocklist-card";
import { WorkspaceSettingsCard } from "./workspace-settings-card";
import { AiSettingsCard } from "@/components/ai/ai-settings-card";
import { ShieldCheck, Sparkles, Zap } from "lucide-react";
import { DpaCard } from "./dpa-card";
import { RemoveMyInfoCard } from "./remove-my-info-card";
import { DangerZoneCard } from "./danger-zone-card";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { user, workspace } = await requireWorkspace();
  const workspaces = await listUserWorkspaces(user.id);
  const initial = (user.name ?? user.email ?? "U").slice(0, 1).toUpperCase();
  const db = getDb();
  await ensureAiColumns(db);
  let settings: any = null;
  try {
    const rows = await db
      .select()
      .from(schema.workspaceSettings)
      .where(eq(schema.workspaceSettings.userId, user.id))
      .limit(1);
    settings = rows[0] ?? null;
  } catch (err) {
    console.error("[settings] query error:", err);
  }
  const suppressions = await db
    .select()
    .from(schema.suppressions)
    .where(eq(schema.suppressions.userId, user.id))
    .orderBy(desc(schema.suppressions.createdAt))
    .limit(200);

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6 lg:p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Workspaces, account, compliance, blocklist, appearance, and sending engine.
        </p>
      </div>

      <WorkspaceSettingsCard workspaces={workspaces} activeWorkspaceId={workspace.id} />

      <Card>
        <CardContent className="p-6">
          <h2 className="font-medium">Profile</h2>
          <div className="mt-4 flex items-center gap-4">
            <Avatar className="h-12 w-12">
              <AvatarFallback className="text-base">{initial}</AvatarFallback>
            </Avatar>
            <div>
              <p className="font-medium">{user.name ?? "—"}</p>
              <p className="text-sm text-muted-foreground">{user.email}</p>
            </div>
          </div>
          <Separator className="my-5" />
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Theme</p>
              <p className="text-sm text-muted-foreground">Dark is optimized for ChadGTM.</p>
            </div>
            <ThemeToggle />
          </div>
        </CardContent>
      </Card>

      <AiSettingsCard
        initialProvider={settings?.aiProvider ?? "google"}
        initialModel={settings?.aiModel ?? "gemini-3.8-flash"}
        hasApiKey={Boolean(settings?.aiApiKeyEnc)}
      />

      <ComplianceForms
        initialSettings={{
          companyName: settings?.companyName ?? "",
          postalAddress: settings?.postalAddress ?? "",
          unsubscribeBaseUrl: settings?.unsubscribeBaseUrl ?? "",
        }}
      />

      {/* Blocklist Card inside Settings */}
      <SettingsBlocklistCard
        initialSuppressions={suppressions.map((s: { id: string; value: string; kind: string; reason: string; source: string }) => ({
          id: s.id,
          value: s.value,
          kind: s.kind,
          reason: s.reason,
          source: s.source,
        }))}
      />

      <DpaCard />

      <RemoveMyInfoCard userEmail={user.email} />

      <Card>
        <CardContent className="p-6">
          <h2 className="font-medium">Sending engine</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            The background worker processes your queue every ~30s — rotating senders, honoring limits,
            randomizing delays, retrying failures, and syncing replies over IMAP.
          </p>
          <Separator className="my-5" />
          <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            {[
              ["Queue interval", "30s"],
              ["Reply sync", "2 min"],
              ["Batch size", "25"],
              ["Encryption", "AES-GCM"],
            ].map(([k, v]) => (
              <div key={k} className="rounded-lg border bg-card/60 p-3">
                <dt className="text-xs text-muted-foreground">{k}</dt>
                <dd className="mt-1 font-medium">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-xs text-muted-foreground">
            Run locally with <code className="font-mono">npm run engine</code>. Set{" "}
            <code className="font-mono">ENGINE_DRY_RUN=1</code> to process jobs without SMTP.
          </p>
        </CardContent>
      </Card>

      {/* Danger Zone: Permanent Account Deletion */}
      <DangerZoneCard userEmail={user.email} />

      {/* ChadGTM Infrastructure Card */}
      <div className="rounded-2xl border border-white/10 bg-zinc-950/60 p-5 backdrop-blur-xl">
        <div className="flex items-center gap-2 text-xs font-bold text-white mb-2">
          <Sparkles className="size-4 text-cyan-400" />
          <span>ChadGTM Autonomous Outbound Engine</span>
        </div>
        <p className="text-xs text-zinc-400 leading-relaxed max-w-xl">
          Powered by Gemini 3.8 Flash, 329k+ verified Apollo decision-maker prospects, and autonomous managed mailboxes with safe 30/day delivery pacing.
        </p>
        <div className="mt-3 flex items-center gap-4 text-[11px] font-mono text-zinc-500">
          <span className="flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Infrastructure Status: Optimal
          </span>
          <span>•</span>
          <span>Shared Mailbox Pool: 3¢/email</span>
        </div>
      </div>

      <p className="text-center text-xs text-zinc-500">
        ChadGTM · Autonomous Go-To-Market & Cold Outreach Engine
      </p>
    </div>
  );
}
