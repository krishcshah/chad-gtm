import { Users } from "lucide-react";
import {
  Badge,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@smartreach/ui";
import type { PoolCustomerSummary } from "@/lib/pool-capacity";

/** Per-customer demand vs. today's fair share of the shared pool. */
export function AdminPoolCustomers({ customers }: { customers: PoolCustomerSummary[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Customers on the pool</CardTitle>
        <CardDescription>
          Daily volume each customer asked for, the share of today&apos;s pool capacity they were given, and what went
          out.
        </CardDescription>
      </CardHeader>
      {customers.length === 0 ? (
        <EmptyState compact icon={Users} title="No running campaigns use the pool." />
      ) : (
        <div className="mt-4 border-t border-border">
          <Table className="min-w-[640px]">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Customer</TableHead>
                <TableHead className="text-right">Campaigns</TableHead>
                <TableHead className="text-right">Daily volume</TableHead>
                <TableHead className="text-right">Allocated today</TableHead>
                <TableHead className="text-right">Sent today</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.map((c) => (
                <TableRow key={c.userId}>
                  <TableCell className="max-w-[280px]">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{c.ownerEmail}</span>
                      {c.starved ? <Badge variant="warning">Getting less than asked</Badge> : null}
                    </div>
                  </TableCell>
                  <TableCell className="tabular text-right">{c.campaigns.toLocaleString()}</TableCell>
                  <TableCell className="tabular text-right">{c.dailyLimit.toLocaleString()}</TableCell>
                  <TableCell className="tabular text-right">{c.allocatedToday.toLocaleString()}</TableCell>
                  <TableCell className="tabular text-right text-muted-foreground">
                    {c.sentToday.toLocaleString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  );
}
