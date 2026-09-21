/** Top-level copy when a Zod issue is a stock message and the field is known. */
const REQUIRED_FIELD_ERRORS: Record<string, string> = {
  name: "Campaign name is required",
  leadListId: "Lead list is required",
  senderIds: "Select at least one sender",
  templateId: "Template is required",
  scheduledAt: "Pick a start date and time",
  email: "Email is required",
  subject: "Subject is required",
  senderName: "Sender name is required",
  smtpHost: "SMTP host is required",
  smtpUsername: "SMTP username is required",
  smtpPassword: "SMTP password is required",
  postalAddress: "Enter a physical postal address for CAN-SPAM compliance",
};

const GENERIC_ZOD =
  /^(required|invalid(?:\s+\w+)?|expected\b|string must|number must|array must|invalid enum|unrecognized key|invalid input)/i;

export function formatZodActionError(issues: { path: PropertyKey[]; message: string }[]): {
  error: string;
  fieldErrors: Record<string, string[]>;
} {
  const fieldErrors: Record<string, string[]> = {};
  const summaries: string[] = [];

  for (const issue of issues) {
    const key = String(issue.path[0] ?? "_");
    const raw = issue.message?.trim() || "Invalid value";
    const summary = specificIssueMessage(key, raw);
    (fieldErrors[key] ??= []).push(summary);
    if (!summaries.includes(summary)) summaries.push(summary);
  }

  const shown = summaries.slice(0, 3);
  const extra = summaries.length - shown.length;
  let error = shown.join(". ");
  if (extra > 0) error += ` (+${extra} more)`;
  if (!error) error = "Some fields are invalid";
  return { error, fieldErrors };
}

function specificIssueMessage(key: string, message: string): string {
  if (!GENERIC_ZOD.test(message)) return message;
  return REQUIRED_FIELD_ERRORS[key] ?? (key === "_" ? message : `${humanizeField(key)}: ${message}`);
}

function humanizeField(key: string): string {
  const spaced = key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
