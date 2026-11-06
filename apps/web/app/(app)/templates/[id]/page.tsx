import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { getTemplate } from "@/lib/queries";
import { PRESET_SEQUENCES, isSequenceTemplate } from "@/lib/sequence-templates";
import { TemplateEditor } from "../template-editor";

export const dynamic = "force-dynamic";

export const metadata = { title: "Edit template" };

export default async function EditTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Sequences and starters are edited in the library's sequence editor.
  if (PRESET_SEQUENCES.some((p) => p.id === id)) redirect(`/templates?edit=${encodeURIComponent(id)}`);

  const user = await requireUser();
  const template = await getTemplate(user.id, id);
  if (!template) notFound();
  if (isSequenceTemplate(template.bodyText)) redirect(`/templates?edit=${encodeURIComponent(id)}`);

  return (
    <TemplateEditor
      key={template.id}
      initial={{
        id: template.id,
        name: template.name,
        subject: template.subject,
        bodyText: template.bodyText,
        bodyHtml: template.bodyHtml || "",
        format: template.format === "html" ? "html" : "text",
        updatedAt: template.updatedAt,
      }}
    />
  );
}
