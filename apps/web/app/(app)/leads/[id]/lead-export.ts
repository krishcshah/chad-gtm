export interface ExportableLead {
  email: string;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  status: string;
}

function csvCell(value: string) {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** CSV text with the same columns the old export produced. */
export function leadsToCsv(rows: ExportableLead[]) {
  const header = "email,first_name,last_name,company,status";
  const body = rows.map((r) =>
    [r.email, r.firstName ?? "", r.lastName ?? "", r.company ?? "", r.status].map((v) => csvCell(String(v))).join(","),
  );
  return [header, ...body].join("\n") + "\n";
}

/** Triggers a browser download of the given leads as CSV. */
export function downloadLeadsCsv(rows: ExportableLead[], fileName = "leads-export.csv") {
  const blob = new Blob([leadsToCsv(rows)], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
