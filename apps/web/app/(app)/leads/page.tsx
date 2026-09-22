import Link from "next/link";
import { Upload, Users } from "lucide-react";
import { requireUser } from "@/lib/session";
import { listLeadLists } from "@/lib/queries";
import { Badge, Button, Card, CardContent, EmptyState, PageHeader } from "@smartreach/ui";
import { formatDate } from "@smartreach/shared";

export const dynamic = "force-dynamic";

export default async function LeadsPage() {
  const user = await requireUser();
  const lists = await listLeadLists(user.id);

  return (
    <div className="page-stack">
      <PageHeader
        title="Leads"
        description="Upload a CSV to create a list and import contacts."
        actions={
          <Button size="sm" asChild>
            <Link href="/leads/import">
              <Upload className="h-4 w-4" /> Upload New List
            </Link>
          </Button>
        }
      />

      {lists.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No lead lists yet"
          description="Upload a CSV to create your first list and import leads."
          action={
            <Button size="sm" asChild>
              <Link href="/leads/import">
                <Upload className="h-4 w-4" /> Upload New List
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {lists.map((list) => (
            <Link key={list.id} href={`/leads/${list.id}`} className="rounded-xl focus-visible:ring-2 focus-visible:ring-ring">
              <Card className="h-full transition-colors hover:border-foreground/20">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-medium truncate">{list.name}</h3>
                    <Badge variant="secondary">{list.leadCount}</Badge>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Created {formatDate(list.createdAt)}
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
