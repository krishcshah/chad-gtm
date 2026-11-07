"use client";

import Link from "next/link";
import { Plus, SearchX, Upload, Users } from "lucide-react";
import {
  Button,
  EmptyState,
  SectionHeader,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "@smartreach/ui";

export interface LeadListItem {
  id: string;
  name: string;
  leadCount: number;
  /** Pre-formatted on the server so server and browser timezones cannot disagree (hydration). */
  createdLabel: string;
  /** Names of the campaigns that send to this list. */
  usedBy: string[];
}

/** Lists whose name, or the name of a campaign using them, contains the query (case-insensitive). */
export function filterLeadLists(lists: LeadListItem[], query: string): LeadListItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return lists;
  return lists.filter(
    (l) => l.name.toLowerCase().includes(q) || l.usedBy.some((name) => name.toLowerCase().includes(q)),
  );
}

function UsedBy({ names }: { names: string[] }) {
  if (names.length === 0) return <span className="text-subtle-foreground">Not used yet</span>;
  return <>{names.join(", ")}</>;
}

/** Every lead list in the workspace, on Campaigns & leads (/leads redirects here). */
export function LeadListsSection({ lists, query }: { lists: LeadListItem[]; query: string }) {
  const visible = filterLeadLists(lists, query);

  return (
    <section id="lead-lists" aria-labelledby="lead-lists-title" className="flex scroll-mt-6 flex-col gap-4">
      <SectionHeader
        title={<span id="lead-lists-title">Lead lists</span>}
        description="Every list in this workspace, including ones no campaign uses yet."
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link href="/leads/import">
                <Upload />
                Import leads
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/leads/new">
                <Plus />
                New list
              </Link>
            </Button>
          </>
        }
      />

      <TableContainer>
        {lists.length === 0 ? (
          <EmptyState
            compact
            icon={Users}
            title="No lead lists yet"
            description="Import a CSV or create a list, then pick it when you build a campaign."
          />
        ) : visible.length === 0 ? (
          <EmptyState
            compact
            icon={SearchX}
            title="No lead lists match"
            description="Try another search."
          />
        ) : (
          <>
            <ul className="divide-y divide-border md:hidden">
              {visible.map((l) => (
                <li key={l.id} className="flex flex-col gap-1 px-4 py-4">
                  <Link href={`/leads/${l.id}`} className="block truncate text-sm font-medium hover:underline">
                    {l.name}
                  </Link>
                  <span className="tabular block text-xs text-muted-foreground">
                    {l.leadCount.toLocaleString()} {l.leadCount === 1 ? "lead" : "leads"} · Created {l.createdLabel}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    Used by <UsedBy names={l.usedBy} />
                  </span>
                </li>
              ))}
            </ul>
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Name</TableHead>
                    <TableHead className="text-right">Leads</TableHead>
                    <TableHead>Used by</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="max-w-[280px]">
                        <Link
                          href={`/leads/${l.id}`}
                          className="block truncate font-medium text-foreground hover:underline"
                        >
                          {l.name}
                        </Link>
                      </TableCell>
                      <TableCell className="tabular text-right">{l.leadCount.toLocaleString()}</TableCell>
                      <TableCell className="max-w-[320px] truncate text-muted-foreground">
                        <UsedBy names={l.usedBy} />
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">{l.createdLabel}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </TableContainer>
    </section>
  );
}
