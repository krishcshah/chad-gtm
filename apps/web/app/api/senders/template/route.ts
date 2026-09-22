import { NextResponse } from "next/server";
import { SENDER_IMPORT_COLUMNS } from "@smartreach/shared";

export const dynamic = "force-dynamic";

const EXAMPLE = [
  "Jane Sender",
  "jane@example.com",
  "smtp.gmail.com",
  "587",
  "jane@example.com",
  "app-password",
  "tls",
  "imap.gmail.com",
  "993",
  "jane@example.com",
  "app-password",
  "50",
  "20",
  "UTC",
  "",
  "true",
  "20",
  "40",
];

export async function GET() {
  const header = SENDER_IMPORT_COLUMNS.join(",");
  const example = EXAMPLE.map((v) => (v.includes(",") ? `"${v}"` : v)).join(",");
  const csv = `${header}\n${example}\n`;
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="smartreach-senders-template.csv"',
    },
  });
}
