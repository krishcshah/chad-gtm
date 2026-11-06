import type { DirectoryFacets, DirectoryLead, DirectorySearchParams } from "@/lib/leads-directory";

/** Filter state with every key set, so resets and comparisons are simple. */
export function emptyDirectoryFilters(pageSize = 25): DirectorySearchParams {
  return {
    query: "",
    industries: [],
    countries: [],
    jobTitles: [],
    companyName: "",
    teamSizes: [],
    revenueRanges: [],
    hasEmail: false,
    hasWorkEmail: false,
    hasPersonalEmail: false,
    hasPhone: false,
    hasLinkedin: false,
    page: 1,
    pageSize,
    sortBy: "default",
    sortOrder: "desc",
  };
}

/** Role shortcuts. The value is matched against job titles by the search. */
export const ROLE_OPTIONS = [
  { label: "Owner or founder", value: "Owner" },
  { label: "CEO", value: "CEO" },
  { label: "President", value: "President" },
  { label: "Vice president", value: "VP" },
  { label: "Director", value: "Director" },
  { label: "Manager", value: "Manager" },
  { label: "Partner", value: "Partner" },
] as const;

export const CONTACT_TOGGLES = [
  { key: "hasWorkEmail", label: "Work email" },
  { key: "hasPersonalEmail", label: "Personal email" },
  { key: "hasEmail", label: "Any email" },
  { key: "hasPhone", label: "Phone number" },
  { key: "hasLinkedin", label: "LinkedIn profile" },
] as const;

export type ContactToggleKey = (typeof CONTACT_TOGGLES)[number]["key"];
export type ListFilterKey = "industries" | "countries" | "jobTitles" | "teamSizes" | "revenueRanges";

export function countActiveFilters(f: DirectorySearchParams): number {
  return (
    (f.query?.trim() ? 1 : 0) +
    (f.companyName?.trim() ? 1 : 0) +
    (f.industries?.length || 0) +
    (f.countries?.length || 0) +
    (f.jobTitles?.length || 0) +
    (f.teamSizes?.length || 0) +
    (f.revenueRanges?.length || 0) +
    CONTACT_TOGGLES.reduce((n, t) => n + (f[t.key] ? 1 : 0), 0)
  );
}

export interface ActiveFilterChip {
  id: string;
  label: string;
  /** Patch that removes this one filter. */
  remove: (f: DirectorySearchParams) => Partial<DirectorySearchParams>;
}

function facetLabel(items: { value: string; label: string }[] | undefined, value: string) {
  return items?.find((i) => i.value === value)?.label ?? value;
}

/** One removable chip per active filter value, in rail order. */
export function activeFilterChips(f: DirectorySearchParams, facets: DirectoryFacets): ActiveFilterChip[] {
  const chips: ActiveFilterChip[] = [];
  if (f.query?.trim()) chips.push({ id: "query", label: `"${f.query.trim()}"`, remove: () => ({ query: "" }) });
  if (f.companyName?.trim())
    chips.push({ id: "company", label: `Company: ${f.companyName.trim()}`, remove: () => ({ companyName: "" }) });

  const list = (key: ListFilterKey, label: (v: string) => string) => {
    for (const v of f[key] || []) {
      chips.push({
        id: `${key}:${v}`,
        label: label(v),
        remove: (cur) => ({ [key]: (cur[key] || []).filter((x) => x !== v) }),
      });
    }
  };
  list("jobTitles", (v) => ROLE_OPTIONS.find((o) => o.value === v)?.label ?? v);
  list("industries", (v) => facetLabel(facets.industries, v));
  list("countries", (v) => facetLabel(facets.countries, v));
  list("teamSizes", (v) => `${facetLabel(facets.teamSizes, v)} employees`);
  list("revenueRanges", (v) => `Revenue ${facetLabel(facets.revenueRanges, v)}`);

  for (const t of CONTACT_TOGGLES) {
    if (f[t.key]) chips.push({ id: t.key, label: `Has ${t.label.toLowerCase()}`, remove: () => ({ [t.key]: false }) });
  }
  return chips;
}

const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
export function formatCount(n: number) {
  return n >= 10000 ? compact.format(n) : n.toLocaleString();
}

export function leadName(lead: DirectoryLead) {
  return lead.fullName || `${lead.firstName || ""} ${lead.lastName || ""}`.trim() || "Unnamed contact";
}

export function leadLocation(lead: DirectoryLead) {
  if (lead.city && lead.state) return `${lead.city}, ${lead.state}`;
  return lead.location || [lead.city, lead.country].filter(Boolean).join(", ") || "";
}

export function externalUrl(url: string) {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

export function displayDomain(url: string) {
  return url.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/$/, "");
}

/** "120" -> "120 employees"; ranges like "11-50" pass through. */
export function formatTeamSize(size: string) {
  if (!size) return "";
  const n = Number(size);
  return Number.isFinite(n) && String(n) === size.trim() ? `${n.toLocaleString()} employees` : `${size} employees`;
}

/** Whether the primary email is the work or the personal address. */
export function emailKind(lead: DirectoryLead): "Work" | "Personal" | null {
  if (!lead.email) return null;
  if (lead.workEmail && lead.workEmail === lead.email) return "Work";
  if (lead.personalEmail && lead.personalEmail === lead.email) return "Personal";
  return null;
}

const CSV_HEADERS = [
  "Full Name",
  "First Name",
  "Last Name",
  "Job Title",
  "Company Name",
  "Company Website",
  "Primary Email",
  "Email Status",
  "Phone",
  "Industry",
  "Country",
  "City",
  "State",
  "Team Size",
  "Revenue Range",
  "LinkedIn URL",
];

function csvCell(v: string | undefined | null) {
  return `"${String(v ?? "").replace(/"/g, '""')}"`;
}

export function leadsToCsv(leads: DirectoryLead[]) {
  const rows = leads.map((l) =>
    [
      l.fullName,
      l.firstName,
      l.lastName,
      l.jobTitle,
      l.companyName,
      l.companyWebsite,
      l.email,
      l.emailStatus,
      l.phone,
      l.industry,
      l.country,
      l.city,
      l.state,
      l.teamSize,
      l.revenueRange,
      l.linkedinUrl,
    ]
      .map(csvCell)
      .join(","),
  );
  return [CSV_HEADERS.join(","), ...rows].join("\n");
}

export function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Revoking straight away can cancel the download in Safari and Firefox.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
