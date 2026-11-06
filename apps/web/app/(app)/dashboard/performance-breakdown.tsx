import Link from "next/link";
import { ArrowUpRight, Rocket } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  Progress,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  statusVariant,
} from "@smartreach/ui";

interface CampaignItem {
  id: string;
  name: string;
  status: string;
  total: number;
  sent: number;
  replied: number;
}

/** Campaign pacing on the overview: how far each campaign has got through its leads. */
export function PerformanceBreakdown({ campaigns = [] }: { campaigns: CampaignItem[] }) {
  return (
    <Card>
      <CardHeader
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link href="/campaigns">
              All campaigns <ArrowUpRight />
            </Link>
          </Button>
        }
      >
        <CardTitle>Campaigns</CardTitle>
        <CardDescription>Delivery progress and replies per campaign.</CardDescription>
      </CardHeader>

      {campaigns.length === 0 ? (
        <EmptyState
          compact
          icon={Rocket}
          title="No campaigns yet"
          description="Start an autopilot run and its campaign shows up here with live pacing."
        />
      ) : (
        <div className="mt-3 border-t border-border">
          <Table>
            <TableHeader className="bg-transparent">
              <TableRow className="hover:bg-transparent">
                <TableHead>Campaign</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[32%]">Sent</TableHead>
                <TableHead className="text-right">Replies</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaigns.map((c) => {
                const pct = c.total > 0 ? Math.round((c.sent / c.total) * 100) : 0;
                return (
                  <TableRow key={c.id}>
                    <TableCell className="max-w-[240px]">
                      <Link href={`/campaigns/${c.id}`} className="block truncate font-medium hover:underline">
                        {c.name}
                      </Link>
                      <span className="text-xs text-subtle-foreground">{c.total.toLocaleString()} leads</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(c.status)} dot className="capitalize">
                        {c.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Progress value={pct} className="h-1.5 flex-1" aria-label={`${pct}% sent`} />
                        <span className="tabular w-16 shrink-0 text-right text-xs text-muted-foreground">
                          {c.sent.toLocaleString()} / {c.total.toLocaleString()}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="tabular text-right font-medium">{c.replied.toLocaleString()}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  );
}
