"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { formatDate } from "@smartreach/shared";
import {
  Button,
  Card,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@smartreach/ui";
import { DeleteListDialog } from "./[id]/lead-manage-dialogs";

interface LeadListCardProps {
  id: string;
  name: string;
  leadCount: number;
  createdAt: string | Date;
}

function toIso(value: string | Date | null | undefined) {
  if (!value) return null;
  return typeof value === "string" ? value : new Date(value).toISOString();
}

/** One lead list as a card: name, lead count, created date and a row of actions. */
export function LeadListCard({ id, name, leadCount, createdAt }: LeadListCardProps) {
  const router = useRouter();
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <>
      <Card className="relative flex flex-col gap-4 p-5 transition-colors hover:border-border-strong">
        <div className="flex items-start justify-between gap-3">
          <h3 className="min-w-0 text-[15px] font-semibold tracking-[-0.01em]">
            <Link
              href={`/leads/${id}`}
              className="block truncate rounded-sm outline-none after:absolute after:inset-0 after:rounded-xl after:content-[''] focus-visible:after:ring-[3px] focus-visible:after:ring-ring"
            >
              {name}
            </Link>
          </h3>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" className="relative z-10 -mr-1.5 -mt-1" aria-label={`Actions for ${name}`}>
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href={`/leads/import?listId=${id}`}>
                  <Upload />
                  Import CSV into list
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem destructive onSelect={() => setDeleteOpen(true)}>
                <Trash2 />
                Delete list
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm">
            <span className="tabular font-semibold">{leadCount.toLocaleString()}</span>{" "}
            <span className="text-muted-foreground">{leadCount === 1 ? "lead" : "leads"}</span>
          </span>
          <span className="text-xs text-subtle-foreground">Created {formatDate(toIso(createdAt))}</span>
        </div>
      </Card>

      {deleteOpen ? (
        <DeleteListDialog
          open
          listId={id}
          name={name}
          leadCount={leadCount}
          onOpenChange={setDeleteOpen}
          onDeleted={() => {
            toast.success(`Deleted "${name}"`);
            router.refresh();
          }}
        />
      ) : null}
    </>
  );
}
