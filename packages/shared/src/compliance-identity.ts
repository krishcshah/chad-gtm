/**
 * The one rule for the sender identity every cold email carries (CAN-SPAM):
 * a company name and a full physical postal address. Pure and client-safe.
 * Used by the Settings save, the campaign start gate and the Autopilot
 * launch, so a saved identity passes or fails the same way everywhere.
 */

export const POSTAL_ADDRESS_PROBLEM =
  "Enter a full physical postal address (street or P.O. box, city, postcode, country). The law requires it in every email.";
export const POSTAL_ADDRESS_TOO_LONG = "Postal address is too long.";
export const COMPANY_NAME_PROBLEM = "Enter your company's legal or trading name.";
export const COMPANY_NAME_TOO_LONG = "Company name is too long (200 characters max).";

function collapse(v: unknown): string {
  return String(v ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Why this postal address can't be used, or null when it is usable. */
export function postalAddressProblem(v: unknown): string | null {
  const s = collapse(v);
  if (s.length > 1000) return POSTAL_ADDRESS_TOO_LONG;
  if (s.length < 10) return POSTAL_ADDRESS_PROBLEM;
  if (!/\d/.test(s) || !/\p{L}/u.test(s)) return POSTAL_ADDRESS_PROBLEM;
  return null;
}

/** Why this company name can't be used, or null when it is usable. */
export function companyNameProblem(v: unknown): string | null {
  const s = String(v ?? "").trim();
  if (s.length < 2) return COMPANY_NAME_PROBLEM;
  if (s.length > 200) return COMPANY_NAME_TOO_LONG;
  return null;
}

export interface ComplianceIdentityProblems {
  companyName?: string;
  postalAddress?: string;
}

export function complianceIdentityProblems(identity: {
  companyName?: string | null;
  postalAddress?: string | null;
}): ComplianceIdentityProblems {
  const out: ComplianceIdentityProblems = {};
  const company = companyNameProblem(identity.companyName);
  if (company) out.companyName = company;
  const postal = postalAddressProblem(identity.postalAddress);
  if (postal) out.postalAddress = postal;
  return out;
}

export function isUsablePostalAddress(v: unknown): boolean {
  return postalAddressProblem(v) === null;
}
