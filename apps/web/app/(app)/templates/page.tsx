import Link from "next/link";
import { FileText, Plus } from "lucide-react";
import { requireUser } from "@/lib/session";
import { listTemplates } from "@/lib/queries";
import { Badge, Button, Card, CardContent, EmptyState, PageHeader } from "@smartreach/ui";
import { formatDate } from "@smartreach/shared";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const user = await requireUser();
  const templates = await listTemplates(user.id);

  return (
    <div className="page-stack">
      <PageHeader
        title="Templates"
        description='Reusable message bodies with merge variables like {{first_name}}.'
        actions={
          <Button size="sm" asChild>
            <Link href="/templates/new">
              <Plus className="h-4 w-4" /> New template
            </Link>
          </Button>
        }
      />

      {templates.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No templates yet"
          description="Write your first email template. Use merge variables to personalize each send."
          action={
            <Button size="sm" asChild>
              <Link href="/templates/new">
                <Plus className="h-4 w-4" /> Create template
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((t) => (
            <Link key={t.id} href={`/templates/${t.id}`} className="rounded-xl focus-visible:ring-2 focus-visible:ring-ring">
              <Card className="h-full transition-colors hover:border-foreground/20">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-medium truncate">{t.name}</h3>
                    <Badge variant="secondary">{t.format}</Badge>
                  </div>
                  <p className="mt-2 truncate text-sm text-muted-foreground">{t.subject}</p>
                  <p className="mt-3 text-xs text-muted-foreground/70">
                    Updated {formatDate(t.updatedAt)}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
