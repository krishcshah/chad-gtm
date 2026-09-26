"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, FileSpreadsheet, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@smartreach/ui";
import { formatDate } from "@smartreach/shared";
import { deleteLeadList } from "@/lib/actions";

interface LeadListCardProps {
  id: string;
  name: string;
  leadCount: number;
  createdAt: string | Date;
}

export function LeadListCard({ id, name, leadCount, createdAt }: LeadListCardProps) {
  const router = useRouter();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDeleteOpen(true);
  };

  const confirmDelete = () => {
    if (pending) return;
    setError(null);
    start(async () => {
      try {
        const res = await deleteLeadList(id);
        if (!res.ok) {
          setError(res.error || "Failed to delete list");
          toast.error(res.error || "Failed to delete list");
        } else {
          toast.success(`List "${name}" deleted`);
          setDeleteOpen(false);
          router.refresh();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to delete list");
      }
    });
  };

  return (
    <>
      <Link
        href={`/leads/${id}`}
        className="group relative rounded-2xl focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Card className="h-full border-border/60 bg-card/50 transition-all hover:bg-accent/40 hover:border-border hover:shadow-md">
          <CardContent className="p-5 flex flex-col justify-between h-full">
            <div>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20">
                    <FileSpreadsheet className="size-4" />
                  </div>
                  <h3 className="font-semibold text-sm truncate text-foreground group-hover:text-primary transition-colors">
                    {name}
                  </h3>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <Badge variant="secondary" className="font-semibold tabular-nums">
                    {leadCount.toLocaleString()} {leadCount === 1 ? "lead" : "leads"}
                  </Badge>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    asChild
                    className="size-8 p-0 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
                    title={`Import CSV to ${name}`}
                  >
                    <Link
                      href={`/leads/import?listId=${id}`}
                      onClick={(e) => {
                        e.stopPropagation();
                      }}
                    >
                      <Upload className="size-3.5" />
                    </Link>
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleDelete}
                    aria-label={`Delete list ${name}`}
                    className="size-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-between pt-3 border-t border-border/40 text-xs text-muted-foreground">
              <span>Created {formatDate(typeof createdAt === "string" ? createdAt : createdAt ? new Date(createdAt).toISOString() : null)}</span>
              <span className="inline-flex items-center gap-1 font-medium text-primary group-hover:translate-x-0.5 transition-transform">
                View Contacts <ArrowRight className="size-3" />
              </span>
            </div>
          </CardContent>
        </Card>
      </Link>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="w-[calc(100%-2rem)]">
          <DialogHeader>
            <DialogTitle>Delete lead list</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &ldquo;{name}&rdquo;? This will remove the list and all {leadCount.toLocaleString()} contacts within it.
            </DialogDescription>
          </DialogHeader>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={confirmDelete}
              disabled={pending}
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
              {pending ? "Deleting…" : "Delete List"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
