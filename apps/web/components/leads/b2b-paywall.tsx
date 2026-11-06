"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, ExternalLink } from "lucide-react";
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  toast,
} from "@smartreach/ui";
import { getB2BCheckoutUrl } from "@/lib/b2b-constants";
import { unlockB2bAccessAction } from "@/lib/b2b-access-actions";

interface B2bPaywallProps {
  userEmail?: string;
  userId?: string;
  totalLeadsCount?: number;
  /** Rows a paid account can export or add to a list per action. */
  rowLimit?: number;
}

/** Explains the one-time directory purchase and lets a buyer check whether access is unlocked. */
export function B2bPaywall({ userEmail, userId, totalLeadsCount, rowLimit }: B2bPaywallProps) {
  const [claimOpen, setClaimOpen] = React.useState(false);
  const checkoutUrl = getB2BCheckoutUrl(userEmail, userId);

  const included = [
    totalLeadsCount
      ? `Search ${totalLeadsCount.toLocaleString()} business contacts by role, industry, country, company size and revenue`
      : "Search business contacts by role, industry, country, company size and revenue",
    "See full email addresses, phone numbers and LinkedIn profiles",
    "Add people straight to lead lists for your campaigns",
    rowLimit ? `Export to CSV, up to ${rowLimit.toLocaleString()} rows at a time` : "Export to CSV",
  ];

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Unlock the B2B directory</CardTitle>
          <CardDescription>
            Without access you can browse names, titles and companies, but emails and phone numbers are hidden.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-8 md:grid-cols-[minmax(0,1fr)_280px]">
          <div className="flex flex-col gap-6">
            <ul className="flex flex-col gap-3">
              {included.map((item) => (
                <li key={item} className="flex gap-3 text-sm text-foreground">
                  <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-success-soft text-success-text">
                    <Check className="size-3.5" aria-hidden />
                  </span>
                  {item}
                </li>
              ))}
            </ul>
            <div className="border-t border-border pt-5">
              <h3 className="text-[13px] font-semibold text-foreground">Why the directory is paid</h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                Sending, warmup, sequences and the inbox stay free. Sourcing contacts and keeping their emails verified
                costs money, and a price keeps out bulk scrapers whose spam would hurt deliverability for everyone.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-4 rounded-lg bg-muted/60 p-5">
            <div>
              <p className="text-[13px] text-muted-foreground">One-time payment</p>
              <p className="mt-1 flex items-baseline gap-1.5">
                <span className="tabular text-3xl font-semibold tracking-[-0.02em] text-foreground">$99</span>
                <span className="text-sm text-muted-foreground">no subscription</span>
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <Button asChild size="lg">
                <a href={checkoutUrl} target="_blank" rel="noopener noreferrer">
                  Pay with Stripe
                  <ExternalLink />
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              </Button>
              <Button variant="outline" size="lg" onClick={() => setClaimOpen(true)}>
                I have already paid
              </Button>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Access is tied to {userEmail ? <span className="text-foreground">{userEmail}</span> : "your account"}. Payments
              are checked by hand, so unlocking can take a little while.
            </p>
          </div>
        </CardContent>
      </Card>

      <ClaimDialog open={claimOpen} onOpenChange={setClaimOpen} userEmail={userEmail} />
    </>
  );
}

function ClaimDialog({
  open,
  onOpenChange,
  userEmail,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userEmail?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  const [notice, setNotice] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) setNotice(null);
  }, [open]);

  const check = () => {
    startTransition(async () => {
      const res = await unlockB2bAccessAction();
      if (res.success) {
        toast.success(res.message);
        onOpenChange(false);
        router.refresh();
      } else {
        setNotice(res.error || "Access is not unlocked yet.");
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Already paid?</DialogTitle>
          <DialogDescription>
            An admin unlocks the directory after confirming your Stripe payment
            {userEmail ? ` for ${userEmail}` : ""}. Check whether that has happened.
          </DialogDescription>
        </DialogHeader>
        {notice ? <Alert variant="info">{notice}</Alert> : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Close
          </Button>
          <Button onClick={check} loading={isPending}>
            Check access
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
