import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams?: Promise<{ from?: string; to?: string }>;
}) {
  const sp = searchParams ? await searchParams : {};
  const query = new URLSearchParams();
  if (sp.from) query.set("from", sp.from);
  if (sp.to) query.set("to", sp.to);
  const qStr = query.toString();
  redirect(qStr ? `/dashboard?${qStr}` : "/dashboard");
}
