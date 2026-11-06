import { Suspense } from "react";
import { requireUser } from "@/lib/session";
import { listTemplates } from "@/lib/queries";
import { TemplatesHub } from "./templates-hub";
import TemplatesLoading from "./loading";

export const dynamic = "force-dynamic";

export const metadata = { title: "Templates" };

export default async function TemplatesPage() {
  const user = await requireUser();
  const rows = await listTemplates(user.id);

  const templates = rows.map((t) => ({
    id: t.id,
    name: t.name,
    subject: t.subject,
    bodyText: t.bodyText,
    bodyHtml: t.bodyHtml || "",
    format: t.format,
    updatedAt: t.updatedAt,
  }));

  return (
    <Suspense fallback={<TemplatesLoading />}>
      <TemplatesHub templates={templates} />
    </Suspense>
  );
}
