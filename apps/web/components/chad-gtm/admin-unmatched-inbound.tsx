"use client";

import { useCallback, useEffect, useState } from "react";
import { Inbox, UserPlus, X } from "lucide-react";
import { timeAgo } from "@smartreach/shared";
import {
  Badge,
  Button,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Input,
  Label,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  toast,
} from "@smartreach/ui";
import {
  assignUnmatchedInboundAction,
  dismissUnmatchedInboundAction,
  listUnmatchedInboundAction,
  type UnmatchedInboundItem,
} from "@/lib/admin-inbound-triage-actions";

/** Pool mailbox mail that answers none of our emails, waiting for an admin to assign it. */
export function AdminUnmatchedInbound() {
  const [items, setItems] = useState<UnmatchedInboundItem[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [assignTarget, setAssignTarget] = useState<UnmatchedInboundItem | null>(null);
  const [customerEmail, setCustomerEmail] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [dismissingId, setDismissingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setItems(await listUnmatchedInboundAction());
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Couldn't load unmatched replies.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openAssign(item: UnmatchedInboundItem) {
    setAssignTarget(item);
    setCustomerEmail(item.candidates.length === 1 ? item.candidates[0]!.email : "");
  }

  async function handleAssign() {
    if (!assignTarget) return;
    setAssigning(true);
    try {
      const res = await assignUnmatchedInboundAction(assignTarget.id, customerEmail);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Assigned to ${customerEmail.trim()}. It's in their Inbox now.`);
      setItems((prev) => (prev ? prev.filter((i) => i.id !== assignTarget.id) : prev));
      setAssignTarget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't assign this message.");
    } finally {
      setAssigning(false);
    }
  }

  async function handleDismiss(item: UnmatchedInboundItem) {
    setDismissingId(item.id);
    try {
      const res = await dismissUnmatchedInboundAction(item.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setItems((prev) => (prev ? prev.filter((i) => i.id !== item.id) : prev));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't dismiss this message.");
    } finally {
      setDismissingId(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Unmatched replies</CardTitle>
        <CardDescription>
          Messages to pool mailboxes that don&apos;t answer an email we sent. Assign each to the customer it belongs to;
          they&apos;ll see it in their Inbox.
        </CardDescription>
      </CardHeader>

      {loadError ? (
        <p role="alert" className="px-5 pb-5 text-sm text-destructive">
          {loadError}
        </p>
      ) : items === null ? (
        <p className="px-5 pb-5 text-sm text-muted-foreground">Loading…</p>
      ) : items.length === 0 ? (
        <EmptyState
          compact
          icon={Inbox}
          title="No unmatched replies"
          description="Messages that don't match a customer's campaign show up here."
        />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>From</TableHead>
                <TableHead>Mailbox</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Received</TableHead>
                <TableHead>Possible customers</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <div className="font-medium">{item.fromName || item.fromEmail}</div>
                    {item.fromName ? <div className="text-xs text-muted-foreground">{item.fromEmail}</div> : null}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{item.mailboxEmail}</TableCell>
                  <TableCell className="max-w-sm">
                    <div className="truncate font-medium">{item.subject || "(no subject)"}</div>
                    {item.snippet ? <div className="line-clamp-2 text-xs text-muted-foreground">{item.snippet}</div> : null}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    <time suppressHydrationWarning dateTime={item.receivedAt}>
                      {timeAgo(item.receivedAt)}
                    </time>
                  </TableCell>
                  <TableCell>
                    {item.candidates.length === 0 ? (
                      <span className="text-xs text-subtle-foreground">None found</span>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {item.candidates.map((c) => (
                          <Badge key={c.userId} variant="neutral">
                            {c.email}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1.5">
                      <Button
                        variant="outline"
                        size="xs"
                        disabled={dismissingId !== null}
                        onClick={() => openAssign(item)}
                        aria-label={`Assign the message from ${item.fromEmail}`}
                      >
                        <UserPlus />
                        Assign
                      </Button>
                      <Button
                        variant="ghost"
                        size="xs"
                        loading={dismissingId === item.id}
                        disabled={dismissingId !== null && dismissingId !== item.id}
                        onClick={() => handleDismiss(item)}
                        aria-label={`Dismiss the message from ${item.fromEmail}`}
                      >
                        {dismissingId === item.id ? null : <X />}
                        Dismiss
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={assignTarget !== null} onOpenChange={(o) => !assigning && !o && setAssignTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign message from {assignTarget?.fromEmail}</DialogTitle>
            <DialogDescription>
              It goes to this customer&apos;s Inbox as a new contact. The agent doesn&apos;t answer it; the customer
              replies themselves.
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void handleAssign();
            }}
          >
            <Label htmlFor="unmatched-customer-email">Customer&apos;s login email</Label>
            <Input
              id="unmatched-customer-email"
              type="email"
              value={customerEmail}
              onChange={(e) => setCustomerEmail(e.target.value)}
              placeholder="name@company.com"
              autoComplete="off"
              required
            />
          </form>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignTarget(null)} disabled={assigning}>
              Cancel
            </Button>
            <Button loading={assigning} disabled={!customerEmail.trim()} onClick={() => void handleAssign()}>
              Assign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
