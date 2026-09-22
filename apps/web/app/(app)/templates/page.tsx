import { requireUser } from "@/lib/session";
import { listTemplates } from "@/lib/queries";
import { TemplatesHub } from "./templates-hub";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const user = await requireUser();
  const rawTemplates = await listTemplates(user.id);

  const templates = rawTemplates.map((t) => ({
    id: t.id,
    name: t.name,
    subject: t.subject,
    bodyText: t.bodyText,
    bodyHtml: t.bodyHtml || "",
    format: t.format,
    updatedAt: t.updatedAt,
  }));

  return <TemplatesHub templates={templates} />;
}
