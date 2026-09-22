import { requireUser } from "@/lib/session";
import { getDb } from "@/lib/db";
import { schema } from "@smartreach/database";
import { APP_NAME } from "@smartreach/shared";
import { Avatar, AvatarFallback, Card, CardContent, Separator } from "@smartreach/ui";
import { ThemeToggle } from "@/components/theme-toggle";
import { eq, desc } from "drizzle-orm";
import { ComplianceForms } from "./compliance-forms";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireUser();
  const initial = (user.name ?? user.email ?? "U").slice(0, 1).toUpperCase();
  const db = getDb();
  const [settings] = await db
    .select()
    .from(schema.workspaceSettings)
    .where(eq(schema.workspaceSettings.userId, user.id))
    .limit(1);
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
          Account, compliance, appearance, and sending engine.
        </p>
      </div>

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
              <p className="text-sm text-muted-foreground">Dark is optimized for SmartReach.</p>
            </div>
            <ThemeToggle />
          </div>
        </CardContent>
      </Card>

      <ComplianceForms
        initialSettings={{
          companyName: settings?.companyName ?? "",
          postalAddress: settings?.postalAddress ?? "",
          unsubscribeBaseUrl: settings?.unsubscribeBaseUrl ?? "",
        }}
        suppressions={suppressions.map((s: { id: string; value: string; kind: string; reason: string; source: string }) => ({
          id: s.id,
          value: s.value,
          kind: s.kind,
          reason: s.reason,
          source: s.source,
        }))}
      />

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

      {/* Subtle Made in Germany System Card */}
      <div className="rounded-xl border border-border/50 bg-card/30 p-4 text-center">
        <div className="flex items-center justify-center gap-2 text-xs font-semibold text-foreground">
          <span>🇩🇪</span>
          <span>Made in Germany · 100% EU Hosted</span>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Engineered with German precision in Frankfurt, Germany. Strict GDPR compliance by design, zero third-party telemetry, and sovereign European cloud infrastructure.
        </p>
      </div>

      <p className="text-center text-xs text-muted-foreground">
        {APP_NAME} · Everything you need. Nothing you don&apos;t.
      </p>
    </div>
  );
}
