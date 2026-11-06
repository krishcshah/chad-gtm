import { requireUser } from "@/lib/session";
import { TemplateEditor } from "../template-editor";

export const dynamic = "force-dynamic";

export const metadata = { title: "New email template" };

export default async function NewTemplatePage() {
  await requireUser();
  return <TemplateEditor />;
}
