"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Ban, Plus, Trash2, Upload } from "lucide-react";
import { formatDate } from "@smartreach/shared";
import {
  Badge,
  Button,
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  EmptyState,
} from "@smartreach/ui";
import {
  AddToBlocklistDialog,
  ImportBlocklistDialog,
  RemoveFromBlocklistDialog,
  sourceLabel,
  type BlocklistItem,
} from "../blocklist/blocklist-dialogs";

export type SuppressionItem = BlocklistItem;

function plural(n: number, one: string, many: string) {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}

/**
 * Settings summary of the blocklist: counts, the latest entries and quick
 * add/import/unblock. The full searchable list lives at /blocklist.
 */
export function SettingsBlocklistCard({
  recent,
  emailCount,
  domainCount,
}: {
  recent: BlocklistItem[];
  emailCount: number;
  domainCount: number;
}) {
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<BlocklistItem | null>(null);
  const total = emailCount + domainCount;
  const refresh = () => router.refresh();

  return (
    <Card>
      <CardHeader
        actions={
          total > 0 ? (
            <Button asChild variant="ghost" size="sm">
              <Link href="/blocklist">
                View all <ArrowUpRight />
              </Link>
            </Button>
          ) : null
        }
      >
        <CardTitle>Blocklist</CardTitle>
        <CardDescription>
          {total > 0
            ? `${plural(emailCount, "email", "emails")} and ${plural(domainCount, "domain", "domains")} that campaigns never send to.`
            : "Emails and domains that campaigns never send to. People who unsubscribe are added automatically."}
        </CardDescription>
      </CardHeader>

      {recent.length === 0 ? (
        <EmptyState
          compact
          icon={Ban}
          title="Nothing blocked yet"
          description="Block competitors, current customers or anyone who asked not to be contacted."
        />
      ) : (
        <div className="mt-4 border-t border-border">
          <p className="px-5 pb-1 pt-3 text-xs text-subtle-foreground">Recently added</p>
          <ul className="divide-y divide-border">
            {recent.map((item) => (
              <li key={item.id} className="flex items-center gap-3 px-5 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-mono text-[13px]">{item.value}</span>
                    {item.kind === "domain" ? <Badge variant="neutral">Domain</Badge> : null}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-subtle-foreground">
                    {sourceLabel(item.source)} ·{" "}
                    <time dateTime={item.createdAt} suppressHydrationWarning>
                      {formatDate(item.createdAt)}
                    </time>
                    {item.reason?.trim() ? ` · ${item.reason}` : ""}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Unblock ${item.value}`}
                  title="Unblock"
                  onClick={() => setRemoveTarget(item)}
                  className="hover:text-destructive-text"
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <CardFooter>
        <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
          <Upload /> Import list
        </Button>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus /> Add address
        </Button>
      </CardFooter>

      <AddToBlocklistDialog open={addOpen} onOpenChange={setAddOpen} onAdded={refresh} />
      <ImportBlocklistDialog open={importOpen} onOpenChange={setImportOpen} onImported={refresh} />
      <RemoveFromBlocklistDialog target={removeTarget} onClose={() => setRemoveTarget(null)} onRemoved={refresh} />
    </Card>
  );
}
