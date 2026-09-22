"use client";

/**
 * Tiny client-side CSV parser with auto delimiter detection and UTF-8 support.
 * Good enough for lead/sender files up to ~50k rows in the browser.
 */

function detectDelimiter(firstLine: string): string {
  const candidates = [",", ";", "\t", "|"];
  let best = ",";
  let bestCount = 0;
  for (const c of candidates) {
    const count = firstLine.split(c).length - 1;
    if (count > bestCount) {
      bestCount = count;
      best = c;
    }
  }
  return best;
}

function splitLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === delimiter) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

export interface ParsedCsv {
  headers: string[];
  rows: Record<string, string>[];
}

export function parseCsvText(text: string): ParsedCsv {
  // Excel CSVs often start with a BOM; leaving it on the first header breaks auto-map.
  const clean = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const lines = clean.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };
  const delimiter = detectDelimiter(lines[0]!);
  const headers = splitLine(lines[0]!, delimiter).map((h) => h.replace(/^\uFEFF/, ""));
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitLine(lines[i]!, delimiter);
    const row: Record<string, string> = {};
    for (let h = 0; h < headers.length; h++) row[headers[h]!] = cells[h] ?? "";
    rows.push(row);
  }
  return { headers, rows };
}

/** Lowercase header key: strips BOM, punctuation, and repeated separators. */
export function normalizeHeader(header: string): string {
  return header
    .replace(/\uFEFF/g, "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/**
 * How strongly a header looks like an email column.
 * 3 = email / e-mail / email address, 2 = work email / contact email, 0 = not email.
 */
export function scoreEmailHeader(header: string): number {
  const norm = normalizeHeader(header);
  if (!norm) return 0;
  if (/^(email|e_mail|mail)$/.test(norm)) return 3;
  if (/^(email|e_mail)_?(address|addr)$/.test(norm) || norm === "emailaddress" || norm === "emailaddr") return 3;
  if (/(^|_)(email|e_mail)(_address|_addr)?$/.test(norm)) return 2;
  return 0;
}

const HEADER_ALIASES: Record<string, string> = {
  email_address: "email",
  emailaddress: "email",
  e_mail: "email",
  mail: "email",
  firstname: "first_name",
  given_name: "first_name",
  lastname: "last_name",
  surname: "last_name",
  organization: "company",
  company_name: "company",
  domain: "website",
  url: "website",
  linkedin_url: "linkedin",
  title: "job_title",
  position: "job_title",
  city: "location",
  country: "location",
  phone_number: "phone",
  telephone: "phone",
  sector: "industry",
  vertical: "industry",
};

/** Best-guess mapping of a CSV header to a field key. */
export function guessField(header: string, allowed: { key: string; label: string }[]): string | null {
  const norm = normalizeHeader(header);
  if (!norm) return null;
  for (const f of allowed) {
    if (norm === f.key || norm === normalizeHeader(f.label)) return f.key;
  }
  const alias = HEADER_ALIASES[norm];
  if (alias && allowed.some((f) => f.key === alias)) return alias;
  if (scoreEmailHeader(header) >= 2 && allowed.some((f) => f.key === "email")) return "email";
  return null;
}

/** Map each CSV header to a field key. Email-like headers are preselected, preferring the strongest match. */
export function autoMapHeaders(
  headers: string[],
  allowed: { key: string; label: string }[],
): Record<string, string | null> {
  const mapping: Record<string, string | null> = {};
  const used = new Set<string>();
  let bestEmail: { header: string; score: number } | null = null;

  for (const header of headers) {
    const guess = guessField(header, allowed);
    if (guess === "email") {
      const score = Math.max(scoreEmailHeader(header), 2);
      if (!bestEmail || score > bestEmail.score) bestEmail = { header, score };
      mapping[header] = null;
      continue;
    }
    if (guess && !used.has(guess)) {
      mapping[header] = guess;
      used.add(guess);
    } else {
      mapping[header] = null;
    }
  }

  if (bestEmail) mapping[bestEmail.header] = "email";
  return mapping;
}
