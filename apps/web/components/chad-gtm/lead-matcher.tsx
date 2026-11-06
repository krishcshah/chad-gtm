"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { ArrowLeft, ArrowRight, Plus, Search, Users, X } from "lucide-react";
import {
  Alert,
  Button,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  Input,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@smartreach/ui";
import { searchMatchingLeadsAction } from "@/lib/chad-gtm-actions";
import type { DirectoryLead } from "@/lib/leads-directory";

/**
 * Guided setup, step 3: choose the industries to target and preview the
 * matching contacts from the directory. At least one industry stays selected.
 */
export function LeadMatcher({
  initialIndustries,
  allAvailableIndustries,
  onProceed,
  onBack,
}: {
  initialIndustries: string[];
  allAvailableIndustries: string[];
  onProceed: (selectedIndustries: string[]) => void | Promise<void>;
  onBack?: () => void;
}) {
  const [selectedIndustries, setSelectedIndustries] = useState<string[]>(
    initialIndustries.length > 0 ? initialIndustries : allAvailableIndustries.slice(0, 3),
  );
  const [industrySearch, setIndustrySearch] = useState("");
  const [totalLeads, setTotalLeads] = useState<number | null>(null);
  const [sampleLeads, setSampleLeads] = useState<DirectoryLead[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lastRemovedBlocked, setLastRemovedBlocked] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [proceeding, setProceeding] = useState(false);
  const requestId = useRef(0);

  const queryLeads = (industries: string[]) => {
    const id = ++requestId.current;
    startTransition(async () => {
      const res = await searchMatchingLeadsAction(industries, 1, 10);
      if (id !== requestId.current) return; // A newer selection is already loading.
      if (res.ok) {
        setTotalLeads(res.total);
        setSampleLeads(res.leads);
        setLoadError(null);
      } else {
        setLoadError("We couldn't load matching contacts. Change the selection or try again.");
      }
    });
  };

  useEffect(() => {
    queryLeads(selectedIndustries);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIndustries]);

  const toggleIndustry = (ind: string) => {
    if (selectedIndustries.includes(ind)) {
      if (selectedIndustries.length > 1) {
        setSelectedIndustries(selectedIndustries.filter((i) => i !== ind));
        setLastRemovedBlocked(false);
      } else {
        setLastRemovedBlocked(true);
      }
    } else {
      setSelectedIndustries([...selectedIndustries, ind]);
      setLastRemovedBlocked(false);
    }
  };

  const query = industrySearch.trim().toLowerCase();
  const suggestions = allAvailableIndustries
    .filter((ind) => !selectedIndustries.includes(ind))
    .filter((ind) => ind.toLowerCase().includes(query))
    .slice(0, 15);

  const proceed = async () => {
    setProceeding(true);
    try {
      await onProceed(selectedIndustries);
    } finally {
      setProceeding(false);
    }
  };

  const loadingFirst = isPending && totalLeads === null;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Which industries should we contact?</CardTitle>
          <CardDescription>
            We suggested these from your website. Add or remove industries; the contact count updates as you go.
          </CardDescription>
        </CardHeader>

        <div className="flex flex-col gap-5 p-5">
          <div>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-[13px] font-medium">
                Selected <span className="tabular font-normal text-subtle-foreground">{selectedIndustries.length}</span>
              </h3>
              <p className="text-[13px] text-muted-foreground" aria-live="polite">
                {loadingFirst ? (
                  "Counting contacts…"
                ) : totalLeads === null ? null : (
                  <>
                    <span className="tabular font-semibold text-foreground">{totalLeads.toLocaleString()}</span>{" "}
                    matching contacts{isPending ? ", updating…" : ""}
                  </>
                )}
              </p>
            </div>
            <ul className="mt-2.5 flex flex-wrap gap-2" aria-label="Selected industries">
              {selectedIndustries.map((ind) => (
                <li key={ind}>
                  <button
                    type="button"
                    onClick={() => toggleIndustry(ind)}
                    aria-label={`Remove ${ind}`}
                    className="inline-flex h-7 items-center gap-1.5 rounded-full border border-border-strong bg-card pl-3 pr-2 text-[13px] outline-none transition-colors hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring"
                  >
                    {ind}
                    <X className="size-3.5 text-subtle-foreground" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
            {lastRemovedBlocked && (
              <p className="mt-2 text-xs text-muted-foreground" role="status">
                Keep at least one industry. Add another before removing this one.
              </p>
            )}
          </div>

          <div className="border-t border-border pt-5">
            <label htmlFor="industry-search" className="text-[13px] font-medium">
              Add industries
            </label>
            <div className="relative mt-2">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle-foreground"
                aria-hidden
              />
              <Input
                id="industry-search"
                type="search"
                value={industrySearch}
                onChange={(e) => setIndustrySearch(e.target.value)}
                placeholder="Search industries"
                className="pl-9"
              />
            </div>
            {suggestions.length > 0 ? (
              <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Suggested industries">
                {suggestions.map((ind) => (
                  <li key={ind}>
                    <button
                      type="button"
                      onClick={() => toggleIndustry(ind)}
                      className="inline-flex h-7 items-center gap-1 rounded-full bg-muted px-2.5 text-[13px] text-muted-foreground outline-none ring-1 ring-inset ring-border transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring"
                    >
                      <Plus className="size-3.5" aria-hidden />
                      {ind}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-xs text-subtle-foreground">
                {query ? `No industries match "${industrySearch.trim()}".` : "Every industry is already selected."}
              </p>
            )}
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sample contacts</CardTitle>
          <CardDescription>
            {totalLeads && totalLeads > 0
              ? `The first ${Math.min(10, sampleLeads.length)} of ${totalLeads.toLocaleString()} people we can reach with this selection.`
              : "People we can reach with this selection."}
          </CardDescription>
        </CardHeader>
        {loadError && (
          <div className="px-5 pt-4">
            <Alert
              variant="destructive"
              action={
                <Button variant="outline" size="sm" onClick={() => queryLeads(selectedIndustries)}>
                  Try again
                </Button>
              }
            >
              {loadError}
            </Alert>
          </div>
        )}
        <div className="mt-3 border-t border-border" aria-busy={isPending || undefined}>
          {isPending && sampleLeads.length === 0 ? (
            <div className="flex flex-col gap-3 p-5" aria-hidden>
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-5 w-full" />
              ))}
            </div>
          ) : sampleLeads.length === 0 ? (
            loadError ? null : (
              <EmptyState
                compact
                icon={Users}
                title="No matching contacts"
                description="Try adding a broader or related industry."
              />
            )
          ) : (
            <Table className={isPending ? "opacity-60 transition-opacity" : "transition-opacity"}>
              <TableHeader className="bg-transparent">
                <TableRow className="hover:bg-transparent">
                  <TableHead>Name</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Industry</TableHead>
                  <TableHead>Location</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sampleLeads.map((lead) => (
                  <TableRow key={lead.id}>
                    <TableCell className="whitespace-nowrap font-medium">
                      {lead.fullName || `${lead.firstName} ${lead.lastName}`}
                    </TableCell>
                    <TableCell className="min-w-40 text-muted-foreground">{lead.jobTitle}</TableCell>
                    <TableCell className="min-w-32">{lead.companyName}</TableCell>
                    <TableCell className="min-w-32 text-muted-foreground">{lead.industry}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {lead.location || lead.country || "Not listed"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
        <div className="flex flex-col-reverse gap-2 border-t border-border px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
          {onBack ? (
            <Button variant="outline" onClick={onBack} disabled={proceeding}>
              <ArrowLeft />
              Back
            </Button>
          ) : (
            <span />
          )}
          <Button onClick={proceed} loading={proceeding} disabled={totalLeads === 0}>
            Continue to email voice
            {!proceeding && <ArrowRight />}
          </Button>
        </div>
      </Card>
    </>
  );
}
