import Link from "next/link";
import { ArrowRight, Database } from "lucide-react";
import { Button, Card, CardDescription, CardHeader, CardTitle, EmptyState } from "@smartreach/ui";
import { Section, SectionIntro } from "./section";

export interface IndustryCount {
  value: string;
  label: string;
  count: number;
}

const FILTERS = ["Industry", "Job title", "Company", "Location", "Company size", "Revenue"];

export function DirectorySection({
  totalLeads,
  topIndustries,
}: {
  totalLeads: number;
  topIndustries: IndustryCount[];
}) {
  const rows = topIndustries.slice(0, 8);
  const max = rows.reduce((m, r) => Math.max(m, r.count), 0);

  return (
    <Section id="directory" labelledBy="directory-title">
      <SectionIntro
        id="directory-title"
        title={`${totalLeads.toLocaleString("en-US")} B2B contacts, built in`}
        description="The directory comes with the platform. AutoGTM searches it for you when it picks buyers, and you can browse it yourself. There are no export credits."
        action={
          <Button asChild variant="outline" size="lg">
            <Link href="/b2b-database">
              Browse the directory <ArrowRight />
            </Link>
          </Button>
        }
      />

      <div className="mt-12 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:pt-5">
          <h3 className="text-[15px] font-semibold tracking-[-0.01em]">Search by</h3>
          <ul className="flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <li
                key={f}
                className="rounded-full bg-card px-3 py-1 text-[13px] text-foreground ring-1 ring-inset ring-border"
              >
                {f}
              </li>
            ))}
          </ul>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Counts on this page come straight from the directory and update as it grows.
          </p>
        </div>

        <Card className="min-w-0 lg:col-span-2">
          <CardHeader>
            <CardTitle>Largest industries</CardTitle>
            <CardDescription>Contacts per industry in the directory today.</CardDescription>
          </CardHeader>
          {rows.length === 0 ? (
            <EmptyState
              compact
              icon={Database}
              title="Industry counts are unavailable"
              description="The directory is being updated. The breakdown shows here again once it is back."
            />
          ) : (
            <ul className="mt-4 divide-y divide-border border-t border-border">
              {rows.map((row) => {
                const pct = max > 0 ? Math.max(2, Math.round((row.count / max) * 100)) : 0;
                return (
                  <li key={row.value} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 px-5 py-3 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_auto]">
                    <span className="truncate text-[13px] font-medium">{row.label}</span>
                    <span aria-hidden className="col-span-2 row-start-2 h-1.5 overflow-hidden rounded-full bg-muted sm:col-span-1 sm:row-start-auto">
                      <span className="block h-full rounded-full bg-chart-1" style={{ width: `${pct}%` }} />
                    </span>
                    <span className="tabular text-right text-[13px] text-muted-foreground">
                      {row.count.toLocaleString("en-US")}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </Section>
  );
}
