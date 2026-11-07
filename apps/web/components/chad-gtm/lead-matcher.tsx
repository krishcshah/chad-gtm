"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
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
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@smartreach/ui";
import { searchMatchingLeadsAction } from "@/lib/chad-gtm-actions";
import { LAUNCH_AUDIENCE_NOTE } from "@/lib/autopilot-policy";
import type { DirectoryLead } from "@/lib/leads-directory";

/**
 * Guided setup, step 3: choose the industries to target and preview the
 * matching contacts from the directory. At least one industry stays selected.
 */
export function LeadMatcher({
  runId,
  initialIndustries,
  allAvailableIndustries,
  onProceed,
  onBack,
  initialStrictRoles = false,
}: {
  /** The run whose job titles launch will use; the counts and sample follow them. */
  runId: string;
  initialIndustries: string[];
  allAvailableIndustries: string[];
  /** strictRoles: only people with the job titles are contacted (no industry top-up). */
  onProceed: (selectedIndustries: string[], strictRoles: boolean) => void | Promise<void>;
  onBack?: () => void;
  initialStrictRoles?: boolean;
}) {
  const [selectedIndustries, setSelectedIndustries] = useState<string[]>(
    initialIndustries.length > 0 ? initialIndustries : allAvailableIndustries.slice(0, 3),
  );
  const [strictRoles, setStrictRoles] = useState(initialStrictRoles);
  const strictId = useId();
  const [industrySearch, setIndustrySearch] = useState("");
  const [totalLeads, setTotalLeads] = useState<number | null>(null);
  const [sampleLeads, setSampleLeads] = useState<DirectoryLead[]>([]);
  const [audience, setAudience] = useState<{
    roleMatches: number;
    otherRoles: number;
    perRun: number;
    bySize: boolean;
    sampleMatchesTitles: boolean;
  } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lastRemovedBlocked, setLastRemovedBlocked] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [proceeding, setProceeding] = useState(false);
  const requestId = useRef(0);

  const queryLeads = (industries: string[], strict: boolean = strictRoles) => {
    const id = ++requestId.current;
    startTransition(async () => {
      const res = await searchMatchingLeadsAction(runId, industries, 1, 10, { strictRoles: strict });
      if (id !== requestId.current) return; // A newer selection is already loading.
      if (res.ok) {
        setTotalLeads(res.total);
        setSampleLeads(res.leads);
        setAudience({
          roleMatches: res.roleMatches ?? res.total,
          otherRoles: res.otherRoles ?? 0,
          perRun: res.perRun ?? Number.POSITIVE_INFINITY,
          bySize: Boolean(res.bySize),
          sampleMatchesTitles: Boolean(res.sampleMatchesTitles),
        });
        setLoadError(null);
      } else {
        setLoadError("We couldn't load matching contacts. Change the selection or try again.");
      }
    });
  };

  useEffect(() => {
    queryLeads(selectedIndustries, strictRoles);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIndustries, strictRoles]);

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
      await onProceed(selectedIndustries, strictRoles);
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
                    All{" "}
                    <span className="tabular font-semibold text-foreground">{totalLeads.toLocaleString()}</span>{" "}
                    matching contacts, best fit first{isPending ? ", updating…" : ""}
                  </>
                )}
              </p>
            </div>
            {audience && totalLeads !== null && totalLeads > 0 && (
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                {strictRoles ? (
                  <>
                    {audience.roleMatches.toLocaleString()} match your job titles{audience.bySize ? " and company size" : ""}.
                    Others in your industries are not contacted.
                  </>
                ) : (
                  <>
                    {audience.roleMatches.toLocaleString()} match your job titles{audience.bySize ? " and company size" : ""},{" "}
                    {audience.otherRoles.toLocaleString()} are others in your industries.
                  </>
                )}{" "}
                {LAUNCH_AUDIENCE_NOTE}
              </p>
            )}
            <div className="mt-3 flex items-start justify-between gap-4 rounded-lg border border-border px-4 py-3">
              <div className="min-w-0">
                <label htmlFor={strictId} className="cursor-pointer text-[13px] font-medium">
                  Only contact people with these job titles
                </label>
                <p id={`${strictId}-hint`} className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Off: if too few people match your job titles, we fill the run with others in your industries.
                </p>
              </div>
              <Switch
                id={strictId}
                checked={strictRoles}
                onCheckedChange={setStrictRoles}
                aria-describedby={`${strictId}-hint`}
              />
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
            {totalLeads === 0
              ? "No contacts match this selection yet. Add an industry."
              : sampleLeads.length > 0
                ? audience?.sampleMatchesTitles
                  ? `${Math.min(10, sampleLeads.length)} of the people who match your job titles.`
                  : `${Math.min(10, sampleLeads.length)} of the people in your industries.`
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
