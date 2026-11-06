"use client";

import Link from "next/link";
import { Copy, Eye, Layers, Mail, MoreHorizontal, Pencil, Rocket, Trash2 } from "lucide-react";
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@smartreach/ui";
import { timeAgo } from "@smartreach/shared";
import { campaignHref, firstSubject, hasAbTest, sequenceSummary, type LibraryItem } from "./template-utils";

const primaryClasses =
  "truncate text-left text-sm font-medium text-foreground outline-none after:absolute after:inset-0 after:content-[''] focus-visible:after:ring-[3px] focus-visible:after:ring-inset focus-visible:after:ring-ring";

/** One template in the library list. The name opens it; the rest of the row is a click target too. */
export function LibraryRow({
  item,
  onPreview,
  onEdit,
  onDelete,
}: {
  item: LibraryItem;
  onPreview: (item: LibraryItem) => void;
  onEdit: (item: LibraryItem) => void;
  onDelete: (item: LibraryItem) => void;
}) {
  const steps = item.sequence.steps;
  const subject = firstSubject(item.sequence);
  const Icon = item.kind === "email" ? Mail : Layers;
  const editHref = item.kind === "email" ? `/templates/${encodeURIComponent(item.id)}` : null;

  const meta = [
    item.kind === "email" ? `Single email · ${item.format === "html" ? "HTML" : "Plain text"}` : sequenceSummary(steps),
    item.updatedAt ? `Updated ${timeAgo(item.updatedAt)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <li className="relative flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-muted/50">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground" aria-hidden>
        <Icon className="size-4" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          {editHref ? (
            <Link href={editHref} className={primaryClasses}>
              {item.name}
            </Link>
          ) : (
            <button
              type="button"
              className={primaryClasses}
              onClick={() => (item.kind === "starter" ? onPreview(item) : onEdit(item))}
            >
              {item.name}
            </button>
          )}
          {hasAbTest(steps) && (
            <Badge variant="neutral" className="shrink-0">
              A/B test
            </Badge>
          )}
        </div>
        <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
          {subject || <span className="text-subtle-foreground">No subject yet</span>}
        </p>
        <p className="mt-0.5 truncate text-xs text-subtle-foreground" suppressHydrationWarning>
          {meta}
        </p>
      </div>

      <div className="relative z-10 flex shrink-0 items-center gap-1">
        <Button asChild variant="outline" size="sm" className="hidden sm:inline-flex">
          <Link href={campaignHref(item.id)} aria-label={`Use ${item.name} in a campaign`}>
            Use
          </Link>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`More actions for ${item.name}`}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => onPreview(item)}>
              <Eye />
              Preview
            </DropdownMenuItem>
            {editHref ? (
              <DropdownMenuItem asChild>
                <Link href={editHref}>
                  <Pencil />
                  Edit
                </Link>
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onSelect={() => onEdit(item)}>
                {item.kind === "starter" ? <Copy /> : <Pencil />}
                {item.kind === "starter" ? "Copy and edit" : "Edit"}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem asChild>
              <Link href={campaignHref(item.id)}>
                <Rocket />
                Use in campaign
              </Link>
            </DropdownMenuItem>
            {item.kind !== "starter" && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem destructive onSelect={() => onDelete(item)}>
                  <Trash2 />
                  Delete
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  );
}
